//! Explicit multi-statement transaction sessions for GUI clients.
//! Holds a dedicated pool connection per connection_id after BEGIN until COMMIT/ROLLBACK.

use crate::db::executor::{execute_dynamic_query_on_connection, QueryResultPayload};
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

struct TxSession {
    conn: PoolConnection<Any>,
    started: Instant,
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
                started_at: Some(
                    chrono::Utc::now().to_rfc3339(), // approximate; client uses duration
                ),
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
                conn,
                started: Instant::now(),
                statement_count: 0,
            },
        );
        drop(guard);
        Ok(self.status(connection_id).await)
    }

    pub async fn commit(&self, connection_id: &str) -> Result<TxStatus, String> {
        let mut guard = self.inner.lock().await;
        let mut session = guard
            .remove(connection_id)
            .ok_or_else(|| "No active transaction for this connection".to_string())?;
        session
            .conn
            .execute("COMMIT")
            .await
            .map_err(|e| format!("COMMIT failed: {}", e))?;
        // connection returns to pool on drop
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
        let _ = session.conn.execute("ROLLBACK").await;
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
        let result = execute_dynamic_query_on_connection(&mut session.conn, sql).await?;
        session.statement_count += 1;
        Ok(Some(result))
    }

    /// Force-drop session without COMMIT (e.g. on disconnect).
    pub async fn force_drop(&self, connection_id: &str) {
        let mut guard = self.inner.lock().await;
        if let Some(mut session) = guard.remove(connection_id) {
            let _ = session.conn.execute("ROLLBACK").await;
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
}
