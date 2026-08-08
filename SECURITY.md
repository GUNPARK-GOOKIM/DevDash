# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x / 1.0.x (current app) | Yes (best-effort) |
| Unreleased / untagged builds | Use at your own risk |

## Reporting a Vulnerability

If you discover a security vulnerability in DevDash (credential exposure, SQL injection in app-generated SQL, IPC issues):

1. **Do not open a public GitHub issue** for unfixed vulnerabilities.
2. Report privately to the project maintainers.
3. Include steps to reproduce and impact.

Response time is best-effort (this is an open-source project, not a commercial SLA).

## Security Features (Implemented in Code)

| Feature | Reality |
| ------- | ------- |
| **OS keyring passwords** | Passwords saved via the `keyring` crate (`src-tauri/src/db/credentials.rs`), service `devdash_app`, not in plain text connection JSON. Shared by the GUI and the `devdash` CLI. |
| **Encrypted connection export** | Passphrase + PBKDF2 + AES-256-GCM (`encrypted_export.rs`). Text + real QR encode/decode (`src/utils/qrShare.ts`). Large multi-profile payloads may exceed QR capacity — text always works. |
| **Safe Mode** | Destructive SQL detection in `safe_mode.rs`; UI confirmation modal; server rejects destructive SQL unless `allow_destructive` is set after confirm (or Safe Mode is off). |
| **Connection read-only** | Stored on the pool; server blocks write/DDL SQL and mutation IPC. CLI honors the same flag and prod-env protection. |
| **DevDash CLI** | Same engine as the GUI. Catalog at `~/.config/devdash/connections.json` (no passwords). Use `--password` / `DEVDASH_PASSWORD` when keyring is unavailable. |
| **Local audit log** | Append-only JSONL under the user config dir (`audit.rs`). **Not** SOC 2, HIPAA, or any certified control. |

## What We Do **Not** Claim

- SOC 2 Type II, HIPAA, GDPR certification, or compliance product status  
- Tamper-proof or signed audit trails  
- Cloud IAM authentication  
- Perfect SQL injection immunity on every code path  
- Mobile/Android signed store distribution  

## Recommendation for Production Databases

Treat DevDash like any powerful database client: use least-privilege DB users, prefer read-only connections for production, enable Safe Mode, and do not paste production credentials into cloud LLM settings unless you accept that risk.
