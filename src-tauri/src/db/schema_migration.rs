// Schema Migration Generator module
use crate::db::identifiers::{quote_ident, quote_table, validate_simple_identifier, validate_table_identifier};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ColumnSnapshot {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TableSnapshot {
    pub table_name: String,
    pub columns: Vec<ColumnSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EngineDialect {
    Postgres,
    Mysql,
    Sqlite,
}

impl EngineDialect {
    pub fn from_db_kind(kind: &str) -> Result<Self, String> {
        match kind.to_lowercase().as_str() {
            "postgres" | "postgresql" | "cockroachdb" | "redshift" => Ok(Self::Postgres),
            "mysql" | "mariadb" => Ok(Self::Mysql),
            "sqlite" | "duckdb" | "turso" => Ok(Self::Sqlite),
            other => Err(format!(
                "No SQL dialect mapping for '{other}' (need postgres, mysql, or sqlite family)"
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MigrationDiffResult {
    pub table_name: String,
    pub added_columns: Vec<ColumnSnapshot>,
    pub removed_columns: Vec<String>,
    pub sql_statements: Vec<String>,
}

fn validate_data_type(data_type: &str) -> Result<(), String> {
    if data_type.is_empty() || data_type.len() > 64 {
        return Err("Invalid data type".to_string());
    }
    if !data_type
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '(' || c == ')' || c == ',' || c == ' ')
    {
        return Err(format!("Invalid data type '{}'", data_type));
    }
    Ok(())
}

/// Diff two table snapshots and generate ADD/DROP COLUMN SQL with validated identifiers.
pub fn generate_schema_migration(
    snapshot: &TableSnapshot,
    current: &TableSnapshot,
    engine: EngineDialect,
) -> Result<MigrationDiffResult, String> {
    validate_table_identifier(&current.table_name)?;
    // Prefer current name; if empty fall back was already rejected by validate.
    if !snapshot.table_name.is_empty() {
        validate_table_identifier(&snapshot.table_name)?;
    }

    let mut snapshot_map: HashMap<String, &ColumnSnapshot> = HashMap::new();
    for col in &snapshot.columns {
        validate_simple_identifier(&col.name)?;
        snapshot_map.insert(col.name.to_lowercase(), col);
    }

    let mut current_map: HashMap<String, &ColumnSnapshot> = HashMap::new();
    for col in &current.columns {
        validate_simple_identifier(&col.name)?;
        current_map.insert(col.name.to_lowercase(), col);
    }

    let mut added_columns = Vec::new();
    for col in &current.columns {
        if !snapshot_map.contains_key(&col.name.to_lowercase()) {
            validate_data_type(&col.data_type)?;
            added_columns.push(col.clone());
        }
    }

    let mut removed_columns = Vec::new();
    for col in &snapshot.columns {
        if !current_map.contains_key(&col.name.to_lowercase()) {
            removed_columns.push(col.name.clone());
        }
    }

    // Type / nullability changes on columns present in both snapshots
    let mut altered: Vec<(String, String, bool, bool)> = Vec::new(); // name, new_type, was_null, is_null
    for col in &current.columns {
        if let Some(old) = snapshot_map.get(&col.name.to_lowercase()) {
            let type_changed = !old.data_type.eq_ignore_ascii_case(&col.data_type);
            let null_changed = old.is_nullable != col.is_nullable;
            if type_changed || null_changed {
                validate_data_type(&col.data_type)?;
                altered.push((
                    col.name.clone(),
                    col.data_type.clone(),
                    old.is_nullable,
                    col.is_nullable,
                ));
            }
        }
    }

    let mysql = matches!(engine, EngineDialect::Mysql);
    let quoted_table = quote_table(&current.table_name, mysql)?;
    let mut sql_statements = Vec::new();

    for col in &added_columns {
        let null_clause = if col.is_nullable { "NULL" } else { "NOT NULL" };
        sql_statements.push(format!(
            "ALTER TABLE {} ADD COLUMN {} {} {};",
            quoted_table,
            quote_ident(&col.name, mysql),
            col.data_type,
            null_clause
        ));
    }

    for col_name in &removed_columns {
        sql_statements.push(format!(
            "ALTER TABLE {} DROP COLUMN {};",
            quoted_table,
            quote_ident(col_name, mysql)
        ));
    }

    for (name, new_type, _was_null, is_null) in &altered {
        let qcol = quote_ident(name, mysql);
        match engine {
            EngineDialect::Postgres => {
                sql_statements.push(format!(
                    "ALTER TABLE {} ALTER COLUMN {} TYPE {};",
                    quoted_table, qcol, new_type
                ));
                if *is_null {
                    sql_statements.push(format!(
                        "ALTER TABLE {} ALTER COLUMN {} DROP NOT NULL;",
                        quoted_table, qcol
                    ));
                } else {
                    sql_statements.push(format!(
                        "ALTER TABLE {} ALTER COLUMN {} SET NOT NULL;",
                        quoted_table, qcol
                    ));
                }
            }
            EngineDialect::Mysql => {
                let null_clause = if *is_null { "NULL" } else { "NOT NULL" };
                sql_statements.push(format!(
                    "ALTER TABLE {} MODIFY COLUMN {} {} {};",
                    quoted_table, qcol, new_type, null_clause
                ));
            }
            EngineDialect::Sqlite => {
                sql_statements.push(format!(
                    "-- SQLite cannot ALTER COLUMN type/nullability for {}; rebuild table manually",
                    name
                ));
            }
        }
    }

    Ok(MigrationDiffResult {
        table_name: current.table_name.clone(),
        added_columns,
        removed_columns,
        sql_statements,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_migration_add_column_all_engines() {
        let snapshot = TableSnapshot {
            table_name: "users".to_string(),
            columns: vec![
                ColumnSnapshot {
                    name: "id".to_string(),
                    data_type: "INT".to_string(),
                    is_nullable: false,
                    is_primary_key: true,
                },
                ColumnSnapshot {
                    name: "name".to_string(),
                    data_type: "VARCHAR(255)".to_string(),
                    is_nullable: true,
                    is_primary_key: false,
                },
            ],
        };

        let current = TableSnapshot {
            table_name: "users".to_string(),
            columns: vec![
                ColumnSnapshot {
                    name: "id".to_string(),
                    data_type: "INT".to_string(),
                    is_nullable: false,
                    is_primary_key: true,
                },
                ColumnSnapshot {
                    name: "name".to_string(),
                    data_type: "VARCHAR(255)".to_string(),
                    is_nullable: true,
                    is_primary_key: false,
                },
                ColumnSnapshot {
                    name: "age".to_string(),
                    data_type: "INT".to_string(),
                    is_nullable: true,
                    is_primary_key: false,
                },
            ],
        };

        let pg_diff =
            generate_schema_migration(&snapshot, &current, EngineDialect::Postgres).unwrap();
        assert_eq!(pg_diff.added_columns.len(), 1);
        assert_eq!(
            pg_diff.sql_statements[0],
            "ALTER TABLE \"users\" ADD COLUMN \"age\" INT NULL;"
        );

        let mysql_diff =
            generate_schema_migration(&snapshot, &current, EngineDialect::Mysql).unwrap();
        assert_eq!(
            mysql_diff.sql_statements[0],
            "ALTER TABLE `users` ADD COLUMN `age` INT NULL;"
        );

        let sqlite_diff =
            generate_schema_migration(&snapshot, &current, EngineDialect::Sqlite).unwrap();
        assert_eq!(
            sqlite_diff.sql_statements[0],
            "ALTER TABLE \"users\" ADD COLUMN \"age\" INT NULL;"
        );
    }

    #[test]
    fn test_rejects_malicious_table_or_column() {
        let snapshot = TableSnapshot {
            table_name: "users".to_string(),
            columns: vec![],
        };
        let evil = TableSnapshot {
            table_name: "users; DROP TABLE users;--".to_string(),
            columns: vec![ColumnSnapshot {
                name: "x".to_string(),
                data_type: "INT".to_string(),
                is_nullable: true,
                is_primary_key: false,
            }],
        };
        assert!(generate_schema_migration(&snapshot, &evil, EngineDialect::Postgres).is_err());

        let bad_col = TableSnapshot {
            table_name: "users".to_string(),
            columns: vec![ColumnSnapshot {
                name: "id; DROP--".to_string(),
                data_type: "INT".to_string(),
                is_nullable: true,
                is_primary_key: false,
            }],
        };
        assert!(generate_schema_migration(&snapshot, &bad_col, EngineDialect::Mysql).is_err());
    }
}
