# DevDash — Architecture (Honest)

> **Status:** Describes what the code does today  
> **License:** Apache License 2.0 (see root `LICENSE`) — not MIT  

---

## 1. System Overview

DevDash is a **local-first desktop** database GUI built with:

| Layer | Stack |
| ----- | ----- |
| UI | React 18 + TypeScript + Tailwind + CodeMirror 6 + `@tanstack/react-virtual` + Recharts + React Flow |
| IPC | Typed helpers in `src/services/tauriBridge.ts` → Tauri 2 `invoke` |
| Engine | Rust (`src-tauri/`) + `sqlx::AnyPool` (Postgres, MySQL/MariaDB, SQLite drivers) |
| Secrets | OS keyring (`keyring` crate) + optional AES-GCM encrypted export |
| Local app DB | SQLite under user config dir (`app_storage.rs`) |

```
React UI  →  tauriBridge.ts  →  Tauri IPC  →  Rust commands.rs
                                              ├─ pool.rs (multi-pool)
                                              ├─ executor.rs (query + stream)
                                              ├─ staged_edits.rs (grid commits)
                                              ├─ safe_mode.rs (destructive analysis)
                                              ├─ result_snapshots.rs (local result capture + paged diff)
                                              ├─ credentials.rs / encrypted_export.rs
                                              └─ audit.rs (local JSONL only)

devdash CLI  →  src-tauri/src/cli/*  →  same db::* engine (see docs/CLI.md)
                 catalog: ~/.config/devdash/connections.json
                 secrets: OS keyring service `devdash_app`
                 history: ~/.config/devdash/devdash_internal.db
```

Cargo features: `gui` (default, Tauri desktop) and `cli` (`devdash` binary, no WebKit). Build CLI with `--no-default-features --features cli`.

There is **no** Monaco editor, **no** embedded offline AI model, and **no** production-verified MSSQL / Redis / Mongo drivers.

---

## 2. Architecture Rules (Enforced Where Practical)

1. **UI must not call raw IPC strings** from components — route through `tauriBridge.ts` (checked by `scripts/check-architecture.py`).
2. **Large result streaming**: `stream_dynamic_query` emits ~500-row chunks over Tauri events. This reduces intermediate row buffers; **RAM is not guaranteed &lt;25MB** (unmeasured).
3. **Grid mutations** stage in the UI, then commit via `staged_edits.rs` in a transaction. Values are **escaped SQL literals**, not bind parameters.
4. **Safe Mode**: `analyze_sql_safety` + server gate on `run_sql_query` unless `allow_destructive` is true.
5. **Passwords**: keyring or encrypted export — not plain-text password fields in saved connection files (connection metadata may still live in `localStorage`).

---

## 3. Engine Support (Code Truth)

### A. Backend can open (`pool.rs` / `Cargo.toml` sqlx features)

- PostgreSQL (and wire-compat use: CockroachDB, Redshift — **not separately tested**)
- MySQL / MariaDB  
- SQLite  
- **DuckDB** via dedicated `duckdb_engine.rs` (file path or `:memory:`, not sqlx)

### B. UI lists but backend **rejects**

MSSQL, Oracle, Snowflake, BigQuery, Turso, Redis, MongoDB, Cassandra, ClickHouse — connect is refused with an error.

### C. Stubs only

- `CloudIamConfig` exists; `build_connection_url` returns an error if set.

---

## 4. Audit Logging (`audit.rs`)

- Append-only JSONL under the user config directory (`…/devdash/audit/audit_log.jsonl`).
- Fields include timestamp, connection name, action type, SQL text, affected rows, status, `client_ip: "local"`.
- **Not** SOC 2 / HIPAA certified. No hash chain, no remote SIEM.

---

## 4b. Query Result Snapshots (`result_snapshots.rs`)

- Stored in the **same AppStorage SQLite** pool as query history / saved queries (`result_snapshots` meta + `result_snapshot_rows`).
- IPC: `save_result_snapshot`, `list_result_snapshots`, `delete_result_snapshot`, `diff_result_snapshots` (via `tauriBridge.ts`).
- **List** returns metadata only (no row payloads).
- **Diff** loads both snapshots in Rust, keys rows by first column (duplicates disambiguated with `#n`), returns counts for added/removed/changed/unchanged plus a **paged** subset of non-unchanged rows (default page size from UI, limit clamped ≤500).
- Soft cap: **100,000 rows** per snapshot. Not a full time-travel DB; no network sync.

---

## 5. Verification Commands

```bash
npx tsc --noEmit
cd src-tauri && cargo test --lib
cd src-tauri && cargo test --lib --no-default-features --features cli
cd src-tauri && cargo build --bin devdash --no-default-features --features cli
python3 scripts/check-architecture.py   # or: npm run test:arch
npm run test:smoke
```

Release CI (`.github/workflows/release.yml`) builds **desktop** installers for Windows, macOS, and Linux only — **not Android**.

CLI guide (v1 quick start, command tree, exit codes, scripting): [`docs/CLI.md`](CLI.md).
