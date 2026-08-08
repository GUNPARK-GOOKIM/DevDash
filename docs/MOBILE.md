# DevDash Mobile

DevDash Mobile is the **third first-class client**, alongside Desktop and CLI. It is not a resized desktop window. It is a touch-first React shell that calls the **same Rust engine** in `src-tauri/src/db/*`.

There is no DevDash cloud. Every core capability is designed to work **offline-first** on the device: connection catalog, keyring secrets, query execution against local engines (SQLite / DuckDB / `:memory:`), history, snapshots, Safe Mode, and optional local AI (Ollama). Remote servers (Postgres, MySQL, …) still need a network path to **that database**, not to us.

## What shipped in this pass

| Area | Behavior |
|------|----------|
| UI | Dedicated `src/mobile/MobileApp.tsx` — Connect, Schema, Query, Assist, More |
| Engine | Identical `db::*` path as Desktop IPC and `devdash` CLI |
| Catalog | `$DEVDASH_CONFIG_DIR/connections.json` is the connection SSOT |
| Secrets | OS keyring service `devdash_app` (same as Desktop/CLI) |
| Sync | Optional AES-256-GCM bundles (`.ddsync`); conflict-aware merge |
| Packaging | Touch UI in the Tauri window today. Native Play Store / App Store APKs are **not** in CI yet |

## How to try it

From a clone:

```bash
npm install
npm run tauri dev
```

Then either:

1. Shrink the window below 768px width, or
2. Open with `?mobile=1` (or set `localStorage.devdash_force_mobile = "1"`).

Window minimum size is 360×560 so the mobile shell is actually usable.

Core workflows on device:

1. **Connect** — add a connection (saved to the shared catalog + keyring).
2. **Schema** — browse tables/columns; preview 50 rows.
3. **Query** — run SQL with the same Safe Mode gate as Desktop/CLI.
4. **Assist** — schema-aware text-to-SQL (`generate_sql_assist`), diagnostics, local snapshots.
5. **More** — history, E2E sync export/import, AI settings.

## Offline-first (honest)

Works without internet:

- Local catalog, device identity, AppStorage (history / snapshots / saved queries)
- SQLite and DuckDB file / memory databases
- Safe Mode, staging rules in the engine, diagnostics against a local engine
- AI via **Ollama on localhost** (no cloud key required)

Needs a network hop *to the database* (not to DevDash):

- Postgres, MySQL, MSSQL, Redis, Mongo, … hosted elsewhere

Needs a network hop *you opted into*:

- Cloud LLM providers (OpenAI / Claude / …)
- Copying a sync bundle to another device (AirDrop, USB, shared folder — you choose)

## Shared core (single source of truth)

```
MobileApp.tsx  ──┐
Desktop App    ──┼── tauriBridge.ts ── commands.rs ── db/*
devdash CLI    ──┘                              │
                                                ├─ connection_catalog.rs
                                                ├─ device_sync.rs
                                                ├─ executor / pool / duckdb
                                                ├─ safe_mode / diagnostics / ai_assist
                                                └─ AppStorage + OS keyring
```

Do **not** reimplement query execution, safety analysis, diagnostics, or AI prompt construction in TypeScript. Add it once under `src-tauri/src/db/` and expose it.

Connection metadata lives in `connections.json`. Passwords never do. Desktop still keeps a localStorage cache for the GUI session and upserts into the catalog when you connect; Mobile and CLI read the catalog directly.

## Optional device sync

Sync is **opt-in**. Nothing phones home.

```bash
devdash sync status
devdash sync export -o ~/Desktop/devdash.ddsync --passphrase 'correct horse battery'
devdash sync import -f ~/Desktop/devdash.ddsync --passphrase 'correct horse battery'
```

`--include-secrets` copies keyring passwords *inside* the encrypted payload. Default is metadata only; the other device prompts or uses its own keyring.

Properties:

| Property | Implementation |
|----------|----------------|
| E2E encryption | AES-256-GCM, PBKDF2-HMAC-SHA256 (100k), same helpers as the vault |
| Conflict-aware | Last-write-wins on `updated_at`; **equal timestamps keep local** |
| Name clash | Same name, different id → keep both; rename incoming `name (device)` |
| Deletes | Import never deletes local rows (offline-first ownership) |
| Snapshots | Row bodies stay on the capturing device; history + saved queries merge |

Mobile **More → Device sync** uses the same `device_sync_*` IPC. Passphrase must be ≥ 8 characters. Env fallback: `DEVDASH_SYNC_PASS` (then `DEVDASH_VAULT_PASS`).

Device identity is `$DEVDASH_CONFIG_DIR/device.json` (stable UUID + hostname).

## Native Android / iOS packaging (not v1)

Tauri 2 can target mobile, but this repo bundles **DuckDB (C++)**, **ssh2**, and **OpenSSL**. A green Android NDK CI job is a separate engineering track (NDK versions, linker flags, store signing). We are not shipping a broken APK workflow.

When that lands, it should consume this same `db::*` crate and this same `src/mobile` UI — not a rewrite.

## What was replaced

An earlier experiment wrapped the desktop `App` in CSS chrome (`MobileViewport` + `MobileDrawer`) and a long “drop native mobile” strategy memo. That was the wrong product: the bottom nav did not drive first-class screens, and the memo argued against building this client.

Those wrappers are now chrome for `MobileApp`, and [`DISTRIBUTION_AND_MOBILE_STRATEGY.md`](DISTRIBUTION_AND_MOBILE_STRATEGY.md) points here.

## Related

- [CLI guide](CLI.md) — `devdash sync`, catalog, exit codes
- [Architecture](ARCHITECTURE.md)
- [Root README](../README.md)
