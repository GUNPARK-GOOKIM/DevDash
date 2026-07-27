// Embedded SQLite database manager for internal app settings, connection profiles, and saved queries using sqlx
use serde::{Deserialize, Serialize}; // Import Serde traits for JSON serialization and deserialization
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions}; // Import sqlx sqlite pool and connection options
use sqlx::Row; // Import Row trait for extracting database columns
use std::str::FromStr; // Import FromStr trait for parsing connection strings

// Saved connection profile struct stored locally (excluding plain password)
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)] // Derive standard traits for JSON encoding
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
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)] // Derive standard traits for JSON encoding
pub struct SavedQueryItem { // Struct definition for saved query item
    pub id: String, // Unique query identifier UUID string
    pub name: String, // Saved query name string
    pub sql_content: String, // SQL code content string
    pub project_path: String, // Associated local workspace directory path
    pub created_at: String, // ISO timestamp string of query creation
} // End of SavedQueryItem struct definition

// Connection Group struct for organizing database connections
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ConnectionGroup {
    pub id: String,
    pub name: String,
    pub color_tag: String,
    pub connection_ids: Vec<String>,
}

// Query History Item struct for logging executed queries
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct QueryHistoryItem {
    pub id: String,
    pub query_text: String,
    pub connection_id: String,
    pub timestamp: String,
    pub execution_time_ms: f64,
    pub row_count: i64,
    pub error: Option<String>,
}

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

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS connection_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color_tag TEXT NOT NULL,
                connection_ids TEXT NOT NULL
            );",
        ).execute(&pool).await.map_err(|e| format!("Failed migration 3: {}", e))?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS query_history (
                id TEXT PRIMARY KEY,
                query_text TEXT NOT NULL,
                connection_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                execution_time_ms REAL NOT NULL,
                row_count INTEGER NOT NULL,
                error TEXT
            );",
        ).execute(&pool).await.map_err(|e| format!("Failed migration 4: {}", e))?;

        Ok(Self { pool }) // Return initialized AppStorage instance
    } // End of AppStorage constructor

    // Save a connection profile
    pub async fn save_connection_profile(
        &self,
        name: &str,
        db_type: &str,
        host: &str,
        port: u16,
        user: &str,
        database: &str,
        project_path: Option<&str>,
    ) -> Result<SavedConnectionProfile, String> {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO connection_profiles (id, name, db_type, host, port, user, database, project_path) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);"
        )
        .bind(&id)
        .bind(name)
        .bind(db_type)
        .bind(host)
        .bind(port as i64)
        .bind(user)
        .bind(database)
        .bind(project_path)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to save connection profile: {}", e))?;

        Ok(SavedConnectionProfile {
            id,
            name: name.to_string(),
            db_type: db_type.to_string(),
            host: host.to_string(),
            port,
            user: user.to_string(),
            database: database.to_string(),
            project_path: project_path.map(|s| s.to_string()),
        })
    }

    // List all saved connection profiles
    pub async fn list_connection_profiles(&self) -> Result<Vec<SavedConnectionProfile>, String> {
        let rows = sqlx::query("SELECT id, name, db_type, host, port, user, database, project_path FROM connection_profiles;")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to fetch connection profiles: {}", e))?;

        let mut list = Vec::new();
        for r in rows {
            let port_i64: i64 = r.get("port");
            list.push(SavedConnectionProfile {
                id: r.get("id"),
                name: r.get("name"),
                db_type: r.get("db_type"),
                host: r.get("host"),
                port: port_i64 as u16,
                user: r.get("user"),
                database: r.get("database"),
                project_path: r.get("project_path"),
            });
        }
        Ok(list)
    }

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

    // List saved queries for a given project path
    pub async fn list_queries_for_project(&self, project_path: &str) -> Result<Vec<SavedQueryItem>, String> { // Async list queries function
        let rows = sqlx::query( // Prepare SELECT query filtering by project_path
            "SELECT id, name, sql_content, project_path, created_at FROM saved_queries WHERE project_path = $1 ORDER BY created_at DESC", // SQL query
        ) // End of query call
        .bind(project_path) // Bind project_path parameter
        .fetch_all(&self.pool) // Fetch all matching rows from pool
        .await // Await database query completion
        .map_err(|e| format!("Failed to fetch queries: {}", e))?; // Handle database execution error

        let mut queries = Vec::new(); // Initialize empty vector for saved query structs
        for r in rows { // Loop over fetched rows
            queries.push(SavedQueryItem { // Push parsed query struct
                id: r.get("id"), // Extract id column
                name: r.get("name"), // Extract name column
                sql_content: r.get("sql_content"), // Extract sql_content column
                project_path: r.get("project_path"), // Extract project_path column
                created_at: r.get("created_at"), // Extract created_at column
            }); // End of SavedQueryItem push
        } // End of row processing loop

        Ok(queries) // Return discovered project queries vector
    } // End of list_queries_for_project function

    // List all saved queries across all projects
    pub async fn list_all_queries(&self) -> Result<Vec<SavedQueryItem>, String> {
        let rows = sqlx::query("SELECT id, name, sql_content, project_path, created_at FROM saved_queries ORDER BY created_at DESC;")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to fetch all queries: {}", e))?;

        let mut queries = Vec::new();
        for r in rows {
            queries.push(SavedQueryItem {
                id: r.get("id"),
                name: r.get("name"),
                sql_content: r.get("sql_content"),
                project_path: r.get("project_path"),
                created_at: r.get("created_at"),
            });
        }
        Ok(queries)
    }

    // Delete a saved query by its ID
    pub async fn delete_query(&self, query_id: &str) -> Result<(), String> { // Async delete query function
        sqlx::query("DELETE FROM saved_queries WHERE id = $1") // Prepare DELETE query
            .bind(query_id) // Bind query ID parameter
            .execute(&self.pool) // Execute against pool
            .await // Await execution result
            .map_err(|e| format!("Failed to delete query: {}", e))?; // Handle error
        Ok(()) // Return success
    } // End of delete_query function

    // Create a connection group
    pub async fn create_connection_group(&self, name: &str, color_tag: &str) -> Result<ConnectionGroup, String> {
        let group_id = uuid::Uuid::new_v4().to_string();
        let json_ids = "[]".to_string();
        sqlx::query("INSERT INTO connection_groups (id, name, color_tag, connection_ids) VALUES ($1, $2, $3, $4);")
            .bind(&group_id)
            .bind(name)
            .bind(color_tag)
            .bind(&json_ids)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to create connection group: {}", e))?;

        Ok(ConnectionGroup {
            id: group_id,
            name: name.to_string(),
            color_tag: color_tag.to_string(),
            connection_ids: vec![],
        })
    }

    // Rename a connection group
    pub async fn rename_connection_group(&self, id: &str, new_name: &str) -> Result<(), String> {
        sqlx::query("UPDATE connection_groups SET name = $1 WHERE id = $2;")
            .bind(new_name)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to rename connection group: {}", e))?;
        Ok(())
    }

    // Delete a connection group
    pub async fn delete_connection_group(&self, id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM connection_groups WHERE id = $1;")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete connection group: {}", e))?;
        Ok(())
    }

    // Move connection into group
    pub async fn move_connection_into_group(&self, group_id: &str, connection_id: &str) -> Result<(), String> {
        let groups = self.get_all_connection_groups().await?;
        if let Some(group) = groups.into_iter().find(|g| g.id == group_id) {
            let mut ids = group.connection_ids;
            if !ids.contains(&connection_id.to_string()) {
                ids.push(connection_id.to_string());
            }
            self.reorder_group_connections(group_id, ids).await
        } else {
            Err("Connection group not found".to_string())
        }
    }

    // Reorder connections in group
    pub async fn reorder_group_connections(&self, group_id: &str, connection_ids: Vec<String>) -> Result<(), String> {
        let json_ids = serde_json::to_string(&connection_ids).unwrap_or_else(|_| "[]".to_string());
        sqlx::query("UPDATE connection_groups SET connection_ids = $1 WHERE id = $2;")
            .bind(&json_ids)
            .bind(group_id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to reorder connection group: {}", e))?;
        Ok(())
    }

    // Get all connection groups
    pub async fn get_all_connection_groups(&self) -> Result<Vec<ConnectionGroup>, String> {
        let rows = sqlx::query("SELECT id, name, color_tag, connection_ids FROM connection_groups;")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to fetch connection groups: {}", e))?;

        let mut groups = Vec::new();
        for r in rows {
            let id: String = r.get("id");
            let name: String = r.get("name");
            let color_tag: String = r.get("color_tag");
            let json_ids: String = r.get("connection_ids");
            let connection_ids: Vec<String> = serde_json::from_str(&json_ids).unwrap_or_default();

            groups.push(ConnectionGroup {
                id,
                name,
                color_tag,
                connection_ids,
            });
        }
        Ok(groups)
    }

    // Log query execution history
    pub async fn log_query_history(
        &self,
        query_text: &str,
        connection_id: &str,
        execution_time_ms: f64,
        row_count: i64,
        error: Option<&str>,
    ) -> Result<QueryHistoryItem, String> {
        let history_id = uuid::Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO query_history (id, query_text, connection_id, timestamp, execution_time_ms, row_count, error) VALUES ($1, $2, $3, $4, $5, $6, $7);"
        )
        .bind(&history_id)
        .bind(query_text)
        .bind(connection_id)
        .bind(&timestamp)
        .bind(execution_time_ms)
        .bind(row_count)
        .bind(error)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to log query history: {}", e))?;

        Ok(QueryHistoryItem {
            id: history_id,
            query_text: query_text.to_string(),
            connection_id: connection_id.to_string(),
            timestamp,
            execution_time_ms,
            row_count,
            error: error.map(|s| s.to_string()),
        })
    }

    // Get paginated query history (newest first)
    pub async fn get_query_history(&self, page: i64, page_size: i64) -> Result<Vec<QueryHistoryItem>, String> {
        let offset = (page - 1) * page_size;
        let rows = sqlx::query(
            "SELECT id, query_text, connection_id, timestamp, execution_time_ms, row_count, error FROM query_history ORDER BY rowid DESC LIMIT $1 OFFSET $2;"
        )
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to fetch query history: {}", e))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(QueryHistoryItem {
                id: r.get("id"),
                query_text: r.get("query_text"),
                connection_id: r.get("connection_id"),
                timestamp: r.get("timestamp"),
                execution_time_ms: r.get("execution_time_ms"),
                row_count: r.get("row_count"),
                error: r.get("error"),
            });
        }
        Ok(list)
    }

    // Search query history by keyword
    pub async fn search_query_history(&self, keyword: &str, page: i64, page_size: i64) -> Result<Vec<QueryHistoryItem>, String> {
        let offset = (page - 1) * page_size;
        let pattern = format!("%{}%", keyword);
        let rows = sqlx::query(
            "SELECT id, query_text, connection_id, timestamp, execution_time_ms, row_count, error FROM query_history WHERE query_text LIKE $1 ORDER BY rowid DESC LIMIT $2 OFFSET $3;"
        )
        .bind(&pattern)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to search query history: {}", e))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(QueryHistoryItem {
                id: r.get("id"),
                query_text: r.get("query_text"),
                connection_id: r.get("connection_id"),
                timestamp: r.get("timestamp"),
                execution_time_ms: r.get("execution_time_ms"),
                row_count: r.get("row_count"),
                error: r.get("error"),
            });
        }
        Ok(list)
    }

    // Delete a query history entry
    pub async fn delete_history_entry(&self, id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM query_history WHERE id = $1;")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete history entry: {}", e))?;
        Ok(())
    }

    // Clear all query history
    pub async fn clear_all_query_history(&self) -> Result<(), String> {
        sqlx::query("DELETE FROM query_history;")
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to clear query history: {}", e))?;
        Ok(())
    }
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

    #[tokio::test]
    async fn test_connection_groups_preservation() {
        let storage = AppStorage::new(":memory:").await.unwrap();

        // 1. Create group
        let group = storage.create_connection_group("Production DBs", "#FF5733").await.unwrap();
        assert_eq!(group.name, "Production DBs");

        // 2. Add 2 connections
        storage.move_connection_into_group(&group.id, "conn-101").await.unwrap();
        storage.move_connection_into_group(&group.id, "conn-102").await.unwrap();

        // 3. Reorder connections
        storage.reorder_group_connections(&group.id, vec!["conn-102".to_string(), "conn-101".to_string()]).await.unwrap();

        // 4. Reload groups and verify structure exact match
        let groups = storage.get_all_connection_groups().await.unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].connection_ids, vec!["conn-102", "conn-101"]);
    }

    #[tokio::test]
    async fn test_query_history_10_sequence() {
        let storage = AppStorage::new(":memory:").await.unwrap();

        // Log 10 queries in sequence
        for i in 1..=10 {
            let sql = format!("SELECT * FROM table_{};", i);
            storage.log_query_history(&sql, "conn-1", 12.5 + i as f64, i * 10, None).await.unwrap();
        }

        let history = storage.get_query_history(1, 20).await.unwrap();
        assert_eq!(history.len(), 10);
        // Newest first order check
        assert_eq!(history[0].query_text, "SELECT * FROM table_10;");
        assert_eq!(history[0].row_count, 100);
        assert_eq!(history[9].query_text, "SELECT * FROM table_1;");
        assert_eq!(history[9].row_count, 10);
    }
} // End of tests module
