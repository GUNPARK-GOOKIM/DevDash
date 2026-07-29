// Transactional staged edit compiler and execution engine
use serde::{Deserialize, Serialize}; // Import Serde traits for JSON deserialization
use serde_json::Value; // Import Serde JSON Value enum
use sqlx::AnyPool; // Import AnyPool from sqlx root (correct for 0.8)

// Single cell change descriptor struct inside a staged row edit
#[derive(Debug, Serialize, Deserialize, Clone)] // Derive standard traits for JSON payload parsing
pub struct StagedCellChange { // Struct definition for staged cell edit
    pub column_name: String, // Target column name string
    pub new_value: Value, // Modified cell value to commit
} // End of StagedCellChange struct definition

// Single row modification payload struct
#[derive(Debug, Serialize, Deserialize, Clone)] // Derive standard traits for JSON parsing
pub struct StagedRowEdit { // Struct definition for single row staged change
    pub pk_value: Value, // Primary key value identifying target row
    pub changes: Vec<StagedCellChange>, // List of column cell modifications for this row
} // End of StagedRowEdit struct definition

// Build dynamic SQL UPDATE query string for a single row staged edit
pub fn build_update_statement(table: &str, pk_col: &str, edit: &StagedRowEdit) -> Result<String, String> {
    if edit.changes.is_empty() {
        return Err("No column changes provided for staged edit".to_string());
    }

    let set_clauses: Vec<String> = edit.changes.iter().map(|change| {
        let val_str = match &change.new_value {
            Value::String(s) => format!("'{}'", s.replace('\'', "''")),
            Value::Null => "NULL".to_string(),
            other => other.to_string(),
        };
        format!("{} = {}", change.column_name, val_str)
    }).collect();

    // Construct WHERE clause supporting single PK, SQLite rowid, or composite multi-column PKs
    let where_clause = match &edit.pk_value {
        Value::Object(obj) => {
            let clauses: Vec<String> = obj.iter().map(|(k, v)| {
                let v_str = match v {
                    Value::String(s) => format!("'{}'", s.replace('\'', "''")),
                    Value::Null => "NULL".to_string(),
                    other => other.to_string(),
                };
                format!("{} = {}", k, v_str)
            }).collect();
            clauses.join(" AND ")
        }
        Value::String(s) => {
            if s.starts_with('{') && s.ends_with('}') {
                if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(s) {
                    let clauses: Vec<String> = obj.iter().map(|(k, v)| {
                        let v_str = match v {
                            Value::String(str_val) => format!("'{}'", str_val.replace('\'', "''")),
                            Value::Null => "NULL".to_string(),
                            other => other.to_string(),
                        };
                        format!("{} = {}", k, v_str)
                    }).collect();
                    clauses.join(" AND ")
                } else {
                    format!("{} = '{}'", pk_col, s.replace('\'', "''"))
                }
            } else {
                format!("{} = '{}'", pk_col, s.replace('\'', "''"))
            }
        }
        other => format!("{} = {}", pk_col, other.to_string()),
    };

    let sql = format!(
        "UPDATE {} SET {} WHERE {};",
        table,
        set_clauses.join(", "),
        where_clause
    );

    Ok(sql)
}

// Apply a batch of staged row edits atomically within a single database transaction
pub async fn apply_staged_edits( // Async function to commit batch edits
    pool: &AnyPool, // Active connection pool reference
    table: &str, // Name of target database table
    pk_col: &str, // Primary key column name identifying rows
    edits: Vec<StagedRowEdit>, // Vector of staged row edits to commit
) -> Result<u64, String> { // Return total affected row count or error string
    let mut tx = pool.begin().await.map_err(|e| format!("Failed to start transaction: {}", e))?; // Begin database transaction
    let mut total_updated: u64 = 0; // Initialize counter for total updated rows

    for edit in edits { // Iterate through each staged row edit payload
        let sql = build_update_statement(table, pk_col, &edit)?; // Build parameterized UPDATE query string for edit
        let result = sqlx::query(&sql).execute(&mut *tx).await.map_err(|e| format!("Failed to update row: {}", e))?; // Execute query within transaction
        total_updated += result.rows_affected(); // Accumulate updated rows count
    } // End of edits iteration loop

    tx.commit().await.map_err(|e| format!("Failed to commit transaction: {}", e))?; // Commit transaction atomically
    Ok(total_updated) // Return total rows updated count
} // End of apply_staged_edits function

#[cfg(test)] // Conditional compilation attribute for unit tests
mod tests { // Declare internal unit testing module
    use super::*; // Import parent module items into test scope
    use serde_json::json; // Import json macro for creating test Values

    #[test] // Mark test function for build_update_statement validation
    fn test_build_update_statement_sql() { // Unit test function verifying SQL update generation
        let edit = StagedRowEdit { // Construct mock StagedRowEdit struct
            pk_value: json!(42), // Set primary key value to 42
            changes: vec![ // Define cell changes vector
                StagedCellChange { column_name: "name".to_string(), new_value: json!("Akshat") }, // Change name column
            ], // End of changes vector
        }; // End of edit struct
        let sql = build_update_statement("users", "id", &edit).unwrap(); // Generate UPDATE SQL statement
        assert_eq!(sql, "UPDATE users SET name = 'Akshat' WHERE id = 42;"); // Assert generated SQL matches expected query string
    } // End of test function
} // End of tests module
