// Module declarations for DevDash database sub-components
pub mod app_storage; // Export app_storage module for embedded SQLite saved queries and profiles
pub mod credentials; // Export credentials module for OS Keychain / Secret Manager key storage
pub mod executor; // Export executor module for dynamic SQL query execution and JSON mapping
pub mod export; // Export export module for CSV, JSON, and SQL dump data export/import
pub mod introspection; // Export introspection module for database schema, column, and PK reflection
pub mod pool; // Export pool module for unified sqlx::any multi-driver pool management
pub mod safe_mode; // Export safe_mode module for destructive SQL statement detection and confirmation
pub mod staged_edits; // Export staged_edits module for building and committing parameterized batch updates
pub mod json_tree; // Export json_tree module for structured JSON cell tree parsing
pub mod chart_formatter; // Export chart_formatter module for result chart formatting
pub mod schema_migration; // Export schema_migration module for ALTER TABLE DDL diff generation
pub mod structure_editor; // Export structure_editor module for visual table schema editing
pub mod row_formatter; // Export row_formatter module for right-click context menu data formatters
pub mod metrics_board; // Export metrics_board module for live database metrics
pub mod autocomplete; // Export autocomplete module for SQL editor schema and column autocompletion
pub mod shortcut_config; // Export shortcut_config module for keyboard shortcuts config and conflict detection
pub mod csv_import; // Export csv_import module for CSV previewing, type-coerced row importing, and error reporting
pub mod encrypted_export; // Export encrypted_export module for AES-256 encrypted connection & query backup
pub mod ssh_tunnel; // Export ssh_tunnel module for native SSH port forwarding
pub mod audit; // Export audit module for native SOC2/HIPAA compliance audit logging


