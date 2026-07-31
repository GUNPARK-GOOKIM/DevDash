//! Safe SQL identifier validation and dialect-aware quoting.
//! Prevents identifier injection in dynamic DDL/DML string assembly.

/// Returns Ok if `name` is a single safe SQL identifier (no schema dots).
pub fn validate_simple_identifier(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Identifier cannot be empty".to_string());
    }
    if name.len() > 128 {
        return Err("Identifier is too long (max 128)".to_string());
    }
    let mut chars = name.chars();
    let first = chars.next().unwrap();
    if !(first.is_ascii_alphabetic() || first == '_') {
        return Err(format!(
            "Invalid identifier '{}': must start with a letter or underscore",
            name
        ));
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(format!(
            "Invalid identifier '{}': only letters, digits, and underscore allowed",
            name
        ));
    }
    Ok(())
}

/// Allows `schema.table` with each part validated as a simple identifier.
pub fn validate_table_identifier(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Table name cannot be empty".to_string());
    }
    let parts: Vec<&str> = name.split('.').collect();
    if parts.len() > 2 {
        return Err(format!("Invalid table identifier '{}'", name));
    }
    for part in parts {
        validate_simple_identifier(part)?;
    }
    Ok(())
}

/// Quote an already-validated simple identifier for the given dialect family.
pub fn quote_ident(name: &str, mysql_style: bool) -> String {
    if mysql_style {
        format!("`{}`", name.replace('`', "``"))
    } else {
        format!("\"{}\"", name.replace('"', "\"\""))
    }
}

/// Quote a table identifier that may be schema-qualified.
pub fn quote_table(name: &str, mysql_style: bool) -> Result<String, String> {
    validate_table_identifier(name)?;
    let parts: Vec<&str> = name.split('.').collect();
    Ok(parts
        .into_iter()
        .map(|p| quote_ident(p, mysql_style))
        .collect::<Vec<_>>()
        .join("."))
}

/// Escape a JSON value as an SQL literal (string/number/bool/null).
pub fn sql_literal(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(b) => {
            if *b {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        other => format!("'{}'", other.to_string().replace('\'', "''")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_injection_in_identifier() {
        assert!(validate_simple_identifier("users; drop table").is_err());
        assert!(validate_simple_identifier("id--").is_err());
        assert!(validate_table_identifier("public.users").is_ok());
        assert!(validate_table_identifier("public.users;drop").is_err());
    }

    #[test]
    fn quotes_mysql_and_pg() {
        assert_eq!(quote_ident("users", false), "\"users\"");
        assert_eq!(quote_ident("users", true), "`users`");
    }
}
