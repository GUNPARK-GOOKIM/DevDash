# DevDash CLI (v1)

DevDash CLI is the **terminal companion to DevDash Desktop**. Both call the same Rust engine in `src-tauri/src/db/*`: one query path, one Safe Mode, one keyring, one AppStorage file.

The CLI is a clap front-end over that core. It does **not** reimplement query execution, staging SQL, schema diff, diagnostics, or AI prompt construction.

## Quick start

First five commands after install:

```bash
devdash doctor                                          # 1. check install + config dir + keyring
devdash connect add --name local --url 'postgres://user@localhost:5432/app'   # 2. save a connection
devdash connect test                                    # 3. ping it
devdash sql 'select 1'                                  # 4. run SQL
devdash repl                                            # 5. interactive prompt
```

`devdash --help` prints this same five-step list.

## Installation

Until `scripts/install-cli.sh` is on `main`, install from a clone:

```bash
cargo install --path src-tauri --bin devdash --locked --no-default-features --features cli
# or
./scripts/install-cli.sh
```

Needs Rust stable and a C/C++ compiler (bundled DuckDB). Linux CLI builds **do not** need WebKit/GTK.

The `curl …/main/scripts/install-cli.sh` one-liner is published **only after merge to `main`**. Do not use that URL from this feature branch.

## Supported platforms

| OS | Arch | Notes |
|----|------|--------|
| macOS | x86_64, arm64 | Keyring = macOS Keychain |
| Linux | x86_64, aarch64 | Keyring = secret-service / libsecret when available |
| Windows | x86_64 | Keyring = Credential Manager; SmartScreen may warn on unsigned bins |

Shells with generated completions: **bash, zsh, fish, powershell, elvish**. The REPL itself is a TTY prompt (`rustyline`), not a shell.

## Configuration precedence

Most settings resolve **highest wins**:

1. **CLI flags** (`--password`, `-c`, `--provider`, `--passphrase`, `-F`, …)
2. **Environment variables** (`DEVDASH_PASSWORD`, `DEVDASH_CONFIG_DIR`, `DEVDASH_AI_*`, `DEVDASH_VAULT_PASS`)
3. **Catalog / config files** (`connections.json` default connection, OS keyring secrets, AppStorage DB)
4. **Built-in defaults** (format `table` / export `csv`, AI provider `ollama`, env tag `dev`)

Password specifically: `--password` → `DEVDASH_PASSWORD` (also wired via clap `env`) → keyring `devdash_app` / connection id → interactive prompt if stdin is a TTY.

Connection selection: `-c/--connection` → `connections.json` `"default"` → the sole saved connection if there is exactly one.

Config directory: `DEVDASH_CONFIG_DIR` → OS config dir + `/devdash`  
(`~/Library/Application Support/devdash` on macOS, `%APPDATA%\devdash` on Windows, `~/.config/devdash` on Linux).

| File / env | Role |
|------------|------|
| `$DEVDASH_CONFIG_DIR/connections.json` | Connection catalog (no passwords) |
| `$DEVDASH_CONFIG_DIR/devdash_internal.db` | Shared AppStorage (history, snapshots, migration runs) |
| `$DEVDASH_CONFIG_DIR/cli_history` | REPL history |
| OS keyring service `devdash_app` | Passwords (same as Desktop) |
| `DEVDASH_PASSWORD` | Password fallback |
| `DEVDASH_VAULT_PASS` | Vault passphrase fallback |
| `DEVDASH_AI_PROVIDER` / `DEVDASH_AI_KEY` / `DEVDASH_AI_MODEL` / `DEVDASH_AI_BASE_URL` | AI defaults |
| keyring account `ai_api_key` | Cloud LLM key if env unset |

`--env prod` connections are read-only unless `--allow-writes-on-prod` was set at `connect add`.

## Exit codes

| Code | Meaning |
|------|---------|
| **0** | Success |
| **1** | Command failed (SQL error, I/O, generic runtime) |
| **2** | Usage / unknown flag or subcommand (clap exits before `run`) |
| **3** | Connection failure (unreachable host, unsupported engine, missing pool) |
| **4** | Safe Mode or read-only policy blocked the statement |
| **5** | Named connection / snapshot / catalog entry not found (or ambiguous) |

Tokio runtime startup failure is **1**. Script with `set -e` and branch on `$?`.

## Machine-readable output

| Command | Default | Scripting formats |
|---------|---------|-------------------|
| `sql`, `tables` | `table` (human) | `-F json` · `-F csv` · `-F tsv` · `-o file` |
| `export` | `csv` | `-F json\|sql\|parquet` · `-o file` |
| `describe` | ASCII table | pipe / wrap; not JSON today |
| `diagnose`, `profile`, `metrics`, `roles`, `routines`, `process ls`, `snapshot *`, `schema runs`, `audit`, `redis-keys`, `connect show` | pretty JSON on stdout | `jq` |
| `schema ddl` / `schema diff` | raw SQL | `-o file` on diff |
| Human chatter (`wrote …`, row counts, doctor) | **stderr** where possible for sql/export files | keep stdout clean for `-F json/csv` |

JSON from `sql -F json`:

```json
{
  "columns": [{"name": "n", "type_name": "INTEGER"}],
  "row_count": 1,
  "execution_time_ms": 2,
  "affected_rows": 1,
  "rows": [{"n": 1}]
}
```

`-n/--limit` on `sql` truncates **display only**; it does not rewrite your SQL.

## Command tree

```
devdash
├── version
├── doctor
├── connect
│   ├── add [--name] [--type ENGINE] [--host] [--port] [--user] [--database]
│   │         [--ssl-mode] [--env] [--read-only] [--allow-writes-on-prod]
│   │         [--url] [--password] [--default]
│   ├── list | ls
│   ├── show <name>
│   ├── use <name>
│   ├── test [name]
│   └── remove | rm <name>
├── sql [SQL] [-c] [-f FILE] [-F table|json|csv|tsv] [-o OUT] [-n LIMIT] [--yes] [--read-only]
├── tables [-c] [-F table|json|csv|tsv]
├── describe | desc <table> [-c]
├── export <table> [-c] [-F csv|json|sql|parquet] [-o OUT] [--where CLAUSE]
├── history [-n]
├── repl [-c] [--yes]
├── schema
│   ├── ddl <table>
│   ├── indexes <table>
│   ├── diff --from A --to B <table> [-o FILE]
│   ├── apply -f FILE [--dry-run] [--source-label]
│   └── runs [-n]
├── diagnose [-c]
├── profile [SQL] [-f FILE] [-c]
├── metrics [-c]
├── snapshot
│   ├── save --name NAME [SQL] [-f FILE]
│   ├── list | ls
│   ├── delete | rm <id>
│   └── diff <left-id> <right-id> [--offset] [--limit]
├── stage commit -f FILE --table T [--pk id]
├── process
│   ├── list | ls
│   └── kill <pid>
├── roles [-c]
├── routines [-c]
├── tx run -f FILE [--dry-run]
├── import
│   ├── csv <table> -f FILE [--preview]
│   └── sql -f FILE [--yes]
├── vault
│   ├── export [-o FILE] [--passphrase]
│   └── import -f FILE [--passphrase]
├── audit [-n]
├── ai <PROMPT> [--execute] [--yes] [--provider] [--model] [--base-url]
├── structure
│   ├── add-column --table T --name C --type TYPE [--nullable]
│   ├── drop-column --table T --name C
│   ├── rename-column --table T --from A --to B
│   ├── change-type --table T --name C --type TYPE
│   ├── set-nullable --table T --name C --type TYPE --nullable/--nullable false
│   ├── add-index --table T --name I --columns a,b [--unique]
│   └── drop-index --name I [--table T]
├── redis-keys [-c] [--pattern *]
├── completions <bash|zsh|fish|powershell|elvish>
└── help
```

Every command accepts `-h` / `--help` with the same flag wording and at least one example where the command has non-trivial flags.

## Engines

Same matrix as Desktop: PostgreSQL, MySQL/MariaDB, SQLite, DuckDB, MSSQL, Redis, MongoDB, Cassandra/Scylla, ClickHouse, plus Postgres wire-compat CockroachDB/Redshift. Oracle / Snowflake / BigQuery / Turso remain core stubs.

```bash
devdash connect add --name analytics --type duckdb --database ./warehouse.duckdb
devdash connect add --name cache --type redis --host 127.0.0.1 --port 6379
```

## Automation examples

```bash
# JSON → jq
devdash sql -F json 'select id, email from users limit 5' | jq '.rows[].email'

# CSV for other tools
devdash sql -F csv 'select * from orders where status = $$open$$' -o open_orders.csv

# Fail a CI job on Safe Mode without --yes
set +e
devdash sql 'delete from users'
test $? -eq 4

# Unknown connection
devdash sql -c does-not-exist 'select 1'; echo $?   # 5

# Isolated config (tests)
export DEVDASH_CONFIG_DIR=/tmp/devdash-ci
devdash connect add --name mem --type duckdb --database ':memory:' --default
devdash sql -F json 'select 1 as n' | jq '.row_count'

# Migration dry-run then apply
devdash schema diff --from staging --to prod --table users -o /tmp/users.sql
devdash schema apply -f /tmp/users.sql --dry-run
devdash schema apply -f /tmp/users.sql
```

## Shell completions

```bash
# zsh
mkdir -p ~/.zfunc
devdash completions zsh > ~/.zfunc/_devdash
# ~/.zshrc: fpath=(~/.zfunc $fpath) && autoload -Uz compinit && compinit

# bash
mkdir -p ~/.local/share/bash-completion/completions
devdash completions bash > ~/.local/share/bash-completion/completions/devdash

# fish
devdash completions fish > ~/.config/fish/completions/devdash.fish

# powershell
devdash completions powershell >> $PROFILE
```

## REPL

```
devdash repl
devdash:local> \tables
devdash:local> \d users
devdash:local> \begin
devdash:local> update users set active = true where id = 1;
devdash:local> \commit
devdash:local> \c analytics
devdash:local> \q
```

Interactive transactions live in **this process** (`TransactionManager` is in-memory). Across separate `devdash` invocations use `devdash tx run -f file.sql`.

### Staged-edit JSON (`devdash stage commit`)

Same structs as `staged_edits.rs`:

```json
{
  "updates": [
    { "pk_value": 1, "changes": [{ "column_name": "email", "new_value": "a@b.com" }] }
  ],
  "inserts": [{ "columns": ["email"], "values": ["c@d.com"] }],
  "deletes": [{ "pk_value": 99 }]
}
```

## Troubleshooting

**Keyring unavailable / `doctor` says unavailable**  
Headless CI, SSH without a secret-service daemon, or sandbox. Pass `--password` or `DEVDASH_PASSWORD`. `doctor` writes/deletes a probe secret `devdash_cli_doctor`.

**`Failed to connect` / exit 3**  
Check host/port/SSL, that the engine is actually supported (`connect show`), and for sqlite/duckdb that `--database` is a real path or `:memory:`. Use `devdash diagnose` after a successful connect for version/latency.

**Safe Mode / read-only / exit 4**  
Destructive SQL (DROP, unbounded DELETE/UPDATE, …) needs `--yes`. Prod env connections are RO unless added with `--allow-writes-on-prod`. `--read-only` forces RO for one run.

**`No connection named` / exit 5**  
`devdash connect ls`. Names are case-insensitive; unique prefixes work. Set a default with `connect use`.

**Wrong config directory**  
`devdash doctor` prints the resolved config dir and catalog path. Override with `DEVDASH_CONFIG_DIR`. Desktop uses the same default folder.

**Completions write error / broken pipe**  
`devdash completions bash` prints to stdout; redirect to a file, don’t pipe to `head` in scripts that use `pipefail`.

**DuckDB / C++ compile errors on install**  
Install a C/C++ toolchain (`xcode-select --install`, `build-essential`). The CLI feature still links bundled DuckDB.

**AI empty / connection refused**  
Default provider is local Ollama at `http://localhost:11434`. Cloud providers need `DEVDASH_AI_KEY` or keyring `ai_api_key`. Generated write SQL still requires `--execute --yes`.

## Architecture (no duplicated business logic)

```
DevDash Desktop (Tauri IPC)  ──┐
                               ├── db/pool.rs, executor.rs, duckdb_engine.rs
devdash CLI (clap)          ───┤── safe_mode.rs, staged_edits.rs, schema_migration.rs
                               ├── diagnostics.rs, profiler.rs, metrics_board.rs
                               ├── result_snapshots.rs, migration_apply.rs, admin_catalog.rs
                               ├── ai_assist.rs, csv_import.rs, export.rs, encrypted_export.rs
                               └── credentials.rs + AppStorage (same files on disk)
```

GUI-only chrome (ERD canvas, virtualized grid editing, command palette) is not cloned. Staging in the CLI is file-based JSON through `apply_staged_*`. Process list in Desktop now goes through IPC → `admin_catalog` (same helper the CLI uses).

Cargo features: `gui` (default, Tauri) · `cli` (`devdash` binary, no WebKit).

```bash
cargo test --lib --manifest-path src-tauri/Cargo.toml --features cli
cargo build --manifest-path src-tauri/Cargo.toml --bin devdash --no-default-features --features cli
```

## v1 production notes

Ready for query, export/import, diagnostics, schema diff/apply, snapshots, staging, admin catalogs, vault, audit, and AI assist on engines the core actually opens.

Not claimed: Cloud IAM, Oracle/Snowflake/BigQuery/Turso, certified compliance, published GitHub-release binaries, or a `curl | sh` installer on `main` until this branch merges.
