// Safe Mode destructive SQL statement detection and confirmation engine
use serde::{Deserialize, Serialize}; // Import Serde traits for payload serialization

// Enum classifying destructive SQL operation types that require confirmation
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)] // Derive standard traits
pub enum DestructiveType { // Destructive operation type enum
    DropTable, // DROP TABLE statement detected
    DropDatabase, // DROP DATABASE statement detected
    TruncateTable, // TRUNCATE TABLE statement detected
    DeleteWithoutWhere, // DELETE statement with no WHERE clause
    UpdateWithoutWhere, // UPDATE statement with no WHERE clause
} // End DestructiveType enum

// Analysis result struct for a SQL statement's safety classification
#[derive(Debug, Serialize, Deserialize, Clone)] // Derive standard traits
pub struct SafetyAnalysis { // Safety analysis result struct
    pub is_destructive: bool, // True if statement is classified as destructive
    pub destructive_type: Option<DestructiveType>, // Type of destructive operation if applicable
    pub warning_message: Option<String>, // Human-readable warning message for confirmation dialog
    pub requires_confirmation: bool, // True if safe mode requires user confirmation before execution
} // End SafetyAnalysis struct

// Analyze a SQL statement string to detect potentially destructive operations
pub fn analyze_sql_safety(sql: &str) -> SafetyAnalysis { // SQL safety analyzer function
    let normalized = sql.trim().to_uppercase(); // Normalize SQL to uppercase trimmed string
    let tokens: Vec<&str> = normalized.split_whitespace().collect(); // Tokenize SQL into whitespace-separated words

    if tokens.is_empty() { // Check for empty query
        return SafetyAnalysis { // Return safe result for empty queries
            is_destructive: false, // Not destructive
            destructive_type: None, // No type
            warning_message: None, // No warning
            requires_confirmation: false, // No confirmation needed
        }; // End return
    } // End empty check

    // Check for DROP TABLE
    if tokens.len() >= 2 && tokens[0] == "DROP" && tokens[1] == "TABLE" { // Detect DROP TABLE pattern
        return SafetyAnalysis { // Return destructive result
            is_destructive: true, // Destructive operation
            destructive_type: Some(DestructiveType::DropTable), // DROP TABLE type
            warning_message: Some("DROP TABLE will permanently delete the table and all its data.".to_string()), // Warning message
            requires_confirmation: true, // Requires confirmation
        }; // End return
    } // End DROP TABLE check

    // Check for DROP DATABASE
    if tokens.len() >= 2 && tokens[0] == "DROP" && tokens[1] == "DATABASE" { // Detect DROP DATABASE pattern
        return SafetyAnalysis { // Return destructive result
            is_destructive: true, // Destructive operation
            destructive_type: Some(DestructiveType::DropDatabase), // DROP DATABASE type
            warning_message: Some("DROP DATABASE will permanently delete the entire database.".to_string()), // Warning message
            requires_confirmation: true, // Requires confirmation
        }; // End return
    } // End DROP DATABASE check

    // Check for TRUNCATE TABLE
    if tokens.len() >= 1 && tokens[0] == "TRUNCATE" { // Detect TRUNCATE pattern
        return SafetyAnalysis { // Return destructive result
            is_destructive: true, // Destructive operation
            destructive_type: Some(DestructiveType::TruncateTable), // TRUNCATE type
            warning_message: Some("TRUNCATE will remove all rows from the table.".to_string()), // Warning message
            requires_confirmation: true, // Requires confirmation
        }; // End return
    } // End TRUNCATE check

    // Check for DELETE without WHERE
    if tokens[0] == "DELETE" && !normalized.contains("WHERE") { // Detect DELETE without WHERE clause
        return SafetyAnalysis { // Return destructive result
            is_destructive: true, // Destructive operation
            destructive_type: Some(DestructiveType::DeleteWithoutWhere), // DELETE without WHERE type
            warning_message: Some("DELETE without WHERE clause will remove ALL rows from the table.".to_string()), // Warning message
            requires_confirmation: true, // Requires confirmation
        }; // End return
    } // End DELETE check

    // Check for UPDATE without WHERE
    if tokens[0] == "UPDATE" && !normalized.contains("WHERE") { // Detect UPDATE without WHERE clause
        return SafetyAnalysis { // Return destructive result
            is_destructive: true, // Destructive operation
            destructive_type: Some(DestructiveType::UpdateWithoutWhere), // UPDATE without WHERE type
            warning_message: Some("UPDATE without WHERE clause will modify ALL rows in the table.".to_string()), // Warning message
            requires_confirmation: true, // Requires confirmation
        }; // End return
    } // End UPDATE check

    // Default: query is safe
    SafetyAnalysis { // Return safe analysis result
        is_destructive: false, // Not destructive
        destructive_type: None, // No destructive type
        warning_message: None, // No warning message
        requires_confirmation: false, // No confirmation needed
    } // End default SafetyAnalysis
} // End analyze_sql_safety function

#[cfg(test)] // Conditional compilation for unit tests
mod tests { // Unit test module
    use super::*; // Import parent module items

    #[test] // Test DROP TABLE detection
    fn test_drop_table_detected() { // Test function
        let result = analyze_sql_safety("DROP TABLE users;"); // Analyze DROP TABLE statement
        assert!(result.is_destructive); // Assert is destructive
        assert_eq!(result.destructive_type, Some(DestructiveType::DropTable)); // Assert correct type
        assert!(result.requires_confirmation); // Assert confirmation required
    } // End test

    #[test] // Test DROP DATABASE detection
    fn test_drop_database_detected() { // Test function
        let result = analyze_sql_safety("DROP DATABASE production;"); // Analyze DROP DATABASE statement
        assert!(result.is_destructive); // Assert is destructive
        assert_eq!(result.destructive_type, Some(DestructiveType::DropDatabase)); // Assert correct type
    } // End test

    #[test] // Test TRUNCATE detection
    fn test_truncate_detected() { // Test function
        let result = analyze_sql_safety("TRUNCATE TABLE orders;"); // Analyze TRUNCATE statement
        assert!(result.is_destructive); // Assert is destructive
        assert_eq!(result.destructive_type, Some(DestructiveType::TruncateTable)); // Assert correct type
    } // End test

    #[test] // Test DELETE without WHERE detection
    fn test_delete_without_where() { // Test function
        let result = analyze_sql_safety("DELETE FROM users;"); // Analyze DELETE without WHERE
        assert!(result.is_destructive); // Assert is destructive
        assert_eq!(result.destructive_type, Some(DestructiveType::DeleteWithoutWhere)); // Assert correct type
    } // End test

    #[test] // Test safe DELETE with WHERE passes
    fn test_delete_with_where_is_safe() { // Test function
        let result = analyze_sql_safety("DELETE FROM users WHERE id = 5;"); // Analyze DELETE with WHERE
        assert!(!result.is_destructive); // Assert not destructive
        assert!(!result.requires_confirmation); // Assert no confirmation needed
    } // End test

    #[test] // Test UPDATE without WHERE detection
    fn test_update_without_where() { // Test function
        let result = analyze_sql_safety("UPDATE users SET role = 'admin';"); // Analyze UPDATE without WHERE
        assert!(result.is_destructive); // Assert is destructive
        assert_eq!(result.destructive_type, Some(DestructiveType::UpdateWithoutWhere)); // Assert correct type
    } // End test

    #[test] // Test safe UPDATE with WHERE passes
    fn test_update_with_where_is_safe() { // Test function
        let result = analyze_sql_safety("UPDATE users SET role = 'admin' WHERE id = 1;"); // Analyze UPDATE with WHERE
        assert!(!result.is_destructive); // Assert not destructive
    } // End test

    #[test] // Test regular SELECT is safe
    fn test_select_is_safe() { // Test function
        let result = analyze_sql_safety("SELECT * FROM users;"); // Analyze SELECT statement
        assert!(!result.is_destructive); // Assert not destructive
        assert!(!result.requires_confirmation); // Assert no confirmation needed
    } // End test

    #[test] // Test empty query is safe
    fn test_empty_query_safe() { // Test function
        let result = analyze_sql_safety(""); // Analyze empty string
        assert!(!result.is_destructive); // Assert not destructive
    } // End test
} // End tests module
