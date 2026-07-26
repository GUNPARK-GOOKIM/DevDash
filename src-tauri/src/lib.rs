// Main library module defining DevDash Tauri application builder and setup
pub mod commands; // Export commands module containing IPC command handlers
pub mod db; // Export database module containing core DB components

use commands::AppState; // Import AppState struct from commands module
use db::app_storage::AppStorage; // Import AppStorage struct from db::app_storage module
use db::pool::ConnectionManager; // Import ConnectionManager struct from db::pool module
use std::sync::Arc; // Import Arc from standard library for thread-safe state sharing

// Initialize and configure Tauri application instance
pub fn run() { // Entry point library run function for Tauri application
    ConnectionManager::init_drivers(); // Initialize sqlx dynamic database drivers for Postgres, MySQL, and SQLite
    
    let connection_manager = ConnectionManager::new(); // Create new ConnectionManager multi-pool instance
    let runtime = tokio::runtime::Runtime::new().expect("Failed to initialize tokio runtime"); // Create tokio runtime for async storage init
    let storage = runtime.block_on(async { // Run async block on tokio runtime
        Arc::new(AppStorage::new("devdash_internal.db").await.expect("Failed to initialize embedded app storage")) // Instantiate embedded SQLite app storage asynchronously
    }); // End of runtime block_on

    let app_state = AppState { // Construct global AppState container
        connection_manager, // Set connection_manager field
        storage, // Set storage field
        active_queries: tokio::sync::Mutex::new(std::collections::HashMap::new()), // Initialize query tracker map
    }; // End of AppState instantiation

    tauri::Builder::default() // Create default Tauri application builder
        .manage(app_state) // Register managed AppState within Tauri runtime context
        .invoke_handler(tauri::generate_handler![ // Register Tauri IPC command handlers
            commands::save_db_password, // Register save_db_password IPC command
            commands::get_db_password, // Register get_db_password IPC command
            commands::delete_db_password, // Register delete_db_password IPC command
            commands::connect_database, // Register connect_database IPC command
            commands::disconnect_database, // Register disconnect_database IPC command
            commands::get_database_tables, // Register get_database_tables IPC command
            commands::get_table_columns, // Register get_table_columns IPC command
            commands::get_pk_analysis, // Register get_pk_analysis IPC command
            commands::run_sql_query, // Register run_sql_query IPC command
            commands::cancel_query, // Register cancel_query IPC command
            commands::check_sql_safety, // Register check_sql_safety IPC command
            commands::commit_staged_row_edits, // Register commit_staged_row_edits IPC command
            commands::export_table_data, // Register export_table_data IPC command
            commands::save_project_query, // Register save_project_query IPC command
            commands::get_queries_for_project, // Register get_queries_for_project IPC command
            commands::delete_saved_query // Register delete_saved_query IPC command
        ]) // End of invoke_handler registration
        .run(tauri::generate_context!()) // Run Tauri application context
        .expect("error while running devdash tauri application"); // Handle application runtime errors
} // End of run function
