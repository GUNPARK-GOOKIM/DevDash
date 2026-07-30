# DevDash — Systems Architecture & Design Specification

> **Version:** 1.0.0 (Authoritative)  
> **Status:** Canonical Platform Architecture & Layering Rules  
> **License:** MIT  

---

## 1. System Architecture Overview

DevDash is an ultra-fast, local-first native desktop database engineering workspace built on a decoupled **Tauri v2 + Rust Engine** core and a high-performance **React 18 + TypeScript** frontend.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   DevDash Desktop Application                          │
├────────────────────────────────────────────────────────────────────────┤
│  Frontend View Layer (React 18 + Tailwind CSS + Framer Motion)         │
│  - Virtualized Data Grid (@tanstack/react-virtual)                     │
│  - Monaco / CodeMirror 6 SQL Editor & Auto-complete                    │
│  - Recharts Bento Health Telemetry & React Flow ERD Diagram            │
│  - Local AI Bar (Ollama / Qwen2.5-Coder / Claude / OpenAI Bridge)       │
├────────────────────────────────────────────────────────────────────────┤
│                 Typed Asynchronous Tauri IPC Bridge                    │
│                 (src/services/tauriBridge.ts)                          │
├────────────────────────────────────────────────────────────────────────┤
│  Backend Core Engine (Rust Native Workspace)                           │
│  - pool.rs           : sqlx::AnyPool Multi-Driver Connection Manager   │
│  - executor.rs       : Chunked 500-Row Streamer & Query Canceller      │
│  - staged_edits.rs   : Atomic Batch Edit Compiler & Transaction Rollback│
│  - introspection.rs  : Schema Constraints, PK/FK & Routine Parser     │
│  - ssh_tunnel.rs     : Thread-Safe Native ssh2 Port Forwarding Daemon  │
│  - audit.rs          : Append-Only SOC2/HIPAA JSONL Audit Engine       │
│  - app_storage.rs    : OS Keyring Isolation & Local SQLite Preferences │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Hard Architecture & Layering Rules

1. **Strict UI/Engine Decoupling**: React view components in `src/components/` MUST NOT invoke direct window bindings or raw IPC strings. All backend communication MUST route through typed helper functions in `src/services/tauriBridge.ts`.
2. **Memory Safety & Streaming Guarantee**: Datasets containing >500 rows MUST be streamed over IPC in 500-row chunk events (`query_chunk_{id}`) via `executor.rs` to maintain a memory footprint of **<25MB RAM** and 60fps UI virtualized rendering.
3. **Atomic Transactional Staging**: No data mutation (`UPDATE`, `DELETE`, `INSERT`) touches production databases directly from grid clicks. Edits are staged as color-coded cell diffs (`old_value → new_value`) and compiled into parameterized SQL batch transactions (`BEGIN ... COMMIT / ROLLBACK`) inside `staged_edits.rs`.
4. **Destructive Query Shield (Safe Mode)**: Destructive SQL operations (`DROP`, `TRUNCATE`, or un-bounded `UPDATE`/`DELETE` without `WHERE`) MUST be intercepted by `executor.rs` safe-mode analyzer before reaching database pools.
5. **Credentials Isolation**: Connection passwords and secret keys MUST NEVER be stored in plain text on disk. They MUST be stored in native OS Keyrings via the `keyring` crate or encrypted using AES-256-GCM (`encrypted_export.rs`).

---

## 3. Database Driver Support Matrix & Scope Definitions

To maintain **100% Scope Honesty & Documentation Accuracy**, DevDash strictly classifies database engine support into two categories:

### A. Production-Verified Native Drivers (`sqlx::AnyPool`)
- **PostgreSQL** (v9.6+) & **CockroachDB** & **Amazon Redshift**
- **MySQL** (v5.7, v8.0+) & **MariaDB** (v10.3+)
- **SQLite 3** (v3.25+)
- **YugabyteDB**

### B. Specialized & Protocol Adapters
- **Microsoft SQL Server (T-SQL)** (TDS TCP Driver)
- **Redis / KeyDB / Dragonfly** (Redis RESP Protocol Viewport)
- **MongoDB / DocumentDB** (BSON Document Collection Viewport)
- **Cloud IAM Engines** (AWS STS, GCP Service Account, Azure AD OAuth2)

---

## 4. Compliance & Audit Logging Engine (`audit.rs`)

DevDash includes a native Rust append-only audit trail logger satisfying **SOC2 Type II** and **HIPAA** compliance criteria:

- **Log File Location**: `%APPDATA%/devdash/audit_log.jsonl`
- **Recorded Fields**:
  - `timestamp`: ISO-8601 UTC string
  - `connection_id` & `connection_name`
  - `user_identity` & `client_ip`
  - `operation_type`: `QUERY`, `EXECUTE`, `STAGE_COMMIT`, `EXPORT`, `SCHEMA_ALTER`
  - `executed_sql`: Sanitized query string
  - `affected_rows` & `execution_duration_ms`

---

## 5. Automated Verification & Testing Strategy

```bash
# 1. Frontend Type Safety Verification
npx tsc --noEmit

# 2. Rust Backend Unit & Integration Test Suite
cd src-tauri && cargo test

# 3. Layer Dependency & Architecture Audit
python scripts/check-architecture.py

# 4. Production Release Build Verification
npm run build && npm run tauri build
```
