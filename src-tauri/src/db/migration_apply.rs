//! Shared migration apply + SQL splitter (GUI IPC and CLI both call this).
use crate::db::audit;
use crate::db::migrations_log::{self, MigrationRun};
use serde::{Deserialize, Serialize};
use sqlx::AnyPool;
use sqlx::SqlitePool;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyMigrationResult {
    pub success: bool,
    pub dry_run: bool,
    pub statements_run: i64,
    pub duration_ms: f64,
    pub error: Option<String>,
    pub run_id: String,
}

/// Split SQL on `;` outside quotes, skipping line/block comments (aligned with frontend splitter).
pub fn split_sql_statements(sql: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let chars: Vec<char> = sql.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();

        if in_line_comment {
            cur.push(c);
            if c == '\n' {
                in_line_comment = false;
            }
            i += 1;
            continue;
        }
        if in_block_comment {
            cur.push(c);
            if c == '*' && next == Some('/') {
                cur.push('/');
                i += 2;
                in_block_comment = false;
                continue;
            }
            i += 1;
            continue;
        }

        if !in_single && !in_double {
            if c == '-' && next == Some('-') {
                cur.push(c);
                in_line_comment = true;
                i += 1;
                continue;
            }
            if c == '/' && next == Some('*') {
                cur.push(c);
                in_block_comment = true;
                i += 1;
                continue;
            }
        }

        if c == '\'' && !in_double {
            if in_single && next == Some('\'') {
                cur.push('\'');
                cur.push('\'');
                i += 2;
                continue;
            }
            in_single = !in_single;
            cur.push(c);
            i += 1;
            continue;
        }
        if c == '"' && !in_single {
            in_double = !in_double;
            cur.push(c);
            i += 1;
            continue;
        }
        if c == ';' && !in_single && !in_double {
            let t = cur.trim().to_string();
            if !t.is_empty() {
                out.push(t);
            }
            cur.clear();
            i += 1;
            continue;
        }
        cur.push(c);
        i += 1;
    }
    let t = cur.trim().to_string();
    if !t.is_empty() {
        out.push(t);
    }
    out
}

pub async fn apply_migration_sql(
    pool: &AnyPool,
    storage: &SqlitePool,
    connection_id: &str,
    source_label: &str,
    target_label: &str,
    sql_script: &str,
    dry_run: bool,
) -> Result<ApplyMigrationResult, String> {
    let start = Instant::now();
    let run_id = migrations_log::new_run_id();
    let statements = split_sql_statements(sql_script);
    if statements.is_empty() {
        return Err("No SQL statements to apply".into());
    }

    if dry_run {
        let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
        let run = MigrationRun {
            id: run_id.clone(),
            source_connection: source_label.to_string(),
            target_connection: target_label.to_string(),
            sql_script: sql_script.to_string(),
            dry_run: true,
            success: true,
            error: None,
            statements_run: statements.len() as i64,
            duration_ms,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        let _ = migrations_log::log_migration_run(storage, &run).await;
        return Ok(ApplyMigrationResult {
            success: true,
            dry_run: true,
            statements_run: statements.len() as i64,
            duration_ms,
            error: None,
            run_id,
        });
    }

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin migration transaction: {}", e))?;
    let mut ran = 0i64;
    for stmt in &statements {
        match sqlx::query(stmt).execute(&mut *tx).await {
            Ok(_) => ran += 1,
            Err(e) => {
                let _ = tx.rollback().await;
                let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
                let err = format!("Statement {} failed: {}", ran + 1, e);
                let run = MigrationRun {
                    id: run_id.clone(),
                    source_connection: source_label.to_string(),
                    target_connection: target_label.to_string(),
                    sql_script: sql_script.to_string(),
                    dry_run: false,
                    success: false,
                    error: Some(err.clone()),
                    statements_run: ran,
                    duration_ms,
                    created_at: chrono::Utc::now().to_rfc3339(),
                };
                let _ = migrations_log::log_migration_run(storage, &run).await;
                return Ok(ApplyMigrationResult {
                    success: false,
                    dry_run: false,
                    statements_run: ran,
                    duration_ms,
                    error: Some(err),
                    run_id,
                });
            }
        }
    }
    tx.commit()
        .await
        .map_err(|e| format!("Migration COMMIT failed: {}", e))?;
    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
    let run = MigrationRun {
        id: run_id.clone(),
        source_connection: source_label.to_string(),
        target_connection: target_label.to_string(),
        sql_script: sql_script.to_string(),
        dry_run: false,
        success: true,
        error: None,
        statements_run: ran,
        duration_ms,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = migrations_log::log_migration_run(storage, &run).await;
    let _ = audit::log_action(
        connection_id,
        "MIGRATION",
        &format!("Applied {} statements", ran),
        ran as u64,
        "SUCCESS",
    );
    Ok(ApplyMigrationResult {
        success: true,
        dry_run: false,
        statements_run: ran,
        duration_ms,
        error: None,
        run_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_two_statements_and_ignores_semicolon_in_string() {
        let stmts = split_sql_statements("SELECT 'a;b';\nDELETE FROM t WHERE id=1;");
        assert_eq!(stmts.len(), 2);
        assert!(stmts[0].contains("SELECT"));
        assert!(stmts[1].contains("DELETE"));
    }
}
