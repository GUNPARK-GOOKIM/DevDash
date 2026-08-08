// Safe Mode destructive SQL statement detection and confirmation engine
use serde::{Deserialize, Serialize}; // Import Serde traits for payload serialization

// Enum classifying destructive SQL operation types that require confirmation
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)] // Derive standard traits
pub enum DestructiveType { // Destructive operation type enum
    DropTable, // DROP TABLE statement detected
    DropDatabase, // DROP DATABASE statement detected
    DropObject, // DROP VIEW / INDEX / SCHEMA / other
    TruncateTable, // TRUNCATE TABLE statement detected
    AlterStatement, // ALTER TABLE / DATABASE / etc.
    GrantOrRevoke, // Privilege changes
    DeleteWithoutWhere, // DELETE with no/trivial WHERE
    UpdateWithoutWhere, // UPDATE with no/trivial WHERE
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

fn destructive(
    kind: DestructiveType,
    message: impl Into<String>,
) -> SafetyAnalysis {
    SafetyAnalysis {
        is_destructive: true,
        destructive_type: Some(kind),
        warning_message: Some(message.into()),
        requires_confirmation: true,
    }
}

/// True when WHERE is missing or only a tautology like `1=1` / `TRUE` (unbounded DML).
fn where_is_missing_or_trivial(tokens: &[&str]) -> bool {
    let where_pos = tokens.iter().position(|t| *t == "WHERE");
    let Some(idx) = where_pos else {
        return true;
    };
    if idx + 1 >= tokens.len() {
        return true; // bare WHERE
    }
    // Join predicate tokens until end (ignore trailing empty)
    let predicate: String = tokens[idx + 1..]
        .iter()
        .copied()
        .collect::<Vec<_>>()
        .join(" ");
    let compact: String = predicate
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_uppercase();
    // Pure tautologies only — "1=1 AND id=2" is not treated as unbounded
    matches!(
        compact.as_str(),
        "1=1"
            | "TRUE"
            | "1"
            | "0=0"
            | "'A'='A'"
            | "\"A\"=\"A\""
            | "1=1;"
            | "TRUE;"
    ) || compact == "1=1"
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

    // Any DROP …
    if tokens[0] == "DROP" {
        if tokens.len() >= 2 && tokens[1] == "TABLE" {
            return destructive(
                DestructiveType::DropTable,
                "DROP TABLE will permanently delete the table and all its data.",
            );
        }
        if tokens.len() >= 2 && tokens[1] == "DATABASE" {
            return destructive(
                DestructiveType::DropDatabase,
                "DROP DATABASE will permanently delete the entire database.",
            );
        }
        let obj = tokens.get(1).unwrap_or(&"OBJECT");
        return destructive(
            DestructiveType::DropObject,
            format!("DROP {} is a destructive schema change and requires confirmation.", obj),
        );
    }

    if tokens[0] == "TRUNCATE" {
        return destructive(
            DestructiveType::TruncateTable,
            "TRUNCATE will remove all rows from the table.",
        );
    }

    if tokens[0] == "ALTER" {
        return destructive(
            DestructiveType::AlterStatement,
            "ALTER statements can change schema or data and require confirmation.",
        );
    }

    if tokens[0] == "GRANT" || tokens[0] == "REVOKE" {
        return destructive(
            DestructiveType::GrantOrRevoke,
            "GRANT/REVOKE changes privileges and requires confirmation.",
        );
    }

    if tokens[0] == "DELETE" && where_is_missing_or_trivial(&tokens) {
        return destructive(
            DestructiveType::DeleteWithoutWhere,
            "DELETE without a meaningful WHERE clause will remove ALL rows from the table.",
        );
    }

    if tokens[0] == "UPDATE" && where_is_missing_or_trivial(&tokens) {
        return destructive(
            DestructiveType::UpdateWithoutWhere,
            "UPDATE without a meaningful WHERE clause will modify ALL rows in the table.",
        );
    }

    SafetyAnalysis {
        is_destructive: false,
        destructive_type: None,
        warning_message: None,
        requires_confirmation: false,
    }
}

/// Keywords that mutate data or schema (blocked on read-only connections).
fn is_write_keyword(token: &str) -> bool {
    matches!(
        token,
        "INSERT"
            | "UPDATE"
            | "DELETE"
            | "DROP"
            | "ALTER"
            | "TRUNCATE"
            | "CREATE"
            | "GRANT"
            | "REVOKE"
            | "REPLACE"
            | "CALL"
            | "MERGE"
            | "COPY"
            | "LOAD"
            | "RENAME"
            | "COMMENT"
            | "VACUUM"
            | "REINDEX"
            | "ATTACH"
            | "DETACH"
            | "PRAGMA" // SQLite PRAGMA can mutate; treat as write for read-only safety
    )
}

/// True if any statement in the batch begins with a write/DDL keyword.
/// Used to enforce connection-level read-only mode server-side.
pub fn sql_contains_write(sql: &str) -> bool {
    let cleaned = strip_sql_comments(sql);
    let statements: Vec<&str> = cleaned
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    if statements.is_empty() {
        return false;
    }
    for stmt in statements {
        let normalized = stmt.trim().to_uppercase();
        let mut tokens = normalized.split_whitespace();
        if let Some(first) = tokens.next() {
            if is_write_keyword(first) {
                return true;
            }
            // WITH ... INSERT/UPDATE/DELETE is a write CTE
            if first == "WITH" {
                let rest = normalized.as_str();
                if rest.split_whitespace().any(|t| {
                    matches!(t, "INSERT" | "UPDATE" | "DELETE" | "MERGE")
                }) {
                    return true;
                }
            }
        }
    }
    false
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

    #[test]
    fn test_sql_contains_write_multi_statement() {
        assert!(!sql_contains_write("SELECT 1"));
        assert!(sql_contains_write("SELECT 1; DROP TABLE users;"));
        assert!(sql_contains_write("INSERT INTO t VALUES (1)"));
        assert!(sql_contains_write("WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x"));
        assert!(!sql_contains_write("WITH x AS (SELECT 1) SELECT * FROM x"));
        assert!(!sql_contains_write("EXPLAIN SELECT 1"));
    }

    #[test]
    fn test_drop_view_and_alter_flagged() {
        let v = analyze_sql_safety("DROP VIEW public.v;");
        assert!(v.requires_confirmation);
        assert_eq!(v.destructive_type, Some(DestructiveType::DropObject));

        let a = analyze_sql_safety("ALTER TABLE users ADD COLUMN x INT;");
        assert!(a.requires_confirmation);
        assert_eq!(a.destructive_type, Some(DestructiveType::AlterStatement));
    }

    #[test]
    fn test_delete_where_1_eq_1_flagged() {
        let r = analyze_sql_safety("DELETE FROM users WHERE 1 = 1;");
        assert!(r.is_destructive);
        assert_eq!(r.destructive_type, Some(DestructiveType::DeleteWithoutWhere));
    }

    #[test]
    fn test_delete_where_real_predicate_ok() {
        let r = analyze_sql_safety("DELETE FROM users WHERE 1 = 1 AND id = 5;");
        // Predicate is not a pure tautology (has AND id = 5)
        assert!(!r.is_destructive);
    }
}
