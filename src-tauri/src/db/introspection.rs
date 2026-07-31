// Database schema introspection engine for table, column, and Primary Key analysis
use serde::{Deserialize, Serialize}; // Import Serde traits for JSON serialization and deserialization
use sqlx::Any; // Import Any database driver marker type from sqlx
use sqlx::AnyPool; // Import AnyPool from sqlx for dynamic queries
use sqlx::Row; // Import Row trait for accessing dynamic database columns

// Data structure representing metadata about a database table
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)] // Derive common standard traits
pub struct TableInfo { // Struct definition for table information
    pub name: String, // Name of the table or view
    pub table_type: String, // Type identifier (BASE TABLE or VIEW)
} // End of TableInfo struct definition

// Data structure representing column properties
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)] // Derive standard traits for JSON encoding
pub struct ColumnInfo { // Struct definition for column information
    pub name: String, // Column identifier name
    pub data_type: String, // SQL data type name (e.g. VARCHAR, INT, TIMESTAMP)
    pub is_nullable: bool, // Flag indicating whether null values are allowed
    pub is_primary_key: bool, // Flag indicating whether column is part of primary key
} // End of ColumnInfo struct definition

// Data structure holding primary key analysis result for table editing safety
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)] // Derive traits for JSON serialization
pub struct PkAnalysis { // Struct definition for primary key analysis
    pub has_single_pk: bool, // True if table has exactly one primary key column
    pub pk_column_name: Option<String>, // Name of primary key column(s)
    pub pk_columns: Vec<String>, // List of primary key column names
    pub is_read_only: bool, // Read-only flag set if table cannot be safely updated inline
    pub read_only_reason: Option<String>, // User-facing explanation for read-only status
} // End of PkAnalysis struct definition


/// Reject table identifiers that could be used for SQL injection in catalog queries.
fn validate_identifier(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Table name cannot be empty".to_string());
    }
    if name.len() > 128 {
        return Err("Table name is too long".to_string());
    }
    // Allow schema-qualified names like public.users and quoted-safe alphanumerics/underscore
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
    {
        return Err(format!(
            "Invalid table identifier '{}': only alphanumeric, underscore, and dot are allowed",
            name
        ));
    }
    Ok(())
}

// Fetch list of table names and types from database catalogs
pub async fn fetch_tables(pool: &AnyPool, db_kind: &str) -> Result<Vec<TableInfo>, String> {
    let mut tables = Vec::new();

    match db_kind.to_lowercase().as_str() {
        "postgres" | "postgresql" | "cockroachdb" | "redshift" => {
            let sql = "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;";
            let rows = sqlx::query::<Any>(sql)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            for row in rows {
                let name: String = row.get(0);
                let table_type: String = row.get(1);
                tables.push(TableInfo { name, table_type });
            }
        }
        "mysql" | "mariadb" => {
            let sql = "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name;";
            let rows = sqlx::query::<Any>(sql)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            for row in rows {
                let name: String = row.get(0);
                let table_type: String = row.get(1);
                tables.push(TableInfo { name, table_type });
            }
        }
        _ => {
            let sql = "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name;";
            let rows = sqlx::query::<Any>(sql)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            for row in rows {
                let name: String = row.get(0);
                let table_type: String = row.get(1);
                tables.push(TableInfo { name, table_type });
            }
        }
    }

    Ok(tables)
}

// Fetch column details for a given table (parameterized — no string interpolation of table name)
pub async fn fetch_columns(
    pool: &AnyPool,
    db_kind: &str,
    table_name: &str,
) -> Result<Vec<ColumnInfo>, String> {
    validate_identifier(table_name)?;
    let mut columns = Vec::new();

    match db_kind.to_lowercase().as_str() {
        "postgres" | "postgresql" | "cockroachdb" | "redshift" => {
            let sql = "SELECT c.column_name, c.data_type, c.is_nullable,
                        CASE WHEN kcu.column_name IS NOT NULL THEN true ELSE false END as is_pk
                 FROM information_schema.columns c
                 LEFT JOIN information_schema.table_constraints tc
                   ON c.table_name = tc.table_name AND c.table_schema = tc.table_schema AND tc.constraint_type = 'PRIMARY KEY'
                 LEFT JOIN information_schema.key_column_usage kcu
                   ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema AND c.column_name = kcu.column_name
                 WHERE c.table_name = $1 AND c.table_schema = 'public'
                 ORDER BY c.ordinal_position";
            let rows = sqlx::query::<Any>(sql)
                .bind(table_name)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            for row in rows {
                let name: String = row.get(0);
                let data_type: String = row.get(1);
                let is_nullable_str: String = row.get(2);
                let is_pk: bool = row.get(3);
                columns.push(ColumnInfo {
                    name,
                    data_type,
                    is_nullable: is_nullable_str == "YES",
                    is_primary_key: is_pk,
                });
            }
        }
        "mysql" | "mariadb" => {
            // MySQL prepared statements use ? placeholders with sqlx Any
            let sql = "SELECT column_name, data_type, is_nullable, column_key
                 FROM information_schema.columns
                 WHERE table_name = ? AND table_schema = DATABASE()
                 ORDER BY ordinal_position";
            let rows = sqlx::query::<Any>(sql)
                .bind(table_name)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            for row in rows {
                let name: String = row.get(0);
                let data_type: String = row.get(1);
                let is_nullable_str: String = row.get(2);
                let column_key: String = row.get(3);
                columns.push(ColumnInfo {
                    name,
                    data_type,
                    is_nullable: is_nullable_str == "YES",
                    is_primary_key: column_key == "PRI",
                });
            }
        }
        _ => {
            // SQLite PRAGMA cannot bind table names; identifier was validated above.
            // Double-quote escaping for safety.
            let safe = table_name.replace('"', "\"\"");
            let sql = format!("PRAGMA table_info(\"{}\");", safe);
            let rows = sqlx::query::<Any>(&sql)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            for row in rows {
                let name: String = row.get(1);
                let data_type: String = row.get(2);
                let notnull: i64 = row.get(3);
                let pk: i64 = row.get(5);
                columns.push(ColumnInfo {
                    name,
                    data_type,
                    is_nullable: notnull == 0,
                    is_primary_key: pk > 0,
                });
            }
        }
    }

    Ok(columns)
}

// Analyze primary key constraints on a table to enforce read-only safety
pub fn analyze_primary_keys(columns: &[ColumnInfo]) -> PkAnalysis {
    let pk_cols: Vec<&ColumnInfo> = columns.iter().filter(|c| c.is_primary_key).collect();
    
    if pk_cols.len() == 1 {
        PkAnalysis {
            has_single_pk: true,
            pk_column_name: Some(pk_cols[0].name.clone()),
            pk_columns: vec![pk_cols[0].name.clone()],
            is_read_only: false,
            read_only_reason: None,
        }
    } else if pk_cols.is_empty() {
        // SQLite rowid exception handling
        PkAnalysis {
            has_single_pk: false,
            pk_column_name: Some("rowid".to_string()),
            pk_columns: vec!["rowid".to_string()],
            is_read_only: false,
            read_only_reason: Some("Using SQLite rowid as primary key fallback.".to_string()),
        }
    } else {
        // Table has composite (multi-column) primary keys - now FULLY EDITABLE!
        let names: Vec<String> = pk_cols.iter().map(|c| c.name.clone()).collect();
        PkAnalysis {
            has_single_pk: false,
            pk_column_name: Some(names.join(", ")),
            pk_columns: names,
            is_read_only: false,
            read_only_reason: None,
        }
    }
}

#[cfg(test)] // Conditional compilation attribute for unit tests
mod tests { // Declare internal unit testing module
    use super::*; // Import outer module items into test scope

    #[test] // Mark test function for single primary key validation
    fn test_single_pk_analysis() { // Test single PK analysis behavior
        let cols = vec![ // Create mock columns vector
            ColumnInfo { name: "id".to_string(), data_type: "INT".to_string(), is_nullable: false, is_primary_key: true }, // PK column
            ColumnInfo { name: "val".to_string(), data_type: "TEXT".to_string(), is_nullable: true, is_primary_key: false }, // Non-PK column
        ]; // End of mock vector
        let res = analyze_primary_keys(&cols); // Run primary key analysis function
        assert!(res.has_single_pk); // Assert single PK flag is true
        assert!(!res.is_read_only); // Assert read-only flag is false
        assert_eq!(res.pk_column_name, Some("id".to_string())); // Assert primary key column name matches "id"
    } // End of test_single_pk_analysis test function

    #[test] // Mark test function for zero primary key validation (SQLite rowid fallback)
    fn test_no_pk_analysis_rowid_fallback() { // Test zero PK analysis behavior
        let cols = vec![ // Create mock columns vector with no PKs
            ColumnInfo { name: "val".to_string(), data_type: "TEXT".to_string(), is_nullable: true, is_primary_key: false }, // Non-PK column
        ]; // End of mock vector
        let res = analyze_primary_keys(&cols); // Run primary key analysis function
        assert!(!res.has_single_pk); // Assert single PK flag is false
        assert!(!res.is_read_only); // Assert rowid fallback makes it editable
        assert_eq!(res.pk_column_name, Some("rowid".to_string())); // Assert rowid fallback
    } // End of test_no_pk_analysis test function
} // End of tests module
