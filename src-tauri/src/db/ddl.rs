//! Live CREATE TABLE DDL generation from catalog metadata (DataGrip/TablePlus parity).

use crate::db::identifiers::{quote_ident, quote_table, validate_table_identifier};
use crate::db::introspection::{
    fetch_columns, fetch_foreign_keys, split_schema_table, ColumnInfo, ForeignKeyInfo,
};
use serde::{Deserialize, Serialize};
use sqlx::Any;
use sqlx::AnyPool;
use sqlx::Row;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TableDdlResult {
    pub table_name: String,
    pub create_sql: String,
    pub indexes: Vec<IndexInfo>,
    pub foreign_keys: Vec<ForeignKeyInfo>,
}

/// Fetch index definitions for a table.
pub async fn fetch_indexes(
    pool: &AnyPool,
    db_kind: &str,
    table_name: &str,
) -> Result<Vec<IndexInfo>, String> {
    validate_table_identifier(table_name)?;
    let mut indexes = Vec::new();

    let (schema_opt, bare_table) = split_schema_table(table_name);

    match db_kind.to_lowercase().as_str() {
        "postgres" | "postgresql" | "cockroachdb" | "redshift" => {
            let schema = schema_opt.unwrap_or_else(|| "public".to_string());
            let sql = "SELECT
                    i.relname AS index_name,
                    ix.indisunique AS is_unique,
                    ix.indisprimary AS is_primary,
                    array_to_string(ARRAY(
                        SELECT a.attname
                        FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
                        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
                        ORDER BY k.ord
                    ), ',') AS columns
                FROM pg_class t
                JOIN pg_index ix ON t.oid = ix.indrelid
                JOIN pg_class i ON i.oid = ix.indexrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE t.relkind IN ('r', 'p', 'v', 'm')
                  AND n.nspname = $2
                  AND t.relname = $1
                ORDER BY i.relname";
            let rows = sqlx::query::<Any>(sql)
                .bind(&bare_table)
                .bind(&schema)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            for row in rows {
                let name: String = row.get(0);
                let is_unique: bool = row.get(1);
                let is_primary: bool = row.get(2);
                let cols_str: String = row.get(3);
                let columns: Vec<String> = cols_str
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                indexes.push(IndexInfo {
                    name,
                    columns,
                    is_unique,
                    is_primary,
                });
            }
        }
        "mysql" | "mariadb" => {
            let rows = if let Some(ref schema) = schema_opt {
                let sql = "SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
                    FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                    ORDER BY INDEX_NAME, SEQ_IN_INDEX";
                sqlx::query::<Any>(sql)
                    .bind(schema)
                    .bind(&bare_table)
                    .fetch_all(pool)
                    .await
                    .map_err(|e| e.to_string())?
            } else {
                let sql = "SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
                    FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                    ORDER BY INDEX_NAME, SEQ_IN_INDEX";
                sqlx::query::<Any>(sql)
                    .bind(&bare_table)
                    .fetch_all(pool)
                    .await
                    .map_err(|e| e.to_string())?
            };
            use std::collections::BTreeMap;
            let mut map: BTreeMap<String, IndexInfo> = BTreeMap::new();
            for row in rows {
                let name: String = row.get(0);
                let non_unique: i64 = row.try_get(1).unwrap_or(1);
                let col: String = row.get(2);
                let entry = map.entry(name.clone()).or_insert(IndexInfo {
                    name: name.clone(),
                    columns: Vec::new(),
                    is_unique: non_unique == 0,
                    is_primary: name.eq_ignore_ascii_case("PRIMARY"),
                });
                entry.columns.push(col);
            }
            indexes.extend(map.into_values());
        }
        _ => {
            // SQLite
            let safe = bare_table.replace('"', "\"\"");
            let list_sql = format!("PRAGMA index_list(\"{}\");", safe);
            let list_rows = sqlx::query::<Any>(&list_sql)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            for row in list_rows {
                // seq, name, unique, origin, partial
                let name: String = row.get(1);
                let unique: i64 = row.get(2);
                let origin: String = row.try_get(3).unwrap_or_default();
                let info_sql = format!("PRAGMA index_info(\"{}\");", name.replace('"', "\"\""));
                let info_rows = sqlx::query::<Any>(&info_sql)
                    .fetch_all(pool)
                    .await
                    .map_err(|e| e.to_string())?;
                let mut columns = Vec::new();
                for ir in info_rows {
                    // seqno, cid, name
                    let col: String = ir.get(2);
                    columns.push(col);
                }
                indexes.push(IndexInfo {
                    name,
                    columns,
                    is_unique: unique != 0,
                    is_primary: origin == "pk",
                });
            }
        }
    }

    Ok(indexes)
}

/// Generate CREATE TABLE DDL including PK, nullability, and FK constraints.
/// Secondary indexes are emitted as separate CREATE INDEX statements when not primary.
pub async fn generate_table_ddl(
    pool: &AnyPool,
    db_kind: &str,
    table_name: &str,
) -> Result<TableDdlResult, String> {
    validate_table_identifier(table_name)?;
    let mysql_style = matches!(
        db_kind.to_lowercase().as_str(),
        "mysql" | "mariadb"
    );
    let columns = fetch_columns(pool, db_kind, table_name).await?;
    if columns.is_empty() {
        return Err(format!("Table '{}' not found or has no columns", table_name));
    }
    let fks = fetch_foreign_keys(pool, db_kind, table_name)
        .await
        .unwrap_or_default();
    let indexes = fetch_indexes(pool, db_kind, table_name)
        .await
        .unwrap_or_default();

    let q_table = quote_table(table_name, mysql_style)?;
    let mut parts: Vec<String> = Vec::new();
    let pk_cols: Vec<&ColumnInfo> = columns.iter().filter(|c| c.is_primary_key).collect();
    let composite_pk = pk_cols.len() > 1;

    for col in &columns {
        parts.push(format_column_def(
            col,
            db_kind,
            mysql_style,
            /* inline_pk */ !composite_pk,
        ));
    }

    // Composite PK as table constraint
    if composite_pk {
        let pk_list = pk_cols
            .iter()
            .map(|c| quote_ident(&c.name, mysql_style))
            .collect::<Vec<_>>()
            .join(", ");
        parts.push(format!("PRIMARY KEY ({})", pk_list));
    }

    for fk in &fks {
        parts.push(format!(
            "FOREIGN KEY ({}) REFERENCES {} ({})",
            quote_ident(&fk.column_name, mysql_style),
            quote_table(&fk.referenced_table, mysql_style)?,
            quote_ident(&fk.referenced_column, mysql_style),
        ));
    }

    let mut create_sql = format!(
        "CREATE TABLE {} (\n  {}\n);",
        q_table,
        parts.join(",\n  ")
    );

    // Secondary indexes (skip primary)
    for idx in indexes.iter().filter(|i| !i.is_primary) {
        if idx.columns.is_empty() {
            continue;
        }
        let col_list = idx
            .columns
            .iter()
            .map(|c| quote_ident(c, mysql_style))
            .collect::<Vec<_>>()
            .join(", ");
        let unique = if idx.is_unique { "UNIQUE " } else { "" };
        // Skip auto-generated names that may collide
        let idx_name = if idx.name.is_empty() {
            format!("idx_{}_{}", table_name, idx.columns.join("_"))
        } else {
            idx.name.clone()
        };
        if let Ok(_) = crate::db::identifiers::validate_simple_identifier(&idx_name) {
            create_sql.push_str(&format!(
                "\nCREATE {}INDEX {} ON {} ({});",
                unique,
                quote_ident(&idx_name, mysql_style),
                q_table,
                col_list
            ));
        }
    }

    Ok(TableDdlResult {
        table_name: table_name.to_string(),
        create_sql,
        indexes,
        foreign_keys: fks,
    })
}

fn format_column_def(
    col: &ColumnInfo,
    db_kind: &str,
    mysql_style: bool,
    inline_pk: bool,
) -> String {
    let q = quote_ident(&col.name, mysql_style);
    let mut def = format!("{} {}", q, map_type_for_ddl(&col.data_type, db_kind));
    if col.is_primary_key && inline_pk {
        def.push_str(" PRIMARY KEY");
    }
    if !col.is_nullable && !(col.is_primary_key && inline_pk) {
        def.push_str(" NOT NULL");
    }
    def
}

fn map_type_for_ddl(data_type: &str, db_kind: &str) -> String {
    let t = data_type.to_lowercase();
    let kind = db_kind.to_lowercase();
    // information_schema often returns generic types; keep as-is when specific enough
    if t.contains('(') || t == "text" || t == "integer" || t == "real" || t == "blob" {
        return data_type.to_string();
    }
    match kind.as_str() {
        "sqlite" => match t.as_str() {
            "character varying" | "varchar" | "nvarchar" => "TEXT".to_string(),
            "timestamp without time zone" | "timestamp with time zone" | "datetime" => {
                "TEXT".to_string()
            }
            "boolean" => "INTEGER".to_string(),
            "double precision" | "numeric" | "decimal" => "REAL".to_string(),
            "bigint" | "smallint" | "int" | "integer" => "INTEGER".to_string(),
            other => other.to_uppercase(),
        },
        _ => {
            // Postgres/MySQL: capitalize common types
            if t == "character varying" {
                "VARCHAR".to_string()
            } else if t == "timestamp without time zone" {
                "TIMESTAMP".to_string()
            } else if t == "timestamp with time zone" {
                "TIMESTAMPTZ".to_string()
            } else {
                data_type.to_uppercase()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::any::AnyPoolOptions;
    use sqlx::Executor;

    #[tokio::test]
    async fn test_sqlite_ddl_with_fk_and_index() {
        sqlx::any::install_default_drivers();
        let pool = AnyPoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        pool.execute("PRAGMA foreign_keys = ON;").await.unwrap();
        pool.execute("CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT);")
            .await
            .unwrap();
        pool.execute(
            "CREATE TABLE child (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER NOT NULL,
                label TEXT,
                FOREIGN KEY (parent_id) REFERENCES parent(id)
            );",
        )
        .await
        .unwrap();
        pool.execute("CREATE INDEX idx_child_label ON child(label);")
            .await
            .unwrap();

        let ddl = generate_table_ddl(&pool, "sqlite", "child").await.unwrap();
        assert!(ddl.create_sql.contains("CREATE TABLE"));
        assert!(ddl.create_sql.to_lowercase().contains("parent_id"));
        assert!(
            ddl.foreign_keys.iter().any(|f| f.column_name == "parent_id"),
            "expected FK on parent_id"
        );
        assert!(
            ddl.indexes.iter().any(|i| i.name.contains("label") || i.columns.contains(&"label".to_string())),
            "expected index on label"
        );
    }
}
