//! Local migration run history for production migration workflow.

use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Row};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationRun {
    pub id: String,
    pub source_connection: String,
    pub target_connection: String,
    pub sql_script: String,
    pub dry_run: bool,
    pub success: bool,
    pub error: Option<String>,
    pub statements_run: i64,
    pub duration_ms: f64,
    pub created_at: String,
}

pub async fn ensure_migrations_table(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS migration_runs (
            id TEXT PRIMARY KEY,
            source_connection TEXT NOT NULL,
            target_connection TEXT NOT NULL,
            sql_script TEXT NOT NULL,
            dry_run INTEGER NOT NULL,
            success INTEGER NOT NULL,
            error TEXT,
            statements_run INTEGER NOT NULL,
            duration_ms REAL NOT NULL,
            created_at TEXT NOT NULL
        );",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn log_migration_run(pool: &SqlitePool, run: &MigrationRun) -> Result<(), String> {
    ensure_migrations_table(pool).await?;
    sqlx::query(
        "INSERT INTO migration_runs
         (id, source_connection, target_connection, sql_script, dry_run, success, error, statements_run, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&run.id)
    .bind(&run.source_connection)
    .bind(&run.target_connection)
    .bind(&run.sql_script)
    .bind(if run.dry_run { 1 } else { 0 })
    .bind(if run.success { 1 } else { 0 })
    .bind(&run.error)
    .bind(run.statements_run)
    .bind(run.duration_ms)
    .bind(&run.created_at)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn list_migration_runs(pool: &SqlitePool, limit: i64) -> Result<Vec<MigrationRun>, String> {
    ensure_migrations_table(pool).await?;
    let rows = sqlx::query(
        "SELECT id, source_connection, target_connection, sql_script, dry_run, success, error,
                statements_run, duration_ms, created_at
         FROM migration_runs ORDER BY rowid DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        out.push(MigrationRun {
            id: r.get("id"),
            source_connection: r.get("source_connection"),
            target_connection: r.get("target_connection"),
            sql_script: r.get("sql_script"),
            dry_run: r.get::<i64, _>("dry_run") != 0,
            success: r.get::<i64, _>("success") != 0,
            error: r.try_get("error").ok(),
            statements_run: r.get("statements_run"),
            duration_ms: r.get("duration_ms"),
            created_at: r.get("created_at"),
        });
    }
    Ok(out)
}

pub fn new_run_id() -> String {
    Uuid::new_v4().to_string()
}
