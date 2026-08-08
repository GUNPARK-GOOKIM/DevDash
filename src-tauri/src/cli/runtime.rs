//! Open a catalog connection using the same engine as the GUI.
use crate::db::app_storage::AppStorage;
use crate::db::audit;
use crate::db::duckdb_engine::DuckDbManager;
use crate::db::executor::{execute_query_for_managed, QueryResultPayload};
use crate::db::introspection::{fetch_columns_managed, fetch_tables_managed, ColumnInfo, TableInfo};
use crate::db::pool::ConnectionManager;
use crate::db::safe_mode::{analyze_sql_safety, sql_contains_write};
use crate::db::schema_migration::EngineDialect;
use crate::db::transactions::TransactionManager;
use sqlx::AnyPool;
use std::io::IsTerminal;
use std::sync::Arc;

use super::catalog::{load_password, CatalogConnection};

pub struct CliEngine {
    pub pools: ConnectionManager,
    pub duckdb: DuckDbManager,
    pub storage: Arc<AppStorage>,
    pub tx: TransactionManager,
}

impl CliEngine {
    pub async fn new() -> Result<Self, String> {
        ConnectionManager::init_drivers();
        super::paths::ensure_config_dir()?;
        let db_path = super::paths::app_db_path();
        let storage = Arc::new(AppStorage::new(db_path.to_string_lossy().as_ref()).await?);
        Ok(Self {
            pools: ConnectionManager::new(),
            duckdb: DuckDbManager::new(),
            storage,
            tx: TransactionManager::new(),
        })
    }

    pub fn resolve_password(
        conn: &CatalogConnection,
        explicit: Option<String>,
        prompt: bool,
    ) -> Result<Option<String>, String> {
        if let Some(p) = explicit {
            if !p.is_empty() {
                return Ok(Some(p));
            }
        }
        if let Ok(p) = std::env::var("DEVDASH_PASSWORD") {
            if !p.is_empty() {
                return Ok(Some(p));
            }
        }
        if let Some(p) = load_password(&conn.id) {
            if !p.is_empty() {
                return Ok(Some(p));
            }
        }
        let needs = !matches!(conn.db_type.to_lowercase().as_str(), "sqlite" | "duckdb")
            && !conn.user.is_empty();
        if needs && prompt && std::io::stdin().is_terminal() {
            let p = rpassword::prompt_password(format!("Password for {} ({}): ", conn.name, conn.user))
                .map_err(|e| format!("Password prompt failed: {e}"))?;
            if p.is_empty() {
                return Ok(None);
            }
            return Ok(Some(p));
        }
        Ok(None)
    }

    pub async fn connect(
        &self,
        conn: &CatalogConnection,
        password: Option<String>,
    ) -> Result<(), String> {
        let kind = conn.db_type.to_lowercase();
        if kind == "duckdb" {
            return self.duckdb.connect(&conn.id, &conn.database, conn.effective_read_only());
        }
        let details = conn.to_details(password);
        self.pools.connect_with_details(&conn.id, &details).await
    }

    pub async fn test(
        &self,
        conn: &CatalogConnection,
        password: Option<String>,
    ) -> crate::db::pool::TestConnectionResult {
        if conn.db_type.eq_ignore_ascii_case("duckdb") {
            let start = std::time::Instant::now();
            let path = conn.database.trim();
            let res = if path.is_empty() || path == ":memory:" {
                duckdb::Connection::open_in_memory()
            } else {
                duckdb::Connection::open(path)
            };
            return match res {
                Ok(c) => match c.execute_batch("SELECT 1;") {
                    Ok(_) => crate::db::pool::TestConnectionResult {
                        success: true,
                        latency_ms: start.elapsed().as_millis() as u64,
                        message: "DuckDB opened successfully".into(),
                    },
                    Err(e) => crate::db::pool::TestConnectionResult {
                        success: false,
                        latency_ms: start.elapsed().as_millis() as u64,
                        message: format!("DuckDB ping failed: {e}"),
                    },
                },
                Err(e) => crate::db::pool::TestConnectionResult {
                    success: false,
                    latency_ms: start.elapsed().as_millis() as u64,
                    message: format!("DuckDB open failed: {e}"),
                },
            };
        }
        ConnectionManager::test_connection(&conn.to_details(password)).await
    }

    pub async fn run_sql(
        &self,
        conn: &CatalogConnection,
        sql: &str,
        allow_destructive: bool,
        force_read_only: bool,
    ) -> Result<QueryResultPayload, String> {
        let ro = force_read_only || conn.effective_read_only();
        if ro && sql_contains_write(sql) {
            return Err(
                "Connection is read-only. Write/DDL statements are blocked. Use a non-prod connection or pass --allow-writes-on-prod when adding it.".into(),
            );
        }
        let analysis = analyze_sql_safety(sql);
        if (analysis.requires_confirmation || analysis.is_destructive) && !allow_destructive {
            return Err(format!(
                "Safe Mode blocked destructive SQL. Re-run with --yes to confirm. {}",
                analysis
                    .warning_message
                    .unwrap_or_else(|| "Destructive operation detected.".into())
            ));
        }

        let result = if self.duckdb.is_connected(&conn.id) {
            self.duckdb.run_sql(&conn.id, sql)
        } else {
            let managed = self.pools.get_managed_connection(&conn.id)?;
            execute_query_for_managed(&managed, sql).await
        };

        match &result {
            Ok(payload) => {
                let row_count = if payload.rows.is_empty() {
                    payload.affected_rows as i64
                } else {
                    payload.rows.len() as i64
                };
                let _ = self
                    .storage
                    .log_query_history(sql, &conn.id, payload.execution_time_ms as f64, row_count, None)
                    .await;
                let _ = audit::log_action(&conn.id, "CLI_QUERY", sql, payload.affected_rows, "SUCCESS");
            }
            Err(err) => {
                let _ = self
                    .storage
                    .log_query_history(sql, &conn.id, 0.0, 0, Some(err))
                    .await;
                let _ = audit::log_action(&conn.id, "CLI_QUERY", sql, 0, "FAILED");
            }
        }
        result
    }

    pub async fn tables(&self, conn: &CatalogConnection) -> Result<Vec<TableInfo>, String> {
        if self.duckdb.is_connected(&conn.id) {
            return self.duckdb.fetch_tables(&conn.id);
        }
        let managed = self.pools.get_managed_connection(&conn.id)?;
        fetch_tables_managed(&managed).await
    }

    pub async fn columns(
        &self,
        conn: &CatalogConnection,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, String> {
        if self.duckdb.is_connected(&conn.id) {
            return self.duckdb.fetch_columns(&conn.id, table);
        }
        let managed = self.pools.get_managed_connection(&conn.id)?;
        fetch_columns_managed(&managed, table).await
    }

    pub async fn disconnect(&self, conn: &CatalogConnection) {
        self.duckdb.disconnect(&conn.id);
        let _ = self.pools.disconnect(&conn.id).await;
    }

    pub fn dialect(conn: &CatalogConnection) -> Result<EngineDialect, String> {
        EngineDialect::from_db_kind(&conn.db_type)
    }

    pub fn pool(&self, conn: &CatalogConnection) -> Result<AnyPool, String> {
        self.pools.get_pool(&conn.id)
    }

    pub fn mysql_style(conn: &CatalogConnection) -> bool {
        ConnectionManager::is_mysql_style(&conn.db_type)
    }
}
