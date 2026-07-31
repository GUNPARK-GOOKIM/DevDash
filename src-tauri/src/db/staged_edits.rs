// Transactional staged edit compiler and execution engine
use crate::db::identifiers::{quote_ident, quote_table, sql_literal, validate_simple_identifier};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::AnyPool;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StagedCellChange {
    pub column_name: String,
    pub new_value: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StagedRowEdit {
    pub pk_value: Value,
    pub changes: Vec<StagedCellChange>,
}

/// Build a single-row UPDATE. Identifiers are validated; values are escaped as SQL literals.
/// `mysql_style` selects backtick vs double-quote identifiers (MySQL needs backticks by default).
pub fn build_update_statement(
    table: &str,
    pk_col: &str,
    edit: &StagedRowEdit,
    mysql_style: bool,
) -> Result<String, String> {
    if edit.changes.is_empty() {
        return Err("No column changes provided for staged edit".to_string());
    }

    let quoted_table = quote_table(table, mysql_style)?;
    for change in &edit.changes {
        validate_simple_identifier(&change.column_name)?;
    }

    let set_clauses: Vec<String> = edit
        .changes
        .iter()
        .map(|change| {
            format!(
                "{} = {}",
                quote_ident(&change.column_name, mysql_style),
                sql_literal(&change.new_value)
            )
        })
        .collect();

    let where_clause = match &edit.pk_value {
        Value::Object(obj) => {
            let mut clauses = Vec::new();
            for (k, v) in obj {
                validate_simple_identifier(k)?;
                clauses.push(format!(
                    "{} = {}",
                    quote_ident(k, mysql_style),
                    sql_literal(v)
                ));
            }
            if clauses.is_empty() {
                return Err("Composite primary key object is empty".to_string());
            }
            clauses.join(" AND ")
        }
        Value::String(s) => {
            // Frontend may JSON.stringify composite PKs
            if s.starts_with('{') && s.ends_with('}') {
                if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(s) {
                    let mut clauses = Vec::new();
                    for (k, v) in obj {
                        validate_simple_identifier(&k)?;
                        clauses.push(format!(
                            "{} = {}",
                            quote_ident(&k, mysql_style),
                            sql_literal(&v)
                        ));
                    }
                    if clauses.is_empty() {
                        return Err("Composite primary key object is empty".to_string());
                    }
                    clauses.join(" AND ")
                } else {
                    validate_simple_identifier(pk_col)?;
                    format!(
                        "{} = {}",
                        quote_ident(pk_col, mysql_style),
                        sql_literal(&Value::String(s.clone()))
                    )
                }
            } else {
                validate_simple_identifier(pk_col)?;
                format!(
                    "{} = {}",
                    quote_ident(pk_col, mysql_style),
                    sql_literal(&Value::String(s.clone()))
                )
            }
        }
        other => {
            validate_simple_identifier(pk_col)?;
            format!(
                "{} = {}",
                quote_ident(pk_col, mysql_style),
                sql_literal(other)
            )
        }
    };

    Ok(format!(
        "UPDATE {} SET {} WHERE {};",
        quoted_table,
        set_clauses.join(", "),
        where_clause
    ))
}

// Apply a batch of staged row edits atomically within a single database transaction
pub async fn apply_staged_edits(
    pool: &AnyPool,
    table: &str,
    pk_col: &str,
    edits: Vec<StagedRowEdit>,
    mysql_style: bool,
) -> Result<u64, String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to start transaction: {}", e))?;
    let mut total_updated: u64 = 0;

    for edit in edits {
        let sql = build_update_statement(table, pk_col, &edit, mysql_style)?;
        let result = sqlx::query(&sql)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to update row: {}", e))?;
        total_updated += result.rows_affected();
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;
    Ok(total_updated)
}

#[cfg(test)] // Conditional compilation attribute for unit tests
mod tests { // Declare internal unit testing module
    use super::*; // Import parent module items into test scope
    use serde_json::json; // Import json macro for creating test Values

    #[test]
    fn test_build_update_statement_sql() {
        let edit = StagedRowEdit {
            pk_value: json!(42),
            changes: vec![StagedCellChange {
                column_name: "name".to_string(),
                new_value: json!("Akshat"),
            }],
        };
        let sql = build_update_statement("users", "id", &edit, false).unwrap();
        assert_eq!(
            sql,
            "UPDATE \"users\" SET \"name\" = 'Akshat' WHERE \"id\" = 42;"
        );
    }

    #[test]
    fn test_mysql_style_backticks() {
        let edit = StagedRowEdit {
            pk_value: json!(1),
            changes: vec![StagedCellChange {
                column_name: "name".to_string(),
                new_value: json!("x"),
            }],
        };
        let sql = build_update_statement("users", "id", &edit, true).unwrap();
        assert_eq!(sql, "UPDATE `users` SET `name` = 'x' WHERE `id` = 1;");
    }

    #[test]
    fn test_rejects_malicious_column_name() {
        let edit = StagedRowEdit {
            pk_value: json!(1),
            changes: vec![StagedCellChange {
                column_name: "name=1; DROP TABLE users;--".to_string(),
                new_value: json!("x"),
            }],
        };
        assert!(build_update_statement("users", "id", &edit, false).is_err());
    }

    #[test]
    fn test_composite_pk_json_string() {
        let edit = StagedRowEdit {
            pk_value: json!("{\"tenant_id\":1,\"id\":2}"),
            changes: vec![StagedCellChange {
                column_name: "status".to_string(),
                new_value: json!("active"),
            }],
        };
        let sql = build_update_statement("orders", "id", &edit, false).unwrap();
        assert!(sql.contains("\"tenant_id\" = 1"));
        assert!(sql.contains("\"id\" = 2"));
        assert!(sql.contains("\"status\" = 'active'"));
    }
}
