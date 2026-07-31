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

/// Strip simple SQL line/block comments so safety checks cannot be trivially bypassed.
fn strip_sql_comments(sql: &str) -> String {
    let mut out = String::with_capacity(sql.len());
    let bytes = sql.as_bytes();
    let mut i = 0;
    let mut in_single = false;
    let mut in_double = false;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if in_single {
            out.push(c);
            if c == '\'' {
                // handle escaped ''
                if i + 1 < bytes.len() && bytes[i + 1] as char == '\'' {
                    out.push('\'');
                    i += 2;
                    continue;
                }
                in_single = false;
            }
            i += 1;
            continue;
        }
        if in_double {
            out.push(c);
            if c == '"' {
                in_double = false;
            }
            i += 1;
            continue;
        }
        if c == '\'' {
            in_single = true;
            out.push(c);
            i += 1;
            continue;
        }
        if c == '"' {
            in_double = true;
            out.push(c);
            i += 1;
            continue;
        }
        // line comment
        if c == '-' && i + 1 < bytes.len() && bytes[i + 1] as char == '-' {
            while i < bytes.len() && bytes[i] as char != '\n' {
                i += 1;
            }
            continue;
        }
        // block comment
        if c == '/' && i + 1 < bytes.len() && bytes[i + 1] as char == '*' {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] as char == '*' && bytes[i + 1] as char == '/') {
                i += 1;
            }
            i = (i + 2).min(bytes.len());
            continue;
        }
        out.push(c);
        i += 1;
    }
    out
}

fn analyze_single_statement(sql: &str) -> SafetyAnalysis {
    let normalized = sql.trim().to_uppercase();
    let tokens: Vec<&str> = normalized.split_whitespace().collect();

    if tokens.is_empty() {
        return SafetyAnalysis {
            is_destructive: false,
            destructive_type: None,
            warning_message: None,
            requires_confirmation: false,
        };
    }

    if tokens.len() >= 2 && tokens[0] == "DROP" && tokens[1] == "TABLE" {
        return SafetyAnalysis {
            is_destructive: true,
            destructive_type: Some(DestructiveType::DropTable),
            warning_message: Some(
                "DROP TABLE will permanently delete the table and all its data.".to_string(),
            ),
            requires_confirmation: true,
        };
    }

    if tokens.len() >= 2 && tokens[0] == "DROP" && tokens[1] == "DATABASE" {
        return SafetyAnalysis {
            is_destructive: true,
            destructive_type: Some(DestructiveType::DropDatabase),
            warning_message: Some(
                "DROP DATABASE will permanently delete the entire database.".to_string(),
            ),
            requires_confirmation: true,
        };
    }

    if tokens[0] == "TRUNCATE" {
        return SafetyAnalysis {
            is_destructive: true,
            destructive_type: Some(DestructiveType::TruncateTable),
            warning_message: Some("TRUNCATE will remove all rows from the table.".to_string()),
            requires_confirmation: true,
        };
    }

    // WHERE detection: word-boundary style (avoid matching column values)
    let has_where = normalized.split_whitespace().any(|t| t == "WHERE" || t.starts_with("WHERE"));

    if tokens[0] == "DELETE" && !has_where {
        return SafetyAnalysis {
            is_destructive: true,
            destructive_type: Some(DestructiveType::DeleteWithoutWhere),
            warning_message: Some(
                "DELETE without WHERE clause will remove ALL rows from the table.".to_string(),
            ),
            requires_confirmation: true,
        };
    }

    if tokens[0] == "UPDATE" && !has_where {
        return SafetyAnalysis {
            is_destructive: true,
            destructive_type: Some(DestructiveType::UpdateWithoutWhere),
            warning_message: Some(
                "UPDATE without WHERE clause will modify ALL rows in the table.".to_string(),
            ),
            requires_confirmation: true,
        };
    }

    SafetyAnalysis {
        is_destructive: false,
        destructive_type: None,
        warning_message: None,
        requires_confirmation: false,
    }
}

/// Analyze SQL (including multi-statement batches) for destructive operations.
pub fn analyze_sql_safety(sql: &str) -> SafetyAnalysis {
    let cleaned = strip_sql_comments(sql);
    // Split on semicolons outside of strings is approximate; comments already stripped.
    let statements: Vec<&str> = cleaned
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    if statements.is_empty() {
        return analyze_single_statement("");
    }

    for stmt in &statements {
        let analysis = analyze_single_statement(stmt);
        if analysis.requires_confirmation {
            return analysis;
        }
    }

    analyze_single_statement(statements[0])
}

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

    #[test]
    fn test_empty_query_safe() {
        let result = analyze_sql_safety("");
        assert!(!result.is_destructive);
    }

    #[test]
    fn test_comment_cannot_hide_drop() {
        let result = analyze_sql_safety("-- harmless\nDROP TABLE users;");
        assert!(result.is_destructive);
        assert_eq!(result.destructive_type, Some(DestructiveType::DropTable));
    }

    #[test]
    fn test_multi_statement_flags_second() {
        let result = analyze_sql_safety("SELECT 1; DELETE FROM users;");
        assert!(result.is_destructive);
        assert_eq!(
            result.destructive_type,
            Some(DestructiveType::DeleteWithoutWhere)
        );
    }
}
