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
pub fn decode_any_cell(row: &AnyRow, index: usize) -> Value {
    // Try string representation first as most database values convert to string easily
    if let Ok(val) = row.try_get::<String, _>(index) {
        // Attempt to parse JSON string if it looks like structured JSON
        if (val.starts_with('{') && val.ends_with('}')) || (val.starts_with('[') && val.ends_with(']')) {
            if let Ok(json_val) = serde_json::from_str::<Value>(&val) {
                return json_val;
            }
        }
        Value::String(val)
    } else if let Ok(val) = row.try_get::<i64, _>(index) {
        json!(val)
    } else if let Ok(val) = row.try_get::<i32, _>(index) {
        json!(val)
    } else if let Ok(val) = row.try_get::<f64, _>(index) {
        json!(val)
    } else if let Ok(val) = row.try_get::<bool, _>(index) {
        Value::Bool(val)
    } else if let Ok(val) = row.try_get::<chrono::NaiveDateTime, _>(index) {
        Value::String(val.to_string())
    } else if let Ok(val) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(index) {
        Value::String(val.to_rfc3339())
    } else {
        Value::Null
    }
}

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

    let execution_time_ms = start_time.elapsed().as_millis() as u64;
    let affected_rows = rows.len() as u64;

    Ok(QueryResultPayload {
        columns,
        rows: result_rows,
        execution_time_ms,
        affected_rows,
    })
}

// Chunked stream payload for emitting partial query row blocks
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamChunkPayload {
    pub query_id: String,
    pub chunk_index: usize,
    pub rows: Vec<Vec<Value>>,
}

// Event payload emitted when dynamic query stream finishes
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamDonePayload {
    pub query_id: String,
    pub execution_time_ms: u64,
    pub total_rows: u64,
}

// Stream dynamic query results in chunks of chunk_size (default 500) to prevent RAM bloating
pub async fn stream_dynamic_query<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    pool: &AnyPool,
    query_id: &str,
    sql: &str,
    chunk_size: usize,
) -> Result<QueryResultPayload, String> {
    use sqlx::futures::StreamExt;
    use tauri::Emitter;

    let start_time = Instant::now();
    let mut stream = sqlx::query(sql).fetch(pool);

    let mut columns = Vec::new();
    let mut current_chunk: Vec<Vec<Value>> = Vec::with_capacity(chunk_size);
    let mut total_rows: u64 = 0;
    let mut chunk_index: usize = 0;
    let mut header_emitted = false;

    while let Some(row_res) = stream.next().await {
        let row = row_res.map_err(|e| format!("Query stream error: {}", e))?;

        if !header_emitted {
            for col in row.columns() {
                columns.push(ColumnHeader {
                    name: col.name().to_string(),
                    type_name: col.type_info().name().to_string(),
                });
            }
            let _ = app_handle.emit(&format!("query_columns_{}", query_id), &columns);
            header_emitted = true;
        }

        let mut row_values = Vec::with_capacity(row.columns().len());
        for i in 0..row.columns().len() {
            row_values.push(decode_any_cell(&row, i));
        }

        current_chunk.push(row_values);
        total_rows += 1;

        if current_chunk.len() >= chunk_size {
            let chunk_payload = StreamChunkPayload {
                query_id: query_id.to_string(),
                chunk_index,
                rows: std::mem::replace(&mut current_chunk, Vec::with_capacity(chunk_size)),
            };
            let _ = app_handle.emit(&format!("query_chunk_{}", query_id), &chunk_payload);
            chunk_index += 1;
        }
    }

    if !current_chunk.is_empty() {
        let chunk_payload = StreamChunkPayload {
            query_id: query_id.to_string(),
            chunk_index,
            rows: current_chunk,
        };
        let _ = app_handle.emit(&format!("query_chunk_{}", query_id), &chunk_payload);
    }

    let execution_time_ms = start_time.elapsed().as_millis() as u64;

    let done_payload = StreamDonePayload {
        query_id: query_id.to_string(),
        execution_time_ms,
        total_rows,
    };
    let _ = app_handle.emit(&format!("query_done_{}", query_id), &done_payload);

    Ok(QueryResultPayload {
        columns,
        rows: Vec::new(),
        execution_time_ms,
        affected_rows: total_rows,
    })
}

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
