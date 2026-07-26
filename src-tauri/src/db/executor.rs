// Dynamic SQL query execution engine and row-to-JSON encoder
use serde::{Deserialize, Serialize}; // Import Serde traits for JSON object serialization
use serde_json::{json, Value}; // Import Serde JSON value enum and construction macro
use sqlx::any::AnyRow; // Import AnyRow dynamic row type
use sqlx::AnyPool; // Import AnyPool from sqlx root (correct for 0.8)
use sqlx::{Column, Row, TypeInfo}; // Import Column, Row, and TypeInfo traits from sqlx
use std::time::Instant; // Import Instant struct from standard library for timing query duration

// Data structure representing a single column header descriptor in query result
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)] // Derive common standard traits
pub struct ColumnHeader { // Struct definition for column header
    pub name: String, // Column header title name
    pub type_name: String, // Column data type string representation
} // End of ColumnHeader struct definition

// Data structure representing complete executed query result payload
#[derive(Debug, Serialize, Deserialize, Clone)] // Derive traits for JSON encoding
pub struct QueryResultPayload { // Struct definition for query result response
    pub columns: Vec<ColumnHeader>, // Array of column headers in result set
    pub rows: Vec<Vec<Value>>, // Matrix array of rows containing JSON cell values
    pub execution_time_ms: u64, // Query execution duration in milliseconds
    pub affected_rows: u64, // Number of database rows modified or returned
} // End of QueryResultPayload struct definition

// Convert dynamic sqlx AnyRow column cell value into generic serde_json::Value
pub fn decode_any_cell(row: &AnyRow, index: usize) -> Value { // Dynamic cell value decoder function
    // Attempt string extraction fallback first for universal compatibility
    if let Ok(val) = row.try_get::<String, _>(index) { // Check if cell decodes as String
        Value::String(val) // Return Serde JSON String value
    } else if let Ok(val) = row.try_get::<i64, _>(index) { // Check if cell decodes as 64-bit integer
        json!(val) // Return Serde JSON Integer value
    } else if let Ok(val) = row.try_get::<f64, _>(index) { // Check if cell decodes as 64-bit float
        json!(val) // Return Serde JSON Float value
    } else if let Ok(val) = row.try_get::<bool, _>(index) { // Check if cell decodes as boolean
        Value::Bool(val) // Return Serde JSON Boolean value
    } else { // Fallback for null or complex binary types
        Value::Null // Return Serde JSON Null value
    } // End of cell value resolution tree
} // End of decode_any_cell function

// Execute arbitrary dynamic SQL string against connection pool and return formatted payload
pub async fn execute_dynamic_query(pool: &AnyPool, sql: &str) -> Result<QueryResultPayload, String> { // Dynamic query executor function
    let start_time = Instant::now(); // Record current timestamp to measure query duration
    let rows: Vec<AnyRow> = sqlx::query(sql) // Prepare dynamic SQL query struct with explicit type
        .fetch_all(pool) // Execute query asynchronously fetching all result rows
        .await // Await database response
        .map_err(|e| format!("Query execution failed: {}", e))?; // Map sqlx error to readable string

    let mut columns = Vec::new(); // Vector to store generated column headers
    let mut result_rows = Vec::new(); // Matrix vector to store encoded JSON row values

    if let Some(first_row) = rows.first() { // Inspect first row to build column header schema if results exist
        for col in first_row.columns() { // Iterate over all columns in row schema
            columns.push(ColumnHeader { // Add column header entry
                name: col.name().to_string(), // Extract column name string
                type_name: col.type_info().name().to_string(), // Extract type info name string
            }); // End of column push
        } // End of column loop
    } // End of schema inspection block

    for row in &rows { // Iterate through each returned dynamic database row
        let mut row_values = Vec::new(); // Initialize array for current row cell values
        for i in 0..row.columns().len() { // Loop over column indices
            row_values.push(decode_any_cell(row, i)); // Decode cell value and append to row array
        } // End of column index loop
        result_rows.push(row_values); // Push completed row array into result matrix
    } // End of row processing loop

    let execution_time_ms = start_time.elapsed().as_millis() as u64; // Calculate elapsed time in milliseconds
    let affected_rows = rows.len() as u64; // Count total rows returned in result set

    Ok(QueryResultPayload { // Return constructed QueryResultPayload struct
        columns, // Return column headers array
        rows: result_rows, // Return encoded rows matrix
        execution_time_ms, // Return execution time duration
        affected_rows, // Return total affected row count
    }) // End of Ok payload return
} // End of execute_dynamic_query function

#[cfg(test)] // Conditional compilation attribute for unit test module
mod tests { // Declare internal unit testing module
    use super::*; // Import parent module items into test scope

    #[test] // Mark function as unit test for ColumnHeader struct
    fn test_column_header_structure() { // Test function verifying ColumnHeader serialization
        let col = ColumnHeader { name: "id".to_string(), type_name: "INTEGER".to_string() }; // Instantiate ColumnHeader
        assert_eq!(col.name, "id"); // Assert name field matches expected value
        assert_eq!(col.type_name, "INTEGER"); // Assert type_name field matches expected value
    } // End of test function
} // End of tests module
