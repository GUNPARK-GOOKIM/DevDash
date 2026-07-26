// Tauri IPC Command Handler Module for DevDash Frontend API Interface
use crate::db::app_storage::{AppStorage, SavedQueryItem}; // Import AppStorage and SavedQueryItem structs
use crate::db::credentials; // Import credentials module for keyring secrets management
use crate::db::executor::{execute_dynamic_query, QueryResultPayload}; // Import dynamic query execution function and payload struct
use crate::db::export; // Import export module for CSV, JSON, SQL dump operations
use crate::db::introspection::{fetch_tables, fetch_columns, analyze_primary_keys, TableInfo, ColumnInfo, PkAnalysis}; // Import introspection functions and structs
use crate::db::pool::ConnectionManager; // Import ConnectionManager for pool lookups
use crate::db::safe_mode::{analyze_sql_safety, SafetyAnalysis}; // Import safe mode analysis function
use crate::db::staged_edits::{apply_staged_edits, StagedRowEdit}; // Import staged edit execution function and payload struct
use std::sync::Arc; // Import Arc for atomic reference sharing
use tauri::State; // Import State extractor type from tauri crate
use std::collections::HashMap; // Import HashMap for tracking active query handles
use tokio::sync::Mutex; // Import Mutex for thread-safe query cancellation access

// Managed state container holding global application handles
pub struct AppState { // Struct definition for managed state
    pub connection_manager: ConnectionManager, // Multi-pool connection manager instance
    pub storage: Arc<AppStorage>, // Embedded SQLite app storage instance
    pub active_queries: Mutex<HashMap<String, tokio::task::JoinHandle<Result<QueryResultPayload, String>>>>, // Map of active query handles
} // End of AppState struct definition

// IPC Command: Save database password securely in OS Keychain
#[tauri::command] // Tauri command macro annotation
pub fn save_db_password(connection_id: String, password: String) -> Result<(), String> { // Command handler function signature
    credentials::save_password(&connection_id, &password) // Call credentials module save password function
} // End of save_db_password command

// IPC Command: Retrieve database password securely from OS Keychain
#[tauri::command] // Tauri command macro annotation
pub fn get_db_password(connection_id: String) -> Result<String, String> { // Command handler function signature
    credentials::get_password(&connection_id) // Call credentials module get password function
} // End of get_db_password command

// IPC Command: Delete stored database password from OS Keychain
#[tauri::command] // Tauri command macro annotation
pub fn delete_db_password(connection_id: String) -> Result<(), String> { // Command handler function signature
    credentials::delete_password(&connection_id) // Call credentials module delete password function
} // End of delete_db_password command

// IPC Command: Establish connection pool to target database
#[tauri::command] // Tauri command macro annotation
pub async fn connect_database( // Async command handler function
    connection_id: String, // Connection ID identifier
    connection_url: String, // Connection URI string
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<(), String> { // Command return signature
    state.connection_manager.connect(&connection_id, &connection_url).await // Call connection manager connect method
} // End of connect_database command

// IPC Command: Disconnect and remove a database connection pool
#[tauri::command] // Tauri command macro annotation
pub async fn disconnect_database( // Async command handler function
    connection_id: String, // Connection ID identifier
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<(), String> { // Command return signature
    state.connection_manager.disconnect(&connection_id).await // Call connection manager disconnect method
} // End of disconnect_database command

// IPC Command: Fetch table names and types from connected database
#[tauri::command] // Tauri command macro annotation
pub async fn get_database_tables( // Async command handler function
    connection_id: String, // Connection ID identifier
    db_kind: String, // Database engine kind identifier string
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<Vec<TableInfo>, String> { // Command return signature
    let pool = state.connection_manager.get_pool(&connection_id)?; // Lookup cached connection pool instance
    fetch_tables(&pool, &db_kind).await // Call fetch_tables introspection function asynchronously
} // End of get_database_tables command

// IPC Command: Fetch column details for a specific table
#[tauri::command] // Tauri command macro annotation
pub async fn get_table_columns( // Async command handler function
    connection_id: String, // Connection ID identifier
    db_kind: String, // Database engine kind string
    table_name: String, // Target table name string
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<Vec<ColumnInfo>, String> { // Command return signature
    let pool = state.connection_manager.get_pool(&connection_id)?; // Lookup cached connection pool
    fetch_columns(&pool, &db_kind, &table_name).await // Call fetch_columns introspection function
} // End of get_table_columns command

// IPC Command: Analyze primary key status for editing safety
#[tauri::command] // Tauri command macro annotation
pub async fn get_pk_analysis( // Async command handler function
    connection_id: String, // Connection ID identifier
    db_kind: String, // Database engine kind string
    table_name: String, // Target table name string
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<PkAnalysis, String> { // Command return signature
    let pool = state.connection_manager.get_pool(&connection_id)?; // Lookup cached connection pool
    let columns = fetch_columns(&pool, &db_kind, &table_name).await?; // Fetch column metadata
    Ok(analyze_primary_keys(&columns)) // Analyze and return PK status
} // End of get_pk_analysis command

// IPC Command: Run arbitrary dynamic SQL query and return rows payload with cancellation support
#[tauri::command] // Tauri command macro annotation
pub async fn run_sql_query( // Async command handler function
    connection_id: String, // Connection ID identifier
    query_id: String, // Unique identifier for the query execution
    sql: String, // Raw SQL string to execute
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<QueryResultPayload, String> { // Command return signature
    let pool = state.connection_manager.get_pool(&connection_id)?; // Lookup cached connection pool instance
    
    // Clone connection pool and SQL statement for task execution
    let pool_clone = pool.clone();
    let sql_clone = sql.clone();
    
    // Spawn task to run query asynchronously on thread pool
    let handle = tokio::spawn(async move {
        execute_dynamic_query(&pool_clone, &sql_clone).await
    });

    // Register active query handle
    {
        let mut active = state.active_queries.lock().await;
        active.insert(query_id.clone(), handle);
    }

    // Await completion or handle cancellation
    let result = match handle.await {
        Ok(res) => res,
        Err(e) => {
            if e.is_cancelled() {
                Err("Query cancelled by user".to_string())
            } else {
                Err(format!("Query execution panicked: {}", e))
            }
        }
    };

    // Remove query handle from active map
    {
        let mut active = state.active_queries.lock().await;
        active.remove(&query_id);
    }

    result
} // End of run_sql_query command

// IPC Command: Cancel a running database query mid-flight
#[tauri::command] // Tauri command macro annotation
pub async fn cancel_query(
    query_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut active = state.active_queries.lock().await;
    if let Some(handle) = active.remove(&query_id) {
        handle.abort(); // Cancel query execution future
        Ok(())
    } else {
        Err("No active query found with that ID".to_string())
    }
}

// IPC Command: Analyze SQL statement safety (detect destructive operations)
#[tauri::command] // Tauri command macro annotation
pub fn check_sql_safety(sql: String) -> SafetyAnalysis { // Command handler function
    analyze_sql_safety(&sql) // Call safe mode analyzer function
} // End of check_sql_safety command

// IPC Command: Commit batch staged cell edits in a transaction
#[tauri::command] // Tauri command macro annotation
pub async fn commit_staged_row_edits( // Async command handler function
    connection_id: String, // Connection ID identifier
    table_name: String, // Target database table name
    pk_column: String, // Primary key column name
    edits: Vec<StagedRowEdit>, // Vector of staged row edits to commit
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<u64, String> { // Command return signature
    let pool = state.connection_manager.get_pool(&connection_id)?; // Lookup cached connection pool instance
    apply_staged_edits(&pool, &table_name, &pk_column, edits).await // Call apply_staged_edits function asynchronously
} // End of commit_staged_row_edits command

// IPC Command: Export table data in specified format (CSV, JSON, SQL)
#[tauri::command] // Tauri command macro annotation
pub async fn export_table_data( // Async command handler function
    connection_id: String, // Connection ID identifier
    table_name: String, // Target table name
    format: String, // Export format string ("csv", "json", "sql")
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<String, String> { // Command return string result
    let pool = state.connection_manager.get_pool(&connection_id)?; // Lookup cached pool
    match format.to_lowercase().as_str() { // Match on format string
        "csv" => export::export_csv(&pool, &table_name, true).await, // Export as CSV with headers
        "json" => export::export_json(&pool, &table_name).await, // Export as JSON array
        "sql" => export::export_sql_dump(&pool, &table_name).await, // Export as SQL dump
        _ => Err(format!("Unsupported export format: {}", format)), // Return error for unknown format
    } // End format match
} // End of export_table_data command

// IPC Command: Save query bound to active workspace project path
#[tauri::command] // Tauri command macro annotation
pub async fn save_project_query( // Async command handler function signature
    name: String, // Query display name string
    sql_content: String, // Query SQL code string
    project_path: String, // Workspace directory path string
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<SavedQueryItem, String> { // Command return signature
    state.storage.save_query(&name, &sql_content, &project_path).await // Call storage save_query method asynchronously
} // End of save_project_query command

// IPC Command: List saved queries filtered by project path
#[tauri::command] // Tauri command macro annotation
pub async fn get_queries_for_project( // Async command handler function signature
    project_path: String, // Workspace directory path string
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<Vec<SavedQueryItem>, String> { // Command return signature
    state.storage.list_queries_for_project(&project_path).await // Call storage list_queries_for_project method asynchronously
} // End of get_queries_for_project command

// IPC Command: Delete a saved query by its unique identifier
#[tauri::command] // Tauri command macro annotation
pub async fn delete_saved_query( // Async command handler function
    query_id: String, // Query unique identifier string
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<(), String> { // Command return signature
    state.storage.delete_query(&query_id).await // Call storage delete_query method
} // End of delete_saved_query command
