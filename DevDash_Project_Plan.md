# DevDash — Project Plan (v2, corrected)
*A fast, free, open-source database GUI client with project-aware saved queries*

> **Changelog from v1:** fixed a conceptual error (git-branch tagging didn't make sense — changed to per-project), added credential security, primary-key/read-only handling, staged-edit pattern, row pagination, a realistic timeline, and a non-blocking two-person split. Patterns below are cross-checked against how Beekeeper Studio (a real, mature open-source competitor) actually handles the hard parts.

---

## 1. Product Vision

TablePlus is loved for being fast and native, but it caps free users at 2 tabs/windows and costs $89+ for a lifetime license. DBeaver is free but Java-based and heavier. Beekeeper Studio is free, well-built, and open source — but its free tier still gates cloud sync, AI query assistance, and team features behind a paid license, and it's Electron-based (heavier than a native app).

DevDash's actual differentiation: **fully free, genuinely native-feeling (Tauri, not Electron), with saved queries scoped to the project you're in** — a smaller, honest niche rather than a claim that "nobody's built anything like this."

---

## 2. Tech Stack (and why)

| Layer | Choice | Why |
|---|---|---|
| App shell | **Tauri** (Rust core + web frontend) | Produces small, fast, native-feeling binaries — directly solves the "Electron is heavy" complaint. Rust backend also gives real low-level DB driver performance. |
| Frontend UI | **React + TypeScript** | Familiar, huge ecosystem, works cleanly inside Tauri's webview. |
| Styling | **Tailwind CSS** | Fast to build clean UI without fighting CSS from scratch. |
| DB drivers | **Rust crates**: `sqlx` (Postgres/MySQL/SQLite, async, compile-time checked queries) | One consistent driver layer across DB types, native performance. |
| App's own local storage (saved queries, settings, connection profiles) | **SQLite** (bundled, via `sqlx`) | No separate server needed — the app manages its own tiny local DB. |
| Project awareness | *(none needed)* — just store the folder path the user selects | The earlier plan pulled in `git2` for branch detection, but since queries are scoped to project (folder), not branch, no git dependency is needed at all — one less library, one less thing to learn. |
| SQL editor component | **CodeMirror 6** | Best-in-class embeddable code editor with SQL syntax highlighting, used by many similar tools. |
| Credential storage | **`keyring` Rust crate** (wraps OS Keychain / Credential Manager / Secret Service) | Never store raw DB passwords in our own SQLite file — use the same OS-level secure storage TablePlus/DBeaver rely on. |
| Large result rendering | **`@tanstack/react-virtual`** | Renders only visible rows in the grid, so a 10k+ row table doesn't lock up the UI. Beekeeper Studio instead solves this by paginating results (page size 100 by default) rather than rendering everything at once — we can do either, but virtualization or pagination must be *explicitly chosen*, not left implicit. |
| Packaging/distribution | **Tauri's built-in bundler** (produces .dmg / .msi / .AppImage) | Cross-platform builds from one codebase. |

**Why not Electron:** it's the default choice and would be easier short-term, but the entire differentiation of this project is "feels native, not heavy" — building it in Electron would undercut the core pitch. Tauri is a genuinely valuable new skill for you both (Rust + modern desktop app architecture) and is becoming an industry-standard choice for this exact reason.

---

## 3. PRD (Product Requirements Document)

### 3.1 Target user
Student and hobbyist developers, and small teams, who want a fast local database GUI without paying $89+ or dealing with a heavy Java/Electron app.

### 3.2 Core user stories (MVP)
1. As a developer, I can add a connection to a Postgres/MySQL/SQLite database and see it in a sidebar.
2. As a developer, I can browse tables, see columns/types, and view rows in a paginated grid.
3. As a developer, I can click a cell and edit its value; the change is **staged** (not written immediately), and I explicitly click "Apply" to commit staged changes in one transaction — matching how Beekeeper Studio handles this, so a stray click doesn't silently mutate data.
4. As a developer, I can open a SQL editor tab, write a query, run it, and see results in a grid.
5. As a developer, I can save a query with a name so I can run it again later.
6. As a developer, when I open DevDash inside a folder that has a saved connection tied to it, my saved queries for *that project* are shown first — this is **per-project (per folder path), not per-git-branch**, since a database schema belongs to the project as a whole, not to whichever branch happens to be checked out.
7. As a developer, I can export query results to CSV or JSON.

### 3.3 Row editing rules (previously glossed over)
- A table **must have a single-column primary key** to be editable in v1.
- Tables with **no primary key** are shown **read-only**, with a visible message explaining why — never silently guess which row to update.
- Tables with **composite (multi-column) primary keys** are also read-only in v1 — this is a known hard edge case (Beekeeper Studio itself didn't support it for years) and is explicitly deferred to a stretch feature.
- SQLite tables without a declared primary key can still use SQLite's internal `rowid` for editing, since SQLite guarantees one exists — this is a SQLite-specific exception, not a general solution.

### 3.4 Explicit non-goals (v1)
- No cloud sync (skip entirely for now — real complexity, not core to the pitch)
- No MongoDB/Redis/NoSQL support in v1 — Postgres + MySQL + SQLite only
- No user accounts/auth system — this is a local desktop tool
- No ER diagram view in v1 (nice-to-have, phase 3)
- No editing of tables with composite primary keys (see above)

### 3.5 Success criteria
- App launches in under 1 second (validates the "native feel" pitch)
- Can connect to a real Postgres DB, browse a 10k-row table without the UI freezing (via pagination or virtualization — see tech stack)
- Project-aware query filtering correctly shows the right saved queries when opening different project folders
- No plaintext DB passwords ever touch disk outside the OS keychain

---

## 4. UI/UX Plan

### Screens
1. **Connection sidebar** (left, always visible) — list of saved DB connections, click to expand tables
2. **Main content area** (tabs across the top, like a browser) —
   - **Table view tab**: spreadsheet-like grid, click cell to edit, filter bar at top
   - **Query editor tab**: CodeMirror SQL editor on top, results grid below, "Run" button (Cmd/Ctrl+Enter)
3. **Saved queries panel** (right sidebar, collapsible) — shows queries relevant to current git branch/project at the top, with an option to "show all queries" below a divider
4. **Status bar** (bottom) — shows current project folder name so the project-awareness feature is visible, not hidden magic

### Design direction
- Dark mode as default (not an afterthought — a stated improvement over competitors)
- Minimal chrome, generous spacing, monospace font in grids/editor for alignment
- Fast keyboard shortcuts (Cmd+T new tab, Cmd+Enter run query, Cmd+K command palette for quick table search) — matches the "fast" positioning

---

## 5. Implementation Plan (Phased)

### Phase 0 — Setup (both, vibe-coded via AI assistant)
- Scaffold Tauri + React + TypeScript project (use the starter prompt in section 7)
- Get a basic window rendering with Tailwind working
- Set up SQLite for app's own local storage (connections, saved queries — **not** credentials)

### Phase 1 — Connect + Browse (Akshat: backend commands)
- Rust command: connect to Postgres/MySQL/SQLite via `sqlx`
- Store credentials via the `keyring` crate — never in our own SQLite file
- List tables, list columns/types, identify primary key (single-column, composite, or none)
- Fetch rows with pagination (page size ~100), expose to frontend via Tauri commands
- Staged-edit backend logic: hold pending changes, commit all together on "Apply," discard on "Reset"

### Phase 2 — Frontend Build-out (Rishi: all UI)
- Connection sidebar + table grid (virtualized)
- CodeMirror 6 SQL editor + results display
- Saved queries panel, project-aware filtering
- Staged-edit UI (pending-change indicators, Apply/Reset)

### Phase 3 — Integration (both together)
- Wire frontend calls to Akshat's Tauri commands
- Cross-test: does staged editing interact correctly with the query editor's own writes?
- Debug together — this is where reviewing the AI-generated code closely matters most

### Phase 4 — Polish (both)
- CSV/JSON export
- Dark mode theming pass
- Command palette (Cmd+K)
- Packaging/build for macOS + Windows + Linux

---

## 6. Two-Person Split (vibe-coded, vertical, non-blocking)

> **Note:** Since this will be vibe-coded (AI-assisted) rather than hand-written line by line, the earlier "learn Rust fundamentals first" phase (Phase 0) is no longer a hard requirement — you'll still want to *read and understand* what's generated well enough to debug it, but the multi-week ramp-up can compress significantly. Keep reviewing generated code critically rather than accepting it blindly, especially around the credential storage and staged-edit logic, since those are the two places a subtle AI mistake could actually corrupt data or leak a password.

**Akshat — Backend (Connect, Browse, Edit, Query Engine)**
- `sqlx` connection handling + `keyring` credential storage
- Table/column/primary-key introspection (including read-only fallback logic)
- Paginated row fetching + staged-edit backend commands (stage → apply/reset)
- Query execution engine (runs arbitrary SQL, returns results/errors)
- Saved-query storage (name + SQL + project folder path) in local SQLite

**Rishi — Frontend (Everything UI)**
- Tauri app shell + React/TypeScript structure + Tailwind styling
- Connection sidebar, table grid (with `@tanstack/react-virtual` for large results)
- CodeMirror 6 SQL editor integration
- Saved-queries panel with project-aware filtering (current project first, "show all" toggle)
- Staged-edit UI (visual indication of pending changes, Apply/Reset buttons)
- Dark mode, command palette (Cmd+K), overall polish
- Packaging/builds for macOS + Windows + Linux

**Balance check:** Akshat's slice is more logic-heavy but narrower in surface area (a handful of Rust commands); Rishi's slice touches far more surface area (every screen, every interaction) but leans on well-trodden React patterns. This is a reasonably even split in total effort, just different *kinds* of effort — data/logic correctness vs. UI breadth and polish.

Both: integration testing (Phase 3), README/docs, deciding together on the staged-edit UX so backend state and frontend display stay in sync.

---

## 7. Starter Prompt (for use with an AI coding assistant like Claude Code)

Use this to scaffold the initial project skeleton — then take over writing the actual logic yourselves, since the goal is to learn, not to have it fully generated.

```
Before doing ANYTHING else — before writing any code, before scaffolding,
before any explanation — ask me exactly this: "Who are you — Akshat or
Rishi?" Wait for my answer before proceeding with anything.

I'm building a desktop app called DevDash: a free, open-source alternative
to TablePlus (a database GUI client). Tech stack: Tauri (Rust backend) +
React + TypeScript frontend + Tailwind CSS, using the sqlx crate for
Postgres/MySQL/SQLite connections, the keyring crate for secure credential
storage, and @tanstack/react-virtual for rendering large result sets.

For inspiration/reference on how a mature open-source project solves the
hard parts, you can look at these existing free/open-source database
clients (do not copy their code or branding — just take architectural
inspiration for patterns like staged edits, primary-key handling, and
pagination):
- Beekeeper Studio (github.com/beekeeper-studio/beekeeper-studio) — staged
  edits before commit, primary-key/read-only handling, pagination defaults
- DBeaver (github.com/dbeaver/dbeaver) — broad database driver support
  patterns
- Bruno (github.com/usebruno/bruno) — example of a fast, non-Electron-style
  local-first developer tool done well

Once I've told you who I am:

- If I say Akshat: only work on the BACKEND. That means: sqlx connection
  handling for Postgres/MySQL/SQLite, keyring-based credential storage,
  table/column/primary-key introspection (including read-only fallback for
  tables with no usable primary key), paginated row fetching, staged-edit
  backend commands (stage changes, then commit all together on "Apply" or
  discard on "Reset"), and the query execution engine. Do NOT touch any
  React/UI/frontend code.

- If I say Rishi: only work on the FRONTEND. That means: the Tauri app
  shell, React/TypeScript structure, Tailwind styling, the connection
  sidebar, the virtualized table grid, the CodeMirror 6 SQL editor, the
  saved-queries panel with project-aware filtering, the staged-edit UI
  (pending-change indicators, Apply/Reset buttons), dark mode, the command
  palette, and packaging. Do NOT touch any Rust/backend logic.

Stick strictly to whichever role I confirm — don't offer to help with the
other person's half, don't suggest restructuring the split, and don't do
extra scaffolding beyond what's asked for the current step. Just do
exactly what's requested, one step at a time.
```

---

## 8. Stretch Features (post-MVP)
- Support editing tables with composite primary keys (deferred from v1 — genuinely hard)
- ER diagram view of table relationships
- Query history (not just manually saved queries)
- Basic MongoDB/Redis support
- Simple schema diff/compare between two connections
- SSH tunneling for connecting to remote/production databases securely
