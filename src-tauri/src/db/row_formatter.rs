// Right-Click Context Menu Data Formatter module
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FormattedRowResult {
    pub raw_values: Vec<String>,
    pub json_object: String,
    pub csv_row: String,
    pub sql_insert: String,
}

pub fn format_row_all_formats(
    table_name: &str,
    columns: &[String],
    values: &[Value],
) -> FormattedRowResult {
    // 1. Raw Values
    let raw_values: Vec<String> = values
        .iter()
        .map(|v| match v {
            Value::String(s) => s.clone(),
            Value::Null => "NULL".to_string(),
            other => other.to_string(),
        })
        .collect();

    // 2. JSON Object
    let mut map = serde_json::Map::new();
    for (col, val) in columns.iter().zip(values.iter()) {
        map.insert(col.clone(), val.clone());
    }
    let json_object = serde_json::to_string_pretty(&Value::Object(map))
        .unwrap_or_else(|_| "{}".to_string());

    // 3. CSV Row
    let mut csv_writer = csv::WriterBuilder::new().from_writer(Vec::new());
    let str_vals: Vec<String> = values.iter().map(|v| match v {
        Value::String(s) => s.clone(),
        Value::Null => "".to_string(),
        other => serde_json::to_string(other).unwrap_or_default(),
    }).collect();
    let _ = csv_writer.write_record(&str_vals);
    let csv_bytes = csv_writer.into_inner().unwrap_or_default();
    let csv_row = String::from_utf8_lossy(&csv_bytes).trim().to_string();

    // 4. SQL INSERT statement
    let cols_str = columns
        .iter()
        .map(|c| format!("\"{}\"", c))
        .collect::<Vec<_>>()
        .join(", ");

    let vals_str = values
        .iter()
        .map(|v| match v {
            Value::Null => "NULL".to_string(),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => if *b { "TRUE".to_string() } else { "FALSE".to_string() },
            Value::String(s) => format!("'{}'", s.replace('\'', "''")),
            other => format!("'{}'", other.to_string().replace('\'', "''")),
        })
        .collect::<Vec<_>>()
        .join(", ");

    let sql_insert = format!("INSERT INTO \"{}\" ({}) VALUES ({});", table_name, cols_str, vals_str);

    FormattedRowResult {
        raw_values,
        json_object,
        csv_row,
        sql_insert,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_format_5_column_mixed_types_row() {
        let table = "users";
        let cols = vec![
            "id".to_string(),
            "email".to_string(),
            "created_at".to_string(),
            "metadata".to_string(),
            "is_active".to_string(),
        ];
        let vals = vec![
            json!(101),
            json!("akshat@devdash.io"),
            json!("2026-07-25 10:00:00"),
            json!({"level": "senior"}),
            json!(true),
        ];

        let result = format_row_all_formats(table, &cols, &vals);

        // Check raw values
        assert_eq!(result.raw_values.len(), 5);
        assert_eq!(result.raw_values[0], "101");
        assert_eq!(result.raw_values[1], "akshat@devdash.io");
        assert_eq!(result.raw_values[4], "true");

        // Check JSON object
        assert!(result.json_object.contains("\"email\": \"akshat@devdash.io\""));
        assert!(result.json_object.contains("\"is_active\": true"));

        // Check CSV row
        assert!(result.csv_row.contains("101,akshat@devdash.io"));

        // Check SQL INSERT statement
        assert_eq!(
            result.sql_insert,
            "INSERT INTO \"users\" (\"id\", \"email\", \"created_at\", \"metadata\", \"is_active\") VALUES (101, 'akshat@devdash.io', '2026-07-25 10:00:00', '{\"level\":\"senior\"}', TRUE);"
        );
    }
}
