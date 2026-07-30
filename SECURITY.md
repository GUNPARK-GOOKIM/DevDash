# Security Policy

## 🛡️ Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## 🔒 Reporting a Vulnerability

The DevDash core team takes the security of our application and users very seriously.

If you discover a security vulnerability in DevDash (e.g. credential exposure, SQL injection vectors, or IPC sandbox escape):

1. **Do NOT open a public GitHub issue**.
2. Please report the vulnerability privately via security contact or by emailing the project maintainers directly.
3. Include detailed steps to reproduce the issue along with proof-of-concept code where applicable.

We will respond to your report within **24 hours** and provide periodic updates regarding patch deployment.

---

## 🔐 Security Features in DevDash

- **Native OS Keyring Isolation**: Database credentials are saved securely in native system keyrings (`keyring` Rust crate) rather than plain-text configuration files.
- **Passphrase-Protected AES-256-GCM Encrypted Backups**: Configuration backups are encrypted using authenticated AES-256-GCM payloads.
- **Safe Mode Destructive Query Shield**: Destructive SQL queries (`DROP`, `TRUNCATE`, un-bounded `UPDATE`/`DELETE`) trigger mandatory user confirmation dialogs before execution.
- **SOC2 & HIPAA Audit Trail**: All database queries and administrative actions are logged to an append-only `audit_log.jsonl` file.
