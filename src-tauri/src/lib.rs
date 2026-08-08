// Main library module defining DevDash Tauri application builder and setup
#[cfg(feature = "gui")]
pub mod commands; // Export commands module containing IPC command handlers
pub mod db; // Export database module containing core DB components
#[cfg(feature = "cli")]
pub mod cli; // Terminal companion (devdash binary)

#[cfg(feature = "gui")]
use commands::AppState; // Import AppState struct from commands module
#[cfg(feature = "gui")]
use db::app_storage::AppStorage; // Import AppStorage struct from db::app_storage module
#[cfg(feature = "gui")]
use db::pool::ConnectionManager; // Import ConnectionManager struct from db::pool module
#[cfg(feature = "gui")]
use std::sync::Arc; // Import Arc from standard library for thread-safe state sharing

#[cfg(feature = "gui")]
use db::ssh_tunnel::SshTunnelManager; // Import SshTunnelManager struct

// Initialize and configure Tauri application instance
#[cfg(feature = "gui")]
pub fn run() { // Entry point library run function for Tauri application
    ConnectionManager::init_drivers(); // Initialize sqlx dynamic database drivers for Postgres, MySQL, and SQLite
    
    let connection_manager = ConnectionManager::new(); // Create new ConnectionManager multi-pool instance
    let ssh_tunnel_manager = SshTunnelManager::new(); // Create new SshTunnelManager instance
    // Store app DB under the user config dir (not the process CWD / app bundle)
    let storage_path = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("devdash")
        .join("devdash_internal.db");
    if let Some(parent) = storage_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let runtime = tokio::runtime::Runtime::new().expect("Failed to initialize tokio runtime");
    let storage = runtime.block_on(async {
        Arc::new(
            AppStorage::new(storage_path.to_string_lossy().as_ref())
                .await
                .expect("Failed to initialize embedded app storage"),
        )
    });

    let app_state = AppState { // Construct global AppState container
        connection_manager, // Set connection_manager field
        storage, // Set storage field
        active_queries: tokio::sync::Mutex::new(std::collections::HashMap::new()), // Initialize query tracker map
        ssh_tunnel_manager, // Set ssh_tunnel_manager field
        tx_manager: db::transactions::TransactionManager::new(),
        duckdb: db::duckdb_engine::DuckDbManager::new(),
    }; // End of AppState instantiation

    tauri::Builder::default() // Create default Tauri application builder
        .manage(app_state) // Register managed AppState within Tauri runtime context
        .invoke_handler(tauri::generate_handler![ // Register Tauri IPC command handlers
            commands::save_db_password, // Register save_db_password IPC command
            commands::get_db_password, // Register get_db_password IPC command
            commands::delete_db_password, // Register delete_db_password IPC command
            commands::test_db_connection, // Register test_db_connection IPC command
            commands::connect_database_config, // Register connect_database_config IPC command
            commands::connect_database, // Register connect_database IPC command
            commands::test_ssh_tunnel, // Register test_ssh_tunnel IPC command
            commands::open_ssh_tunnel, // Register open_ssh_tunnel IPC command
            commands::close_ssh_tunnel, // Register close_ssh_tunnel IPC command
            commands::disconnect_database, // Register disconnect_database IPC command
            commands::get_database_tables, // Register get_database_tables IPC command
            commands::get_table_columns, // Register get_table_columns IPC command
            commands::get_pk_analysis, // Register get_pk_analysis IPC command
            commands::run_sql_query, // Register run_sql_query IPC command
            commands::stream_sql_query, // Register stream_sql_query IPC command
            commands::cancel_query, // Register cancel_query IPC command
            commands::cancel_backend_query, // Register cancel_backend_query IPC command (GAP 12)
            commands::check_sql_safety, // Register check_sql_safety IPC command
            commands::commit_staged_row_edits, // Register commit_staged_row_edits IPC command
            commands::commit_staged_inserts,
            commands::commit_staged_deletes,
            commands::generate_table_ddl_cmd,
            commands::get_table_indexes,
            commands::export_table_data, // Register export_table_data IPC command
            commands::save_project_query, // Register save_project_query IPC command
            commands::get_queries_for_project, // Register get_queries_for_project IPC command
            commands::delete_saved_query, // Register delete_saved_query IPC command
            commands::parse_json_cell, // Register parse_json_cell IPC command
            commands::format_chart_data, // Register format_chart_data IPC command
            commands::generate_migration_sql, // Register generate_migration_sql IPC command
            commands::structure_add_column, // Register structure_add_column IPC command
            commands::structure_drop_column, // Register structure_drop_column IPC command
            commands::structure_rename_column, // Register structure_rename_column IPC command
            commands::structure_change_type, // Register structure_change_type IPC command
            commands::structure_set_nullable, // Register structure_set_nullable IPC command
            commands::structure_add_index, // Register structure_add_index IPC command
            commands::structure_drop_index, // Register structure_drop_index IPC command
            commands::format_row_context, // Register format_row_context IPC command
            commands::get_live_database_metrics, // Register get_live_database_metrics IPC command
            commands::create_connection_group, // Register create_connection_group IPC command
            commands::rename_connection_group, // Register rename_connection_group IPC command
            commands::delete_connection_group, // Register delete_connection_group IPC command
            commands::move_connection_into_group, // Register move_connection_into_group IPC command
            commands::reorder_group_connections, // Register reorder_group_connections IPC command
            commands::get_all_connection_groups, // Register get_all_connection_groups IPC command
            commands::get_query_history, // Register get_query_history IPC command
            commands::search_query_history, // Register search_query_history IPC command
            commands::delete_history_entry, // Register delete_history_entry IPC command
            commands::clear_all_query_history, // Register clear_all_query_history IPC command
            commands::get_autocomplete_data, // Register get_autocomplete_data IPC command
            commands::get_shortcut_config, // Register get_shortcut_config IPC command
            commands::update_shortcut_binding, // Register update_shortcut_binding IPC command
            commands::reset_shortcut_config, // Register reset_shortcut_config IPC command
            commands::preview_csv_data,
            commands::import_csv_data,
            commands::import_csv_content,
            commands::export_encrypted_data,
            commands::import_encrypted_data,
            commands::export_rows_parquet,
            commands::save_result_snapshot,
            commands::list_result_snapshots,
            commands::delete_result_snapshot,
            commands::diff_result_snapshots,
            commands::export_connections_to_text,
            commands::import_connections_from_text,
            commands::get_audit_log,
            commands::save_secret,
            commands::get_secret,
            commands::delete_secret,
            commands::list_connected_ids,
            commands::begin_transaction,
            commands::commit_transaction,
            commands::rollback_transaction,
            commands::get_transaction_status,
            commands::diagnose_connection,
            commands::profile_sql_query,
            commands::apply_migration_sql,
            commands::list_migration_runs,
            commands::fetch_redis_keys,
            commands::list_database_processes,
            commands::list_db_roles,
            commands::list_db_routines,
            commands::generate_sql_assist,
        ])
        .run(tauri::generate_context!()) // Run Tauri application context
        .expect("error while running devdash tauri application"); // Handle application runtime errors
} // End of run function
