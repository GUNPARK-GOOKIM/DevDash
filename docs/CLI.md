# DevDash CLI

DevDash CLI is the **terminal companion to DevDash Desktop**. Both products call the same Rust engine (`src-tauri/src/db/*`): one query planner, one Safe Mode, one keyring, one AppStorage database.

This is **not** a second implementation of DevDash. The CLI is a clap front-end over the same modules the desktop IPC handlers use.

## Installation

Until the installer script is on the `main` branch, install from a clone:

```bash
# from the repository root
cargo install --path src-tauri --bin devdash --locked --no-default-features --features cli

# or the helper script (builds the same binary into ~/.devdash/bin)
./scripts/install-cli.sh
```

Requirements: Rust stable, a C/C++ compiler (bundled DuckDB). Linux does **not** need WebKit/GTK for the CLI.

After `feat/devdash-cli` is merged, a one-liner will be published:

```bash
curl -fsSL https://raw.githubusercontent.com/akshat-lakhera/DevDash/main/scripts/install-cli.sh | sh
```

Do not advertise that URL until `scripts/install-cli.sh` exists on `main`.

Verify:

```bash
devdash version
devdash doctor
```

## Configuration

| Path / env | Purpose |
|------------|---------|
| `~/.config/devdash/connections.json` | Connection catalog (no passwords) |
| `~/.config/devdash/devdash_internal.db` | Shared AppStorage (history, snapshots, migration runs) |
| `~/.config/devdash/cli_history` | REPL history |
| OS keyring service `devdash_app` | Passwords (same as Desktop) |
| `DEVDASH_CONFIG_DIR` | Override config directory (tests / CI) |
| `DEVDASH_PASSWORD` | Password if keyring is empty |
| `DEVDASH_VAULT_PASS` | Passphrase for encrypted vault import/export |
| `DEVDASH_AI_PROVIDER` | `ollama` (default), `openai`, `claude`, `deepseek`, `custom` |
| `DEVDASH_AI_KEY` / keyring `ai_api_key` | Cloud LLM key |
| `DEVDASH_AI_MODEL` / `DEVDASH_AI_BASE_URL` | Model + base URL |

Production connections (`--env prod`) are **read-only** unless `--allow-writes-on-prod` was set when adding the connection.

## Engines

Same matrix as Desktop: PostgreSQL, MySQL/MariaDB, SQLite, DuckDB, MSSQL, Redis, MongoDB, Cassandra/Scylla, ClickHouse, plus Postgres wire-compat CockroachDB/Redshift. Oracle / Snowflake / BigQuery / Turso remain stubs in the core.

```bash
devdash connect add --name local --url 'postgres://user@localhost:5432/app'
devdash connect add --name analytics --type duckdb --database ./warehouse.duckdb
devdash connect add --name cache --type redis --host 127.0.0.1 --port 6379
devdash connect ls
devdash connect use local
devdash connect test
```

## Commands

| Command | Desktop equivalent |
|---------|--------------------|
| `devdash sql` / `repl` | SQL editor + multi-statement runner |
| `devdash tables` / `describe` | Object explorer |
| `devdash export` / `import csv` / `import sql` | Export / Import modals |
| `devdash schema ddl` / `indexes` | Structure view DDL |
| `devdash schema diff --from A --to B --table t` | Schema Diff modal |
| `devdash schema apply -f mig.sql` / `schema runs` | Migration apply + history |
| `devdash diagnose` | Connection diagnostics |
| `devdash profile 'select …'` | Query profiler / EXPLAIN |
| `devdash metrics` | Health / metrics grid |
| `devdash snapshot save\|ls\|diff\|rm` | Result snapshots |
| `devdash stage commit -f edits.json` | Staged grid commit |
| `devdash process ls` / `process kill <pid>` | Process manager |
| `devdash roles` / `routines` | Roles + routines managers |
| `devdash tx run -f file.sql` | Transactional apply |
| `devdash vault export\|import` | Encrypted share |
| `devdash audit` | Audit log |
| `devdash ai "count users"` | AI agent bar (same prompt builder) |
| `devdash structure …` | Structure editor |
| `devdash redis-keys` | Redis inspector |
| `devdash history` | Query history panel |
| `devdash completions zsh` | — |

Global-style flags on most commands:

- `-c, --connection <name>` — catalog name or id prefix  
- `--password` / `DEVDASH_PASSWORD`  
- `-F table|json|csv|tsv` (sql / tables)  
- `--yes` — confirm destructive SQL (Safe Mode)  
- `--read-only` — block writes for one run  

## Examples

```bash
# Query
devdash sql 'select now()'
devdash sql -f report.sql -F json -o out.json
devdash sql 'drop table scratch' --yes

# REPL (interactive transactions live here)
devdash repl
# \tables   \d users   \begin   \commit   \rollback   \c analytics   \q

# Schema + migrations
devdash schema ddl public.orders
devdash schema diff --from staging --to prod --table users -o users.sql
devdash schema apply -f users.sql --dry-run
devdash schema apply -f users.sql
devdash schema runs

# Snapshots
devdash snapshot save --name before -f q.sql
devdash snapshot save --name after 'select * from users'
devdash snapshot diff <left-id> <right-id>

# Staging JSON (same structs as staged_edits.rs)
devdash stage commit -f stage.json --table users --pk id

# Admin
devdash diagnose
devdash profile 'select * from users where id = 1'
devdash metrics
devdash process ls
devdash roles
devdash routines

# AI (Ollama default)
devdash ai 'top 10 customers by revenue'
devdash ai 'delete inactive users' --execute --yes --provider openai

# Completions
devdash completions zsh > ~/.zfunc/_devdash
```

### Staged-edit JSON shape

```json
{
  "updates": [
    {
      "pk_value": 1,
      "changes": [{ "column_name": "email", "new_value": "a@b.com" }]
    }
  ],
  "inserts": [{ "columns": ["email"], "values": ["c@d.com"] }],
  "deletes": [{ "pk_value": 99 }]
}
```

## Shell completions

```bash
# zsh
mkdir -p ~/.zfunc
devdash completions zsh > ~/.zfunc/_devdash
# add to ~/.zshrc: fpath=(~/.zfunc $fpath) && autoload -Uz compinit && compinit

# bash
devdash completions bash > ~/.local/share/bash-completion/completions/devdash

# fish
devdash completions fish > ~/.config/fish/completions/devdash.fish
```

## Architecture (single source of truth)

```
devdash CLI  ──┐
               ├── db/pool.rs, executor.rs, duckdb_engine.rs
DevDash Desktop┤── db/safe_mode.rs, staged_edits.rs, schema_migration.rs
               ├── db/diagnostics.rs, profiler.rs, metrics_board.rs
               ├── db/result_snapshots.rs, migration_apply.rs, admin_catalog.rs
               ├── db/ai_assist.rs, csv_import.rs, export.rs, encrypted_export.rs
               └── credentials.rs + AppStorage (same files on disk)
```

Cargo features:

- `gui` (default) — Tauri desktop (WebKit/GTK on Linux)
- `cli` — `devdash` binary, no WebKit

```bash
cargo test --lib --manifest-path src-tauri/Cargo.toml --features cli
cargo build --manifest-path src-tauri/Cargo.toml --bin devdash --no-default-features --features cli
```

## Production notes

- CLI is **production-usable** for query, export/import, diagnostics, schema diff/apply, snapshots, staging, admin catalogs, and AI assist on engines the core actually opens.
- Interactive GUI-only chrome (ERD canvas, virtualized grid editing, command palette) is not duplicated; staging is file-based, grid editing stays in Desktop.
- Transactions that span multiple process invocations are not possible (in-memory `TransactionManager`). Use `devdash repl` `\begin`/`\commit` or `devdash tx run -f`.
- Cloud IAM, Oracle, Snowflake, BigQuery, Turso remain unimplemented in the core — the CLI does not pretend otherwise.
