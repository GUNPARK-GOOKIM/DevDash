// Tauri IPC Command Handler Module for DevDash Frontend API Interface
use crate::db::app_storage::{AppStorage, ConnectionGroup, QueryHistoryItem, SavedQueryItem}; // Import AppStorage, ConnectionGroup, QueryHistoryItem, and SavedQueryItem structs
use crate::db::credentials; // Import credentials module for keyring secrets management
use crate::db::executor::{execute_dynamic_query, QueryResultPayload}; // Import dynamic query execution function and payload struct
use crate::db::export; // Import export module for CSV, JSON, SQL dump operations
use crate::db::introspection::{fetch_tables, fetch_tables_managed, fetch_columns, fetch_columns_managed, analyze_primary_keys, TableInfo, ColumnInfo, PkAnalysis}; // Import introspection functions and structs
use crate::db::pool::{ConnectionManager, ConnectionDetails, TestConnectionResult}; // Import ConnectionManager, ConnectionDetails, and TestConnectionResult
use crate::db::safe_mode::{analyze_sql_safety, SafetyAnalysis}; // Import safe mode analysis function
use crate::db::staged_edits::{
    apply_staged_deletes, apply_staged_edits, apply_staged_inserts, StagedDeleteRow,
    StagedInsertRow, StagedRowEdit,
};
use crate::db::ddl::{fetch_indexes, generate_table_ddl, IndexInfo, TableDdlResult};
use crate::db::json_tree::{parse_json_tree, JsonParseResult}; // Import JSON tree viewer parser
use crate::db::chart_formatter::{format_query_result_for_chart, ColumnInput, FormattedChartData}; // Import chart data formatter
use crate::db::schema_migration::{generate_schema_migration, EngineDialect, MigrationDiffResult, TableSnapshot}; // Import schema migration generator
use crate::db::structure_editor::{
    build_add_column_sql, build_add_index_sql, build_change_type_sql, build_drop_column_sql,
    build_drop_index_sql, build_rename_column_sql, build_set_nullable_sql, execute_structure_sql,
    AddColumnPayload, AddIndexPayload, ChangeTypePayload, DropColumnPayload, DropIndexPayload,
    RenameColumnPayload, SetNullablePayload,
}; // Import structure editor builders & executor
use crate::db::row_formatter::{format_row_all_formats, FormattedRowResult}; // Import row formatter for context menu
use crate::db::metrics_board::{fetch_live_database_metrics, DatabaseLiveMetrics}; // Import live metrics collector
use crate::db::autocomplete::{fetch_autocomplete_data, AutocompleteDataPayload}; // Import autocomplete provider
use crate::db::shortcut_config::{
    load_shortcut_config, reset_shortcut_config as reset_shortcuts,
    update_shortcut_binding as update_shortcut, ShortcutConfig,
}; // Import shortcut config manager
use crate::db::csv_import::{
    execute_csv_import, execute_csv_import_content, preview_csv_file, ImportExecutionResult,
    ImportPreviewPayload,
};
use crate::db::encrypted_export::{
    export_connections_and_queries, export_connections_to_string, import_connections_and_queries,
    import_connections_from_string, ExportPayload,
}; // Import AES-256 encrypted export engine
use crate::db::ssh_tunnel::{SshConfigPayload, SshTunnelManager}; // Import SSH tunnel manager and types
use crate::db::audit::{self, AuditEntry}; // Import audit trail logger
use crate::db::transactions::{TransactionManager, TxStatus};
use crate::db::diagnostics::{run_connection_diagnostics, ConnectionDiagnostics};
use crate::db::profiler::{profile_query, QueryProfile};
use crate::db::migrations_log::{self, MigrationRun};
use crate::db::redis::{self, RedisKeyInfo};
use std::sync::Arc; // Import Arc for atomic reference sharing
use tauri::State; // Import State extractor type from tauri crate

use std::collections::HashMap; // Import HashMap for tracking active query handles
use tokio::sync::Mutex; // Import Mutex for thread-safe query cancellation access

// Managed state container holding global application handles
pub struct AppState { // Struct definition for managed state
    pub connection_manager: ConnectionManager, // Multi-pool connection manager instance
    pub storage: Arc<AppStorage>, // Embedded SQLite app storage instance
    pub active_queries: Mutex<HashMap<String, tokio::task::AbortHandle>>, // Map of active query cancellation handles
    pub ssh_tunnel_manager: SshTunnelManager, // Native SSH tunnel manager handle
    pub tx_manager: TransactionManager, // Explicit GUI transaction sessions
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
#[tauri::command]
pub fn delete_db_password(connection_id: String) -> Result<(), String> {
    credentials::delete_password(&connection_id)
}

// IPC Command: Save arbitrary secret (AI API keys, etc.) in OS keychain
#[tauri::command]
pub fn save_secret(account: String, secret: String) -> Result<(), String> {
    credentials::save_secret(&account, &secret)
}

#[tauri::command]
pub fn get_secret(account: String) -> Result<String, String> {
    credentials::get_secret(&account)
}

#[tauri::command]
pub fn delete_secret(account: String) -> Result<(), String> {
    credentials::delete_secret(&account)
}

// IPC Command: Parse JSON cell string into structured tree
#[tauri::command]
pub fn parse_json_cell(json_str: String) -> JsonParseResult {
    parse_json_tree(&json_str)
}

// IPC Command: Format query result into chart-ready series & suggested chart type
#[tauri::command]
pub fn format_chart_data(
    columns: Vec<ColumnInput>,
    rows: Vec<Vec<serde_json::Value>>,
) -> FormattedChartData {
    format_query_result_for_chart(&columns, &rows)
}

// IPC Command: Diff schema snapshot against current table schema and generate ALTER TABLE SQL
#[tauri::command]
pub fn generate_migration_sql(
    snapshot: TableSnapshot,
    current: TableSnapshot,
    engine: EngineDialect,
) -> MigrationDiffResult {
    generate_schema_migration(&snapshot, &current, engine)
}

// IPC Command: Add column to table
#[tauri::command]
pub async fn structure_add_column(
    connection_id: String,
    payload: AddColumnPayload,
    engine: EngineDialect,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let sql = build_add_column_sql(&payload, engine)?;
    execute_structure_sql(&pool, &sql).await
}

// IPC Command: Drop column from table
#[tauri::command]
pub async fn structure_drop_column(
    connection_id: String,
    payload: DropColumnPayload,
    engine: EngineDialect,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let sql = build_drop_column_sql(&payload, engine)?;
    execute_structure_sql(&pool, &sql).await
}

// IPC Command: Rename column in table
#[tauri::command]
pub async fn structure_rename_column(
    connection_id: String,
    payload: RenameColumnPayload,
    engine: EngineDialect,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let sql = build_rename_column_sql(&payload, engine);
    execute_structure_sql(&pool, &sql).await
}

// IPC Command: Change column type
#[tauri::command]
pub async fn structure_change_type(
    connection_id: String,
    payload: ChangeTypePayload,
    engine: EngineDialect,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let sql = build_change_type_sql(&payload, engine);
    execute_structure_sql(&pool, &sql).await
}

// IPC Command: Set column nullable / not null
#[tauri::command]
pub async fn structure_set_nullable(
    connection_id: String,
    payload: SetNullablePayload,
    engine: EngineDialect,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let sql = build_set_nullable_sql(&payload, engine);
    execute_structure_sql(&pool, &sql).await
}

// IPC Command: Add index on table columns
#[tauri::command]
pub async fn structure_add_index(
    connection_id: String,
    payload: AddIndexPayload,
    engine: EngineDialect,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let sql = build_add_index_sql(&payload, engine);
    execute_structure_sql(&pool, &sql).await
}

// IPC Command: Drop index from table
#[tauri::command]
pub async fn structure_drop_index(
    connection_id: String,
    payload: DropIndexPayload,
    engine: EngineDialect,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let sql = build_drop_index_sql(&payload, engine);
    execute_structure_sql(&pool, &sql).await
}

// IPC Command: Format row for right-click context menu into raw, JSON, CSV, and SQL INSERT formats
#[tauri::command]
pub fn format_row_context(
    table_name: String,
    columns: Vec<String>,
    values: Vec<serde_json::Value>,
) -> FormattedRowResult {
    format_row_all_formats(&table_name, &columns, &values)
}

// IPC Command: Get live database metrics
#[tauri::command]
pub async fn get_live_database_metrics(
    connection_id: String,
    engine: EngineDialect,
    state: State<'_, AppState>,
) -> Result<DatabaseLiveMetrics, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    fetch_live_database_metrics(&pool, engine).await
}

// IPC Command: Create a connection group
#[tauri::command]
pub async fn create_connection_group(
    name: String,
    color_tag: String,
    state: State<'_, AppState>,
) -> Result<ConnectionGroup, String> {
    state.storage.create_connection_group(&name, &color_tag).await
}

// IPC Command: Rename a connection group
#[tauri::command]
pub async fn rename_connection_group(
    id: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.storage.rename_connection_group(&id, &new_name).await
}

// IPC Command: Delete a connection group
#[tauri::command]
pub async fn delete_connection_group(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.storage.delete_connection_group(&id).await
}

// IPC Command: Move connection into group
#[tauri::command]
pub async fn move_connection_into_group(
    group_id: String,
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.storage.move_connection_into_group(&group_id, &connection_id).await
}

// IPC Command: Reorder connections within group
#[tauri::command]
pub async fn reorder_group_connections(
    group_id: String,
    connection_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.storage.reorder_group_connections(&group_id, connection_ids).await
}

// IPC Command: Get all connection groups
#[tauri::command]
pub async fn get_all_connection_groups(
    state: State<'_, AppState>,
) -> Result<Vec<ConnectionGroup>, String> {
    state.storage.get_all_connection_groups().await
}

// IPC Command: Test reachability and credentials for target database
#[tauri::command]
pub async fn test_db_connection(details: ConnectionDetails) -> TestConnectionResult {
    ConnectionManager::test_connection(&details).await
}

// IPC Command: Connect to target database using structured ConnectionDetails
#[tauri::command]
pub async fn connect_database_config(
    connection_id: String,
    details: ConnectionDetails,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.connection_manager.connect_with_details(&connection_id, &details).await
}

// IPC Command: Establish connection pool to target database
#[tauri::command]
pub async fn connect_database(
    connection_id: String,
    connection_url: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Legacy URL-only connect: infer a coarse dialect from the scheme for quoting later
    let db_type = if connection_url.starts_with("mysql") {
        "mysql"
    } else if connection_url.starts_with("sqlite") {
        "sqlite"
    } else {
        "postgres"
    };
    state
        .connection_manager
        .connect(&connection_id, &connection_url, db_type)
        .await
}

// IPC Command: Disconnect and remove a database connection pool
#[tauri::command] // Tauri command macro annotation
pub async fn disconnect_database( // Async command handler function
    connection_id: String, // Connection ID identifier
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<(), String> { // Command return signature
    state.tx_manager.force_drop(&connection_id).await;
    state.connection_manager.disconnect(&connection_id).await // Call connection manager disconnect method
} // End of disconnect_database command

// IPC Command: Fetch table names and types from connected database
#[tauri::command] // Tauri command macro annotation
pub async fn get_database_tables( // Async command handler function
    connection_id: String, // Connection ID identifier
    _db_kind: String, // Database engine kind identifier string
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<Vec<TableInfo>, String> { // Command return signature
    let managed = state.connection_manager.get_managed_connection(&connection_id)?;
    fetch_tables_managed(&managed).await
} // End of get_database_tables command

// IPC Command: Fetch column details for a specific table
#[tauri::command] // Tauri command macro annotation
pub async fn get_table_columns( // Async command handler function
    connection_id: String, // Connection ID identifier
    _db_kind: String, // Database engine kind string
    table_name: String, // Target table name string
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<Vec<ColumnInfo>, String> { // Command return signature
    let managed = state.connection_manager.get_managed_connection(&connection_id)?;
    fetch_columns_managed(&managed, &table_name).await // Call fetch_columns introspection function
} // End of get_table_columns command

// IPC Command: Analyze primary key status for editing safety
#[tauri::command] // Tauri command macro annotation
pub async fn get_pk_analysis( // Async command handler function
    connection_id: String, // Connection ID identifier
    _db_kind: String, // Database engine kind string
    table_name: String, // Target table name string
    state: State<'_, AppState>, // Extracted global AppState handle
) -> Result<PkAnalysis, String> { // Command return signature
    let managed = state.connection_manager.get_managed_connection(&connection_id)?;
    let columns = fetch_columns_managed(&managed, &table_name).await?; // Fetch column metadata
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
    // Prefer open transaction session when present.
    // On TX SQL failure, surface the error — do NOT fall through to the pool
    // (which would re-run the statement outside the held connection / auto-commit).
    match state.tx_manager.execute_in_tx(&connection_id, &sql).await {
        Ok(Some(payload)) => {
            let row_count = if !payload.rows.is_empty() {
                payload.rows.len() as i64
            } else {
                payload.affected_rows as i64
            };
            let _ = state
                .storage
                .log_query_history(
                    &sql,
                    &connection_id,
                    payload.execution_time_ms as f64,
                    row_count,
                    None,
                )
                .await;
            let _ = audit::log_action(
                &connection_id,
                "QUERY_TX",
                &sql,
                payload.affected_rows,
                "SUCCESS",
            );
            return Ok(payload);
        }
        Err(e) => {
            let _ = audit::log_action(&connection_id, "QUERY_TX", &sql, 0, "ERROR");
            return Err(e);
        }
        Ok(None) => {
            // No active transaction for this connection — continue on pool
        }
    }

    let managed_conn = state.connection_manager.get_managed_connection(&connection_id)?; // Lookup cached connection pool instance
    
    // Clone connection pool and SQL statement for task execution
    let conn_clone = managed_conn.clone();
    let sql_clone = sql.clone();
    
    // Spawn task to run query asynchronously on thread pool
    let handle = tokio::spawn(async move {
        execute_dynamic_query(&conn_clone, &sql_clone).await
    });

    // Register active query handle
    {
        let mut active = state.active_queries.lock().await;
        active.insert(query_id.clone(), handle.abort_handle());
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

    // Auto-log query in query_history storage and append-only audit trail
    match &result {
        Ok(payload) => {
            let row_count = if !payload.rows.is_empty() {
                payload.rows.len() as i64
            } else {
                payload.affected_rows as i64
            };
            let _ = state
                .storage
                .log_query_history(&sql, &connection_id, payload.execution_time_ms as f64, row_count, None)
                .await;
            let _ = audit::log_action(
                &connection_id,
                "QUERY",
                &sql,
                payload.affected_rows,
                "SUCCESS",
            );
        }
        Err(err_msg) => {
            let _ = state
                .storage
                .log_query_history(&sql, &connection_id, 0.0, 0, Some(err_msg))
                .await;
            let _ = audit::log_action(&connection_id, "QUERY", &sql, 0, "FAILED");
        }
    }

    result
} // End of run_sql_query command

// ─── Multi-connection workspace ──────────────────────────────────────
#[tauri::command]
pub fn list_connected_ids(state: State<'_, AppState>) -> Vec<String> {
    state.connection_manager.list_connected_ids()
}

// ─── Transaction manager ─────────────────────────────────────────────
#[tauri::command]
pub async fn begin_transaction(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<TxStatus, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    state.tx_manager.begin(&pool, &connection_id).await
}

#[tauri::command]
pub async fn commit_transaction(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<TxStatus, String> {
    state.tx_manager.commit(&connection_id).await
}

#[tauri::command]
pub async fn rollback_transaction(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<TxStatus, String> {
    state.tx_manager.rollback(&connection_id).await
}

#[tauri::command]
pub async fn get_transaction_status(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<TxStatus, String> {
    Ok(state.tx_manager.status(&connection_id).await)
}

// ─── Connection diagnostics ──────────────────────────────────────────
#[tauri::command]
pub async fn diagnose_connection(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<ConnectionDiagnostics, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let db_kind = state
        .connection_manager
        .get_db_type(&connection_id)
        .unwrap_or_else(|_| "postgres".into());
    run_connection_diagnostics(&pool, &db_kind).await
}

// ─── Query profiling ─────────────────────────────────────────────────
#[tauri::command]
pub async fn profile_sql_query(
    connection_id: String,
    sql: String,
    state: State<'_, AppState>,
) -> Result<QueryProfile, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let db_kind = state
        .connection_manager
        .get_db_type(&connection_id)
        .unwrap_or_else(|_| "postgres".into());
    profile_query(&pool, &db_kind, &sql).await
}

// ─── Migration apply workflow ────────────────────────────────────────
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ApplyMigrationResult {
    pub success: bool,
    pub dry_run: bool,
    pub statements_run: i64,
    pub duration_ms: f64,
    pub error: Option<String>,
    pub run_id: String,
}

#[tauri::command]
pub async fn apply_migration_sql(
    connection_id: String,
    source_label: String,
    target_label: String,
    sql_script: String,
    dry_run: bool,
    state: State<'_, AppState>,
) -> Result<ApplyMigrationResult, String> {
    use std::time::Instant;
    let start = Instant::now();
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let run_id = migrations_log::new_run_id();

    // Split on ; outside strings (simple)
    let statements: Vec<String> = split_sql_simple(&sql_script);
    if statements.is_empty() {
        return Err("No SQL statements to apply".into());
    }

    if dry_run {
        let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
        let run = MigrationRun {
            id: run_id.clone(),
            source_connection: source_label,
            target_connection: target_label,
            sql_script,
            dry_run: true,
            success: true,
            error: None,
            statements_run: statements.len() as i64,
            duration_ms,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        let _ = migrations_log::log_migration_run(state.storage.pool(), &run).await;
        return Ok(ApplyMigrationResult {
            success: true,
            dry_run: true,
            statements_run: statements.len() as i64,
            duration_ms,
            error: None,
            run_id,
        });
    }

    // Apply inside a real transaction
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
                    source_connection: source_label,
                    target_connection: target_label,
                    sql_script,
                    dry_run: false,
                    success: false,
                    error: Some(err.clone()),
                    statements_run: ran,
                    duration_ms,
                    created_at: chrono::Utc::now().to_rfc3339(),
                };
                let _ = migrations_log::log_migration_run(state.storage.pool(), &run).await;
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
        source_connection: source_label,
        target_connection: target_label,
        sql_script,
        dry_run: false,
        success: true,
        error: None,
        statements_run: ran,
        duration_ms,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = migrations_log::log_migration_run(state.storage.pool(), &run).await;
    let _ = audit::log_action(
        &connection_id,
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

#[tauri::command]
pub async fn list_migration_runs(
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<MigrationRun>, String> {
    migrations_log::list_migration_runs(state.storage.pool(), limit.unwrap_or(50)).await
}

fn split_sql_simple(sql: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let chars: Vec<char> = sql.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '\'' && !in_double {
            in_single = !in_single;
            cur.push(c);
        } else if c == '"' && !in_single {
            in_double = !in_double;
            cur.push(c);
        } else if c == ';' && !in_single && !in_double {
            let t = cur.trim().to_string();
            if !t.is_empty() && !t.starts_with("--") {
                out.push(t);
            }
            cur.clear();
        } else {
            cur.push(c);
        }
        i += 1;
    }
    let t = cur.trim().to_string();
    if !t.is_empty() {
        out.push(t);
    }
    out
}

// IPC Command: Stream dynamic query rows in chunks of 500 rows over Tauri IPC events
#[tauri::command]
pub async fn stream_sql_query(
    connection_id: String,
    query_id: String,
    sql: String,
    chunk_size: Option<usize>,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<QueryResultPayload, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let size = chunk_size.unwrap_or(500);
    crate::db::executor::stream_dynamic_query(&app_handle, &pool, &query_id, &sql, size).await
}

// IPC Command: Get paginated query history
#[tauri::command]
pub async fn get_query_history(
    page: i64,
    page_size: i64,
    state: State<'_, AppState>,
) -> Result<Vec<QueryHistoryItem>, String> {
    state.storage.get_query_history(page, page_size).await
}

// IPC Command: Search query history by keyword
#[tauri::command]
pub async fn search_query_history(
    keyword: String,
    page: i64,
    page_size: i64,
    state: State<'_, AppState>,
) -> Result<Vec<QueryHistoryItem>, String> {
    state.storage.search_query_history(&keyword, page, page_size).await
}

// IPC Command: Delete a query history entry
#[tauri::command]
pub async fn delete_history_entry(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.storage.delete_history_entry(&id).await
}

// IPC Command: Clear all query history
#[tauri::command]
pub async fn clear_all_query_history(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.storage.clear_all_query_history().await
}

// IPC Command: Get complete autocomplete schema, table, and column map for connection
#[tauri::command]
pub async fn get_autocomplete_data(
    connection_id: String,
    db_kind: String,
    state: State<'_, AppState>,
) -> Result<AutocompleteDataPayload, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    fetch_autocomplete_data(&pool, &db_kind).await
}

fn get_shortcuts_path() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("devdash")
        .join("shortcuts.json")
}

// IPC Command: Get keyboard shortcut configuration
#[tauri::command]
pub fn get_shortcut_config() -> ShortcutConfig {
    load_shortcut_config(&get_shortcuts_path())
}

// IPC Command: Update a keyboard shortcut binding with conflict checking
#[tauri::command]
pub fn update_shortcut_binding(action_id: String, new_key_combo: String) -> Result<ShortcutConfig, String> {
    update_shortcut(&get_shortcuts_path(), &action_id, &new_key_combo)
}

// IPC Command: Reset keyboard shortcuts to defaults
#[tauri::command]
pub fn reset_shortcut_config() -> Result<ShortcutConfig, String> {
    reset_shortcuts(&get_shortcuts_path())
}

// IPC Command: Preview uploaded CSV file headers and top 5 rows
#[tauri::command]
pub fn preview_csv_data(file_path: String) -> Result<ImportPreviewPayload, String> {
    preview_csv_file(std::path::Path::new(&file_path))
}

// IPC Command: Execute CSV data import into target database table
#[tauri::command]
pub async fn import_csv_data(
    connection_id: String,
    table_name: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<ImportExecutionResult, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let db_type = state
        .connection_manager
        .get_db_type(&connection_id)
        .unwrap_or_else(|_| "postgres".to_string());
    let mysql_style = crate::db::pool::ConnectionManager::is_mysql_style(&db_type);
    execute_csv_import(
        &pool,
        &table_name,
        std::path::Path::new(&file_path),
        mysql_style,
    )
    .await
}

// IPC Command: Import CSV from in-memory content (browser FileReader path)
#[tauri::command]
pub async fn import_csv_content(
    connection_id: String,
    table_name: String,
    csv_content: String,
    state: State<'_, AppState>,
) -> Result<ImportExecutionResult, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let db_type = state
        .connection_manager
        .get_db_type(&connection_id)
        .unwrap_or_else(|_| "postgres".to_string());
    let mysql_style = crate::db::pool::ConnectionManager::is_mysql_style(&db_type);
    let result = execute_csv_import_content(&pool, &table_name, &csv_content, mysql_style).await;
    if let Ok(ref r) = result {
        let _ = audit::log_action(
            &connection_id,
            "CSV_IMPORT",
            &format!("IMPORT CSV into {} ({} inserted)", table_name, r.inserted_count),
            r.inserted_count as u64,
            if r.failed_count == 0 {
                "SUCCESS"
            } else {
                "PARTIAL"
            },
        );
    }
    result
}

// IPC Command: Export connections and queries to AES-256 encrypted JSON file
#[tauri::command]
pub async fn export_encrypted_data(
    export_path: String,
    passphrase: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    export_connections_and_queries(&state.storage, std::path::Path::new(&export_path), &passphrase).await
}

// IPC Command: Import connections and queries from AES-256 encrypted JSON file
#[tauri::command]
pub async fn import_encrypted_data(
    import_path: String,
    passphrase: String,
    state: State<'_, AppState>,
) -> Result<ExportPayload, String> {
    import_connections_and_queries(&state.storage, std::path::Path::new(&import_path), &passphrase).await
}

// IPC Command: Export connections and queries as AES-256 encrypted text string
#[tauri::command]
pub async fn export_connections_to_text(
    connection_ids: Option<Vec<String>>,
    passphrase: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    export_connections_to_string(&state.storage, connection_ids, &passphrase).await
}

// IPC Command: Import connections and queries from AES-256 encrypted text string
#[tauri::command]
pub async fn import_connections_from_text(
    encrypted_payload: String,
    passphrase: String,
    state: State<'_, AppState>,
) -> Result<ExportPayload, String> {
    import_connections_from_string(&state.storage, &encrypted_payload, &passphrase).await
}

// IPC Command: Protocol-level query cancellation (pg_cancel_backend / KILL QUERY)
#[tauri::command]
pub async fn cancel_backend_query(
    connection_id: String,
    pid_or_thread_id: u32,
    db_kind: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    crate::db::executor::cancel_backend_process(&pool, pid_or_thread_id, &db_kind).await
}

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
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let db_type = state
        .connection_manager
        .get_db_type(&connection_id)
        .unwrap_or_else(|_| "postgres".to_string());
    let mysql_style = crate::db::pool::ConnectionManager::is_mysql_style(&db_type);
    let result = apply_staged_edits(&pool, &table_name, &pk_column, edits, mysql_style).await;
    match &result {
        Ok(count) => {
            let _ = audit::log_action(
                &connection_id,
                "STAGED_COMMIT",
                &format!("COMMIT staged edits on {}", table_name),
                *count,
                "SUCCESS",
            );
        }
        Err(err) => {
            let _ = audit::log_action(
                &connection_id,
                "STAGED_COMMIT",
                &format!("COMMIT staged edits on {} failed: {}", table_name, err),
                0,
                "FAILED",
            );
        }
    }
    result
} // End of commit_staged_row_edits command

// IPC Command: Commit staged INSERT rows in a transaction
#[tauri::command]
pub async fn commit_staged_inserts(
    connection_id: String,
    table_name: String,
    rows: Vec<StagedInsertRow>,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let db_type = state
        .connection_manager
        .get_db_type(&connection_id)
        .unwrap_or_else(|_| "postgres".to_string());
    let mysql_style = crate::db::pool::ConnectionManager::is_mysql_style(&db_type);
    let result = apply_staged_inserts(&pool, &table_name, rows, mysql_style).await;
    if let Ok(count) = &result {
        let _ = audit::log_action(
            &connection_id,
            "STAGED_INSERT",
            &format!("INSERT {} row(s) into {}", count, table_name),
            *count,
            "SUCCESS",
        );
    }
    result
}

// IPC Command: Commit staged DELETE rows in a transaction
#[tauri::command]
pub async fn commit_staged_deletes(
    connection_id: String,
    table_name: String,
    pk_column: String,
    rows: Vec<StagedDeleteRow>,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let db_type = state
        .connection_manager
        .get_db_type(&connection_id)
        .unwrap_or_else(|_| "postgres".to_string());
    let mysql_style = crate::db::pool::ConnectionManager::is_mysql_style(&db_type);
    let result = apply_staged_deletes(&pool, &table_name, &pk_column, rows, mysql_style).await;
    if let Ok(count) = &result {
        let _ = audit::log_action(
            &connection_id,
            "STAGED_DELETE",
            &format!("DELETE {} row(s) from {}", count, table_name),
            *count,
            "SUCCESS",
        );
    }
    result
}

// IPC Command: Generate CREATE TABLE DDL + indexes for a live table
#[tauri::command]
pub async fn generate_table_ddl_cmd(
    connection_id: String,
    table_name: String,
    db_kind: String,
    state: State<'_, AppState>,
) -> Result<TableDdlResult, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    generate_table_ddl(&pool, &db_kind, &table_name).await
}

// IPC Command: List indexes for a table
#[tauri::command]
pub async fn get_table_indexes(
    connection_id: String,
    table_name: String,
    db_kind: String,
    state: State<'_, AppState>,
) -> Result<Vec<IndexInfo>, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    fetch_indexes(&pool, &db_kind, &table_name).await
}

// IPC Command: Read recent append-only audit log entries
#[tauri::command]
pub fn get_audit_log(limit: Option<usize>) -> Result<Vec<AuditEntry>, String> {
    let cap = limit.unwrap_or(200).min(2000);
    audit::read_audit_entries(&audit::default_audit_dir(), cap)
}

// IPC Command: Export table data in specified format (CSV, JSON, SQL)
// Optional where_clause applies server-side filtering (full table export, not just UI page).
#[tauri::command]
pub async fn export_table_data(
    connection_id: String,
    table_name: String,
    format: String,
    where_clause: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let pool = state.connection_manager.get_pool(&connection_id)?;
    let db_type = state
        .connection_manager
        .get_db_type(&connection_id)
        .unwrap_or_else(|_| "postgres".to_string());
    let mysql_style = crate::db::pool::ConnectionManager::is_mysql_style(&db_type);
    let where_ref = where_clause.as_deref();
    match format.to_lowercase().as_str() {
        "csv" => {
            export::export_csv_filtered(&pool, &table_name, true, mysql_style, where_ref).await
        }
        "json" => {
            export::export_json_filtered(&pool, &table_name, mysql_style, where_ref).await
        }
        "sql" | "sqldump" => {
            export::export_sql_dump_filtered(&pool, &table_name, mysql_style, where_ref).await
        }
        _ => Err(format!("Unsupported export format: {}", format)),
    }
}

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

// IPC Command: Test SSH authentication and reachability
#[tauri::command]
pub fn test_ssh_tunnel(config: SshConfigPayload) -> Result<u64, String> {
    SshTunnelManager::test_ssh_connection(&config)
}

// IPC Command: Open SSH tunnel and forward local port
#[tauri::command]
pub fn open_ssh_tunnel(
    connection_id: String,
    ssh_config: SshConfigPayload,
    target_host: String,
    target_port: u16,
    state: State<'_, AppState>,
) -> Result<u16, String> {
    state
        .ssh_tunnel_manager
        .open_tunnel(&connection_id, &ssh_config, &target_host, target_port)
}

// IPC Command: Close active SSH tunnel
#[tauri::command]
pub fn close_ssh_tunnel(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.ssh_tunnel_manager.close_tunnel(&connection_id)
}

// IPC Command: Inspect keys from live Redis instance using RESP protocol
#[tauri::command]
pub async fn fetch_redis_keys(
    host: String,
    port: u16,
    password: Option<String>,
    pattern: Option<String>,
) -> Result<Vec<RedisKeyInfo>, String> {
    let mut client = redis::RedisClient::connect(&host, port, password.as_deref()).await?;
    let pat = pattern.as_deref().unwrap_or("*");
    client.fetch_keys(pat).await
}

