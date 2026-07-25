# DevDash ⚡

> *A fast, free, open-source database GUI client with project-aware saved queries.*

![DevDash System Architecture](devdash_architecture.png)

DevDash is a modern, lightweight desktop application engineered as a high-performance alternative to TablePlus, DBeaver, and Beekeeper Studio. Built natively with **Tauri (Rust)** and **React + TypeScript**, it delivers instant startup times, low memory consumption, OS-level credential protection, and project-scoped query workflows.

---

## 🚀 Core Features

- 🟢 **Native Performance**: Small binary footprint (~15-20MB) & sub-second startup using Tauri & Rust.
- 🔑 **OS Credential Manager**: Passwords stored directly in macOS Keychain, Windows Credential Manager, or Linux Secret Service via `keyring`.
- 📁 **Project-Aware Queries**: Saved queries automatically scope to your active project folder directory path.
- ✏️ **Safe Staged Editing**: Cell modifications are staged locally and committed atomically via parameterized single-transaction updates.
- ⚡ **Virtualized Result Grids**: Handle 10,000+ rows smoothly with `@tanstack/react-virtual`.
- 📝 **CodeMirror 6 SQL Editor**: Modern code editing experience with syntax highlighting and instant execution shortcuts.

---

## 🏛️ System Architecture

```text
DevDash Desktop Client
├── 🎨 FRONTEND LAYER (React + TypeScript + Tailwind CSS)
│   ├── Connection Sidebar (Saved profiles & schema navigator)
│   ├── Virtualized Data Grid (@tanstack/react-virtual)
│   ├── CodeMirror 6 SQL Editor (Query execution & hotkeys)
│   └── Project Saved Queries Panel (Directory-filtered query store)
│
└── 🦀 BACKEND LAYER (Tauri 2.x + Rust)
    ├── Tauri IPC Command Bridge (commands.rs)
    ├── Connection Manager (sqlx::any::AnyPool)
    ├── Credential Manager (keyring OS Keychain integration)
    ├── Schema Introspection & Primary Key Guardrails
    ├── Transactional Staged Edit Executor
    └── App Internal Storage (Embedded SQLite devdash_internal.db)
```

---

## 📂 Repository Structure & Documentation

- [Backend Architecture & Module Spec (`BACKEND_README.md`)](BACKEND_README.md) — Detailed minimal backend module breakdown for Rust development.
- [DevDash Project Plan (`DevDash_Project_Plan.md`)](DevDash_Project_Plan.md) — Full product requirements document, UI plan, and technical specification.

---

## ⚙️ Stack Summary

| Component | Technology | Purpose |
|---|---|---|
| **App Shell** | Tauri 2.x (Rust) | Cross-platform desktop application container |
| **Backend Engine** | Rust (`sqlx::any`, `tokio`) | Async multi-DB driver engine (Postgres, MySQL, SQLite) |
| **Credential Manager** | `keyring` Rust Crate | OS-level secret vault isolation |
| **Frontend Framework** | React 18 + TypeScript + Vite | Modular UI component rendering |
| **Styling** | Tailwind CSS | Sleek dark-mode desktop interface |
| **SQL Editor** | CodeMirror 6 | Embeddable SQL editor with autocompletion |
| **Grid Virtualization** | `@tanstack/react-virtual` | High-performance result set rendering |

---

## 💻 Team Responsibilities

- **Akshat (Backend Lead)**: `sqlx::any` pool management, `keyring` credential security, schema introspection, staged edit transactions, dynamic query runner, and internal app SQLite store.
- **Rishi (Frontend Lead)**: Tauri UI shell, React/TypeScript components, Tailwind styling, CodeMirror 6 editor, virtualized data grid, staged edit UX, and project query panel.

---

## 📄 License

Open Source — MIT License.
