//! Thin CLI wrappers around `crate::db::*` — no duplicated business logic.
use super::catalog::{
    default_connection, load_catalog, resolve_connection, CatalogConnection, ConnectionCatalog,
};
use super::format::{render_payload, OutputFormat};
use super::runtime::CliEngine;
use crate::db::ai_assist::{complete_sql_blocking, AiAssistRequest, SchemaTableContext};
use crate::db::autocomplete::fetch_autocomplete_data;
use crate::db::csv_import::{execute_csv_import, preview_csv_file};
use crate::db::ddl::{fetch_indexes, generate_table_ddl};
use crate::db::diagnostics::run_connection_diagnostics;
use crate::db::encrypted_export::{export_connections_to_string, import_connections_from_string};
use crate::db::introspection::fetch_columns_managed;
use crate::db::metrics_board::fetch_live_database_metrics;
use crate::db::migration_apply::apply_migration_sql;
use crate::db::migrations_log::list_migration_runs;
use crate::db::profiler::profile_query;
use crate::db::result_snapshots::{
    delete_result_snapshot, diff_result_snapshots, list_result_snapshots, save_result_snapshot,
};
use crate::db::schema_migration::{generate_schema_migration, ColumnSnapshot, TableSnapshot};
use crate::db::staged_edits::{
    apply_staged_deletes, apply_staged_edits, apply_staged_inserts, StagedDeleteRow, StagedInsertRow,
    StagedRowEdit,
};
use crate::db::structure_editor::{
    build_add_column_sql, build_add_index_sql, build_change_type_sql, build_drop_column_sql,
    build_drop_index_sql, build_rename_column_sql, build_set_nullable_sql, execute_structure_sql,
    AddColumnPayload, AddIndexPayload, ChangeTypePayload, DropColumnPayload, DropIndexPayload,
    RenameColumnPayload, SetNullablePayload,
};
use super::helptext::{H_CONN, H_OUT, H_PASS, H_YES};
use clap::Subcommand;
use serde::Deserialize;
use std::io;
use std::path::PathBuf;

// ── clap subcommand trees ────────────────────────────────────────────

#[derive(Subcommand, Debug)]
pub enum SchemaCmd {
    /// Generate CREATE TABLE DDL
    Ddl {
        /// Table name (schema.table ok)
        table: String,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// List indexes
    Indexes {
        table: String,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// Diff one table across two saved connections
    Diff {
        table: String,
        #[arg(long = "from", help = "Source connection name")]
        from: String,
        #[arg(long = "to", help = "Target connection name")]
        to: String,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
        #[arg(short = 'o', long = "out", help = H_OUT)]
        out: Option<PathBuf>,
    },
    /// Apply a SQL migration file (transactional)
    Apply {
        #[arg(short = 'f', long = "file", help = "SQL script to apply")]
        file: PathBuf,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "source-label", help = "Label stored in migration history")]
        source_label: Option<String>,
        #[arg(long = "dry-run", help = "Parse/log only; do not execute")]
        dry_run: bool,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// List local migration run history (JSON)
    Runs {
        #[arg(short = 'n', long = "limit", default_value_t = 20)]
        limit: i64,
    },
}

#[derive(Subcommand, Debug)]
pub enum SnapshotCmd {
    /// Run SQL and store the result set locally
    Save {
        #[arg(long, help = "Snapshot display name")]
        name: String,
        #[arg(short = 'f', long = "file", help = "SQL file to run and snapshot")]
        file: Option<PathBuf>,
        /// SQL text (if --file omitted)
        sql: Option<String>,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// List snapshot metadata (JSON)
    #[command(visible_alias = "ls")]
    List {
        #[arg(short = 'n', long = "limit", default_value_t = 50)]
        limit: i64,
    },
    /// Delete a snapshot by id
    #[command(visible_alias = "rm")]
    Delete { id: String },
    /// Paged row diff between two snapshots (JSON)
    Diff {
        left: String,
        right: String,
        #[arg(long, default_value_t = 0)]
        offset: i64,
        #[arg(long, default_value_t = 50)]
        limit: i64,
    },
}

#[derive(Subcommand, Debug)]
pub enum ProcessCmd {
    /// List server processes (JSON; empty on SQLite/DuckDB)
    #[command(visible_alias = "ls")]
    List {
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// Cancel/kill a backend pid (pg_cancel_backend / KILL QUERY)
    Kill {
        pid: u32,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
pub enum TxCmd {
    /// Run a SQL file inside a single transaction (same engine as Desktop apply_migration_sql)
    Run {
        #[arg(short = 'f', long = "file", help = "SQL file")]
        file: PathBuf,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "dry-run", help = "Do not execute; log only")]
        dry_run: bool,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
pub enum ImportCmd {
    /// Import a CSV file into a table
    Csv {
        table: String,
        #[arg(short = 'f', long = "file", help = "CSV path")]
        file: PathBuf,
        #[arg(long, help = "Show headers + first rows; do not import")]
        preview: bool,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// Run a SQL dump file
    Sql {
        #[arg(short = 'f', long = "file", help = "SQL dump path")]
        file: PathBuf,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "yes", help = H_YES)]
        yes: bool,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
pub enum VaultCmd {
    /// Export AppStorage connections as AES-GCM ciphertext
    Export {
        #[arg(short = 'o', long = "out", help = H_OUT)]
        out: Option<PathBuf>,
        #[arg(long, help = "Passphrase (--passphrase > DEVDASH_VAULT_PASS)")]
        passphrase: Option<String>,
    },
    /// Import an encrypted vault payload
    Import {
        #[arg(short = 'f', long = "file", help = "Encrypted JSON file")]
        file: PathBuf,
        #[arg(long, help = "Passphrase (--passphrase > DEVDASH_VAULT_PASS)")]
        passphrase: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
pub enum StructureCmd {
    /// ADD COLUMN
    AddColumn {
        #[arg(long)]
        table: String,
        #[arg(long)]
        name: String,
        #[arg(long = "type", help = "SQL type, e.g. TEXT or INTEGER")]
        data_type: String,
        #[arg(long, help = "Allow NULL")]
        nullable: bool,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// DROP COLUMN
    DropColumn {
        #[arg(long)]
        table: String,
        #[arg(long)]
        name: String,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// RENAME COLUMN
    RenameColumn {
        #[arg(long)]
        table: String,
        #[arg(long)]
        from: String,
        #[arg(long)]
        to: String,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// ALTER COLUMN type
    ChangeType {
        #[arg(long)]
        table: String,
        #[arg(long)]
        name: String,
        #[arg(long = "type")]
        data_type: String,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// SET/DROP NOT NULL (MySQL needs --type)
    SetNullable {
        #[arg(long)]
        table: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        nullable: bool,
        #[arg(long = "type", help = "Current SQL type (required for MySQL MODIFY)")]
        data_type: String,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// CREATE INDEX
    AddIndex {
        #[arg(long)]
        table: String,
        #[arg(long)]
        name: String,
        #[arg(long = "columns", value_delimiter = ',', help = "Comma-separated columns")]
        columns: Vec<String>,
        #[arg(long)]
        unique: bool,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
    /// DROP INDEX
    DropIndex {
        #[arg(long)]
        name: String,
        #[arg(long)]
        table: Option<String>,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
pub enum StageCmd {
    /// Commit staged edits from a JSON file (same structs as staged_edits.rs)
    Commit {
        #[arg(short = 'f', long = "file", help = "JSON file: updates/inserts/deletes")]
        file: PathBuf,
        #[arg(long, help = "Target table")]
        table: String,
        #[arg(long = "pk", default_value = "id", help = "Primary-key column name")]
        pk: String,
        #[arg(short = 'c', long = "connection", help = H_CONN)]
        connection: Option<String>,
        #[arg(long = "password", env = "DEVDASH_PASSWORD", help = H_PASS)]
        password: Option<String>,
    },
}

#[derive(Deserialize)]
struct StageFile {
    #[serde(default)]
    updates: Vec<StagedRowEdit>,
    #[serde(default)]
    inserts: Vec<StagedInsertRow>,
    #[serde(default)]
    deletes: Vec<StagedDeleteRow>,
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

async fn open(
    name: Option<String>,
    password: Option<String>,
) -> Result<(CatalogConnection, CliEngine), String> {
    let catalog = load_catalog()?;
    let conn = pick_conn(&catalog, &name)?.clone();
    let engine = CliEngine::new().await?;
    let pw = CliEngine::resolve_password(&conn, password, true)?;
    engine.connect(&conn, pw).await?;
    Ok((conn, engine))
}

fn print_json(v: &impl serde::Serialize) -> Result<(), String> {
    println!(
        "{}",
        serde_json::to_string_pretty(v).map_err(|e| e.to_string())?
    );
    Ok(())
}

pub async fn cmd_schema(cmd: SchemaCmd) -> Result<(), String> {
    match cmd {
        SchemaCmd::Ddl {
            table,
            connection,
            password,
        } => {
            let (conn, engine) = open(connection, password).await?;
            let pool = engine.pool(&conn)?;
            let ddl = generate_table_ddl(&pool, &conn.db_type, &table).await;
            engine.disconnect(&conn).await;
            let ddl = ddl?;
            println!("{}", ddl.create_sql);
            if !ddl.indexes.is_empty() {
                eprintln!("-- indexes: {}", ddl.indexes.len());
            }
            Ok(())
        }
        SchemaCmd::Indexes {
            table,
            connection,
            password,
        } => {
            let (conn, engine) = open(connection, password).await?;
            let pool = engine.pool(&conn)?;
            let idx = fetch_indexes(&pool, &conn.db_type, &table).await;
            engine.disconnect(&conn).await;
            print_json(&idx?)
        }
        SchemaCmd::Diff {
            table,
            from,
            to,
            password,
            out,
        } => {
            let catalog = load_catalog()?;
            let left = resolve_connection(&catalog, &from)?.clone();
            let right = resolve_connection(&catalog, &to)?.clone();
            let engine = CliEngine::new().await?;
            let pw_l = CliEngine::resolve_password(&left, password.clone(), true)?;
            let pw_r = CliEngine::resolve_password(&right, password, true)?;
            engine.connect(&left, pw_l).await?;
            engine.connect(&right, pw_r).await?;
            let snap_l = snapshot_table(&engine, &left, &table).await;
            let snap_r = snapshot_table(&engine, &right, &table).await;
            engine.disconnect(&left).await;
            engine.disconnect(&right).await;
            let dialect = CliEngine::dialect(&right)?;
            let diff = generate_schema_migration(&snap_l?, &snap_r?, dialect)?;
            let script = diff.sql_statements.join("\n");
            if let Some(path) = out {
                std::fs::write(&path, script.as_bytes())
                    .map_err(|e| format!("write {}: {e}", path.display()))?;
                eprintln!("wrote {}", path.display());
            } else {
                println!("{script}");
            }
            eprintln!(
                "added={} removed={} statements={}",
                diff.added_columns.len(),
                diff.removed_columns.len(),
                diff.sql_statements.len()
            );
            Ok(())
        }
        SchemaCmd::Apply {
            file,
            connection,
            source_label,
            dry_run,
            password,
        } => {
            let sql = std::fs::read_to_string(&file)
                .map_err(|e| format!("read {}: {e}", file.display()))?;
            let (conn, engine) = open(connection, password).await?;
            if !dry_run {
                engine.pools.ensure_writes_allowed(&conn.id)?;
            }
            let pool = engine.pool(&conn)?;
            let result = apply_migration_sql(
                &pool,
                engine.storage.pool(),
                &conn.id,
                source_label.as_deref().unwrap_or("cli"),
                &conn.name,
                &sql,
                dry_run,
            )
            .await;
            engine.disconnect(&conn).await;
            print_json(&result?)
        }
        SchemaCmd::Runs { limit } => {
            let engine = CliEngine::new().await?;
            let runs = list_migration_runs(engine.storage.pool(), limit).await?;
            print_json(&runs)
        }
    }
}

async fn snapshot_table(
    engine: &CliEngine,
    conn: &CatalogConnection,
    table: &str,
) -> Result<TableSnapshot, String> {
    let managed = engine.pools.get_managed_connection(&conn.id)?;
    let cols = fetch_columns_managed(&managed, table).await?;
    Ok(TableSnapshot {
        table_name: table.to_string(),
        columns: cols
            .into_iter()
            .map(|c| ColumnSnapshot {
                name: c.name,
                data_type: c.data_type,
                is_nullable: c.is_nullable,
                is_primary_key: c.is_primary_key,
            })
            .collect(),
    })
}

pub async fn cmd_diagnose(
    connection: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    let (conn, engine) = open(connection, password).await?;
    let pool = engine.pool(&conn)?;
    let diag = run_connection_diagnostics(&pool, &conn.db_type).await;
    engine.disconnect(&conn).await;
    print_json(&diag?)
}

pub async fn cmd_profile(
    sql: Option<String>,
    file: Option<PathBuf>,
    connection: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    let text = if let Some(p) = file {
        std::fs::read_to_string(&p).map_err(|e| format!("read {}: {e}", p.display()))?
    } else {
        sql.unwrap_or_default()
    };
    if text.trim().is_empty() {
        return Err("Pass SQL text or --file".into());
    }
    let (conn, engine) = open(connection, password).await?;
    let pool = engine.pool(&conn)?;
    let profile = profile_query(&pool, &conn.db_type, text.trim()).await;
    engine.disconnect(&conn).await;
    print_json(&profile?)
}

pub async fn cmd_metrics(
    connection: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    let (conn, engine) = open(connection, password).await?;
    let pool = engine.pool(&conn)?;
    let dialect = CliEngine::dialect(&conn)?;
    let metrics = fetch_live_database_metrics(&pool, dialect).await;
    engine.disconnect(&conn).await;
    print_json(&metrics?)
}

pub async fn cmd_snapshot(cmd: SnapshotCmd) -> Result<(), String> {
    match cmd {
        SnapshotCmd::Save {
            name,
            file,
            sql,
            connection,
            password,
        } => {
            let text = if let Some(p) = file {
                std::fs::read_to_string(&p).map_err(|e| format!("read {}: {e}", p.display()))?
            } else {
                sql.unwrap_or_default()
            };
            if text.trim().is_empty() {
                return Err("Pass SQL or --file to snapshot a result".into());
            }
            let (conn, engine) = open(connection, password).await?;
            let payload = engine.run_sql(&conn, text.trim(), true, false).await;
            let payload = match payload {
                Ok(p) => p,
                Err(e) => {
                    engine.disconnect(&conn).await;
                    return Err(e);
                }
            };
            let cols: Vec<String> = payload.columns.iter().map(|c| c.name.clone()).collect();
            let meta = save_result_snapshot(
                engine.storage.pool(),
                &name,
                &conn.id,
                &conn.name,
                text.trim(),
                &cols,
                &payload.rows,
            )
            .await;
            engine.disconnect(&conn).await;
            print_json(&meta?)
        }
        SnapshotCmd::List { limit } => {
            let engine = CliEngine::new().await?;
            let list = list_result_snapshots(engine.storage.pool(), limit).await?;
            print_json(&list)
        }
        SnapshotCmd::Delete { id } => {
            let engine = CliEngine::new().await?;
            delete_result_snapshot(engine.storage.pool(), &id).await?;
            println!("deleted {id}");
            Ok(())
        }
        SnapshotCmd::Diff {
            left,
            right,
            offset,
            limit,
        } => {
            let engine = CliEngine::new().await?;
            let diff =
                diff_result_snapshots(engine.storage.pool(), &left, &right, offset, limit).await?;
            print_json(&diff)
        }
    }
}

pub async fn cmd_process(cmd: ProcessCmd) -> Result<(), String> {
    match cmd {
        ProcessCmd::List {
            connection,
            password,
        } => {
            let (conn, engine) = open(connection, password).await?;
            let pool = engine.pool(&conn)?;
            let list = crate::db::admin_catalog::list_processes(&pool, &conn.db_type).await;
            engine.disconnect(&conn).await;
            print_json(&list?)
        }
        ProcessCmd::Kill {
            pid,
            connection,
            password,
        } => {
            let (conn, engine) = open(connection, password).await?;
            let pool = engine.pool(&conn)?;
            let r = crate::db::admin_catalog::kill_process(&pool, &conn.db_type, pid).await;
            engine.disconnect(&conn).await;
            r?;
            println!("killed pid {pid}");
            Ok(())
        }
    }
}

pub async fn cmd_roles(
    connection: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    let (conn, engine) = open(connection, password).await?;
    let pool = engine.pool(&conn)?;
    let list = crate::db::admin_catalog::list_roles(&pool, &conn.db_type).await;
    engine.disconnect(&conn).await;
    print_json(&list?)
}

pub async fn cmd_routines(
    connection: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    let (conn, engine) = open(connection, password).await?;
    let pool = engine.pool(&conn)?;
    let list = crate::db::admin_catalog::list_routines(&pool, &conn.db_type).await;
    engine.disconnect(&conn).await;
    print_json(&list?)
}

pub async fn cmd_tx(cmd: TxCmd) -> Result<(), String> {
    let TxCmd::Run {
        file,
        connection,
        dry_run,
        password,
    } = cmd;
    cmd_schema(SchemaCmd::Apply {
        file,
        connection,
        source_label: Some("cli-tx".into()),
        dry_run,
        password,
    })
    .await
}

pub async fn cmd_import(cmd: ImportCmd) -> Result<(), String> {
    match cmd {
        ImportCmd::Csv {
            table,
            file,
            preview,
            connection,
            password,
        } => {
            if preview {
                let p = preview_csv_file(&file)?;
                return print_json(&p);
            }
            let (conn, engine) = open(connection, password).await?;
            engine.pools.ensure_writes_allowed(&conn.id)?;
            let pool = engine.pool(&conn)?;
            let mysql = CliEngine::mysql_style(&conn);
            let res = execute_csv_import(&pool, &table, &file, mysql).await;
            engine.disconnect(&conn).await;
            print_json(&res?)
        }
        ImportCmd::Sql {
            file,
            connection,
            yes,
            password,
        } => {
            let sql = std::fs::read_to_string(&file)
                .map_err(|e| format!("read {}: {e}", file.display()))?;
            let (conn, engine) = open(connection, password).await?;
            let res = engine.run_sql(&conn, &sql, yes, false).await;
            engine.disconnect(&conn).await;
            let payload = res?;
            render_payload(&payload, OutputFormat::Table, Some(50), io::stdout())
                .map_err(|e| e.to_string())
        }
    }
}

pub async fn cmd_vault(cmd: VaultCmd) -> Result<(), String> {
    let engine = CliEngine::new().await?;
    match cmd {
        VaultCmd::Export { out, passphrase } => {
            let pass = passphrase
                .or_else(|| std::env::var("DEVDASH_VAULT_PASS").ok())
                .ok_or("Pass --passphrase or DEVDASH_VAULT_PASS")?;
            let blob = export_connections_to_string(&engine.storage, None, &pass).await?;
            if let Some(path) = out {
                std::fs::write(&path, blob.as_bytes())
                    .map_err(|e| format!("write {}: {e}", path.display()))?;
                eprintln!("wrote {}", path.display());
            } else {
                println!("{blob}");
            }
            Ok(())
        }
        VaultCmd::Import { file, passphrase } => {
            let pass = passphrase
                .or_else(|| std::env::var("DEVDASH_VAULT_PASS").ok())
                .ok_or("Pass --passphrase or DEVDASH_VAULT_PASS")?;
            let raw = std::fs::read_to_string(&file)
                .map_err(|e| format!("read {}: {e}", file.display()))?;
            let payload = import_connections_from_string(&engine.storage, &raw, &pass).await?;
            println!(
                "imported {} connections, {} queries",
                payload.connections.len(),
                payload.saved_queries.len()
            );
            Ok(())
        }
    }
}

pub async fn cmd_audit(limit: usize) -> Result<(), String> {
    let entries = crate::db::audit::read_audit_entries(&crate::db::audit::default_audit_dir(), limit)?;
    print_json(&entries)
}

pub async fn cmd_ai(
    prompt: String,
    connection: Option<String>,
    execute: bool,
    yes: bool,
    provider: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    let (conn, engine) = open(connection, password).await?;
    let pool = engine.pool(&conn).ok();
    let tables = if let Some(pool) = pool {
        fetch_autocomplete_data(&pool, &conn.db_type)
            .await
            .map(|data| {
                data.table_columns
                    .into_iter()
                    .map(|t| SchemaTableContext {
                        name: t.table_name,
                        columns: t.columns,
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let provider = provider
        .or_else(|| std::env::var("DEVDASH_AI_PROVIDER").ok())
        .unwrap_or_else(|| "ollama".into());
    let api_key = std::env::var("DEVDASH_AI_KEY")
        .ok()
        .or_else(|| crate::db::credentials::get_secret("ai_api_key").ok());
    let req = AiAssistRequest {
        provider,
        base_url: base_url.or_else(|| std::env::var("DEVDASH_AI_BASE_URL").ok()),
        model: model.or_else(|| std::env::var("DEVDASH_AI_MODEL").ok()),
        api_key,
        db_type: conn.db_type.clone(),
        active_table: None,
        last_queries: Vec::new(),
        tables,
        prompt,
    };
    let assist = tokio::task::spawn_blocking(move || complete_sql_blocking(&req))
        .await
        .map_err(|e| format!("AI task: {e}"))??;
    println!("{}", assist.sql);
    if execute {
        let payload = engine
            .run_sql(&conn, &assist.sql, yes || !assist.is_write, false)
            .await;
        engine.disconnect(&conn).await;
        let payload = payload?;
        render_payload(&payload, OutputFormat::Table, Some(100), io::stdout())
            .map_err(|e| e.to_string())?;
    } else {
        engine.disconnect(&conn).await;
        if assist.is_write {
            eprintln!("(write SQL — re-run with --execute --yes to apply)");
        }
    }
    Ok(())
}

pub async fn cmd_structure(cmd: StructureCmd) -> Result<(), String> {
    let (connection, password, sql_builder) = match cmd {
        StructureCmd::AddColumn {
            table,
            name,
            data_type,
            nullable,
            connection,
            password,
        } => (
            connection,
            password,
            Box::new(move |d| {
                build_add_column_sql(
                    &AddColumnPayload {
                        table_name: table,
                        column_name: name,
                        data_type,
                        is_nullable: nullable,
                    },
                    d,
                )
            }) as Box<dyn FnOnce(crate::db::schema_migration::EngineDialect) -> Result<String, String>>,
        ),
        StructureCmd::DropColumn {
            table,
            name,
            connection,
            password,
        } => (
            connection,
            password,
            Box::new(move |d| {
                build_drop_column_sql(
                    &DropColumnPayload {
                        table_name: table,
                        column_name: name,
                    },
                    d,
                )
            }) as _,
        ),
        StructureCmd::RenameColumn {
            table,
            from,
            to,
            connection,
            password,
        } => (
            connection,
            password,
            Box::new(move |d| {
                build_rename_column_sql(
                    &RenameColumnPayload {
                        table_name: table,
                        old_name: from,
                        new_name: to,
                    },
                    d,
                )
            }) as _,
        ),
        StructureCmd::ChangeType {
            table,
            name,
            data_type,
            connection,
            password,
        } => (
            connection,
            password,
            Box::new(move |d| {
                build_change_type_sql(
                    &ChangeTypePayload {
                        table_name: table,
                        column_name: name,
                        new_type: data_type,
                    },
                    d,
                )
            }) as _,
        ),
        StructureCmd::SetNullable {
            table,
            name,
            nullable,
            data_type,
            connection,
            password,
        } => (
            connection,
            password,
            Box::new(move |d| {
                build_set_nullable_sql(
                    &SetNullablePayload {
                        table_name: table,
                        column_name: name,
                        is_nullable: nullable,
                        data_type,
                    },
                    d,
                )
            }) as _,
        ),
        StructureCmd::AddIndex {
            table,
            name,
            columns,
            unique,
            connection,
            password,
        } => (
            connection,
            password,
            Box::new(move |d| {
                build_add_index_sql(
                    &AddIndexPayload {
                        table_name: table,
                        index_name: name,
                        columns,
                        is_unique: unique,
                    },
                    d,
                )
            }) as _,
        ),
        StructureCmd::DropIndex {
            name,
            table,
            connection,
            password,
        } => (
            connection,
            password,
            Box::new(move |d| {
                build_drop_index_sql(
                    &DropIndexPayload {
                        table_name: table.unwrap_or_default(),
                        index_name: name,
                    },
                    d,
                )
            }) as _,
        ),
    };
    let (conn, engine) = open(connection, password).await?;
    engine.pools.ensure_writes_allowed(&conn.id)?;
    let dialect = CliEngine::dialect(&conn)?;
    let sql = sql_builder(dialect)?;
    let pool = engine.pool(&conn)?;
    let res = execute_structure_sql(&pool, &sql).await;
    engine.disconnect(&conn).await;
    res?;
    println!("{sql}");
    Ok(())
}

pub async fn cmd_stage(cmd: StageCmd) -> Result<(), String> {
    let StageCmd::Commit {
        file,
        table,
        pk,
        connection,
        password,
    } = cmd;
    let raw = std::fs::read_to_string(&file).map_err(|e| format!("read {}: {e}", file.display()))?;
    let stage: StageFile = serde_json::from_str(&raw).map_err(|e| format!("stage JSON: {e}"))?;
    let (conn, engine) = open(connection, password).await?;
    engine.pools.ensure_writes_allowed(&conn.id)?;
    let pool = engine.pool(&conn)?;
    let mysql = CliEngine::mysql_style(&conn);
    let n_upd = stage.updates.len();
    let n_ins = stage.inserts.len();
    let n_del = stage.deletes.len();
    if n_upd > 0 {
        apply_staged_edits(&pool, &table, &pk, stage.updates, mysql).await?;
    }
    if n_ins > 0 {
        apply_staged_inserts(&pool, &table, stage.inserts, mysql).await?;
    }
    if n_del > 0 {
        apply_staged_deletes(&pool, &table, &pk, stage.deletes, mysql).await?;
    }
    engine.disconnect(&conn).await;
    println!(
        "committed updates={} inserts={} deletes={}",
        n_upd, n_ins, n_del
    );
    Ok(())
}

pub async fn cmd_redis_keys(
    connection: Option<String>,
    pattern: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    let catalog = load_catalog()?;
    let conn = pick_conn(&catalog, &connection)?.clone();
    if !conn.db_type.eq_ignore_ascii_case("redis") {
        return Err("Connection is not Redis. Use a redis catalog entry.".into());
    }
    let pw = password
        .or_else(|| std::env::var("DEVDASH_PASSWORD").ok())
        .or_else(|| super::catalog::load_password(&conn.id));
    let mut client =
        crate::db::redis::RedisClient::connect(&conn.host, conn.port, pw.as_deref()).await?;
    let keys = client
        .fetch_keys(pattern.as_deref().unwrap_or("*"))
        .await?;
    print_json(&keys)
}

pub fn cmd_completions(shell: &str) -> Result<(), String> {
    use clap::CommandFactory;
    use clap_complete::{generate, Shell};
    use std::str::FromStr;
    let sh = Shell::from_str(shell).map_err(|_| {
        format!("Unknown shell '{shell}'. Use bash, zsh, fish, powershell, or elvish.")
    })?;
    let mut cmd = super::Cli::command();
    generate(sh, &mut cmd, "devdash", &mut io::stdout());
    Ok(())
}
