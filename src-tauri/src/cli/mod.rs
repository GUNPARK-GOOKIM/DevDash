//! DevDash CLI — terminal companion to the desktop GUI.
//! Shares `~/.config/devdash/` + OS keyring + the same Rust query engine.
pub mod catalog;
pub mod format;
pub mod ops;
pub mod paths;
pub mod runtime;

use catalog::{
    default_connection, load_catalog, parse_connection_url, remove_connection, resolve_connection,
    save_catalog, store_password, upsert_connection, CatalogConnection, ConnectionCatalog,
};
use clap::{Parser, Subcommand};
use format::{render_payload, OutputFormat};
use runtime::CliEngine;
use std::io::{self, IsTerminal, Read};
use std::path::PathBuf;
use std::process::ExitCode;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Parser, Debug)]
#[command(
    name = "devdash",
    version = VERSION,
    about = "DevDash CLI — terminal companion to DevDash Desktop",
    long_about = "Same Rust engine as DevDash Desktop. Query every supported engine from any terminal.\n\
Connections: ~/.config/devdash/connections.json  ·  secrets: OS keyring service devdash_app.\n\
See docs/CLI.md for install, commands, and completions."
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Print version
    Version,
    /// Check install, config dir, keyring, and catalog
    Doctor,
    /// Manage saved connections (shared catalog + keyring)
    #[command(subcommand)]
    Connect(ConnectCmd),
    /// Run SQL against a saved connection
    Sql {
        /// SQL text (omit to read --file or stdin)
        sql: Option<String>,
        /// Connection name or id (default: catalog default)
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        /// Read SQL from a file
        #[arg(short = 'f', long = "file")]
        file: Option<PathBuf>,
        /// Output format
        #[arg(short = 'F', long = "format", default_value = "table")]
        format: String,
        /// Write output to a file instead of stdout
        #[arg(short = 'o', long = "out")]
        out: Option<PathBuf>,
        /// Max rows to display (does not change the query)
        #[arg(short = 'n', long = "limit")]
        limit: Option<usize>,
        /// Confirm destructive SQL (DROP / unbounded DELETE / UPDATE)
        #[arg(long = "yes")]
        yes: bool,
        /// Force read-only for this run
        #[arg(long = "read-only")]
        read_only: bool,
        /// Password (otherwise keyring / DEVDASH_PASSWORD / prompt)
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// List tables / views
    Tables {
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(short = 'F', long = "format", default_value = "table")]
        format: String,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// Describe a table (columns)
    #[command(visible_alias = "desc")]
    Describe {
        table: String,
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// Export a table (csv / json / sql / parquet)
    Export {
        table: String,
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(short = 'F', long = "format", default_value = "csv")]
        format: String,
        #[arg(short = 'o', long = "out")]
        out: Option<PathBuf>,
        #[arg(long = "where", value_name = "CLAUSE")]
        where_clause: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// Show recent query history (shared with the GUI AppStorage DB)
    History {
        #[arg(short = 'n', long = "limit", default_value_t = 20)]
        limit: i64,
    },
    /// Interactive SQL prompt
    Repl {
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
        #[arg(long = "yes")]
        yes: bool,
    },
    /// Schema DDL, diff, and migration apply
    #[command(subcommand)]
    Schema(ops::SchemaCmd),
    /// Connection diagnostics
    Diagnose {
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// EXPLAIN / EXPLAIN ANALYZE profile
    Profile {
        sql: Option<String>,
        #[arg(short = 'f', long = "file")]
        file: Option<PathBuf>,
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// Live database metrics
    Metrics {
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// Query result snapshots + diff
    #[command(subcommand)]
    Snapshot(ops::SnapshotCmd),
    /// Staged grid edits (JSON → transactional commit)
    #[command(subcommand)]
    Stage(ops::StageCmd),
    /// Server process list / kill
    #[command(subcommand)]
    Process(ops::ProcessCmd),
    /// Roles / login roles
    Roles {
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// Functions / procedures / routines
    Routines {
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// Run a SQL file in a transaction
    #[command(subcommand)]
    Tx(ops::TxCmd),
    /// CSV / SQL dump import
    #[command(subcommand)]
    Import(ops::ImportCmd),
    /// Encrypted connection vault (same AES-GCM payload as Desktop)
    #[command(subcommand)]
    Vault(ops::VaultCmd),
    /// Local audit log
    Audit {
        #[arg(short = 'n', long = "limit", default_value_t = 50)]
        limit: usize,
    },
    /// Schema-aware text-to-SQL (Ollama / OpenAI / Claude / DeepSeek)
    Ai {
        prompt: String,
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(long)]
        execute: bool,
        #[arg(long = "yes")]
        yes: bool,
        #[arg(long)]
        provider: Option<String>,
        #[arg(long)]
        model: Option<String>,
        #[arg(long = "base-url")]
        base_url: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// Structure editor (ADD/DROP COLUMN, indexes, …)
    #[command(subcommand)]
    Structure(ops::StructureCmd),
    /// Redis KEYS/SCAN via native RESP client
    RedisKeys {
        #[arg(short = 'c', long = "connection")]
        connection: Option<String>,
        #[arg(long, default_value = "*")]
        pattern: String,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// Generate shell completions
    Completions {
        /// bash | zsh | fish | powershell | elvish
        shell: String,
    },
}

#[derive(Subcommand, Debug)]
pub enum ConnectCmd {
    /// Add or update a connection
    Add {
        #[arg(long)]
        name: Option<String>,
        #[arg(long = "type", value_name = "ENGINE")]
        db_type: Option<String>,
        #[arg(long)]
        host: Option<String>,
        #[arg(long)]
        port: Option<u16>,
        #[arg(long)]
        user: Option<String>,
        #[arg(long)]
        database: Option<String>,
        #[arg(long = "ssl-mode")]
        ssl_mode: Option<String>,
        #[arg(long = "env", default_value = "dev")]
        environment: String,
        #[arg(long = "read-only")]
        read_only: bool,
        #[arg(long = "allow-writes-on-prod")]
        allow_writes_on_prod: bool,
        /// postgres://user:pass@host:5432/db
        #[arg(long = "url")]
        url: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
        /// Set this connection as default
        #[arg(long)]
        default: bool,
    },
    /// List saved connections
    #[command(visible_alias = "ls")]
    List,
    /// Show one connection (no password)
    Show { name: String },
    /// Set the default connection
    Use { name: String },
    /// Test reachability
    Test {
        name: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD")]
        password: Option<String>,
    },
    /// Remove a connection (and its keyring secret)
    #[command(visible_alias = "rm")]
    Remove { name: String },
}

pub fn run() -> ExitCode {
    let cli = Cli::parse();
    let rt = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("error: failed to start tokio: {e}");
            return ExitCode::from(1);
        }
    };
    match rt.block_on(dispatch(cli)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::from(1)
        }
    }
}

async fn dispatch(cli: Cli) -> Result<(), String> {
    match cli.command {
        Commands::Version => {
            println!("devdash {VERSION}");
            println!("companion to DevDash GUI · local-first · same Rust engine");
            Ok(())
        }
        Commands::Doctor => cmd_doctor().await,
        Commands::Connect(cmd) => cmd_connect(cmd).await,
        Commands::Sql {
            sql,
            connection,
            file,
            format,
            out,
            limit,
            yes,
            read_only,
            password,
        } => {
            cmd_sql(
                sql, connection, file, format, out, limit, yes, read_only, password,
            )
            .await
        }
        Commands::Tables {
            connection,
            format,
            password,
        } => cmd_tables(connection, format, password).await,
        Commands::Describe {
            table,
            connection,
            password,
        } => cmd_describe(table, connection, password).await,
        Commands::Export {
            table,
            connection,
            format,
            out,
            where_clause,
            password,
        } => cmd_export(table, connection, format, out, where_clause, password).await,
        Commands::History { limit } => cmd_history(limit).await,
        Commands::Repl {
            connection,
            password,
            yes,
        } => cmd_repl(connection, password, yes).await,
        Commands::Schema(cmd) => ops::cmd_schema(cmd).await,
        Commands::Diagnose {
            connection,
            password,
        } => ops::cmd_diagnose(connection, password).await,
        Commands::Profile {
            sql,
            file,
            connection,
            password,
        } => ops::cmd_profile(sql, file, connection, password).await,
        Commands::Metrics {
            connection,
            password,
        } => ops::cmd_metrics(connection, password).await,
        Commands::Snapshot(cmd) => ops::cmd_snapshot(cmd).await,
        Commands::Stage(cmd) => ops::cmd_stage(cmd).await,
        Commands::Process(cmd) => ops::cmd_process(cmd).await,
        Commands::Roles {
            connection,
            password,
        } => ops::cmd_roles(connection, password).await,
        Commands::Routines {
            connection,
            password,
        } => ops::cmd_routines(connection, password).await,
        Commands::Tx(cmd) => ops::cmd_tx(cmd).await,
        Commands::Import(cmd) => ops::cmd_import(cmd).await,
        Commands::Vault(cmd) => ops::cmd_vault(cmd).await,
        Commands::Audit { limit } => ops::cmd_audit(limit).await,
        Commands::Ai {
            prompt,
            connection,
            execute,
            yes,
            provider,
            model,
            base_url,
            password,
        } => {
            ops::cmd_ai(
                prompt, connection, execute, yes, provider, model, base_url, password,
            )
            .await
        }
        Commands::Structure(cmd) => ops::cmd_structure(cmd).await,
        Commands::RedisKeys {
            connection,
            pattern,
            password,
        } => ops::cmd_redis_keys(connection, Some(pattern), password).await,
        Commands::Completions { shell } => ops::cmd_completions(&shell),
    }
}

async fn cmd_doctor() -> Result<(), String> {
    let dir = paths::ensure_config_dir()?;
    println!("DevDash CLI doctor");
    println!("  version     {VERSION}");
    println!("  config dir  {}", dir.display());
    println!("  catalog     {}", paths::connections_path().display());
    println!("  app db      {}", paths::app_db_path().display());
    let cat = load_catalog()?;
    println!("  connections {}", cat.connections.len());
    if let Some(d) = &cat.default {
        println!("  default     {d}");
    } else {
        println!("  default     (none)");
    }
    ConnectionManagerInit::init();
    let keyring_ok = crate::db::credentials::save_secret("devdash_cli_doctor", "ok")
        .and_then(|_| crate::db::credentials::delete_secret("devdash_cli_doctor"))
        .is_ok();
    println!(
        "  keyring     {}",
        if keyring_ok {
            "ok (service=devdash_app)"
        } else {
            "unavailable (passwords via --password / DEVDASH_PASSWORD)"
        }
    );
    println!("  engines     postgres mysql mariadb sqlite duckdb mssql redis mongo cassandra clickhouse (+ cockroach/redshift wire)");
    println!("ok");
    Ok(())
}

struct ConnectionManagerInit;
impl ConnectionManagerInit {
    fn init() {
        crate::db::pool::ConnectionManager::init_drivers();
    }
}

async fn cmd_connect(cmd: ConnectCmd) -> Result<(), String> {
    match cmd {
        ConnectCmd::Add {
            name,
            db_type,
            host,
            port,
            user,
            database,
            ssl_mode,
            environment,
            read_only,
            allow_writes_on_prod,
            url,
            password,
            default,
        } => {
            let mut catalog = load_catalog()?;
            let (mut conn, url_password) = if let Some(url) = url {
                parse_connection_url(&url)?
            } else {
                let db_type = db_type.ok_or("--type is required (or pass --url)")?;
                (
                    CatalogConnection {
                        id: uuid::Uuid::new_v4().to_string(),
                        name: name.clone().unwrap_or_else(|| db_type.clone()),
                        db_type,
                        host: host.clone().unwrap_or_default(),
                        port: port.unwrap_or(0),
                        user: user.clone().unwrap_or_default(),
                        database: database.clone().unwrap_or_default(),
                        ssl_mode: ssl_mode.clone(),
                        environment: environment.clone(),
                        is_read_only: read_only,
                        allow_writes_on_prod,
                    },
                    None,
                )
            };
            if let Some(n) = name {
                conn.name = n;
            }
            if let Some(h) = host {
                conn.host = h;
            }
            if let Some(p) = port {
                conn.port = p;
            }
            if let Some(u) = user {
                conn.user = u;
            }
            if let Some(d) = database {
                conn.database = d;
            }
            if let Some(s) = ssl_mode {
                conn.ssl_mode = Some(s);
            }
            conn.environment = environment;
            conn.is_read_only = read_only;
            conn.allow_writes_on_prod = allow_writes_on_prod;

            if let Some(existing) = catalog
                .connections
                .iter()
                .find(|c| c.name.eq_ignore_ascii_case(&conn.name))
            {
                conn.id = existing.id.clone();
            }

            let pw = password.or(url_password);
            if let Some(ref p) = pw {
                store_password(&conn.id, p)?;
            }

            if default || catalog.connections.is_empty() {
                catalog.default = Some(conn.name.clone());
            }
            println!(
                "saved connection '{}' ({}) id={}",
                conn.name, conn.db_type, conn.id
            );
            upsert_connection(&mut catalog, conn);
            save_catalog(&catalog)?;
            Ok(())
        }
        ConnectCmd::List => {
            let catalog = load_catalog()?;
            if catalog.connections.is_empty() {
                println!("No connections. `devdash connect add --help`");
                return Ok(());
            }
            let mut table = comfy_table::Table::new();
            table.set_header(["*", "NAME", "ENGINE", "TARGET", "ENV", "RO"]);
            for c in &catalog.connections {
                let star = if catalog.default.as_deref() == Some(c.name.as_str()) {
                    "*"
                } else {
                    ""
                };
                let target = if matches!(c.db_type.as_str(), "sqlite" | "duckdb") {
                    c.database.clone()
                } else {
                    format!("{}:{}/{}", c.host, c.port, c.database)
                };
                table.add_row([
                    star.to_string(),
                    c.name.clone(),
                    c.db_type.clone(),
                    target,
                    c.environment.clone(),
                    if c.effective_read_only() {
                        "yes".into()
                    } else {
                        "no".into()
                    },
                ]);
            }
            println!("{table}");
            Ok(())
        }
        ConnectCmd::Show { name } => {
            let catalog = load_catalog()?;
            let c = resolve_connection(&catalog, &name)?;
            println!("{}", serde_json::to_string_pretty(c).unwrap());
            Ok(())
        }
        ConnectCmd::Use { name } => {
            let mut catalog = load_catalog()?;
            let c = resolve_connection(&catalog, &name)?;
            let chosen = c.name.clone();
            catalog.default = Some(chosen.clone());
            save_catalog(&catalog)?;
            println!("default connection → {chosen}");
            Ok(())
        }
        ConnectCmd::Test { name, password } => {
            let catalog = load_catalog()?;
            let conn = match name {
                Some(n) => resolve_connection(&catalog, &n)?.clone(),
                None => default_connection(&catalog)?.clone(),
            };
            let engine = CliEngine::new().await?;
            let pw = CliEngine::resolve_password(&conn, password, true)?;
            let res = engine.test(&conn, pw).await;
            if res.success {
                println!("ok  {}  {}ms  {}", conn.name, res.latency_ms, res.message);
                Ok(())
            } else {
                Err(format!("{}: {}", conn.name, res.message))
            }
        }
        ConnectCmd::Remove { name } => {
            let mut catalog = load_catalog()?;
            let removed = remove_connection(&mut catalog, &name)?;
            save_catalog(&catalog)?;
            println!("removed '{}'", removed.name);
            Ok(())
        }
    }
}

fn pick_conn<'a>(
    catalog: &'a ConnectionCatalog,
    name: &Option<String>,
) -> Result<&'a CatalogConnection, String> {
    match name {
        Some(n) => resolve_connection(catalog, n),
        None => default_connection(catalog),
    }
}

async fn cmd_sql(
    sql: Option<String>,
    connection: Option<String>,
    file: Option<PathBuf>,
    format: String,
    out: Option<PathBuf>,
    limit: Option<usize>,
    yes: bool,
    read_only: bool,
    password: Option<String>,
) -> Result<(), String> {
    let mut sql_text = if let Some(p) = file {
        std::fs::read_to_string(&p).map_err(|e| format!("Read {}: {e}", p.display()))?
    } else {
        sql.unwrap_or_default()
    };
    if sql_text.trim().is_empty() {
        if !io::stdin().is_terminal() {
            io::stdin()
                .read_to_string(&mut sql_text)
                .map_err(|e| format!("stdin: {e}"))?;
        }
    }
    if sql_text.trim().is_empty() {
        return Err("No SQL provided. Pass an argument, --file, stdin, or use `devdash repl`.".into());
    }
    let fmt = OutputFormat::parse(&format)?;
    let catalog = load_catalog()?;
    let conn = pick_conn(&catalog, &connection)?.clone();
    let engine = CliEngine::new().await?;
    let pw = CliEngine::resolve_password(&conn, password, true)?;
    engine.connect(&conn, pw).await?;
    let payload = engine
        .run_sql(&conn, sql_text.trim(), yes, read_only)
        .await;
    engine.disconnect(&conn).await;
    let payload = payload?;
    write_formatted(&payload, fmt, limit, out)
}

fn write_formatted(
    payload: &crate::db::executor::QueryResultPayload,
    fmt: OutputFormat,
    limit: Option<usize>,
    out: Option<PathBuf>,
) -> Result<(), String> {
    if let Some(path) = out {
        let mut f = std::fs::File::create(&path)
            .map_err(|e| format!("Write {}: {e}", path.display()))?;
        render_payload(payload, fmt, limit, &mut f).map_err(|e| e.to_string())?;
        eprintln!("wrote {}", path.display());
        Ok(())
    } else {
        render_payload(payload, fmt, limit, io::stdout()).map_err(|e| e.to_string())
    }
}

async fn cmd_tables(
    connection: Option<String>,
    format: String,
    password: Option<String>,
) -> Result<(), String> {
    let fmt = OutputFormat::parse(&format)?;
    let catalog = load_catalog()?;
    let conn = pick_conn(&catalog, &connection)?.clone();
    let engine = CliEngine::new().await?;
    let pw = CliEngine::resolve_password(&conn, password, true)?;
    engine.connect(&conn, pw).await?;
    let tables = engine.tables(&conn).await;
    engine.disconnect(&conn).await;
    let tables = tables?;
    let payload = crate::db::executor::QueryResultPayload {
        columns: vec![
            crate::db::executor::ColumnHeader {
                name: "schema".into(),
                type_name: "TEXT".into(),
            },
            crate::db::executor::ColumnHeader {
                name: "name".into(),
                type_name: "TEXT".into(),
            },
            crate::db::executor::ColumnHeader {
                name: "type".into(),
                type_name: "TEXT".into(),
            },
        ],
        rows: tables
            .into_iter()
            .map(|t| {
                vec![
                    serde_json::json!(t.schema),
                    serde_json::json!(t.name),
                    serde_json::json!(t.table_type),
                ]
            })
            .collect(),
        execution_time_ms: 0,
        affected_rows: 0,
    };
    write_formatted(&payload, fmt, None, None)
}

async fn cmd_describe(
    table: String,
    connection: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    let catalog = load_catalog()?;
    let conn = pick_conn(&catalog, &connection)?.clone();
    let engine = CliEngine::new().await?;
    let pw = CliEngine::resolve_password(&conn, password, true)?;
    engine.connect(&conn, pw).await?;
    let cols = engine.columns(&conn, &table).await;
    engine.disconnect(&conn).await;
    let cols = cols?;
    let mut t = comfy_table::Table::new();
    t.set_header(["COLUMN", "TYPE", "NULL", "PK", "FK"]);
    for c in cols {
        let fk = if c.is_foreign_key {
            format!(
                "{}{}{}",
                c.fk_table.clone().unwrap_or_default(),
                if c.fk_column.is_some() { "." } else { "" },
                c.fk_column.clone().unwrap_or_default()
            )
        } else {
            String::new()
        };
        t.add_row([
            c.name,
            c.data_type,
            if c.is_nullable { "yes" } else { "no" }.into(),
            if c.is_primary_key { "yes" } else { "" }.into(),
            fk,
        ]);
    }
    println!("{t}");
    Ok(())
}

async fn cmd_export(
    table: String,
    connection: Option<String>,
    format: String,
    out: Option<PathBuf>,
    where_clause: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    let catalog = load_catalog()?;
    let conn = pick_conn(&catalog, &connection)?.clone();
    let engine = CliEngine::new().await?;
    let pw = CliEngine::resolve_password(&conn, password, true)?;
    engine.connect(&conn, pw).await?;

    let fmt = format.to_lowercase();
    let result = async {
        if engine.duckdb.is_connected(&conn.id) {
            let quoted = if table.contains('.') {
                table.clone()
            } else {
                format!("\"{}\"", table.replace('"', "\"\""))
            };
            let mut sql = format!("SELECT * FROM {quoted}");
            if let Some(w) = where_clause.as_deref() {
                let t = w.trim();
                if t.contains(';') {
                    return Err("WHERE must not contain semicolons".into());
                }
                if t.to_uppercase().starts_with("WHERE") {
                    sql.push(' ');
                    sql.push_str(t);
                } else if !t.is_empty() {
                    sql.push_str(" WHERE ");
                    sql.push_str(t);
                }
            }
            let payload = engine.duckdb.run_sql(&conn.id, &sql)?;
            return write_export_payload(&payload, &fmt, out.as_deref(), &table);
        }
        let managed = engine.pools.get_managed_connection(&conn.id)?;
        let mysql = crate::db::pool::ConnectionManager::is_mysql_style(&conn.db_type);
        let where_ref = where_clause.as_deref();
        match fmt.as_str() {
            "csv" => {
                let s = crate::db::export::export_csv_filtered(
                    &managed, &table, true, mysql, where_ref,
                )
                .await?;
                write_export_text(&s, out.as_deref(), &table, "csv")
            }
            "json" => {
                let s =
                    crate::db::export::export_json_filtered(&managed, &table, mysql, where_ref)
                        .await?;
                write_export_text(&s, out.as_deref(), &table, "json")
            }
            "sql" | "sqldump" => {
                let s = crate::db::export::export_sql_dump_filtered(
                    &managed, &table, mysql, where_ref,
                )
                .await?;
                write_export_text(&s, out.as_deref(), &table, "sql")
            }
            "parquet" => {
                let bytes = crate::db::export::export_parquet_filtered(
                    &managed, &table, mysql, where_ref,
                )
                .await?;
                write_export_bytes(&bytes, out.as_deref(), &table, "parquet")
            }
            other => Err(format!(
                "Unknown export format '{other}'. Use csv, json, sql, parquet."
            )),
        }
    }
    .await;
    engine.disconnect(&conn).await;
    result
}

fn write_export_payload(
    payload: &crate::db::executor::QueryResultPayload,
    fmt: &str,
    out: Option<&std::path::Path>,
    table: &str,
) -> Result<(), String> {
    match fmt {
        "csv" => {
            let mut buf = Vec::new();
            render_payload(payload, OutputFormat::Csv, None, &mut buf).map_err(|e| e.to_string())?;
            write_export_text(
                &String::from_utf8_lossy(&buf),
                out,
                table,
                "csv",
            )
        }
        "json" => {
            let mut buf = Vec::new();
            render_payload(payload, OutputFormat::Json, None, &mut buf).map_err(|e| e.to_string())?;
            write_export_text(
                &String::from_utf8_lossy(&buf),
                out,
                table,
                "json",
            )
        }
        "parquet" => {
            let cols: Vec<String> = payload.columns.iter().map(|c| c.name.clone()).collect();
            let bytes = crate::db::export::export_parquet_from_json_rows(&cols, &payload.rows)?;
            write_export_bytes(&bytes, out, table, "parquet")
        }
        other => Err(format!(
            "DuckDB export supports csv, json, parquet (not '{other}')"
        )),
    }
}

fn write_export_text(
    body: &str,
    out: Option<&std::path::Path>,
    table: &str,
    ext: &str,
) -> Result<(), String> {
    if let Some(p) = out {
        std::fs::write(p, body).map_err(|e| format!("Write {}: {e}", p.display()))?;
        eprintln!("wrote {}", p.display());
    } else if ext == "csv" || ext == "json" || ext == "sql" {
        print!("{body}");
        if !body.ends_with('\n') {
            println!();
        }
        let _ = table;
    }
    Ok(())
}

fn write_export_bytes(
    bytes: &[u8],
    out: Option<&std::path::Path>,
    table: &str,
    ext: &str,
) -> Result<(), String> {
    let path = match out {
        Some(p) => p.to_path_buf(),
        None => PathBuf::from(format!("{table}.{ext}")),
    };
    std::fs::write(&path, bytes).map_err(|e| format!("Write {}: {e}", path.display()))?;
    eprintln!("wrote {} ({} bytes)", path.display(), bytes.len());
    Ok(())
}

async fn cmd_history(limit: i64) -> Result<(), String> {
    let engine = CliEngine::new().await?;
    let items = engine.storage.get_query_history(1, limit.max(1)).await?;
    if items.is_empty() {
        println!("(no query history yet)");
        return Ok(());
    }
    let mut t = comfy_table::Table::new();
    t.set_header(["WHEN", "CONN", "MS", "ROWS", "SQL"]);
    for h in items {
        let sql = h.query_text.replace('\n', " ");
        let sql = if sql.len() > 72 {
            format!("{}…", &sql[..69])
        } else {
            sql
        };
        t.add_row([
            h.timestamp,
            h.connection_id.chars().take(8).collect::<String>(),
            format!("{:.0}", h.execution_time_ms),
            h.row_count.to_string(),
            sql,
        ]);
    }
    println!("{t}");
    Ok(())
}

async fn cmd_repl(
    connection: Option<String>,
    password: Option<String>,
    yes: bool,
) -> Result<(), String> {
    let catalog = load_catalog()?;
    let mut current = pick_conn(&catalog, &connection)?.clone();
    let engine = CliEngine::new().await?;
    let pw = CliEngine::resolve_password(&current, password, true)?;
    engine.connect(&current, pw).await?;
    println!(
        "DevDash CLI {VERSION}  connected → {} ({})",
        current.name, current.db_type
    );
    println!("\\q quit  ·  \\tables  ·  \\d <table>  ·  \\c <name>  ·  \\begin \\commit \\rollback  ·  \\? help");

    let hist_path = paths::config_dir().join("cli_history");
    let mut rl = rustyline::DefaultEditor::new().map_err(|e| e.to_string())?;
    let _ = rl.load_history(&hist_path);

    loop {
        let prompt = format!("devdash:{}> ", current.name);
        let line = match rl.readline(&prompt) {
            Ok(l) => l,
            Err(rustyline::error::ReadlineError::Interrupted) => continue,
            Err(rustyline::error::ReadlineError::Eof) => break,
            Err(e) => return Err(e.to_string()),
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let _ = rl.add_history_entry(trimmed);
        if trimmed == "\\q" || trimmed == "\\quit" || trimmed == "exit" {
            break;
        }
        if trimmed == "\\?" || trimmed == "\\help" {
            println!("\\tables          list tables");
            println!("\\d <table>       describe table");
            println!("\\c <name>        switch saved connection");
            println!("\\begin           BEGIN on held connection (same TransactionManager as Desktop)");
            println!("\\commit          COMMIT open transaction");
            println!("\\rollback        ROLLBACK open transaction");
            println!("\\q               quit");
            continue;
        }
        if trimmed == "\\tables" {
            match engine.tables(&current).await {
                Ok(ts) => {
                    for t in ts {
                        println!(
                            "{:<16} {:<32} {}",
                            t.schema, t.name, t.table_type
                        );
                    }
                }
                Err(e) => eprintln!("error: {e}"),
            }
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("\\d ") {
            match engine.columns(&current, rest.trim()).await {
                Ok(cols) => {
                    for c in cols {
                        println!(
                            "{:<24} {:<18} null={} pk={}",
                            c.name, c.data_type, c.is_nullable, c.is_primary_key
                        );
                    }
                }
                Err(e) => eprintln!("error: {e}"),
            }
            continue;
        }
        if trimmed == "\\begin" {
            match engine.pools.get_managed_connection(&current.id) {
                Ok(managed) => match engine.tx.begin_managed(&managed, &current.id).await {
                    Ok(st) => println!("transaction active={}", st.active),
                    Err(e) => eprintln!("error: {e}"),
                },
                Err(e) => eprintln!("error: {e}"),
            }
            continue;
        }
        if trimmed == "\\commit" {
            match engine.tx.commit(&current.id).await {
                Ok(st) => println!("committed active={}", st.active),
                Err(e) => eprintln!("error: {e}"),
            }
            continue;
        }
        if trimmed == "\\rollback" {
            match engine.tx.rollback(&current.id).await {
                Ok(st) => println!("rolled back active={}", st.active),
                Err(e) => eprintln!("error: {e}"),
            }
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("\\c ") {
            let name = rest.trim();
            match load_catalog() {
                Ok(cat) => match resolve_connection(&cat, name) {
                    Ok(next) => {
                        let next = next.clone();
                        engine.disconnect(&current).await;
                        match CliEngine::resolve_password(&next, None, true) {
                            Ok(pw) => match engine.connect(&next, pw).await {
                                Ok(()) => {
                                    println!("switched → {} ({})", next.name, next.db_type);
                                    current = next;
                                }
                                Err(e) => {
                                    eprintln!("error: {e}");
                                    // try reconnect previous
                                    let _ = engine
                                        .connect(
                                            &current,
                                            CliEngine::resolve_password(&current, None, false)
                                                .ok()
                                                .flatten(),
                                        )
                                        .await;
                                }
                            },
                            Err(e) => eprintln!("error: {e}"),
                        }
                    }
                    Err(e) => eprintln!("error: {e}"),
                },
                Err(e) => eprintln!("error: {e}"),
            }
            continue;
        }
        let tx_hit = engine.tx.execute_in_tx(&current.id, trimmed).await;
        let result = match tx_hit {
            Ok(Some(payload)) => Ok(payload),
            Err(e) => Err(e),
            Ok(None) => engine.run_sql(&current, trimmed, yes, false).await,
        };
        match result {
            Ok(payload) => {
                let _ = render_payload(&payload, OutputFormat::Table, Some(200), io::stdout());
            }
            Err(e) => eprintln!("error: {e}"),
        }
    }

    engine.disconnect(&current).await;
    let _ = rl.save_history(&hist_path);
    Ok(())
}
