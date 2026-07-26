// Module declarations for DevDash database sub-components
pub mod app_storage; // Export app_storage module for embedded SQLite saved queries and profiles
pub mod credentials; // Export credentials module for OS Keychain / Secret Manager key storage
pub mod executor; // Export executor module for dynamic SQL query execution and JSON mapping
pub mod export; // Export export module for CSV, JSON, and SQL dump data export/import
pub mod introspection; // Export introspection module for database schema, column, and PK reflection
pub mod pool; // Export pool module for unified sqlx::any multi-driver pool management
pub mod safe_mode; // Export safe_mode module for destructive SQL statement detection and confirmation
pub mod staged_edits; // Export staged_edits module for building and committing parameterized batch updates
