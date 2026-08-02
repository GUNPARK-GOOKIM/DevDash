//! Connection diagnostics: version, user, size, latency, basic privilege checks.

use serde::{Deserialize, Serialize};
use sqlx::{AnyPool, Row};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionDiagnostics {
    pub success: bool,
    pub latency_ms: u64,
    pub server_version: String,
    pub current_database: String,
    pub current_user: String,
    pub is_superuser: Option<bool>,
    pub max_connections: Option<i64>,
    pub active_connections: Option<i64>,
    pub database_size_pretty: Option<String>,
    pub encoding: Option<String>,
    pub uptime_seconds: Option<i64>,
    pub message: String,
    pub checks: Vec<DiagnosticCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticCheck {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

pub async fn run_connection_diagnostics(
    pool: &AnyPool,
    db_kind: &str,
) -> Result<ConnectionDiagnostics, String> {
    let start = Instant::now();
    let mut checks = Vec::new();

    // Ping
    let ping = sqlx::query("SELECT 1").execute(pool).await;
    let ping_ok = ping.is_ok();
    checks.push(DiagnosticCheck {
        name: "Ping".into(),
        ok: ping_ok,
        detail: if ping_ok {
            "SELECT 1 succeeded".into()
        } else {
            format!("{}", ping.err().unwrap())
        },
    });
    if !ping_ok {
        return Ok(ConnectionDiagnostics {
            success: false,
            latency_ms: start.elapsed().as_millis() as u64,
            server_version: String::new(),
            current_database: String::new(),
            current_user: String::new(),
            is_superuser: None,
            max_connections: None,
            active_connections: None,
            database_size_pretty: None,
            encoding: None,
            uptime_seconds: None,
            message: "Connection ping failed".into(),
            checks,
        });
    }

    let kind = db_kind.to_lowercase();
    let mut server_version = String::new();
    let mut current_database = String::new();
    let mut current_user = String::new();
    let mut is_superuser = None;
    let mut max_connections = None;
    let mut active_connections = None;
    let mut database_size_pretty = None;
    let mut encoding = None;
    let mut uptime_seconds = None;

    match kind.as_str() {
        "postgres" | "postgresql" | "cockroachdb" | "redshift" => {
            if let Ok(row) = sqlx::query(
                "SELECT version() AS v, current_database() AS db, current_user AS usr,
                        current_setting('server_encoding') AS enc",
            )
            .fetch_one(pool)
            .await
            {
                server_version = row.try_get::<String, _>("v").unwrap_or_default();
                current_database = row.try_get::<String, _>("db").unwrap_or_default();
                current_user = row.try_get::<String, _>("usr").unwrap_or_default();
                encoding = row.try_get::<String, _>("enc").ok();
            }
            if let Ok(row) = sqlx::query(
                "SELECT usesuper FROM pg_user WHERE usename = current_user",
            )
            .fetch_optional(pool)
            .await
            {
                is_superuser = row.and_then(|r| r.try_get::<bool, _>(0).ok());
            }
            if let Ok(row) = sqlx::query(
                "SELECT setting::bigint FROM pg_settings WHERE name = 'max_connections'",
            )
            .fetch_optional(pool)
            .await
            {
                max_connections = row.and_then(|r| r.try_get::<i64, _>(0).ok());
            }
            if let Ok(row) = sqlx::query(
                "SELECT count(*)::bigint FROM pg_stat_activity",
            )
            .fetch_optional(pool)
            .await
            {
                active_connections = row.and_then(|r| r.try_get::<i64, _>(0).ok());
            }
            if let Ok(row) = sqlx::query(
                "SELECT pg_size_pretty(pg_database_size(current_database())) AS sz",
            )
            .fetch_optional(pool)
            .await
            {
                database_size_pretty = row.and_then(|r| r.try_get::<String, _>("sz").ok());
            }
            if let Ok(row) = sqlx::query(
                "SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::bigint AS up",
            )
            .fetch_optional(pool)
            .await
            {
                uptime_seconds = row.and_then(|r| r.try_get::<i64, _>("up").ok());
            }
            checks.push(DiagnosticCheck {
                name: "Catalog access".into(),
                ok: !server_version.is_empty(),
                detail: if server_version.is_empty() {
                    "Could not read version()".into()
                } else {
                    "pg_catalog readable".into()
                },
            });
        }
        "mysql" | "mariadb" => {
            if let Ok(row) = sqlx::query(
                "SELECT VERSION() AS v, DATABASE() AS db, USER() AS usr,
                        @@character_set_database AS enc, @@max_connections AS mx",
            )
            .fetch_one(pool)
            .await
            {
                server_version = row.try_get::<String, _>("v").unwrap_or_default();
                current_database = row.try_get::<String, _>("db").unwrap_or_default();
                current_user = row.try_get::<String, _>("usr").unwrap_or_default();
                encoding = row.try_get::<String, _>("enc").ok();
                max_connections = row
                    .try_get::<i64, _>("mx")
                    .ok()
                    .or_else(|| row.try_get::<i32, _>("mx").ok().map(|v| v as i64));
            }
            if let Ok(row) = sqlx::query(
                "SELECT COUNT(*) AS c FROM information_schema.PROCESSLIST",
            )
            .fetch_optional(pool)
            .await
            {
                active_connections = row.and_then(|r| {
                    r.try_get::<i64, _>("c")
                        .ok()
                        .or_else(|| r.try_get::<i32, _>("c").ok().map(|v| v as i64))
                });
            }
            checks.push(DiagnosticCheck {
                name: "Catalog access".into(),
                ok: !server_version.is_empty(),
                detail: "information_schema readable".into(),
            });
        }
        _ => {
            // SQLite
            if let Ok(row) = sqlx::query("SELECT sqlite_version() AS v").fetch_one(pool).await {
                server_version = format!("SQLite {}", row.try_get::<String, _>("v").unwrap_or_default());
            }
            current_database = "main".into();
            current_user = "local".into();
            if let Ok(row) = sqlx::query(
                "SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()",
            )
            .fetch_optional(pool)
            .await
            {
                if let Some(bytes) = row.and_then(|r| r.try_get::<i64, _>("bytes").ok()) {
                    database_size_pretty = Some(format_bytes(bytes));
                }
            }
            checks.push(DiagnosticCheck {
                name: "SQLite file".into(),
                ok: true,
                detail: "Local embedded database".into(),
            });
        }
    }

    let latency_ms = start.elapsed().as_millis() as u64;
    checks.push(DiagnosticCheck {
        name: "Latency".into(),
        ok: latency_ms < 2000,
        detail: format!("{} ms round-trip for diagnostics suite", latency_ms),
    });

    Ok(ConnectionDiagnostics {
        success: true,
        latency_ms,
        server_version,
        current_database,
        current_user,
        is_superuser,
        max_connections,
        active_connections,
        database_size_pretty,
        encoding,
        uptime_seconds,
        message: "Diagnostics completed".into(),
        checks,
    })
}

fn format_bytes(bytes: i64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.2} MB", b / MB)
    } else if b >= KB {
        format!("{:.2} KB", b / KB)
    } else {
        format!("{} B", bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::any::AnyPoolOptions;

    #[tokio::test]
    async fn test_sqlite_diagnostics() {
        sqlx::any::install_default_drivers();
        let pool = AnyPoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        let d = run_connection_diagnostics(&pool, "sqlite").await.unwrap();
        assert!(d.success);
        assert!(d.server_version.to_lowercase().contains("sqlite"));
        assert!(!d.checks.is_empty());
    }
}
