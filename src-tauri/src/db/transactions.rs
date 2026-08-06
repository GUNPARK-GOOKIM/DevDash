//! Explicit multi-statement transaction sessions for GUI clients.
//! Holds a dedicated pool connection per connection_id after BEGIN until COMMIT/ROLLBACK.

use crate::db::executor::{
    execute_dynamic_query_on_connection, execute_mssql_query_on_conn,
    execute_pg_query_on_conn, execute_mysql_query_on_conn, QueryResultPayload,
};
use bb8_tiberius::ConnectionManager as MssqlConnectionManager;
use crate::db::pool::ManagedConnection;
use serde::{Deserialize, Serialize};
use sqlx::pool::PoolConnection;
use sqlx::{Any, AnyPool, Executor};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxStatus {
    pub active: bool,
    pub connection_id: String,
    pub started_at: Option<String>,
    pub statement_count: u64,
    pub duration_ms: u64,
}

use tiberius::Client as TiberiusClient;
use tokio::net::TcpStream;
use tokio_util::compat::Compat;

enum TxConn {
    Pg(PoolConnection<sqlx::Postgres>),
    MySql(PoolConnection<sqlx::MySql>),
    Sqlx(PoolConnection<Any>),
    Mssql(TiberiusClient<Compat<TcpStream>>),
}

struct TxSession {
    conn: TxConn,
    started: Instant,
    started_at: String,
    statement_count: u64,
}

#[derive(Clone, Default)]
pub struct TransactionManager {
    inner: Arc<Mutex<HashMap<String, TxSession>>>,
}

impl TransactionManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn is_active(&self, connection_id: &str) -> bool {
        self.inner.lock().await.contains_key(connection_id)
    }

    pub async fn status(&self, connection_id: &str) -> TxStatus {
        let guard = self.inner.lock().await;
        if let Some(s) = guard.get(connection_id) {
            TxStatus {
                active: true,
                connection_id: connection_id.to_string(),
                started_at: Some(s.started_at.clone()),
                statement_count: s.statement_count,
                duration_ms: s.started.elapsed().as_millis() as u64,
            }
        } else {
            TxStatus {
                active: false,
                connection_id: connection_id.to_string(),
                started_at: None,
                statement_count: 0,
                duration_ms: 0,
            }
        }
    }

    pub async fn begin(&self, pool: &AnyPool, connection_id: &str) -> Result<TxStatus, String> {
        let mut guard = self.inner.lock().await;
        if guard.contains_key(connection_id) {
            return Err("A transaction is already open for this connection".to_string());
        }
        let mut conn = pool
            .acquire()
            .await
            .map_err(|e| format!("Failed to acquire connection for transaction: {}", e))?;
        conn.execute("BEGIN")
            .await
            .map_err(|e| format!("BEGIN failed: {}", e))?;
        guard.insert(
            connection_id.to_string(),
            TxSession {
                conn: TxConn::Sqlx(conn),
                started: Instant::now(),
                started_at: chrono::Utc::now().to_rfc3339(),
                statement_count: 0,
            },
        );
        drop(guard);
        Ok(self.status(connection_id).await)
    }

    pub async fn begin_managed(
        &self,
        managed_conn: &ManagedConnection,
        connection_id: &str,
    ) -> Result<TxStatus, String> {
        let db_type = managed_conn.db_type.to_lowercase();
        if matches!(db_type.as_str(), "postgres" | "postgresql" | "cockroachdb" | "redshift") {
            if let Some(ref pg_pool) = managed_conn.pg_pool {
                let mut guard = self.inner.lock().await;
                if guard.contains_key(connection_id) {
                    return Err("A transaction is already open for this connection".to_string());
                }
                let mut conn = pg_pool
                    .acquire()
                    .await
                    .map_err(|e| format!("Failed to acquire Postgres connection for TX: {}", e))?;
                conn.execute("BEGIN")
                    .await
                    .map_err(|e| format!("BEGIN failed: {}", e))?;
                guard.insert(
                    connection_id.to_string(),
                    TxSession {
                        conn: TxConn::Pg(conn),
                        started: Instant::now(),
                        started_at: chrono::Utc::now().to_rfc3339(),
                        statement_count: 0,
                    },
                );
                drop(guard);
                return Ok(self.status(connection_id).await);
            }
        } else if matches!(db_type.as_str(), "mysql" | "mariadb") {
            if let Some(ref mysql_pool) = managed_conn.mysql_pool {
                let mut guard = self.inner.lock().await;
                if guard.contains_key(connection_id) {
                    return Err("A transaction is already open for this connection".to_string());
                }
                let mut conn = mysql_pool
                    .acquire()
                    .await
                    .map_err(|e| format!("Failed to acquire MySQL connection for TX: {}", e))?;
                conn.execute("BEGIN")
                    .await
                    .map_err(|e| format!("BEGIN failed: {}", e))?;
                guard.insert(
                    connection_id.to_string(),
                    TxSession {
                        conn: TxConn::MySql(conn),
                        started: Instant::now(),
                        started_at: chrono::Utc::now().to_rfc3339(),
                        statement_count: 0,
                    },
                );
                drop(guard);
                return Ok(self.status(connection_id).await);
            }
        }

        if db_type == "mssql" || db_type == "sqlserver" {
            let mut guard = self.inner.lock().await;
            if guard.contains_key(connection_id) {
                return Err("A transaction is already open for this connection".to_string());
            }
            let config = tiberius::Config::from_ado_string(&managed_conn.connection_url)
                .map_err(|e| format!("Invalid MSSQL ADO connection string: {}", e))?;
            let manager = MssqlConnectionManager::build(config)
                .map_err(|e| format!("Failed to build MSSQL manager: {}", e))?;

            use bb8::ManageConnection;
            let mut conn = manager
                .connect()
                .await
                .map_err(|e| format!("Failed to acquire MSSQL connection for TX: {}", e))?;

            conn.execute("BEGIN TRAN", &[])
                .await
                .map_err(|e| format!("MSSQL BEGIN TRAN failed: {}", e))?;

            guard.insert(
                connection_id.to_string(),
                TxSession {
                    conn: TxConn::Mssql(conn),
                    started: Instant::now(),
                    started_at: chrono::Utc::now().to_rfc3339(),
                    statement_count: 0,
                },
            );
            drop(guard);
            Ok(self.status(connection_id).await)
        } else if matches!(
            db_type.as_str(),
            "redis" | "mongodb" | "cassandra" | "clickhouse" | "duckdb" | "oracle" | "snowflake"
        ) {
            Err(format!(
                "Interactive UI transaction sessions are not supported for {} engine.",
                managed_conn.db_type
            ))
        } else {
            self.begin(&managed_conn.pool, connection_id).await
        }
    }

    pub async fn commit(&self, connection_id: &str) -> Result<TxStatus, String> {
        let mut guard = self.inner.lock().await;
        let mut session = guard
            .remove(connection_id)
            .ok_or_else(|| "No active transaction for this connection".to_string())?;

        match &mut session.conn {
            TxConn::Pg(c) => {
                c.execute("COMMIT")
                    .await
                    .map_err(|e| format!("COMMIT failed: {}", e))?;
            }
            TxConn::MySql(c) => {
                c.execute("COMMIT")
                    .await
                    .map_err(|e| format!("COMMIT failed: {}", e))?;
            }
            TxConn::Sqlx(c) => {
                c.execute("COMMIT")
                    .await
                    .map_err(|e| format!("COMMIT failed: {}", e))?;
            }
            TxConn::Mssql(c) => {
                c.execute("COMMIT TRAN", &[])
                    .await
                    .map_err(|e| format!("MSSQL COMMIT TRAN failed: {}", e))?;
            }
        }

        Ok(TxStatus {
            active: false,
            connection_id: connection_id.to_string(),
            started_at: None,
            statement_count: session.statement_count,
            duration_ms: session.started.elapsed().as_millis() as u64,
        })
    }

    pub async fn rollback(&self, connection_id: &str) -> Result<TxStatus, String> {
        let mut guard = self.inner.lock().await;
        let mut session = guard
            .remove(connection_id)
            .ok_or_else(|| "No active transaction for this connection".to_string())?;

        match &mut session.conn {
            TxConn::Pg(c) => {
                let _ = c.execute("ROLLBACK").await;
            }
            TxConn::MySql(c) => {
                let _ = c.execute("ROLLBACK").await;
            }
            TxConn::Sqlx(c) => {
                let _ = c.execute("ROLLBACK").await;
            }
            TxConn::Mssql(c) => {
                let _ = c.execute("ROLLBACK TRAN", &[]).await;
            }
        }

        Ok(TxStatus {
            active: false,
            connection_id: connection_id.to_string(),
            started_at: None,
            statement_count: session.statement_count,
            duration_ms: session.started.elapsed().as_millis() as u64,
        })
    }

    /// Execute SQL inside the open transaction, if any.
    pub async fn execute_in_tx(
        &self,
        connection_id: &str,
        sql: &str,
    ) -> Result<Option<QueryResultPayload>, String> {
        let mut guard = self.inner.lock().await;
        let Some(session) = guard.get_mut(connection_id) else {
            return Ok(None);
        };
        let result = match &mut session.conn {
            TxConn::Pg(c) => execute_pg_query_on_conn(c, sql).await?,
            TxConn::MySql(c) => execute_mysql_query_on_conn(c, sql).await?,
            TxConn::Sqlx(c) => execute_dynamic_query_on_connection(c, sql).await?,
            TxConn::Mssql(c) => execute_mssql_query_on_conn(c, sql).await?,
        };
        session.statement_count += 1;
        Ok(Some(result))
    }

    /// Force-drop session without COMMIT (e.g. on disconnect).
    pub async fn force_drop(&self, connection_id: &str) {
        let mut guard = self.inner.lock().await;
        if let Some(mut session) = guard.remove(connection_id) {
            match &mut session.conn {
                TxConn::Pg(c) => {
                    let _ = c.execute("ROLLBACK").await;
                }
                TxConn::MySql(c) => {
                    let _ = c.execute("ROLLBACK").await;
                }
                TxConn::Sqlx(c) => {
                    let _ = c.execute("ROLLBACK").await;
                }
                TxConn::Mssql(c) => {
                    let _ = c.execute("ROLLBACK TRAN", &[]).await;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::any::AnyPoolOptions;
    use sqlx::{Executor, Row};

    #[tokio::test]
    async fn test_begin_commit_sqlite() {
        sqlx::any::install_default_drivers();
        // Shared-cache memory so acquire/return sees same DB
        let pool = AnyPoolOptions::new()
            .max_connections(4)
            .connect("sqlite:file:tx_commit?mode=memory&cache=shared")
            .await
            .unwrap();
        pool.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);")
            .await
            .unwrap();

        let mgr = TransactionManager::new();
        mgr.begin(&pool, "c1").await.unwrap();
        assert!(mgr.is_active("c1").await);

        let r = mgr
            .execute_in_tx("c1", "INSERT INTO t (id, v) VALUES (1, 'a');")
            .await
            .unwrap()
            .unwrap();
        assert!(r.affected_rows >= 1);

        mgr.commit("c1").await.unwrap();
        assert!(!mgr.is_active("c1").await);

        let row = sqlx::query("SELECT COUNT(*) as c FROM t")
            .fetch_one(&pool)
            .await
            .unwrap();
        let count: i64 = row.try_get(0).unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn test_rollback_discards() {
        sqlx::any::install_default_drivers();
        let pool = AnyPoolOptions::new()
            .max_connections(4)
            .connect("sqlite:file:tx_rb?mode=memory&cache=shared")
            .await
            .unwrap();
        pool.execute("CREATE TABLE t2 (id INTEGER PRIMARY KEY);")
            .await
            .unwrap();
        let mgr = TransactionManager::new();
        mgr.begin(&pool, "c2").await.unwrap();
        let _ = mgr
            .execute_in_tx("c2", "INSERT INTO t2 (id) VALUES (1);")
            .await
            .unwrap();
        mgr.rollback("c2").await.unwrap();
        let row = sqlx::query("SELECT COUNT(*) as c FROM t2")
            .fetch_one(&pool)
            .await
            .unwrap();
        let count: i64 = row.try_get(0).unwrap();
        assert_eq!(count, 0);
    }

    /// Failed SQL inside an open TX must return Err and leave the session active
    /// (callers must not re-run the statement on the pool).
    #[tokio::test]
    async fn test_failed_sql_stays_in_tx() {
        sqlx::any::install_default_drivers();
        let pool = AnyPoolOptions::new()
            .max_connections(4)
            .connect("sqlite:file:tx_fail?mode=memory&cache=shared")
            .await
            .unwrap();
        pool.execute("CREATE TABLE t3 (id INTEGER PRIMARY KEY);")
            .await
            .unwrap();
        let mgr = TransactionManager::new();
        mgr.begin(&pool, "c3").await.unwrap();
        let started = mgr.status("c3").await.started_at.clone();
        assert!(started.is_some());

        let err = mgr
            .execute_in_tx("c3", "INSERT INTO no_such_table_xyz (id) VALUES (1);")
            .await;
        assert!(err.is_err(), "invalid SQL should error inside TX");
        assert!(
            mgr.is_active("c3").await,
            "TX must remain open after statement failure"
        );
        // started_at is stable across status polls
        assert_eq!(mgr.status("c3").await.started_at, started);

        // Valid work after failure still goes on the held connection
        mgr.execute_in_tx("c3", "INSERT INTO t3 (id) VALUES (1);")
            .await
            .unwrap()
            .unwrap();
        mgr.rollback("c3").await.unwrap();
        let row = sqlx::query("SELECT COUNT(*) as c FROM t3")
            .fetch_one(&pool)
            .await
            .unwrap();
        let count: i64 = row.try_get(0).unwrap();
        assert_eq!(count, 0);
    }
}
