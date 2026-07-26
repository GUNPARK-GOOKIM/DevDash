# DevDash ⚡

> **Fast, open-source native database GUI client with project-aware query workflows and TablePlus-grade ergonomics.**

*Note: For the latest feature progress and comparative gap analysis with Beekeeper Studio and Antares SQL, see [PROGRESS.md](file:///e:/devdash/PROGRESS.md).*

---

## 📸 Interface Screenshots

![TablePlus Data Grid & Cell Inspector](docs/images/table_grid.png)

![14-Dialect Database Selector Dropdown](docs/images/dialect_selector.png)

![CodeMirror 6 SQL Editor with Beautifier](docs/images/sql_editor.png)

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run in frontend dev mode (Vite live reload)
npm run dev

# 3. Build production bundle
npm run build
```

---

## 🎯 Keyboard Shortcuts (Zero Mouse Required)

| Shortcut | Action |
|---|---|
| `Cmd + K` / `Ctrl + K` | Open Global Command Palette (tables, connections, queries) |
| `Cmd + Enter` / `Ctrl + Enter` | Run SQL query in CodeMirror 6 editor |
| `Single Click Cell` | Select cell for inspection in right drawer |
| `Double Click Cell` | Edit cell value in Table Grid |
| `Esc` | Cancel modal / close active dialog |

---

## ⚡ Comprehensive Feature Suite

### Phase 1: Core Engine & GUI Foundation
- **TablePlus-Grade Layout**: Left sidebar connection explorer, tabs top, virtualized grid center, SQL editor bottom. Zero relearning curve.
- **Multi-Engine Support**: PostgreSQL, MySQL, MariaDB, SQLite, Microsoft SQL Server (`tiberius`), CockroachDB, Amazon Redshift.
- **Safe Mode Protection**: Mandatory typed confirmation dialog (`CONFIRM`) before executing destructive queries (`DROP`, `TRUNCATE`, `DELETE`/`UPDATE` without `WHERE`).
- **Atomic Staged Edits**: Multi-cell inline edits with a side-by-side diff review modal before committing. Automatic rollback on failure.
- **OS Keychain Security**: Passwords stored directly in macOS Keychain, Windows Credential Manager, or Linux Secret Service via `keyring`. Zero plain-text credentials.
- **Project-Aware Saved Queries**: Saved queries automatically scope to your active project workspace folder path.
- **Virtualized Grid**: 60fps smooth scrolling for 100,000+ rows using `@tanstack/react-virtual`.

### Phase 2: Power-User Niche Suite
- **Visual Quick Filter & Sort (`FilterBar.tsx`)**: TablePlus-style visual filter bar (`[Column] [Operator] [Value]`) and instant sorting.
- **Structure & DDL Inspector (`StructureView.tsx`)**: Data Grid vs. Structure mode switcher for column types, nullability, keys, and DDL column additions/drops.
- **Interactive ER Diagram Map (`ErDiagramModal.tsx`)**: Visual node-graph map of database tables and schema structures.
- **Query History Log Panel (`QueryHistory.tsx`)**: Collapsible panel tracking all executed queries with execution time, status, and click-to-rerun.
- **Data Export & Import (`ExportModal.tsx` & `ImportModal.tsx`)**: UI for exporting/importing table data via CSV, JSON, or SQL dump formats.
- **Formatted JSON / JSONB Cell Viewer (`JsonViewerModal.tsx`)**: Specialized formatted inspector for complex JSON columns with 1-click copy.
- **Right-Side Cell Inspector Drawer (`CellInspectorPanel.tsx`)**: TablePlus-style right drawer for inspecting raw multi-line values, text length, and data types.

### Phase 3: DB Admin & Performance Suite
- **Process Activity Monitor (`ProcessManagerModal.tsx`)**: Active server connection list with query state, PID, client IP, and 1-click process termination.
- **SQL Execution Plan Visualizer (`ExplainVisualizerModal.tsx`)**: Interactive node-graph breakdown of query costs and index scans (`EXPLAIN ANALYZE`).

### Phase 4: Visual Redesign (TablePlus Parity + Enhancements)
- **TablePlus Color System**: Custom base background (`#0F0F10`), surface (`#1A1A1C`), card/hover (`#222224`), borders, text, and accent colors defined globally.
- **Backdrop-Filter Sidebar**: Frosted-glass sidebar (12px blur, 85% opacity) with a subtle inner right border.
- **Bento Card Panel Separation**: Sections (connections, tables, saved queries) sit in subtle card frames with 8px radius and low-contrast borders.
- **Row Hover & Selection**: 120ms background transitions on hover, selected row highlighted with 2px indigo accent left border and soft highlight.
- **Tab Bar Overhaul**: Pill-shaped active tabs, 50% opacity inactive tabs, and close buttons that appear on hover.
- **Status Bar & Short Cut Hints**: Compact, single-line footer with status dot, latency, shortcuts, and darker background shift.
- **Outline Focus Rings**: Global custom focus ring overrides (2px solid `#6366F1` at 50% opacity, 2px offset) to replace browser default outlines.
- **Randomized Skeleton Loading**: Skeleton rows with pseudo-random widths between 40-90% and shimmer gradient animation.
- **Visual Empty States**: Custom database cylinder SVG illustrations centered with muted labels for empty tables and queries.
- **Draggable Resizable Editor**: Draggable divider between CodeMirror SQL editor and results grid, with 6px grab zone and custom row-resize cursor.
- **Run Query Click Spinner**: 150ms spinner animation inside the Run button on click or Ctrl+Enter.
- **Explain Plan Validations**: Automatically disables Explain button with custom tooltip explanation on non-SELECT queries.
- **Debounced Dual Filter**: Real-time sidebar query filter that matches both connection and table names simultaneously, with 30% opacity on mismatches.
- **Pulsing Status Indicators**: 3px connection status dots with pulsing yellow reconnecting states.
- **Custom Tooltip Engine**: General custom tooltips showing keyboard shortcuts with a 600ms hover delay.
- **Tab Overflow Dropdown**: Chevron tab selector dropdown for managing multiple open tabs.
- **Tauri Query Cancellation**: Spawns queries inside async tokio tasks that can be cancelled/aborted mid-flight via IPC.
- **14 TablePlus Database Dialects**: Complete support for PostgreSQL, MySQL, MariaDB, SQLite, MSSQL, CockroachDB, Redshift, Snowflake, Oracle, ClickHouse, DuckDB, Redis, MongoDB, and Cassandra across editor and connection modal.
- **Format SQL (Query Beautifier)**: 1-click SQL formatting (`Cmd+I`) that auto-indents and formats SQL statements.
- **Read-Only Connection Mode**: Toggle switch per connection to protect production databases from accidental DDL or write queries.
- **SSH Tunneling Configuration**: Route database connection traffic through remote SSH bastion jump hosts.
- **1-Click DDL Exporter**: Generate and copy `CREATE TABLE` SQL definitions from Structure mode.
- **Reusable SQL Snippets**: Dropdown library of reusable SQL query templates (JOINs, batch inserts, DDL, indexes, upserts).
- **Mock Data Generator**: 1-click test row seeder for testing database table schemas.

---

## 📁 Clean Codebase Architecture

```text
devdash/
├── src-tauri/             # Rust Backend Engine
│   └── src/
│       ├── commands.rs    # Tauri IPC API Handlers
│       ├── lib.rs         # Tauri Runtime & State Builder
│       └── db/
│           ├── executor.rs        # Dynamic SQL Execution
│           ├── introspection.rs   # Schema, Column & PK Reflection
│           ├── safe_mode.rs       # Destructive Query Analyzer
│           ├── staged_edits.rs    # Transactional Batch Updates
│           ├── export.rs          # CSV, JSON & SQL Dump Parsers
│           ├── app_storage.rs     # Embedded SQLite Saved Queries
│           ├── pool.rs            # Connection Pool Manager
│           └── credentials.rs     # OS Keychain Secrets Vault
│
└── src/                   # React + TypeScript Frontend
    ├── App.tsx            # Main Application Shell & State
    ├── types.ts           # Shared TypeScript Interfaces
    └── components/
        ├── Sidebar.tsx                # Connections & Table Explorer
        ├── TableGrid.tsx              # Virtualized 60fps Result Grid
        ├── SqlEditor.tsx              # CodeMirror 6 SQL Editor
        ├── FilterBar.tsx              # Visual Quick Filter & Sort Builder
        ├── StructureView.tsx          # Table DDL & Schema Inspector
        ├── CellInspectorPanel.tsx     # Right-Side Cell Inspector Drawer
        ├── DiffModal.tsx              # Staged Edit Review Dialog
        ├── SafeModeModal.tsx          # Destructive Protection Dialog
        ├── ErDiagramModal.tsx         # Interactive Schema ER Map
        ├── ExportModal.tsx            # CSV / JSON / SQL Dump Export Modal
        ├── ImportModal.tsx            # Data File Upload & Import Modal
        ├── JsonViewerModal.tsx        # Formatted JSON/JSONB Cell Inspector
        ├── ProcessManagerModal.tsx    # Active Connection & PID Activity Monitor
        ├── ExplainVisualizerModal.tsx # SQL Execution Plan Tree Diagram
        ├── QueryHistory.tsx           # SQL Execution Log Panel
        ├── CommandPalette.tsx         # Cmd+K Global Search
        ├── SavedQueries.tsx           # Project-Aware Saved Queries
        └── ConnectionModal.tsx        # Connection Configuration Dialog
```

---

## 🧪 Running Tests

```bash
# Run Rust backend unit tests (19 tests)
cd src-tauri
cargo test
```

---

## 📄 License

Open Source — MIT License.
