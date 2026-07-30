# Contributing to DevDash

Thank you for your interest in contributing to **DevDash**! We welcome contributions from developers of all skill levels.

---

## 🛠️ Development Setup

### Prerequisites
1. **Node.js** (v18.0 or higher)
2. **Rust Toolchain** (v1.75 or higher) with `cargo`
3. **Tauri CLI v2**

### Steps
1. Fork and clone the repository:
   ```bash
   git clone https://github.com/GUNPARK-GOOKIM/DevDash.git
   cd DevDash
   ```
2. Install frontend dependencies:
   ```bash
   npm install
   ```
3. Run the development environment:
   ```bash
   npm run dev
   ```

---

## 📋 Pull Request Process

1. Create a descriptive feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Ensure frontend type safety and architecture rules pass:
   ```bash
   npx tsc --noEmit
   python scripts/check-architecture.py
   ```
3. Commit your changes with clear commit messages following Conventional Commits (`feat:`, `fix:`, `docs:`).
4. Push to your fork and submit a Pull Request targeting the `main` branch.

---

## 📄 License
By contributing to DevDash, you agree that your contributions will be licensed under the project's **Apache License 2.0**.
