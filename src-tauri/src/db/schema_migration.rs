// Schema Migration Generator module
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MigrationDiffResult {
    pub table_name: String,
    pub added_columns: Vec<ColumnSnapshot>,
    pub removed_columns: Vec<String>,
    pub sql_statements: Vec<String>,
}

pub fn generate_schema_migration(
    snapshot: &TableSnapshot,
    current: &TableSnapshot,
    engine: EngineDialect,
) -> MigrationDiffResult {
    let mut snapshot_map: HashMap<String, &ColumnSnapshot> = HashMap::new();
    for col in &snapshot.columns {
        snapshot_map.insert(col.name.to_lowercase(), col);
    }

    let mut current_map: HashMap<String, &ColumnSnapshot> = HashMap::new();
    for col in &current.columns {
        current_map.insert(col.name.to_lowercase(), col);
    }

    let mut added_columns = Vec::new();
    for col in &current.columns {
        if !snapshot_map.contains_key(&col.name.to_lowercase()) {
            added_columns.push(col.clone());
        }
    }

    let mut removed_columns = Vec::new();
    for col in &snapshot.columns {
        if !current_map.contains_key(&col.name.to_lowercase()) {
            removed_columns.push(col.name.clone());
        }
    }

    let mut sql_statements = Vec::new();

    // Generate ADD COLUMN SQLs
    for col in &added_columns {
        let null_clause = if col.is_nullable { "NULL" } else { "NOT NULL" };
        let stmt = match engine {
            EngineDialect::Postgres => format!(
                "ALTER TABLE \"{}\" ADD COLUMN \"{}\" {} {};",
                current.table_name, col.name, col.data_type, null_clause
            ),
            EngineDialect::Mysql => format!(
                "ALTER TABLE `{}` ADD COLUMN `{}` {} {};",
                current.table_name, col.name, col.data_type, null_clause
            ),
            EngineDialect::Sqlite => format!(
                "ALTER TABLE \"{}\" ADD COLUMN \"{}\" {} {};",
                current.table_name, col.name, col.data_type, null_clause
            ),
        };
        sql_statements.push(stmt);
    }

    // Generate DROP COLUMN SQLs
    for col_name in &removed_columns {
        let stmt = match engine {
            EngineDialect::Postgres => format!(
                "ALTER TABLE \"{}\" DROP COLUMN \"{}\";",
                current.table_name, col_name
            ),
            EngineDialect::Mysql => format!(
                "ALTER TABLE `{}` DROP COLUMN `{}`;",
                current.table_name, col_name
            ),
            EngineDialect::Sqlite => format!(
                "ALTER TABLE \"{}\" DROP COLUMN \"{}\";",
                current.table_name, col_name
            ),
        };
        sql_statements.push(stmt);
    }

    MigrationDiffResult {
        table_name: current.table_name.clone(),
        added_columns,
        removed_columns,
        sql_statements,
    }
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

        let pg_diff = generate_schema_migration(&snapshot, &current, EngineDialect::Postgres);
        assert_eq!(pg_diff.added_columns.len(), 1);
        assert_eq!(
            pg_diff.sql_statements[0],
            "ALTER TABLE \"users\" ADD COLUMN \"age\" INT NULL;"
        );

        let mysql_diff = generate_schema_migration(&snapshot, &current, EngineDialect::Mysql);
        assert_eq!(
            mysql_diff.sql_statements[0],
            "ALTER TABLE `users` ADD COLUMN `age` INT NULL;"
        );

        let sqlite_diff = generate_schema_migration(&snapshot, &current, EngineDialect::Sqlite);
        assert_eq!(
            sqlite_diff.sql_statements[0],
            "ALTER TABLE \"users\" ADD COLUMN \"age\" INT NULL;"
        );
    }
}
