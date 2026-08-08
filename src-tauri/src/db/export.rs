// Data export and import engine supporting CSV, JSON, and SQL dump formats
use serde::{Deserialize, Serialize}; // Import Serde traits for payload serialization
use serde_json::Value; // Import JSON Value enum for dynamic row data

// Supported export format enumeration
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)] // Derive standard traits
pub enum ExportFormat { // Define export format enum
    Csv, // Comma-separated values format
    Json, // JSON array format
    SqlDump, // SQL INSERT statement dump format
    Parquet, // Apache Parquet (binary; returned as base64 from IPC)
} // End of ExportFormat enum

// Export configuration payload struct
#[derive(Debug, Serialize, Deserialize, Clone)] // Derive standard traits
pub struct ExportConfig { // Struct for export parameters
    pub table_name: String, // Target table name to export
    pub format: ExportFormat, // Output format specification
    pub include_headers: bool, // Whether to include column headers in output
} // End of ExportConfig struct

use crate::db::pool::ManagedConnection;

// Fetch all rows from a table (optional WHERE fragment, already validated by caller)
async fn fetch_table_data(
    managed_conn: &ManagedConnection,
    table_name: &str,
    mysql_style: bool,
    where_clause: Option<&str>,
) -> Result<(Vec<String>, Vec<Vec<Value>>), String> {
    let quoted = crate::db::identifiers::quote_table(table_name, mysql_style)?;
    let mut sql = format!("SELECT * FROM {}", quoted);
    if let Some(w) = where_clause {
        let trimmed = w.trim();
        if !trimmed.is_empty() {
            // Reject multi-statement injection
            if trimmed.contains(';') {
                return Err("WHERE clause must not contain semicolons".to_string());
            }
            if trimmed.to_uppercase().starts_with("WHERE") {
                sql.push(' ');
                sql.push_str(trimmed);
            } else {
                sql.push_str(" WHERE ");
                sql.push_str(trimmed);
            }
        }
    }
    let payload = crate::db::executor::execute_query_for_managed(managed_conn, &sql).await?;
    let col_names = payload.columns.into_iter().map(|c| c.name).collect();
    Ok((col_names, payload.rows))
} // End fetch_table_data function

// Export table data to CSV format string
pub async fn export_csv(
    conn: &ManagedConnection,
    table_name: &str,
    include_headers: bool,
    mysql_style: bool,
) -> Result<String, String> {
    export_csv_filtered(conn, table_name, include_headers, mysql_style, None).await
}

pub async fn export_csv_filtered(
    conn: &ManagedConnection,
    table_name: &str,
    include_headers: bool,
    mysql_style: bool,
    where_clause: Option<&str>,
) -> Result<String, String> {
    let (cols, rows) = fetch_table_data(conn, table_name, mysql_style, where_clause).await?;
    let mut output = String::new(); // Initialize output buffer string

    if include_headers { // Check if headers should be included
        output.push_str(&cols.join(",")); // Join column names with commas
        output.push('\n'); // Append newline after header row
    } // End header inclusion

    for row in &rows { // Iterate through data rows
        let line: Vec<String> = row.iter().map(|v| { // Map each cell value to string
            match v { // Match on value type
                Value::String(s) => format!("\"{}\"", s.replace('"', "\"\"")), // Quote and escape strings
                Value::Null => "".to_string(), // Empty string for nulls
                other => other.to_string(), // Direct conversion for numbers/booleans
            } // End match
        }).collect(); // Collect formatted cell strings
        output.push_str(&line.join(",")); // Join cells with commas
        output.push('\n'); // Append newline after each row
    } // End row loop

    Ok(output) // Return formatted CSV string
} // End export_csv function

// Export table data to JSON array format string
pub async fn export_json(
    conn: &ManagedConnection,
    table_name: &str,
    mysql_style: bool,
) -> Result<String, String> {
    export_json_filtered(conn, table_name, mysql_style, None).await
}

pub async fn export_json_filtered(
    conn: &ManagedConnection,
    table_name: &str,
    mysql_style: bool,
    where_clause: Option<&str>,
) -> Result<String, String> {
    let (cols, rows) = fetch_table_data(conn, table_name, mysql_style, where_clause).await?;
    let mut json_rows = Vec::new(); // Initialize JSON objects vector

    for row in &rows { // Iterate through data rows
        let mut obj = serde_json::Map::new(); // Create JSON object for row
        for (i, col_name) in cols.iter().enumerate() { // Iterate over columns with index
            obj.insert(col_name.clone(), row[i].clone()); // Insert column-value pair into object
        } // End column loop
        json_rows.push(Value::Object(obj)); // Add JSON object to array
    } // End row loop

    let output = serde_json::to_string_pretty(&json_rows) // Serialize JSON array to pretty string
        .map_err(|e| format!("JSON serialization failed: {}", e))?; // Handle serialization error
    Ok(output) // Return JSON string
} // End export_json function

// Export table data to SQL INSERT dump format string
pub async fn export_sql_dump(
    conn: &ManagedConnection,
    table_name: &str,
    mysql_style: bool,
) -> Result<String, String> {
    export_sql_dump_filtered(conn, table_name, mysql_style, None).await
}

pub async fn export_sql_dump_filtered(
    conn: &ManagedConnection,
    table_name: &str,
    mysql_style: bool,
    where_clause: Option<&str>,
) -> Result<String, String> {
    let (cols, rows) = fetch_table_data(conn, table_name, mysql_style, where_clause).await?;
    let mut output = String::new();
    let quoted_table = crate::db::identifiers::quote_table(table_name, mysql_style)?;
    let quoted_cols: Vec<String> = cols
        .iter()
        .map(|c| crate::db::identifiers::quote_ident(c, mysql_style))
        .collect();
    let col_list = quoted_cols.join(", ");

    for row in &rows {
        let vals: Vec<String> = row
            .iter()
            .map(|v| match v {
                Value::String(s) => format!("'{}'", s.replace('\'', "''")),
                Value::Null => "NULL".to_string(),
                Value::Bool(b) => {
                    if *b {
                        "TRUE".to_string()
                    } else {
                        "FALSE".to_string()
                    }
                }
                other => other.to_string(),
            })
            .collect();
        output.push_str(&format!(
            "INSERT INTO {} ({}) VALUES ({});\n",
            quoted_table,
            col_list,
            vals.join(", ")
        ));
    }

    Ok(output)
}

/// Build Apache Parquet bytes from column names + stringified cell values (nullable Utf8).
pub fn write_parquet_from_columns(
    col_names: &[String],
    column_data: &[Vec<Option<String>>],
) -> Result<Vec<u8>, String> {
    use std::sync::Arc;

    use arrow_array::{ArrayRef, RecordBatch, StringArray};
    use arrow_schema::{DataType, Field, Schema};
    use parquet::arrow::ArrowWriter;
    use parquet::basic::Compression;
    use parquet::file::properties::WriterProperties;

    if col_names.is_empty() {
        return Err("Cannot write Parquet without columns".to_string());
    }
    if column_data.len() != col_names.len() {
        return Err("Column name / data length mismatch".to_string());
    }
    let row_count = column_data[0].len();
    if column_data.iter().any(|c| c.len() != row_count) {
        return Err("Jagged column lengths".to_string());
    }

    let fields: Vec<Field> = col_names
        .iter()
        .map(|n| Field::new(n.as_str(), DataType::Utf8, true))
        .collect();
    let schema = Arc::new(Schema::new(fields));

    let arrays: Vec<ArrayRef> = column_data
        .iter()
        .map(|col| {
            let arr = StringArray::from(col.clone());
            Arc::new(arr) as ArrayRef
        })
        .collect();

    let batch = RecordBatch::try_new(schema.clone(), arrays)
        .map_err(|e| format!("Parquet RecordBatch failed: {}", e))?;

    let mut buffer: Vec<u8> = Vec::new();
    {
        let props = WriterProperties::builder()
            .set_compression(Compression::SNAPPY)
            .build();
        let mut writer = ArrowWriter::try_new(&mut buffer, schema, Some(props))
            .map_err(|e| format!("Parquet writer init failed: {}", e))?;
        writer
            .write(&batch)
            .map_err(|e| format!("Parquet write failed: {}", e))?;
        writer
            .close()
            .map_err(|e| format!("Parquet close failed: {}", e))?;
    }
    Ok(buffer)
}

fn json_value_to_optional_string(v: &Value) -> Option<String> {
    match v {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    }
}

/// Full-table Parquet via the managed connection query path.
pub async fn export_parquet_filtered(
    conn: &ManagedConnection,
    table_name: &str,
    mysql_style: bool,
    where_clause: Option<&str>,
) -> Result<Vec<u8>, String> {
    let (cols, rows) = fetch_table_data(conn, table_name, mysql_style, where_clause).await?;
    if cols.is_empty() {
        return write_parquet_from_columns(
            &["_empty".to_string()],
            &[Vec::<Option<String>>::new()],
        );
    }
    export_parquet_from_json_rows(&cols, &rows)
}

/// Parquet from pre-materialized JSON rows (current page / client-side export path).
pub fn export_parquet_from_json_rows(
    columns: &[String],
    rows: &[Vec<Value>],
) -> Result<Vec<u8>, String> {
    if columns.is_empty() {
        return Err("No columns for Parquet export".to_string());
    }
    let mut column_data: Vec<Vec<Option<String>>> =
        columns.iter().map(|_| Vec::with_capacity(rows.len())).collect();
    for row in rows {
        for (i, _) in columns.iter().enumerate() {
            let cell = row.get(i).unwrap_or(&Value::Null);
            column_data[i].push(json_value_to_optional_string(cell));
        }
    }
    write_parquet_from_columns(columns, &column_data)
}

// Parse CSV string and return as structured data
pub fn parse_csv(csv_data: &str, has_headers: bool) -> Result<(Vec<String>, Vec<Vec<String>>), String> { // CSV parser function
    let mut lines = csv_data.lines(); // Split input into line iterator
    let mut headers = Vec::new(); // Initialize headers vector
    let mut data = Vec::new(); // Initialize data rows vector

    if has_headers { // Check if first line is header row
        if let Some(header_line) = lines.next() { // Read first line as headers
            headers = header_line.split(',') // Split by comma
                .map(|h| h.trim().trim_matches('"').to_string()) // Trim whitespace and quotes
                .collect(); // Collect into headers vector
        } // End header extraction
    } // End header check

    for line in lines { // Iterate remaining lines
        if line.trim().is_empty() { continue; } // Skip empty lines
        let row: Vec<String> = line.split(',') // Split by comma
            .map(|c| c.trim().trim_matches('"').to_string()) // Trim whitespace and quotes
            .collect(); // Collect into row vector
        data.push(row); // Add row to data matrix
    } // End line iteration

    Ok((headers, data)) // Return parsed headers and data
} // End parse_csv function

#[cfg(test)] // Conditional compilation for unit tests
mod tests { // Unit test module
    use super::*; // Import parent module items

    #[test] // Test CSV parsing with headers
    fn test_parse_csv_with_headers() { // Test function
        let csv = "id,name,email\n1,Akshat,akshat@test.com\n2,Rishi,rishi@test.com"; // Mock CSV data
        let (headers, data) = parse_csv(csv, true).unwrap(); // Parse CSV with headers enabled
        assert_eq!(headers, vec!["id", "name", "email"]); // Assert headers match expected
        assert_eq!(data.len(), 2); // Assert two data rows parsed
        assert_eq!(data[0], vec!["1", "Akshat", "akshat@test.com"]); // Assert first row values
    } // End test function

    #[test] // Test CSV parsing without headers
    fn test_parse_csv_without_headers() { // Test function
        let csv = "1,Akshat\n2,Rishi"; // Mock CSV without headers
        let (headers, data) = parse_csv(csv, false).unwrap(); // Parse without headers
        assert!(headers.is_empty()); // Assert no headers
        assert_eq!(data.len(), 2); // Assert two data rows
    } // End test function

    #[test] // Test export format enum equality
    fn test_export_format_variants() { // Test function
        assert_eq!(ExportFormat::Csv, ExportFormat::Csv); // Assert CSV equality
        assert_ne!(ExportFormat::Csv, ExportFormat::Json); // Assert CSV != JSON
        assert_ne!(ExportFormat::Json, ExportFormat::SqlDump); // Assert JSON != SqlDump
        assert_ne!(ExportFormat::Parquet, ExportFormat::Csv);
    } // End test function

    #[test]
    fn test_write_parquet_roundtrip_bytes() {
        let cols = vec!["id".to_string(), "name".to_string()];
        let data = vec![
            vec![Some("1".to_string()), Some("2".to_string())],
            vec![Some("alice".to_string()), None],
        ];
        let bytes = write_parquet_from_columns(&cols, &data).unwrap();
        assert!(bytes.len() > 8);
        assert_eq!(&bytes[0..4], b"PAR1");
        assert_eq!(&bytes[bytes.len() - 4..], b"PAR1");
    }
} // End tests module
