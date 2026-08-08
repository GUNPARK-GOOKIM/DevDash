//! DuckDB file / in-memory engine (not via sqlx::AnyPool).
use crate::db::executor::{ColumnHeader, QueryResultPayload};
use crate::db::introspection::{ColumnInfo, TableInfo};
use dashmap::DashMap;
use duckdb::types::ValueRef;
use duckdb::Connection;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Clone, Default)]
pub struct DuckDbManager {
    conns: Arc<DashMap<String, Arc<Mutex<Connection>>>>,
    read_only: Arc<DashMap<String, bool>>,
}

impl DuckDbManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_connected(&self, id: &str) -> bool {
        self.conns.contains_key(id)
    }

    pub fn is_read_only(&self, id: &str) -> bool {
        self.read_only.get(id).map(|v| *v).unwrap_or(false)
    }

    pub fn ensure_writes_allowed(&self, id: &str) -> Result<(), String> {
        if self.is_read_only(id) {
            return Err(
                "Connection is read-only. Write/DDL operations are blocked by the server."
                    .to_string(),
            );
        }
        Ok(())
    }

    pub fn connect(&self, id: &str, database_path: &str, is_read_only: bool) -> Result<(), String> {
        if let Some((_, old)) = self.conns.remove(id) {
            drop(old);
        }
        let path = database_path.trim();
        let conn = if path.is_empty() || path == ":memory:" || path == "memory" {
            Connection::open_in_memory()
                .map_err(|e| format!("DuckDB open memory failed: {}", e))?
        } else {
            Connection::open(path).map_err(|e| format!("DuckDB open '{}' failed: {}", path, e))?
        };
        self.conns
            .insert(id.to_string(), Arc::new(Mutex::new(conn)));
        self.read_only.insert(id.to_string(), is_read_only);
        Ok(())
    }

    pub fn disconnect(&self, id: &str) {
        self.conns.remove(id);
        self.read_only.remove(id);
    }

    pub fn list_connected_ids(&self) -> Vec<String> {
        self.conns.iter().map(|e| e.key().clone()).collect()
    }

    fn value_ref_to_json(v: ValueRef<'_>) -> Value {
        match v {
            ValueRef::Null => Value::Null,
            ValueRef::Boolean(b) => Value::Bool(b),
            ValueRef::TinyInt(i) => json!(i),
            ValueRef::SmallInt(i) => json!(i),
            ValueRef::Int(i) => json!(i),
            ValueRef::BigInt(i) => json!(i),
            ValueRef::HugeInt(i) => json!(i.to_string()),
            ValueRef::UTinyInt(i) => json!(i),
            ValueRef::USmallInt(i) => json!(i),
            ValueRef::UInt(i) => json!(i),
            ValueRef::UBigInt(i) => json!(i),
            ValueRef::Float(f) => json!(f),
            ValueRef::Double(f) => json!(f),
            ValueRef::Decimal(d) => json!(d.to_string()),
            ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
            ValueRef::Blob(b) => {
                use base64::{engine::general_purpose::STANDARD, Engine as _};
                Value::String(STANDARD.encode(b))
            }
            ValueRef::Date32(d) => json!(d),
            ValueRef::Time64(_, t) => json!(t),
            ValueRef::Timestamp(_, t) => json!(t),
            ValueRef::Interval { .. } => Value::String("interval".into()),
            // DuckDB ValueRef is non_exhaustive — catch remaining complex types
            other => Value::String(format!("{:?}", other)),
        }
    }

    pub fn run_sql(&self, id: &str, sql: &str) -> Result<QueryResultPayload, String> {
        let start = Instant::now();
        let entry = self
            .conns
            .get(id)
            .ok_or_else(|| format!("DuckDB connection '{}' not found", id))?;
        let conn = entry
            .lock()
            .map_err(|_| "DuckDB connection lock poisoned".to_string())?;

        let trimmed = sql.trim_start().to_uppercase();
        let is_select_like = trimmed.starts_with("SELECT")
            || trimmed.starts_with("WITH")
            || trimmed.starts_with("SHOW")
            || trimmed.starts_with("DESCRIBE")
            || trimmed.starts_with("DESC ")
            || trimmed.starts_with("EXPLAIN")
            || trimmed.starts_with("PRAGMA")
            || trimmed.starts_with("VALUES")
            || trimmed.starts_with("FROM "); // duckdb allows FROM-first

        if !is_select_like {
            let changed = conn
                .execute_batch(sql)
                .map_err(|e| format!("DuckDB execute failed: {}", e))?;
            let _ = changed;
            let rows_affected = conn
                .prepare("SELECT changes()")
                .ok()
                .and_then(|mut s| s.query_row([], |r| r.get::<_, i64>(0)).ok())
                .unwrap_or(0) as u64;
            return Ok(QueryResultPayload {
                columns: vec![ColumnHeader {
                    name: "affected_rows".into(),
                    type_name: "INTEGER".into(),
                }],
                rows: vec![vec![json!(rows_affected)]],
                execution_time_ms: start.elapsed().as_millis() as u64,
                affected_rows: rows_affected,
            });
        }

        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| format!("DuckDB prepare failed: {}", e))?;
        // column_names() requires the statement to have been executed first
        stmt.execute([])
            .map_err(|e| format!("DuckDB execute failed: {}", e))?;
        let col_names = stmt.column_names();
        let col_count = col_names.len();
        let columns: Vec<ColumnHeader> = col_names
            .into_iter()
            .map(|name| ColumnHeader {
                name,
                type_name: "UNKNOWN".into(),
            })
            .collect();

        let mut rows = stmt
            .query([])
            .map_err(|e| format!("DuckDB query failed: {}", e))?;
        let mut rows_out: Vec<Vec<Value>> = Vec::new();
        while let Some(row) = rows
            .next()
            .map_err(|e| format!("DuckDB row failed: {}", e))?
        {
            let mut vals = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let v = row.get_ref_unwrap(i);
                vals.push(Self::value_ref_to_json(v));
            }
            rows_out.push(vals);
        }
        let n = rows_out.len() as u64;
        Ok(QueryResultPayload {
            columns,
            rows: rows_out,
            execution_time_ms: start.elapsed().as_millis() as u64,
            affected_rows: n,
        })
    }

    pub fn fetch_tables(&self, id: &str) -> Result<Vec<TableInfo>, String> {
        let payload = self.run_sql(
            id,
            "SELECT table_name, table_type FROM information_schema.tables \
             WHERE table_schema NOT IN ('information_schema', 'pg_catalog') \
             ORDER BY table_name",
        )?;
        let mut out = Vec::new();
        for row in payload.rows {
            let name = row
                .first()
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            let table_type = row
                .get(1)
                .and_then(|v| v.as_str())
                .unwrap_or("BASE TABLE")
                .to_string();
            out.push(TableInfo::new("main", &name, &table_type));
        }
        Ok(out)
    }

    pub fn fetch_columns(&self, id: &str, table: &str) -> Result<Vec<ColumnInfo>, String> {
        crate::db::identifiers::validate_table_identifier(table)?;
        let entry = self
            .conns
            .get(id)
            .ok_or_else(|| format!("DuckDB connection '{}' not found", id))?;
        let conn = entry
            .lock()
            .map_err(|_| "DuckDB connection lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT column_name, data_type, is_nullable \
                 FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(duckdb::params![table]).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let name: String = row.get(0).map_err(|e| e.to_string())?;
            let data_type: String = row.get(1).unwrap_or_else(|_| "UNKNOWN".into());
            let nullable: String = row.get(2).unwrap_or_else(|_| "YES".into());
            out.push(ColumnInfo {
                name,
                data_type,
                is_nullable: nullable.eq_ignore_ascii_case("YES"),
                is_primary_key: false,
                is_foreign_key: false,
                fk_table: None,
                fk_column: None,
            });
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_duckdb_memory_select() {
        let mgr = DuckDbManager::new();
        mgr.connect("t1", ":memory:", false).unwrap();
        mgr.run_sql("t1", "CREATE TABLE t (id INTEGER, name VARCHAR);")
            .unwrap();
        mgr.run_sql("t1", "INSERT INTO t VALUES (1, 'ada');")
            .unwrap();
        let res = mgr.run_sql("t1", "SELECT id, name FROM t;").unwrap();
        assert_eq!(res.rows.len(), 1);
        assert_eq!(res.rows[0][1], json!("ada"));
        let tables = mgr.fetch_tables("t1").unwrap();
        assert!(tables.iter().any(|t| t.name == "t"));
    }
}
