// Main library module defining DevDash Tauri application builder and setup
pub mod commands; // Export commands module containing IPC command handlers
pub mod db; // Export database module containing core DB components

use commands::AppState; // Import AppState struct from commands module
use db::app_storage::AppStorage; // Import AppStorage struct from db::app_storage module
use db::pool::ConnectionManager; // Import ConnectionManager struct from db::pool module
use std::sync::Arc; // Import Arc from standard library for thread-safe state sharing

use db::ssh_tunnel::SshTunnelManager; // Import SshTunnelManager struct

// Initialize and configure Tauri application instance
pub fn run() { // Entry point library run function for Tauri application
    ConnectionManager::init_drivers(); // Initialize sqlx dynamic database drivers for Postgres, MySQL, and SQLite
    
    let connection_manager = ConnectionManager::new(); // Create new ConnectionManager multi-pool instance
    let ssh_tunnel_manager = SshTunnelManager::new(); // Create new SshTunnelManager instance
    let runtime = tokio::runtime::Runtime::new().expect("Failed to initialize tokio runtime"); // Create tokio runtime for async storage init
    let storage = runtime.block_on(async { // Run async block on tokio runtime
        Arc::new(AppStorage::new("devdash_internal.db").await.expect("Failed to initialize embedded app storage")) // Instantiate embedded SQLite app storage asynchronously
    }); // End of runtime block_on

    let app_state = AppState { // Construct global AppState container
        connection_manager, // Set connection_manager field
        storage, // Set storage field
        active_queries: tokio::sync::Mutex::new(std::collections::HashMap::new()), // Initialize query tracker map
        ssh_tunnel_manager, // Set ssh_tunnel_manager field
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
            commands::preview_csv_data, // Register preview_csv_data IPC command
            commands::import_csv_data, // Register import_csv_data IPC command
            commands::export_encrypted_data, // Register export_encrypted_data IPC command
            commands::import_encrypted_data // Register import_encrypted_data IPC command
        ]) // End of invoke_handler registration
        .run(tauri::generate_context!()) // Run Tauri application context
        .expect("error while running devdash tauri application"); // Handle application runtime errors
} // End of run function
