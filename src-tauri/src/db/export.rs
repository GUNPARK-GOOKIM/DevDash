// Data export and import engine supporting CSV, JSON, and SQL dump formats
use serde::{Deserialize, Serialize}; // Import Serde traits for payload serialization
use serde_json::Value; // Import JSON Value enum for dynamic row data
use sqlx::any::AnyRow; // Import AnyRow for result processing
use sqlx::AnyPool; // Import AnyPool for database queries
use sqlx::{Column, Row}; // Import Column and Row traits for schema access

// Supported export format enumeration
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)] // Derive standard traits
pub enum ExportFormat { // Define export format enum
    Csv, // Comma-separated values format
    Json, // JSON array format
    SqlDump, // SQL INSERT statement dump format
} // End of ExportFormat enum

// Export configuration payload struct
#[derive(Debug, Serialize, Deserialize, Clone)] // Derive standard traits
pub struct ExportConfig { // Struct for export parameters
    pub table_name: String, // Target table name to export
    pub format: ExportFormat, // Output format specification
    pub include_headers: bool, // Whether to include column headers in output
} // End of ExportConfig struct

// Fetch all rows from a table and convert to JSON value arrays
async fn fetch_table_data(pool: &AnyPool, table_name: &str) -> Result<(Vec<String>, Vec<Vec<Value>>), String> { // Fetch function
    let sql = format!("SELECT * FROM {}", table_name); // Build SELECT query string
    let rows: Vec<AnyRow> = sqlx::query(&sql) // Prepare dynamic query
        .fetch_all(pool) // Execute and fetch all rows
        .await // Await database response
        .map_err(|e| format!("Export fetch failed: {}", e))?; // Map error to string

    let mut col_names = Vec::new(); // Column names vector
    let mut data_rows = Vec::new(); // Data rows matrix vector

    if let Some(first) = rows.first() { // Extract column schema from first row
        for col in first.columns() { // Iterate over columns
            col_names.push(col.name().to_string()); // Store column name
        } // End column iteration
    } // End schema extraction

    for row in &rows { // Iterate through all data rows
        let mut vals = Vec::new(); // Values vector for current row
        for i in 0..row.columns().len() { // Loop over column indices
            let val = if let Ok(v) = row.try_get::<String, _>(i) { // Try string decode
                Value::String(v) // String value
            } else if let Ok(v) = row.try_get::<i64, _>(i) { // Try integer decode
                serde_json::json!(v) // Integer value
            } else if let Ok(v) = row.try_get::<f64, _>(i) { // Try float decode
                serde_json::json!(v) // Float value
            } else if let Ok(v) = row.try_get::<bool, _>(i) { // Try boolean decode
                Value::Bool(v) // Boolean value
            } else { // Fallback to null
                Value::Null // Null value
            }; // End value decode tree
            vals.push(val); // Add value to row vector
        } // End column loop
        data_rows.push(vals); // Add row to matrix
    } // End row loop

    Ok((col_names, data_rows)) // Return column names and data
} // End fetch_table_data function

// Export table data to CSV format string
pub async fn export_csv(pool: &AnyPool, table_name: &str, include_headers: bool) -> Result<String, String> { // CSV export function
    let (cols, rows) = fetch_table_data(pool, table_name).await?; // Fetch table data
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
pub async fn export_json(pool: &AnyPool, table_name: &str) -> Result<String, String> { // JSON export function
    let (cols, rows) = fetch_table_data(pool, table_name).await?; // Fetch table data
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
pub async fn export_sql_dump(pool: &AnyPool, table_name: &str) -> Result<String, String> { // SQL dump export function
    let (cols, rows) = fetch_table_data(pool, table_name).await?; // Fetch table data
    let mut output = String::new(); // Initialize output buffer string
    let col_list = cols.join(", "); // Join column names for INSERT header

    for row in &rows { // Iterate through data rows
        let vals: Vec<String> = row.iter().map(|v| { // Map each cell to SQL literal
            match v { // Match on value type
                Value::String(s) => format!("'{}'", s.replace('\'', "''")), // Escape single quotes in strings
                Value::Null => "NULL".to_string(), // SQL NULL literal
                Value::Bool(b) => if *b { "TRUE".to_string() } else { "FALSE".to_string() }, // SQL boolean literal
                other => other.to_string(), // Direct number conversion
            } // End match
        }).collect(); // Collect SQL literal strings
        output.push_str(&format!("INSERT INTO {} ({}) VALUES ({});\n", table_name, col_list, vals.join(", "))); // Format INSERT statement
    } // End row loop

    Ok(output) // Return SQL dump string
} // End export_sql_dump function

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
    } // End test function
} // End tests module
