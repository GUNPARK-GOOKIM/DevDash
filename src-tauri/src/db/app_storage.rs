// Embedded SQLite database manager for internal app settings, connection profiles, and saved queries using sqlx
use serde::{Deserialize, Serialize}; // Import Serde traits for JSON serialization and deserialization
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions}; // Import sqlx sqlite pool and connection options
use sqlx::Row; // Import Row trait for extracting database columns
use std::str::FromStr; // Import FromStr trait for parsing connection strings

// Saved connection profile struct stored locally (excluding plain password)
#[derive(Debug, Serialize, Deserialize, Clone)] // Derive standard traits for JSON encoding
pub struct SavedConnectionProfile { // Struct definition for saved connection configuration
    pub id: String, // Unique identifier UUID string for connection
    pub name: String, // User-friendly display name (e.g. "Prod DB")
    pub db_type: String, // Database engine type string ("postgres", "mysql", "sqlite")
    pub host: String, // Hostname or IP address string
    pub port: u16, // Port number (e.g. 5432, 3306)
    pub user: String, // Database username string
    pub database: String, // Target database name string
    pub project_path: Option<String>, // Bound local workspace project directory path
} // End of SavedConnectionProfile struct definition

// Saved query struct bound to workspace project path
#[derive(Debug, Serialize, Deserialize, Clone)] // Derive standard traits for JSON encoding
pub struct SavedQueryItem { // Struct definition for saved query item
    pub id: String, // Unique query identifier UUID string
    pub name: String, // Saved query name string
    pub sql_content: String, // SQL code content string
    pub project_path: String, // Associated local workspace directory path
    pub created_at: String, // ISO timestamp string of query creation
} // End of SavedQueryItem struct definition

// AppStorage thread-safe wrapper managing embedded SQLite database pool
#[derive(Clone)] // Derive Clone for cheap pool reference sharing
pub struct AppStorage { // Struct definition for embedded storage manager
    pool: SqlitePool, // SqlitePool instance managing embedded SQLite connections
} // End of AppStorage struct definition

impl AppStorage { // Implementation block for AppStorage struct
    // Initialize embedded SQLite database file or memory store asynchronously and run migration DDL
    pub async fn new(db_path: &str) -> Result<Self, String> { // Async AppStorage constructor function
        let connection_string = if db_path == ":memory:" { // Check if in-memory DB path requested
            "sqlite::memory:".to_string() // Format SQLite in-memory connection string
        } else { // File-based DB path requested
            format!("sqlite:{}?mode=rwc", db_path) // Format SQLite file connection string with read-write-create mode
        }; // End of connection string formatting

        let options = SqliteConnectOptions::from_str(&connection_string) // Parse SQLite connect options
            .map_err(|e| format!("Failed to parse sqlite options: {}", e))? // Handle options parsing error
            .create_if_missing(true); // Ensure SQLite database file is created if missing

        let pool = SqlitePoolOptions::new() // Initialize SqlitePoolOptions builder
            .max_connections(5) // Set max active connections to 5
            .connect_with(options) // Connect asynchronously with options
            .await // Await pool connection result
            .map_err(|e| format!("Failed to open app storage DB: {}", e))?; // Handle pool creation error

        // Execute DDL migration statements to create tables if they do not exist
        sqlx::query( // Prepare dynamic SQL query for schema migration
            "CREATE TABLE IF NOT EXISTS connection_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                db_type TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                user TEXT NOT NULL,
                database TEXT NOT NULL,
                project_path TEXT
            );", // Table migration string for connection profiles
        ).execute(&pool).await.map_err(|e| format!("Failed migration 1: {}", e))?; // Execute first migration

        sqlx::query( // Prepare dynamic SQL query for saved queries table
            "CREATE TABLE IF NOT EXISTS saved_queries (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sql_content TEXT NOT NULL,
                project_path TEXT NOT NULL,
                created_at TEXT NOT NULL
            );", // Table migration string for saved queries
        ).execute(&pool).await.map_err(|e| format!("Failed migration 2: {}", e))?; // Execute second migration

        Ok(Self { pool }) // Return initialized AppStorage instance
    } // End of AppStorage constructor

    // Insert or replace a saved query entry bound to project path
    pub async fn save_query(&self, name: &str, sql: &str, project_path: &str) -> Result<SavedQueryItem, String> { // Async save query function
        let id = uuid::Uuid::new_v4().to_string(); // Generate new unique UUID v4 identifier string
        let created_at = chrono::Utc::now().to_rfc3339(); // Get current UTC timestamp formatted as ISO-8601

        sqlx::query( // Prepare INSERT query into saved_queries table
            "INSERT INTO saved_queries (id, name, sql_content, project_path, created_at) VALUES ($1, $2, $3, $4, $5)", // SQL string
        ) // End of query call
        .bind(&id) // Bind id parameter
        .bind(name) // Bind name parameter
        .bind(sql) // Bind sql parameter
        .bind(project_path) // Bind project_path parameter
        .bind(&created_at) // Bind created_at parameter
        .execute(&self.pool) // Execute query asynchronously against pool
        .await // Await execution result
        .map_err(|e| format!("Failed to save query: {}", e))?; // Handle insertion errors

        Ok(SavedQueryItem { id, name: name.to_string(), sql_content: sql.to_string(), project_path: project_path.to_string(), created_at }) // Return saved query item
    } // End of save_query function

    // List all saved queries filtered by target project directory path
    pub async fn list_queries_for_project(&self, target_project_path: &str) -> Result<Vec<SavedQueryItem>, String> { // Async list queries function
        let rows = sqlx::query( // Prepare SELECT query filtering by project path
            "SELECT id, name, sql_content, project_path, created_at FROM saved_queries WHERE project_path = $1 ORDER BY created_at DESC", // SQL string
        ) // End of query call
        .bind(target_project_path) // Bind target_project_path parameter
        .fetch_all(&self.pool) // Fetch all matching rows asynchronously
        .await // Await fetch result
        .map_err(|e| format!("Failed to list queries: {}", e))?; // Handle query error

        let mut queries = Vec::new(); // Initialize empty queries vector
        for row in rows { // Iterate over returned rows
            queries.push(SavedQueryItem { // Map columns to SavedQueryItem struct fields
                id: row.get(0), // Extract id string
                name: row.get(1), // Extract name string
                sql_content: row.get(2), // Extract sql_content string
                project_path: row.get(3), // Extract project_path string
                created_at: row.get(4), // Extract created_at timestamp string
            }); // End of SavedQueryItem push
        } // End of row processing loop

        Ok(queries) // Return discovered project queries vector
    } // End of list_queries_for_project function

    // Delete a saved query by its ID
    pub async fn delete_query(&self, query_id: &str) -> Result<(), String> { // Async delete query function
        sqlx::query("DELETE FROM saved_queries WHERE id = $1") // Prepare DELETE query
            .bind(query_id) // Bind query ID parameter
            .execute(&self.pool) // Execute against pool
            .await // Await execution result
            .map_err(|e| format!("Failed to delete query: {}", e))?; // Handle error
        Ok(()) // Return success
    } // End of delete_query function
} // End of AppStorage implementation block

#[cfg(test)] // Conditional compilation attribute for unit tests
mod tests { // Declare internal unit testing module
    use super::*; // Import parent module items into test scope

    #[tokio::test] // Mark test function for AppStorage in-memory async test
    async fn test_in_memory_app_storage() { // Unit test verifying embedded SQLite storage operations asynchronously
        let storage = AppStorage::new(":memory:").await.unwrap(); // Initialize in-memory SQLite storage database asynchronously
        let saved = storage.save_query("Fetch All Users", "SELECT * FROM users;", "/dev/myproject").await.unwrap(); // Save mock query asynchronously
        assert_eq!(saved.name, "Fetch All Users"); // Assert saved query name matches expected string
        let list = storage.list_queries_for_project("/dev/myproject").await.unwrap(); // List saved queries for project asynchronously
        assert_eq!(list.len(), 1); // Assert exactly one saved query returned
        assert_eq!(list[0].sql_content, "SELECT * FROM users;"); // Assert saved query SQL matches expected string
    } // End of test function
} // End of tests module
