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
    pub pk_column_name: Option<String>, // Name of single primary key column if present
    pub is_read_only: bool, // Read-only flag set if table cannot be safely updated inline
    pub read_only_reason: Option<String>, // User-facing explanation for read-only status
} // End of PkAnalysis struct definition

// Fetch list of table names and types from database catalogs
pub async fn fetch_tables(pool: &AnyPool, db_kind: &str) -> Result<Vec<TableInfo>, String> { // Fetch tables function
    let mut tables = Vec::new(); // Initialize empty vector to store discovered tables
    
    // Choose catalog query based on database driver kind
    match db_kind.to_lowercase().as_str() { // Match on database engine identifier
        "postgres" | "postgresql" | "cockroachdb" | "redshift" => { // Postgres-compatible engines
            let sql = "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"; // Postgres catalog query
            let rows = sqlx::query::<Any>(sql).fetch_all(pool).await.map_err(|e| e.to_string())?; // Execute query against Any pool
            for row in rows { // Loop over result rows
                let name: String = row.get(0); // Extract table_name column value
                let table_type: String = row.get(1); // Extract table_type column value
                tables.push(TableInfo { name, table_type }); // Push table info struct into vector
            } // End of rows iteration loop
        } // End of Postgres branch
        "mysql" | "mariadb" => { // MySQL-compatible engines
            let sql = "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name;"; // MySQL catalog query
            let rows = sqlx::query::<Any>(sql).fetch_all(pool).await.map_err(|e| e.to_string())?; // Execute query against Any pool
            for row in rows { // Loop over result rows
                let name: String = row.get(0); // Extract table_name column value
                let table_type: String = row.get(1); // Extract table_type column value
                tables.push(TableInfo { name, table_type }); // Push table info struct into vector
            } // End of rows iteration loop
        } // End of MySQL branch
        _ => { // Fallback/SQLite database handler branch
            let sql = "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name;"; // SQLite master catalog query
            let rows = sqlx::query::<Any>(sql).fetch_all(pool).await.map_err(|e| e.to_string())?; // Execute query against Any pool
            for row in rows { // Loop over result rows
                let name: String = row.get(0); // Extract table name column value
                let table_type: String = row.get(1); // Extract object type column value
                tables.push(TableInfo { name, table_type }); // Push table info struct into vector
            } // End of rows iteration loop
        } // End of SQLite/fallback branch
    } // End of database kind match statement

    Ok(tables) // Return discovered tables vector
} // End of fetch_tables function

// Fetch column details for a given table
pub async fn fetch_columns(pool: &AnyPool, db_kind: &str, table_name: &str) -> Result<Vec<ColumnInfo>, String> { // Fetch columns function
    let mut columns = Vec::new(); // Initialize empty columns vector

    match db_kind.to_lowercase().as_str() { // Match database engine kind
        "postgres" | "postgresql" | "cockroachdb" | "redshift" => { // Postgres catalog inspect
            let sql = format!(
                "SELECT c.column_name, c.data_type, c.is_nullable, 
                        CASE WHEN kcu.column_name IS NOT NULL THEN true ELSE false END as is_pk
                 FROM information_schema.columns c
                 LEFT JOIN information_schema.table_constraints tc 
                   ON c.table_name = tc.table_name AND tc.constraint_type = 'PRIMARY KEY'
                 LEFT JOIN information_schema.key_column_usage kcu 
                   ON tc.constraint_name = kcu.constraint_name AND c.column_name = kcu.column_name
                 WHERE c.table_name = '{}' AND c.table_schema = 'public';",
                table_name
            ); // Postgres column inspection query
            let rows = sqlx::query::<Any>(&sql).fetch_all(pool).await.map_err(|e| e.to_string())?; // Execute query
            for row in rows { // Iterate result rows
                let name: String = row.get(0); // Extract column name
                let data_type: String = row.get(1); // Extract data type
                let is_nullable_str: String = row.get(2); // Extract nullable string
                let is_pk: bool = row.get(3); // Extract primary key boolean
                columns.push(ColumnInfo { // Push column descriptor
                    name, // Column name
                    data_type, // Data type
                    is_nullable: is_nullable_str == "YES", // Parse boolean
                    is_primary_key: is_pk, // PK status
                }); // End column push
            } // End row loop
        } // End Postgres branch
        "mysql" | "mariadb" => { // MySQL catalog inspect
            let sql = format!(
                "SELECT column_name, data_type, is_nullable, column_key
                 FROM information_schema.columns
                 WHERE table_name = '{}' AND table_schema = DATABASE();",
                table_name
            ); // MySQL column query
            let rows = sqlx::query::<Any>(&sql).fetch_all(pool).await.map_err(|e| e.to_string())?; // Execute query
            for row in rows { // Iterate result rows
                let name: String = row.get(0); // Extract column name
                let data_type: String = row.get(1); // Extract data type
                let is_nullable_str: String = row.get(2); // Extract nullable string
                let column_key: String = row.get(3); // Extract key type string
                columns.push(ColumnInfo { // Push column descriptor
                    name, // Column name
                    data_type, // Data type
                    is_nullable: is_nullable_str == "YES", // Parse boolean
                    is_primary_key: column_key == "PRI", // Check if Primary Key
                }); // End column push
            } // End row loop
        } // End MySQL branch
        _ => { // SQLite PRAGMA table_info catalog inspect
            let sql = format!("PRAGMA table_info('{}');", table_name); // SQLite PRAGMA table_info query
            let rows = sqlx::query::<Any>(&sql).fetch_all(pool).await.map_err(|e| e.to_string())?; // Execute query
            for row in rows { // Iterate result rows
                let name: String = row.get(1); // Extract column name from index 1
                let data_type: String = row.get(2); // Extract data type from index 2
                let notnull: i64 = row.get(3); // Extract NOT NULL flag from index 3
                let pk: i64 = row.get(5); // Extract PK index from index 5
                columns.push(ColumnInfo { // Push column descriptor
                    name, // Column name
                    data_type, // Data type
                    is_nullable: notnull == 0, // Invert NOT NULL flag
                    is_primary_key: pk > 0, // Check if PK order > 0
                }); // End column push
            } // End row loop
        } // End SQLite branch
    } // End database kind match

    Ok(columns) // Return columns vector
} // End fetch_columns function

// Analyze primary key constraints on a table to enforce read-only safety
pub fn analyze_primary_keys(columns: &[ColumnInfo]) -> PkAnalysis { // Primary key safety analyzer function
    let pk_cols: Vec<&ColumnInfo> = columns.iter().filter(|c| c.is_primary_key).collect(); // Filter columns marked as primary keys
    
    if pk_cols.len() == 1 { // Check if table has exactly one primary key column
        PkAnalysis { // Construct single primary key analysis result
            has_single_pk: true, // Flag single primary key present
            pk_column_name: Some(pk_cols[0].name.clone()), // Save primary key column name
            is_read_only: false, // Table is safely editable
            read_only_reason: None, // No read-only reason
        } // End of PkAnalysis struct
    } else if pk_cols.is_empty() { // Check if table has zero primary key columns
        // B4 Requirement: SQLite rowid exception handling
        PkAnalysis { // Construct no primary key analysis result
            has_single_pk: false, // Flag no explicit single primary key column
            pk_column_name: Some("rowid".to_string()), // Fallback to SQLite rowid implicit primary key
            is_read_only: false, // Allow editing via rowid exception
            read_only_reason: Some("Using SQLite rowid as primary key fallback.".to_string()), // Informative note
        } // End of PkAnalysis struct
    } else { // Table has composite (multi-column) primary keys
        PkAnalysis { // Construct composite primary key analysis result
            has_single_pk: false, // Flag no single primary key
            pk_column_name: None, // No single primary key column name
            is_read_only: true, // Mark table read-only for composite PK safety
            read_only_reason: Some("Composite (multi-column) primary keys are read-only in v1.".to_string()), // Explanation message
        } // End of PkAnalysis struct
    } // End of primary key evaluation conditional
} // End of analyze_primary_keys function

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
