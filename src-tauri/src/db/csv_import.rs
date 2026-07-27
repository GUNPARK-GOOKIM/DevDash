// CSV and File Import Engine module
use serde::{Deserialize, Serialize};
use sqlx::{AnyPool, Executor};
use std::fs::File;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImportPreviewPayload {
    pub headers: Vec<String>,
    pub preview_rows: Vec<Vec<String>>,
    pub total_rows_estimated: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FailedRowReport {
    pub row_index: usize,
    pub raw_data: Vec<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImportExecutionResult {
    pub inserted_count: usize,
    pub failed_count: usize,
    pub failed_rows: Vec<FailedRowReport>,
}

pub fn preview_csv_file(file_path: &Path) -> Result<ImportPreviewPayload, String> {
    let file = File::open(file_path).map_err(|e| format!("Failed to open CSV file: {}", e))?;
    let mut reader = csv::ReaderBuilder::new().from_reader(file);

    let headers = reader
        .headers()
        .map_err(|e| format!("Failed to read CSV headers: {}", e))?
        .iter()
        .map(|s| s.to_string())
        .collect();

    let mut preview_rows = Vec::new();
    let mut total_rows_estimated = 0;

    for (idx, result) in reader.records().enumerate() {
        total_rows_estimated += 1;
        if let Ok(record) = result {
            if idx < 5 {
                preview_rows.push(record.iter().map(|s| s.to_string()).collect());
            }
        }
    }

    Ok(ImportPreviewPayload {
        headers,
        preview_rows,
        total_rows_estimated,
    })
}

pub async fn execute_csv_import(
    pool: &AnyPool,
    table_name: &str,
    file_path: &Path,
) -> Result<ImportExecutionResult, String> {
    let file = File::open(file_path).map_err(|e| format!("Failed to open CSV file: {}", e))?;
    let mut reader = csv::ReaderBuilder::new().from_reader(file);

    let headers = reader
        .headers()
        .map_err(|e| format!("Failed to read CSV headers: {}", e))?
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>();

    let cols_clause = headers
        .iter()
        .map(|h| format!("\"{}\"", h))
        .collect::<Vec<_>>()
        .join(", ");

    let placeholders = (1..=headers.len())
        .map(|idx| format!("${}", idx))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!("INSERT INTO \"{}\" ({}) VALUES ({});", table_name, cols_clause, placeholders);

    let mut inserted_count = 0;
    let mut failed_rows = Vec::new();

    for (idx, record_res) in reader.records().enumerate() {
        let row_num = idx + 1;
        match record_res {
            Ok(record) => {
                let row_values: Vec<String> = record.iter().map(|s| s.to_string()).collect();

                // Format row into SQL query with escaped literals
                let vals_clause = row_values
                    .iter()
                    .map(|val| {
                        let trimmed = val.trim();
                        if trimmed.is_empty() {
                            "NULL".to_string()
                        } else if let Ok(num) = trimmed.parse::<i64>() {
                            num.to_string()
                        } else if let Ok(num) = trimmed.parse::<f64>() {
                            num.to_string()
                        } else if trimmed.eq_ignore_ascii_case("true") {
                            "TRUE".to_string()
                        } else if trimmed.eq_ignore_ascii_case("false") {
                            "FALSE".to_string()
                        } else {
                            format!("'{}'", trimmed.replace('\'', "''"))
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(", ");

                let insert_sql = format!(
                    "INSERT INTO \"{}\" ({}) VALUES ({});",
                    table_name, cols_clause, vals_clause
                );

                match pool.execute(insert_sql.as_str()).await {
                    Ok(_) => {
                        inserted_count += 1;
                    }
                    Err(err) => {
                        failed_rows.push(FailedRowReport {
                            row_index: row_num,
                            raw_data: row_values,
                            reason: err.to_string(),
                        });
                    }
                }
            }
            Err(e) => {
                failed_rows.push(FailedRowReport {
                    row_index: row_num,
                    raw_data: vec![],
                    reason: e.to_string(),
                });
            }
        }
    }

    Ok(ImportExecutionResult {
        inserted_count,
        failed_count: failed_rows.len(),
        failed_rows,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::any::AnyPoolOptions;

    #[tokio::test]
    async fn test_1000_row_mixed_csv_import_with_partial_failures() {
        sqlx::any::install_default_drivers();
        let pool = AnyPoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        pool.execute("CREATE TABLE users (id INT PRIMARY KEY, name TEXT NOT NULL, age INT);")
            .await
            .unwrap();

        let temp_dir = std::env::temp_dir().join("devdash_csv_import_test");
        let _ = std::fs::create_dir_all(&temp_dir);
        let csv_file = temp_dir.join("test_1000.csv");

        // Write 1000 row CSV (with row 500 having duplicate PK 1 to trigger failure)
        let mut wtr = csv::Writer::from_path(&csv_file).unwrap();
        wtr.write_record(&["id", "name", "age"]).unwrap();

        for i in 1..=1000 {
            if i == 500 {
                // Duplicate ID 1 to trigger individual row failure
                wtr.write_record(&["1", "Duplicate User", "99"]).unwrap();
            } else {
                wtr.write_record(&[i.to_string(), format!("User_{}", i), (20 + i % 50).to_string()]).unwrap();
            }
        }
        wtr.flush().unwrap();

        // 1. Preview test
        let preview = preview_csv_file(&csv_file).unwrap();
        assert_eq!(preview.headers, vec!["id", "name", "age"]);
        assert_eq!(preview.preview_rows.len(), 5);
        assert_eq!(preview.total_rows_estimated, 1000);

        // 2. Import execution test
        let result = execute_csv_import(&pool, "users", &csv_file).await.unwrap();
        assert_eq!(result.inserted_count, 999);
        assert_eq!(result.failed_count, 1);
        assert_eq!(result.failed_rows[0].row_index, 500);

        // Cleanup
        let _ = std::fs::remove_file(&csv_file);
    }
}
