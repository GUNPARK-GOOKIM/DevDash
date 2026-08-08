//! Connection catalog shared conceptually with the GUI:
//! metadata on disk, passwords in the OS keyring (`devdash_app`).
use crate::db::credentials;
use crate::db::pool::ConnectionDetails;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use super::paths::{connections_path, ensure_config_dir};

pub const CATALOG_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CatalogConnection {
    pub id: String,
    pub name: String,
    pub db_type: String,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub database: String,
    #[serde(default)]
    pub ssl_mode: Option<String>,
    #[serde(default)]
    pub environment: String,
    #[serde(default)]
    pub is_read_only: bool,
    #[serde(default)]
    pub allow_writes_on_prod: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConnectionCatalog {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub default: Option<String>,
    #[serde(default)]
    pub connections: Vec<CatalogConnection>,
}

fn default_version() -> u32 {
    CATALOG_VERSION
}

impl Default for ConnectionCatalog {
    fn default() -> Self {
        Self {
            version: CATALOG_VERSION,
            default: None,
            connections: Vec::new(),
        }
    }
}

impl CatalogConnection {
    pub fn effective_read_only(&self) -> bool {
        let env = self.environment.to_lowercase();
        if env == "prod" && !self.allow_writes_on_prod {
            return true;
        }
        self.is_read_only
    }

    pub fn to_details(&self, password: Option<String>) -> ConnectionDetails {
        ConnectionDetails {
            db_type: self.db_type.clone(),
            host: self.host.clone(),
            port: self.port,
            user: self.user.clone(),
            password,
            database: self.database.clone(),
            ssl_mode: self.ssl_mode.clone(),
            cloud_iam: None,
            is_read_only: self.effective_read_only(),
        }
    }
}

pub fn load_catalog() -> Result<ConnectionCatalog, String> {
    let path = connections_path();
    if !path.exists() {
        return Ok(ConnectionCatalog::default());
    }
    load_catalog_from_path(&path)
}

pub fn load_catalog_from_path(path: &Path) -> Result<ConnectionCatalog, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("Read {}: {e}", path.display()))?;
    if raw.trim().is_empty() {
        return Ok(ConnectionCatalog::default());
    }
    serde_json::from_str(&raw).map_err(|e| format!("Invalid connection catalog {}: {e}", path.display()))
}

pub fn save_catalog(catalog: &ConnectionCatalog) -> Result<(), String> {
    ensure_config_dir()?;
    save_catalog_to_path(&connections_path(), catalog)
}

pub fn save_catalog_to_path(path: &Path, catalog: &ConnectionCatalog) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    let json = serde_json::to_string_pretty(catalog)
        .map_err(|e| format!("Serialize catalog: {e}"))?;
    fs::write(path, json + "\n").map_err(|e| format!("Write {}: {e}", path.display()))
}

pub fn resolve_connection<'a>(
    catalog: &'a ConnectionCatalog,
    name_or_id: &str,
) -> Result<&'a CatalogConnection, String> {
    let needle = name_or_id.trim();
    if needle.is_empty() {
        return Err("Connection name is empty".into());
    }
    if let Some(c) = catalog
        .connections
        .iter()
        .find(|c| c.name.eq_ignore_ascii_case(needle) || c.id == needle)
    {
        return Ok(c);
    }
    let matches: Vec<_> = catalog
        .connections
        .iter()
        .filter(|c| {
            c.name.to_lowercase().starts_with(&needle.to_lowercase())
                || c.id.starts_with(needle)
        })
        .collect();
    match matches.len() {
        1 => Ok(matches[0]),
        0 => Err(format!(
            "No connection named '{needle}'. Run `devdash connect ls`."
        )),
        _ => Err(format!(
            "Ambiguous connection '{needle}' matches: {}",
            matches
                .iter()
                .map(|c| c.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

pub fn default_connection<'a>(
    catalog: &'a ConnectionCatalog,
) -> Result<&'a CatalogConnection, String> {
    if let Some(name) = catalog.default.as_deref() {
        return resolve_connection(catalog, name);
    }
    if catalog.connections.len() == 1 {
        return Ok(&catalog.connections[0]);
    }
    if catalog.connections.is_empty() {
        return Err("No saved connections. Run `devdash connect add` first.".into());
    }
    Err(
        "No default connection. Run `devdash connect use <name>` or pass `-c <name>`.".into(),
    )
}

pub fn upsert_connection(catalog: &mut ConnectionCatalog, conn: CatalogConnection) {
    if let Some(existing) = catalog
        .connections
        .iter_mut()
        .find(|c| c.id == conn.id || c.name.eq_ignore_ascii_case(&conn.name))
    {
        *existing = conn;
        return;
    }
    catalog.connections.push(conn);
}

pub fn remove_connection(catalog: &mut ConnectionCatalog, name_or_id: &str) -> Result<CatalogConnection, String> {
    let id = resolve_connection(catalog, name_or_id)?.id.clone();
    let idx = catalog
        .connections
        .iter()
        .position(|c| c.id == id)
        .ok_or_else(|| format!("Connection '{name_or_id}' vanished"))?;
    let removed = catalog.connections.remove(idx);
    if catalog.default.as_deref() == Some(removed.name.as_str())
        || catalog.default.as_deref() == Some(removed.id.as_str())
    {
        catalog.default = catalog.connections.first().map(|c| c.name.clone());
    }
    let _ = credentials::delete_password(&removed.id);
    Ok(removed)
}

pub fn store_password(connection_id: &str, password: &str) -> Result<(), String> {
    credentials::save_password(connection_id, password)
}

pub fn load_password(connection_id: &str) -> Option<String> {
    credentials::get_password(connection_id).ok()
}

/// Parse `postgres://user:pass@host:5432/db?sslmode=require` style URLs.
pub fn parse_connection_url(raw: &str) -> Result<(CatalogConnection, Option<String>), String> {
    let raw = raw.trim();
    let (scheme, rest) = raw
        .split_once("://")
        .ok_or_else(|| "URL must look like postgres://user:pass@host:5432/db".to_string())?;
    let db_type = match scheme.to_lowercase().as_str() {
        "postgres" | "postgresql" => "postgres",
        "mysql" | "mariadb" => "mysql",
        "sqlite" | "file" => "sqlite",
        "duckdb" => "duckdb",
        "redis" => "redis",
        "mssql" | "sqlserver" => "mssql",
        other => return Err(format!("Unsupported URL scheme '{other}'")),
    };

    let (auth_host, path_query) = rest.split_once('/').unwrap_or((rest, ""));
    let (path, query) = path_query.split_once('?').unwrap_or((path_query, ""));

    let (user, password, hostport) = if let Some((auth, hostport)) = auth_host.rsplit_once('@') {
        if let Some((u, p)) = auth.split_once(':') {
            (percent_decode(u), Some(percent_decode(p)), hostport)
        } else {
            (percent_decode(auth), None, hostport)
        }
    } else {
        (String::new(), None, auth_host)
    };

    let default_port = match db_type {
        "postgres" => 5432,
        "mysql" => 3306,
        "redis" => 6379,
        "mssql" => 1433,
        _ => 0,
    };
    let (host, port) = if let Some((h, p)) = hostport.rsplit_once(':') {
        if h.starts_with('[') && hostport.contains(']') {
            // [::1]:5432
            if let Some(end) = hostport.rfind(']') {
                let host = hostport[1..end].to_string();
                let port = hostport[end + 1..]
                    .trim_start_matches(':')
                    .parse::<u16>()
                    .unwrap_or(default_port);
                (host, port)
            } else {
                (hostport.to_string(), default_port)
            }
        } else {
            (
                h.to_string(),
                p.parse::<u16>().unwrap_or(default_port),
            )
        }
    } else {
        (hostport.to_string(), default_port)
    };

    let database = if matches!(db_type, "sqlite" | "duckdb") {
        if path.is_empty() {
            if host.is_empty() {
                ":memory:".into()
            } else {
                host.clone()
            }
        } else {
            percent_decode(path)
        }
    } else {
        percent_decode(path)
    };

    let mut ssl_mode = None;
    if !query.is_empty() {
        for pair in query.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "sslmode" || k == "ssl_mode" {
                    ssl_mode = Some(percent_decode(v));
                }
            }
        }
    }

    let name = if !host.is_empty() {
        format!("{db_type}-{host}")
    } else {
        format!("{db_type}-local")
    };

    Ok((
        CatalogConnection {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            db_type: db_type.to_string(),
            host,
            port,
            user,
            database,
            ssl_mode,
            environment: "dev".into(),
            is_read_only: false,
            allow_writes_on_prod: false,
        },
        password,
    ))
}

fn percent_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16)
            {
                out.push(v as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_catalog_path() -> std::path::PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("devdash-cat-{n}.json"))
    }

    fn sample(name: &str) -> CatalogConnection {
        CatalogConnection {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            db_type: "postgres".into(),
            host: "localhost".into(),
            port: 5432,
            user: "postgres".into(),
            database: "app".into(),
            ssl_mode: Some("disable".into()),
            environment: "dev".into(),
            is_read_only: false,
            allow_writes_on_prod: false,
        }
    }

    #[test]
    fn roundtrip_catalog_file() {
        let path = temp_catalog_path();
        let mut cat = ConnectionCatalog::default();
        cat.connections.push(sample("local"));
        cat.default = Some("local".into());
        save_catalog_to_path(&path, &cat).unwrap();
        let loaded = load_catalog_from_path(&path).unwrap();
        assert_eq!(loaded.default.as_deref(), Some("local"));
        assert_eq!(loaded.connections[0].name, "local");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn resolve_by_prefix_and_ambiguity() {
        let mut cat = ConnectionCatalog::default();
        cat.connections.push(sample("analytics"));
        cat.connections.push(sample("app-prod"));
        assert_eq!(resolve_connection(&cat, "anal").unwrap().name, "analytics");
        assert!(resolve_connection(&cat, "a").is_err());
        assert!(resolve_connection(&cat, "nope").is_err());
    }

    #[test]
    fn prod_forces_read_only_unless_opt_in() {
        let mut c = sample("prod");
        c.environment = "prod".into();
        assert!(c.effective_read_only());
        c.allow_writes_on_prod = true;
        assert!(!c.effective_read_only());
        c.is_read_only = true;
        assert!(c.effective_read_only());
    }

    #[test]
    fn parse_postgres_url() {
        let (c, pw) = parse_connection_url(
            "postgres://alice:p%40ss@db.internal:5433/orders?sslmode=require",
        )
        .unwrap();
        assert_eq!(c.db_type, "postgres");
        assert_eq!(c.user, "alice");
        assert_eq!(pw.as_deref(), Some("p@ss"));
        assert_eq!(c.host, "db.internal");
        assert_eq!(c.port, 5433);
        assert_eq!(c.database, "orders");
        assert_eq!(c.ssl_mode.as_deref(), Some("require"));
    }
}
