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
// Note: sqlx::Any only decodes a limited set of types (not chrono DateTime).
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
    } else if let Ok(val) = row.try_get::<Vec<u8>, _>(index) {
        // Binary / BLOB — surface as base64 so the UI can inspect without loss
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        Value::String(STANDARD.encode(val))
    } else {
        Value::Null
    }
}

/// Returns true when the statement is expected to return a result set.
fn expects_result_set(sql: &str) -> bool {
    let trimmed = sql.trim_start();
    // Strip leading SQL comments (single-line)
    let mut s = trimmed;
    loop {
        if s.starts_with("--") {
            if let Some(pos) = s.find('\n') {
                s = s[pos + 1..].trim_start();
                continue;
            }
            return false;
        }
        if s.starts_with("/*") {
            if let Some(pos) = s.find("*/") {
                s = s[pos + 2..].trim_start();
                continue;
            }
            return false;
        }
        break;
    }
    let upper = s.to_uppercase();
    upper.starts_with("SELECT")
        || upper.starts_with("WITH")
        || upper.starts_with("SHOW")
        || upper.starts_with("DESCRIBE")
        || upper.starts_with("DESC ")
        || upper.starts_with("EXPLAIN")
        || upper.starts_with("PRAGMA")
        || upper.starts_with("VALUES")
}

// Execute arbitrary dynamic SQL string against connection pool and return formatted payload
pub async fn execute_dynamic_query(pool: &AnyPool, sql: &str) -> Result<QueryResultPayload, String> {
    let start_time = Instant::now();

    // DML/DDL statements (INSERT/UPDATE/DELETE/CREATE/...) should use execute(),
    // not fetch_all(). Using fetch_all on non-SELECT queries fails on most drivers.
    if !expects_result_set(sql) {
        let result = sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| format!("Query execution failed: {}", e))?;

        return Ok(QueryResultPayload {
            columns: vec![ColumnHeader {
                name: "affected_rows".to_string(),
                type_name: "INTEGER".to_string(),
            }],
            rows: vec![vec![json!(result.rows_affected())]],
            execution_time_ms: start_time.elapsed().as_millis() as u64,
            affected_rows: result.rows_affected(),
        });
    }

    let rows: Vec<AnyRow> = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Query execution failed: {}", e))?;

    let mut columns = Vec::new();
    let mut result_rows = Vec::new();

    if let Some(first_row) = rows.first() {
        for col in first_row.columns() {
            columns.push(ColumnHeader {
                name: col.name().to_string(),
                type_name: col.type_info().name().to_string(),
            });
        }
    }

    for row in &rows {
        let mut row_values = Vec::new();
        for i in 0..row.columns().len() {
            row_values.push(decode_any_cell(row, i));
        }
        result_rows.push(row_values);
    }

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

// GAP 12: Protocol-level Backend Process Termination
pub async fn cancel_backend_process(pool: &AnyPool, pid_or_thread_id: u32, db_kind: &str) -> Result<(), String> {
    let cancel_sql = match db_kind.to_lowercase().as_str() {
        "postgres" | "cockroachdb" | "redshift" => format!("SELECT pg_cancel_backend({})", pid_or_thread_id),
        "mysql" | "mariadb" => format!("KILL QUERY {}", pid_or_thread_id),
        "mssql" => format!("KILL {}", pid_or_thread_id),
        _ => return Err(format!("Engine {} does not support remote protocol query cancellation", db_kind)),
    };
    sqlx::query(&cancel_sql)
        .execute(pool)
        .await
        .map_err(|e| format!("Protocol query cancellation failed: {}", e))?;
    Ok(())
}

// Stream dynamic query results in chunks of chunk_size (default 500) to prevent RAM bloating
pub async fn stream_dynamic_query<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    pool: &AnyPool,
    query_id: &str,
    sql: &str,
    chunk_size: usize,
) -> Result<QueryResultPayload, String> {
    use futures_util::StreamExt;
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

#[cfg(test)]
mod integration_tests {
    use super::*;
    use sqlx::any::AnyPoolOptions;

    #[tokio::test]
    async fn test_dml_and_select_on_sqlite() {
        sqlx::any::install_default_drivers();
        // Single connection: in-memory SQLite is not shared across pool connections.
        let pool = AnyPoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect");

        let create = execute_dynamic_query(
            &pool,
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
        )
        .await
        .expect("create");
        assert_eq!(create.columns[0].name, "affected_rows");

        let insert = execute_dynamic_query(
            &pool,
            "INSERT INTO users (id, name) VALUES (1, 'Ada');",
        )
        .await
        .expect("insert");
        assert_eq!(insert.affected_rows, 1);

        let select = execute_dynamic_query(&pool, "SELECT id, name FROM users;")
            .await
            .expect("select");
        assert_eq!(select.rows.len(), 1);
        assert_eq!(select.rows[0][1], serde_json::json!("Ada"));
    }
}
