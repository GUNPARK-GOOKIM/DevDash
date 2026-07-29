// Unified multi-database connection pool manager using sqlx::AnyPool
use dashmap::DashMap; // Import DashMap for concurrent thread-safe pool caching
use serde::{Deserialize, Serialize}; // Import Serde traits for JSON struct serialization
use sqlx::any::AnyPoolOptions; // Import AnyPoolOptions from sqlx::any
use sqlx::AnyPool; // Import AnyPool from sqlx root crate
use std::sync::Arc; // Import Arc for atomic reference counting across threads
use std::time::{Duration, Instant}; // Import Duration and Instant for latency calculation

// Cloud IAM Authentication Protocol Parameters (GAP 14)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CloudIamConfig {
    pub provider: String, // "gcp_bigquery", "aws_redshift", "azure_ad"
    pub service_account_json_path: Option<String>,
    pub aws_role_arn: Option<String>,
    pub azure_client_id: Option<String>,
    pub azure_tenant_id: Option<String>,
}

// Structured connection parameters payload
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionDetails {
    pub db_type: String, // Database engine kind (postgres, mysql, sqlite, etc.)
    pub host: String, // Server host or IP address
    pub port: u16, // Server port number
    pub user: String, // Database user account
    pub password: Option<String>, // Password credential
    pub database: String, // Database or schema name / file path
    pub ssl_mode: Option<String>, // SSL / TLS mode (disable, require, verify-full)
    pub cloud_iam: Option<CloudIamConfig>, // Cloud IAM credentials (GAP 14)
}

// Result payload for connection testing diagnostics
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestConnectionResult {
    pub success: bool, // True if TCP connection and authentication succeeded
    pub latency_ms: u64, // Roundtrip execution ping latency in milliseconds
    pub message: String, // Detailed message or exception diagnostics
}

// Helper function to build sqlx connection URL string from structured parameters
pub fn build_connection_url(details: &ConnectionDetails) -> String {
    let db_kind = details.db_type.to_lowercase();
    let pass_str = details.password.as_deref().unwrap_or("");
    
    match db_kind.as_str() {
        "sqlite" | "duckdb" => {
            if details.database.starts_with("sqlite:") || details.database.starts_with("file:") {
                details.database.clone()
            } else {
                format!("sqlite:{}?mode=rwc", details.database)
            }
        }
        "mysql" | "mariadb" => {
            if pass_str.is_empty() {
                format!("mysql://{}@{}:{}/{}", details.user, details.host, details.port, details.database)
            } else {
                format!("mysql://{}:{}@{}:{}/{}", details.user, pass_str, details.host, details.port, details.database)
            }
        }
        "mssql" => {
            format!("mssql://{}:{}@{}:{}/{}", details.user, pass_str, details.host, details.port, details.database)
        }
        _ => {
            // Default to Postgres / Cockroach / Redshift URL format
            let ssl = details.ssl_mode.as_deref().unwrap_or("prefer");
            if pass_str.is_empty() {
                format!("postgres://{}@{}:{}/{}?sslmode={}", details.user, details.host, details.port, details.database, ssl)
            } else {
                format!("postgres://{}:{}@{}:{}/{}?sslmode={}", details.user, pass_str, details.host, details.port, details.database, ssl)
            }
        }
    }
}

// Central connection manager struct holding active database pools
#[derive(Clone)]
pub struct ConnectionManager {
    pools: Arc<DashMap<String, AnyPool>>, // Thread-safe map storing pools keyed by connection ID
}

impl ConnectionManager {
    // Construct a new empty ConnectionManager instance
    pub fn new() -> Self {
        Self {
            pools: Arc::new(DashMap::new()),
        }
    }

    // Register sqlx default database drivers (Postgres, MySQL, SQLite)
    pub fn init_drivers() {
        sqlx::any::install_default_drivers();
    }

    // Test reachability and credentials for a connection config without storing pool
    pub async fn test_connection(details: &ConnectionDetails) -> TestConnectionResult {
        let url = build_connection_url(details);
        let start = Instant::now();

        let pool_res = AnyPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(Duration::from_secs(5))
            .connect(&url)
            .await;

        match pool_res {
            Ok(pool) => {
                // Execute lightweight ping query
                let ping_res = sqlx::query("SELECT 1;").execute(&pool).await;
                let elapsed = start.elapsed().as_millis() as u64;
                let _ = pool.close().await;

                match ping_res {
                    Ok(_) => TestConnectionResult {
                        success: true,
                        latency_ms: elapsed,
                        message: format!("Successfully connected to {} database ({:?}ms)", details.db_type, elapsed),
                    },
                    Err(e) => TestConnectionResult {
                        success: false,
                        latency_ms: elapsed,
                        message: format!("Connection open succeeded but ping query failed: {}", e),
                    },
                }
            }
            Err(e) => TestConnectionResult {
                success: false,
                latency_ms: start.elapsed().as_millis() as u64,
                message: format!("Failed to connect to database: {}", e),
            },
        }
    }

    // Establish a connection pool for a connection string and store it
    pub async fn connect(&self, id: &str, url: &str) -> Result<(), String> {
        let pool = AnyPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(Duration::from_secs(10))
            .connect(url)
            .await
            .map_err(|e| format!("Failed to connect to database: {}", e))?;

        self.pools.insert(id.to_string(), pool);
        Ok(())
    }

    // Connect using structured connection details
    pub async fn connect_with_details(&self, id: &str, details: &ConnectionDetails) -> Result<(), String> {
        let url = build_connection_url(details);
        self.connect(id, &url).await
    }

    // Retrieve an active connection pool reference by connection ID
    pub fn get_pool(&self, id: &str) -> Result<AnyPool, String> {
        self.pools
            .get(id)
            .map(|r| r.value().clone())
            .ok_or_else(|| format!("Connection ID '{}' is not connected or pool expired", id))
    }

    // Disconnect and remove a connection pool from cache
    pub async fn disconnect(&self, id: &str) -> Result<(), String> {
        if let Some((_, pool)) = self.pools.remove(id) {
            pool.close().await;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_connection_manager_instantiation() {
        ConnectionManager::init_drivers();
        let manager = ConnectionManager::new();
        assert!(manager.get_pool("invalid_id").is_err());
    }

    #[test]
    fn test_url_builder() {
        let details = ConnectionDetails {
            db_type: "postgres".to_string(),
            host: "localhost".to_string(),
            port: 5432,
            user: "postgres".to_string(),
            password: Some("secret".to_string()),
            database: "testdb".to_string(),
            ssl_mode: Some("disable".to_string()),
        };
        let url = build_connection_url(&details);
        assert_eq!(url, "postgres://postgres:secret@localhost:5432/testdb?sslmode=disable");
    }
}
