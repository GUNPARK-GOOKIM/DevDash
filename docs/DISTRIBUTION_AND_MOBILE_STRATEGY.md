# Distribution and mobile

This file used to be a long channel-comparison memo that recommended **not** building native mobile. That is no longer the product direction.

**DevDash Mobile is a first-class client.** See [`MOBILE.md`](MOBILE.md) for the actual architecture, offline-first rules, and optional E2E sync.

## What we ship today

| Channel | Status |
|---------|--------|
| Desktop installers (Windows / macOS / Linux) | Release CI when published |
| DevDash CLI (`devdash`) | Same Rust engine; `docs/CLI.md` |
| DevDash Mobile (touch UI in the Tauri app) | Dedicated `src/mobile` shell; shrink window or `?mobile=1` |
| Native Play Store / App Store packages | **Not in CI** — DuckDB/ssh2 NDK work is a follow-up, not a CSS wrap |

## Sync between clients

Optional, user-copied, AES-256-GCM bundles. No DevDash cloud.

```bash
devdash sync export -o bundle.ddsync --passphrase '…'
devdash sync import -f bundle.ddsync --passphrase '…'
```

Details: [`MOBILE.md`](MOBILE.md#optional-device-sync).
