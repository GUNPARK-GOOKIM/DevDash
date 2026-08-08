//! Live admin catalog SQL (processes, roles, routines).
//! Single source of truth — GUI IPC and CLI both call these helpers.
use crate::db::executor::{cancel_backend_process, execute_dynamic_query, QueryResultPayload};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::AnyPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbProcess {
    pub pid: i64,
    pub user: String,
    pub database: String,
    pub client_addr: String,
    pub state: String,
    pub query: String,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbRole {
    pub name: String,
    pub host: Option<String>,
    pub is_superuser: bool,
    pub can_login: bool,
    pub can_create_db: bool,
    pub can_create_role: bool,
    pub connection_limit: i64,
    pub valid_until: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbRoutine {
    pub schema: String,
    pub name: String,
    pub routine_type: String,
    pub language: String,
    pub return_type: Option<String>,
    pub args: Option<String>,
    pub owner: Option<String>,
}

fn kind(db_kind: &str) -> String {
    db_kind.to_lowercase()
}

fn idx(payload: &QueryResultPayload, name: &str) -> Option<usize> {
    payload
        .columns
        .iter()
        .position(|c| c.name.eq_ignore_ascii_case(name))
}

fn cell<'a>(payload: &'a QueryResultPayload, row: &'a [Value], name: &str) -> &'a Value {
    static NULL: Value = Value::Null;
    match idx(payload, name) {
        Some(i) => row.get(i).unwrap_or(&NULL),
        None => &NULL,
    }
}

fn as_str(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn as_i64(v: &Value) -> i64 {
    match v {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)).unwrap_or(0),
        Value::String(s) => s.parse().unwrap_or(0),
        Value::Bool(b) => {
            if *b {
                1
            } else {
                0
            }
        }
        _ => 0,
    }
}

fn as_bool(v: &Value) -> bool {
    match v {
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_i64().unwrap_or(0) != 0,
        Value::String(s) => matches!(s.to_lowercase().as_str(), "t" | "true" | "1" | "yes" | "y"),
        _ => false,
    }
}

pub async fn list_processes(pool: &AnyPool, db_kind: &str) -> Result<Vec<DbProcess>, String> {
    let k = kind(db_kind);
    let sql = if matches!(
        k.as_str(),
        "postgres" | "postgresql" | "cockroachdb" | "redshift"
    ) {
        r#"
        SELECT
          pid,
          COALESCE(usename, '') AS username,
          COALESCE(datname, '') AS database,
          COALESCE(client_addr::text, '') AS client_addr,
          COALESCE(state, '') AS state,
          COALESCE(query, '') AS query,
          COALESCE(EXTRACT(EPOCH FROM (now() - query_start)) * 1000, 0)::bigint AS duration_ms
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
        ORDER BY query_start DESC NULLS LAST
        LIMIT 200
        "#
    } else if matches!(k.as_str(), "mysql" | "mariadb") {
        r#"
        SELECT
          ID AS pid,
          USER AS username,
          DB AS database,
          HOST AS client_addr,
          COMMAND AS state,
          INFO AS query,
          TIME * 1000 AS duration_ms
        FROM information_schema.PROCESSLIST
        ORDER BY TIME DESC
        LIMIT 200
        "#
    } else {
        return Ok(Vec::new());
    };

    let payload = execute_dynamic_query(pool, sql).await?;
    Ok(payload
        .rows
        .iter()
        .map(|row| DbProcess {
            pid: as_i64(cell(&payload, row, "pid")),
            user: as_str(cell(&payload, row, "username")),
            database: as_str(cell(&payload, row, "database")),
            client_addr: as_str(cell(&payload, row, "client_addr")),
            state: as_str(cell(&payload, row, "state")),
            query: as_str(cell(&payload, row, "query")),
            duration_ms: as_i64(cell(&payload, row, "duration_ms")),
        })
        .collect())
}

pub async fn kill_process(pool: &AnyPool, db_kind: &str, pid: u32) -> Result<(), String> {
    cancel_backend_process(pool, pid, db_kind).await
}

pub async fn list_roles(pool: &AnyPool, db_kind: &str) -> Result<Vec<DbRole>, String> {
    let k = kind(db_kind);
    if matches!(k.as_str(), "sqlite" | "duckdb" | "turso") {
        return Ok(Vec::new());
    }
    if matches!(
        k.as_str(),
        "postgres" | "postgresql" | "cockroachdb" | "redshift"
    ) {
        let sql = r#"
        SELECT rolname, rolsuper, rolcanlogin, rolcreatedb, rolcreaterole, rolconnlimit,
               rolvaliduntil::text AS valid_until
        FROM pg_roles
        ORDER BY rolname
        LIMIT 500
        "#;
        let payload = execute_dynamic_query(pool, sql).await?;
        return Ok(payload
            .rows
            .iter()
            .map(|row| {
                let until = as_str(cell(&payload, row, "valid_until"));
                DbRole {
                    name: as_str(cell(&payload, row, "rolname")),
                    host: None,
                    is_superuser: as_bool(cell(&payload, row, "rolsuper")),
                    can_login: as_bool(cell(&payload, row, "rolcanlogin")),
                    can_create_db: as_bool(cell(&payload, row, "rolcreatedb")),
                    can_create_role: as_bool(cell(&payload, row, "rolcreaterole")),
                    connection_limit: as_i64(cell(&payload, row, "rolconnlimit")),
                    valid_until: if until.is_empty() { None } else { Some(until) },
                }
            })
            .collect());
    }
    if matches!(k.as_str(), "mysql" | "mariadb") {
        let sql = r#"
        SELECT User AS user_name, Host AS host
        FROM mysql.user
        ORDER BY User, Host
        LIMIT 500
        "#;
        let payload = execute_dynamic_query(pool, sql).await?;
        return Ok(payload
            .rows
            .iter()
            .map(|row| DbRole {
                name: as_str(cell(&payload, row, "user_name")),
                host: Some(as_str(cell(&payload, row, "host"))),
                is_superuser: false,
                can_login: true,
                can_create_db: false,
                can_create_role: false,
                connection_limit: -1,
                valid_until: None,
            })
            .collect());
    }
    Ok(Vec::new())
}

pub async fn list_routines(pool: &AnyPool, db_kind: &str) -> Result<Vec<DbRoutine>, String> {
    let k = kind(db_kind);
    if matches!(k.as_str(), "sqlite" | "duckdb" | "turso") {
        return Ok(Vec::new());
    }
    if matches!(
        k.as_str(),
        "postgres" | "postgresql" | "cockroachdb" | "redshift"
    ) {
        let sql = r#"
        SELECT
          n.nspname AS schema_name,
          p.proname AS name,
          CASE p.prokind WHEN 'p' THEN 'procedure' WHEN 'f' THEN 'function' ELSE 'function' END AS routine_type,
          l.lanname AS language,
          COALESCE(pg_get_function_result(p.oid), '') AS return_type,
          COALESCE(pg_get_function_arguments(p.oid), '') AS args,
          COALESCE(pg_get_userbyid(p.proowner), '') AS owner
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY n.nspname, p.proname
        LIMIT 500
        "#;
        if let Ok(payload) = execute_dynamic_query(pool, sql).await {
            return Ok(payload
                .rows
                .iter()
                .map(|row| {
                    let ret = as_str(cell(&payload, row, "return_type"));
                    let args = as_str(cell(&payload, row, "args"));
                    let owner = as_str(cell(&payload, row, "owner"));
                    DbRoutine {
                        schema: as_str(cell(&payload, row, "schema_name")),
                        name: as_str(cell(&payload, row, "name")),
                        routine_type: as_str(cell(&payload, row, "routine_type")),
                        language: as_str(cell(&payload, row, "language")),
                        return_type: if ret.is_empty() { None } else { Some(ret) },
                        args: if args.is_empty() { None } else { Some(args) },
                        owner: if owner.is_empty() { None } else { Some(owner) },
                    }
                })
                .collect());
        }
    }
    let sql = r#"
    SELECT
      ROUTINE_SCHEMA AS schema_name,
      ROUTINE_NAME AS name,
      LOWER(ROUTINE_TYPE) AS routine_type,
      COALESCE(EXTERNAL_LANGUAGE, 'SQL') AS language,
      COALESCE(DTD_IDENTIFIER, '') AS return_type,
      COALESCE(DEFINER, '') AS owner
    FROM information_schema.ROUTINES
    ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
    LIMIT 500
    "#;
    let payload = execute_dynamic_query(pool, sql).await?;
    Ok(payload
        .rows
        .iter()
        .map(|row| {
            let ret = as_str(cell(&payload, row, "return_type"));
            let owner = as_str(cell(&payload, row, "owner"));
            DbRoutine {
                schema: as_str(cell(&payload, row, "schema_name")),
                name: as_str(cell(&payload, row, "name")),
                routine_type: as_str(cell(&payload, row, "routine_type")),
                language: as_str(cell(&payload, row, "language")),
                return_type: if ret.is_empty() { None } else { Some(ret) },
                args: None,
                owner: if owner.is_empty() { None } else { Some(owner) },
            }
        })
        .collect())
}
