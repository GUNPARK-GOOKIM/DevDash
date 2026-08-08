// Visual Table Structure Editor Backend module
use crate::db::schema_migration::EngineDialect;
use serde::{Deserialize, Serialize};
use sqlx::{AnyPool, Executor};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddColumnPayload {
    pub table_name: String,
    pub column_name: String,
    pub data_type: String,
    pub is_nullable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DropColumnPayload {
    pub table_name: String,
    pub column_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameColumnPayload {
    pub table_name: String,
    pub old_name: String,
    pub new_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeTypePayload {
    pub table_name: String,
    pub column_name: String,
    pub new_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetNullablePayload {
    pub table_name: String,
    pub column_name: String,
    pub is_nullable: bool,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddIndexPayload {
    pub table_name: String,
    pub index_name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DropIndexPayload {
    pub table_name: String,
    pub index_name: String,
}

fn validate_structure_idents(table: &str, columns: &[&str]) -> Result<(), String> {
    crate::db::identifiers::validate_table_identifier(table)?;
    for c in columns {
        crate::db::identifiers::validate_simple_identifier(c)?;
    }
    // Data type must be a conservative token set (letters, digits, space, parens, comma, underscore)
    Ok(())
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

pub fn build_add_column_sql(payload: &AddColumnPayload, engine: EngineDialect) -> Result<String, String> {
    validate_structure_idents(&payload.table_name, &[&payload.column_name])?;
    validate_data_type(&payload.data_type)?;
    let null_clause = if payload.is_nullable { "NULL" } else { "NOT NULL" };
    let mysql = matches!(engine, EngineDialect::Mysql);
    Ok(format!(
        "ALTER TABLE {} ADD COLUMN {} {} {};",
        crate::db::identifiers::quote_table(&payload.table_name, mysql)?,
        crate::db::identifiers::quote_ident(&payload.column_name, mysql),
        payload.data_type,
        null_clause
    ))
}

pub fn build_drop_column_sql(payload: &DropColumnPayload, engine: EngineDialect) -> Result<String, String> {
    validate_structure_idents(&payload.table_name, &[&payload.column_name])?;
    let mysql = matches!(engine, EngineDialect::Mysql);
    Ok(format!(
        "ALTER TABLE {} DROP COLUMN {};",
        crate::db::identifiers::quote_table(&payload.table_name, mysql)?,
        crate::db::identifiers::quote_ident(&payload.column_name, mysql)
    ))
}

pub fn build_rename_column_sql(
    payload: &RenameColumnPayload,
    engine: EngineDialect,
) -> Result<String, String> {
    validate_structure_idents(
        &payload.table_name,
        &[&payload.old_name, &payload.new_name],
    )?;
    let mysql = matches!(engine, EngineDialect::Mysql);
    Ok(format!(
        "ALTER TABLE {} RENAME COLUMN {} TO {};",
        crate::db::identifiers::quote_table(&payload.table_name, mysql)?,
        crate::db::identifiers::quote_ident(&payload.old_name, mysql),
        crate::db::identifiers::quote_ident(&payload.new_name, mysql)
    ))
}

pub fn build_change_type_sql(
    payload: &ChangeTypePayload,
    engine: EngineDialect,
) -> Result<String, String> {
    validate_structure_idents(&payload.table_name, &[&payload.column_name])?;
    validate_data_type(&payload.new_type)?;
    let mysql = matches!(engine, EngineDialect::Mysql);
    let table = crate::db::identifiers::quote_table(&payload.table_name, mysql)?;
    let col = crate::db::identifiers::quote_ident(&payload.column_name, mysql);
    match engine {
        EngineDialect::Postgres => Ok(format!(
            "ALTER TABLE {} ALTER COLUMN {} TYPE {};",
            table, col, payload.new_type
        )),
        EngineDialect::Mysql => Ok(format!(
            "ALTER TABLE {} MODIFY COLUMN {} {};",
            table, col, payload.new_type
        )),
        // SQLite cannot ALTER COLUMN TYPE; surface a clear error instead of a no-op rename.
        EngineDialect::Sqlite => Err(
            "SQLite does not support ALTER COLUMN TYPE. Rebuild the table to change types."
                .to_string(),
        ),
    }
}

pub fn build_set_nullable_sql(
    payload: &SetNullablePayload,
    engine: EngineDialect,
) -> Result<String, String> {
    validate_structure_idents(&payload.table_name, &[&payload.column_name])?;
    let mysql = matches!(engine, EngineDialect::Mysql);
    let table = crate::db::identifiers::quote_table(&payload.table_name, mysql)?;
    let col = crate::db::identifiers::quote_ident(&payload.column_name, mysql);
    match engine {
        EngineDialect::Postgres => {
            if payload.is_nullable {
                Ok(format!(
                    "ALTER TABLE {} ALTER COLUMN {} DROP NOT NULL;",
                    table, col
                ))
            } else {
                Ok(format!(
                    "ALTER TABLE {} ALTER COLUMN {} SET NOT NULL;",
                    table, col
                ))
            }
        }
        EngineDialect::Mysql => {
            validate_data_type(&payload.data_type)?;
            let null_clause = if payload.is_nullable { "NULL" } else { "NOT NULL" };
            Ok(format!(
                "ALTER TABLE {} MODIFY COLUMN {} {} {};",
                table, col, payload.data_type, null_clause
            ))
        }
        EngineDialect::Sqlite => {
            // SQLite cannot ALTER nullability in place; refuse instead of adding a orphan `_new` column.
            let _ = (table, col, payload.data_type.as_str());
            Err(
                "SQLite does not support ALTER COLUMN nullability. Rebuild the table to change NOT NULL."
                    .to_string(),
            )
        }
    }
}

pub fn build_add_index_sql(
    payload: &AddIndexPayload,
    engine: EngineDialect,
) -> Result<String, String> {
    if payload.columns.is_empty() {
        return Err("Index must include at least one column".to_string());
    }
    let col_refs: Vec<&str> = payload.columns.iter().map(|s| s.as_str()).collect();
    validate_structure_idents(&payload.table_name, &col_refs)?;
    crate::db::identifiers::validate_simple_identifier(&payload.index_name)?;
    let mysql = matches!(engine, EngineDialect::Mysql);
    let unique = if payload.is_unique { "UNIQUE " } else { "" };
    let cols = payload
        .columns
        .iter()
        .map(|c| crate::db::identifiers::quote_ident(c, mysql))
        .collect::<Vec<_>>()
        .join(", ");
    Ok(format!(
        "CREATE {}INDEX {} ON {} ({});",
        unique,
        crate::db::identifiers::quote_ident(&payload.index_name, mysql),
        crate::db::identifiers::quote_table(&payload.table_name, mysql)?,
        cols
    ))
}

pub fn build_drop_index_sql(
    payload: &DropIndexPayload,
    engine: EngineDialect,
) -> Result<String, String> {
    crate::db::identifiers::validate_simple_identifier(&payload.index_name)?;
    let mysql = matches!(engine, EngineDialect::Mysql);
    match engine {
        EngineDialect::Mysql => {
            crate::db::identifiers::validate_table_identifier(&payload.table_name)?;
            Ok(format!(
                "DROP INDEX {} ON {};",
                crate::db::identifiers::quote_ident(&payload.index_name, true),
                crate::db::identifiers::quote_table(&payload.table_name, true)?
            ))
        }
        _ => Ok(format!(
            "DROP INDEX {};",
            crate::db::identifiers::quote_ident(&payload.index_name, mysql)
        )),
    }
}

pub async fn execute_structure_sql(pool: &AnyPool, sql: &str) -> Result<(), String> {
    pool.execute(sql)
        .await
        .map(|_| ())
        .map_err(|e| format!("Structure SQL execution failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::any::AnyPoolOptions;

    #[tokio::test]
    async fn test_sqlite_structure_editor_execution() {
        sqlx::any::install_default_drivers();
        let pool = AnyPoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        pool.execute("CREATE TABLE users (id INT PRIMARY KEY, name TEXT);")
            .await
            .unwrap();

        // 1. Add Column
        let add_payload = AddColumnPayload {
            table_name: "users".to_string(),
            column_name: "email".to_string(),
            data_type: "TEXT".to_string(),
            is_nullable: true,
        };
        let add_sql = build_add_column_sql(&add_payload, EngineDialect::Sqlite).unwrap();
        assert_eq!(add_sql, "ALTER TABLE \"users\" ADD COLUMN \"email\" TEXT NULL;");
        execute_structure_sql(&pool, &add_sql).await.unwrap();

        // 2. Rename Column
        let rename_payload = RenameColumnPayload {
            table_name: "users".to_string(),
            old_name: "name".to_string(),
            new_name: "full_name".to_string(),
        };
        let rename_sql = build_rename_column_sql(&rename_payload, EngineDialect::Sqlite).unwrap();
        assert_eq!(
            rename_sql,
            "ALTER TABLE \"users\" RENAME COLUMN \"name\" TO \"full_name\";"
        );
        execute_structure_sql(&pool, &rename_sql).await.unwrap();

        // 3. Add Index
        let idx_payload = AddIndexPayload {
            table_name: "users".to_string(),
            index_name: "idx_users_email".to_string(),
            columns: vec!["email".to_string()],
            is_unique: true,
        };
        let idx_sql = build_add_index_sql(&idx_payload, EngineDialect::Sqlite).unwrap();
        assert_eq!(
            idx_sql,
            "CREATE UNIQUE INDEX \"idx_users_email\" ON \"users\" (\"email\");"
        );
        execute_structure_sql(&pool, &idx_sql).await.unwrap();

        // 4. Drop Index
        let drop_idx_payload = DropIndexPayload {
            table_name: "users".to_string(),
            index_name: "idx_users_email".to_string(),
        };
        let drop_idx_sql = build_drop_index_sql(&drop_idx_payload, EngineDialect::Sqlite).unwrap();
        assert_eq!(drop_idx_sql, "DROP INDEX \"idx_users_email\";");
        execute_structure_sql(&pool, &drop_idx_sql).await.unwrap();

        // 5. Drop Column
        let drop_col_payload = DropColumnPayload {
            table_name: "users".to_string(),
            column_name: "email".to_string(),
        };
        let drop_col_sql = build_drop_column_sql(&drop_col_payload, EngineDialect::Sqlite).unwrap();
        execute_structure_sql(&pool, &drop_col_sql).await.unwrap();
    }

    #[test]
    fn test_rejects_malicious_identifiers() {
        let rename = RenameColumnPayload {
            table_name: "users; DROP TABLE users;--".to_string(),
            old_name: "name".to_string(),
            new_name: "x".to_string(),
        };
        assert!(build_rename_column_sql(&rename, EngineDialect::Postgres).is_err());

        let change = ChangeTypePayload {
            table_name: "users".to_string(),
            column_name: "id".to_string(),
            new_type: "INT; DROP TABLE users;--".to_string(),
        };
        assert!(build_change_type_sql(&change, EngineDialect::Postgres).is_err());

        let idx = AddIndexPayload {
            table_name: "users".to_string(),
            index_name: "idx'; DROP TABLE t;--".to_string(),
            columns: vec!["id".to_string()],
            is_unique: false,
        };
        assert!(build_add_index_sql(&idx, EngineDialect::Mysql).is_err());
    }

    #[test]
    fn test_sqlite_change_type_errors() {
        let change = ChangeTypePayload {
            table_name: "users".to_string(),
            column_name: "name".to_string(),
            new_type: "TEXT".to_string(),
        };
        let err = build_change_type_sql(&change, EngineDialect::Sqlite).unwrap_err();
        assert!(err.contains("SQLite does not support"));
    }

    #[test]
    fn test_sqlite_set_nullable_errors() {
        let payload = SetNullablePayload {
            table_name: "users".to_string(),
            column_name: "name".to_string(),
            is_nullable: true,
            data_type: "TEXT".to_string(),
        };
        let err = build_set_nullable_sql(&payload, EngineDialect::Sqlite).unwrap_err();
        assert!(err.contains("nullability"));
    }
}
