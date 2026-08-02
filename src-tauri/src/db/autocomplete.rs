// SQL Editor Autocomplete Data Provider module
use crate::db::introspection::{fetch_columns, fetch_tables};
use serde::{Deserialize, Serialize};
use sqlx::AnyPool;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TableColumnsMap {
    pub table_name: String,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AutocompleteDataPayload {
    pub schemas: Vec<String>,
    pub tables: Vec<String>,
    pub table_columns: Vec<TableColumnsMap>,
    pub fetch_time_ms: f64,
}

pub async fn fetch_autocomplete_data(
    pool: &AnyPool,
    db_kind: &str,
) -> Result<AutocompleteDataPayload, String> {
    let start_time = Instant::now();

    // 1. Fetch tables (multi-schema aware)
    let tables_info = fetch_tables(pool, db_kind).await?;
    let mut tables = Vec::new();
    let mut table_columns = Vec::new();
    let mut schemas: Vec<String> = Vec::new();

    for table in &tables_info {
        if !schemas.iter().any(|s| s == &table.schema) {
            schemas.push(table.schema.clone());
        }
        // Prefer qualified names for autocomplete so multi-schema DBs disambiguate
        let key = if table.qualified_name.is_empty() {
            table.name.clone()
        } else {
            table.qualified_name.clone()
        };
        tables.push(key.clone());
        // Also register bare name for convenience when unique
        if key != table.name && !tables.iter().any(|t| t == &table.name) {
            tables.push(table.name.clone());
        }
        let cols_info = fetch_columns(pool, db_kind, &key)
            .await
            .unwrap_or_default();
        let cols = cols_info.into_iter().map(|c| c.name).collect();
        table_columns.push(TableColumnsMap {
            table_name: key,
            columns: cols,
        });
    }

    if schemas.is_empty() {
        schemas.push("public".to_string());
    }

    let elapsed = start_time.elapsed().as_secs_f64() * 1000.0;
    Ok(AutocompleteDataPayload {
        schemas,
        tables,
        table_columns,
        fetch_time_ms: elapsed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::any::AnyPoolOptions;
    use sqlx::Executor;

    #[tokio::test]
    async fn test_fetch_autocomplete_5_tables_under_100ms() {
        sqlx::any::install_default_drivers();
        let pool = AnyPoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        // Create 5 tables
        for i in 1..=5 {
            let sql = format!(
                "CREATE TABLE table_{} (id INT PRIMARY KEY, name TEXT, col_{} TEXT);",
                i, i
            );
            pool.execute(sql.as_str()).await.unwrap();
        }

        let data = fetch_autocomplete_data(&pool, "sqlite").await.unwrap();
        assert_eq!(data.tables.len(), 5);
        assert_eq!(data.table_columns.len(), 5);
        assert!(data.fetch_time_ms < 100.0);
    }
}
