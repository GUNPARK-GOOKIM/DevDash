//! Optional, offline-first device sync for Desktop, CLI, and Mobile.
//!
//! Bundles are files (or ciphertext strings) the user copies however they like
//! (AirDrop, USB, shared folder, paste). There is no DevDash cloud.
//!
//! - Encryption: AES-256-GCM + PBKDF2-HMAC-SHA256 (same helpers as the vault).
//! - Conflict policy: last-write-wins by `updated_at`; equal timestamps keep local.
//! - Name collisions with different ids: keep both; rename the incoming copy.
//! - Secrets are omitted unless the user opts in (`include_secrets`).
//! - Snapshot *rows* stay local (too large / still useful on the capturing device).
//! - Local ownership: import never deletes local records.

use crate::db::app_storage::{AppStorage, QueryHistoryItem, SavedQueryItem};
use crate::db::connection_catalog::{
    load_catalog, save_catalog, CatalogConnection, ConnectionCatalog,
};
use crate::db::credentials;
use crate::db::encrypted_export::{decrypt_bytes, encrypt_bytes, EncryptedExportFile};
use crate::db::paths::{device_identity_path, ensure_config_dir, sync_export_dir};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub const SYNC_FORMAT: &str = "devdash.device_sync.v1";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeviceIdentity {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncBundle {
    pub format: String,
    pub exported_at: String,
    pub origin_device: DeviceIdentity,
    pub catalog: ConnectionCatalog,
    /// Passwords keyed by connection id. Empty unless export opted into secrets.
    #[serde(default)]
    pub secrets: HashMap<String, String>,
    #[serde(default)]
    pub saved_queries: Vec<SavedQueryItem>,
    #[serde(default)]
    pub history: Vec<QueryHistoryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConflictRecord {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub resolution: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct MergeReport {
    pub connections_added: usize,
    pub connections_updated: usize,
    pub connections_kept_local: usize,
    pub queries_upserted: usize,
    pub history_inserted: usize,
    pub secrets_imported: usize,
    pub conflicts: Vec<ConflictRecord>,
    pub origin_device_id: String,
    pub origin_device_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncStatus {
    pub device: DeviceIdentity,
    pub catalog_path: String,
    pub catalog_count: usize,
    pub default_connection: Option<String>,
    pub saved_query_count: usize,
    pub history_count: usize,
    pub last_export_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncExportReport {
    pub path: Option<String>,
    pub ciphertext: String,
    pub connection_count: usize,
    pub query_count: usize,
    pub history_count: usize,
    pub include_secrets: bool,
    pub origin_device: DeviceIdentity,
}

fn default_device_name() -> String {
    std::env::var("HOST")
        .or_else(|_| std::env::var("HOSTNAME"))
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "devdash-device".into())
}

pub fn ensure_device_identity(platform: &str) -> Result<DeviceIdentity, String> {
    ensure_config_dir()?;
    let path = device_identity_path();
    if path.exists() {
        let raw = fs::read_to_string(&path)
            .map_err(|e| format!("Read {}: {e}", path.display()))?;
        let mut id: DeviceIdentity = serde_json::from_str(&raw)
            .map_err(|e| format!("Invalid device identity {}: {e}", path.display()))?;
        if !platform.is_empty() && id.platform != platform {
            // Keep stable id; record the most recent client that opened it.
            id.platform = platform.to_string();
            let _ = save_device_identity(&id);
        }
        return Ok(id);
    }
    let id = DeviceIdentity {
        id: uuid::Uuid::new_v4().to_string(),
        name: default_device_name(),
        platform: if platform.is_empty() {
            "unknown".into()
        } else {
            platform.into()
        },
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    save_device_identity(&id)?;
    Ok(id)
}

fn save_device_identity(id: &DeviceIdentity) -> Result<(), String> {
    ensure_config_dir()?;
    let path = device_identity_path();
    let json = serde_json::to_string_pretty(id).map_err(|e| format!("Serialize device: {e}"))?;
    fs::write(&path, json + "\n").map_err(|e| format!("Write {}: {e}", path.display()))
}

/// True if `incoming` should replace `local` (strictly newer timestamp).
pub fn incoming_wins(local_updated: &str, incoming_updated: &str) -> bool {
    let local = local_updated.trim();
    let incoming = incoming_updated.trim();
    if incoming.is_empty() {
        return false;
    }
    if local.is_empty() {
        return true;
    }
    incoming > local
}

pub fn merge_catalog(
    local: &mut ConnectionCatalog,
    incoming: &ConnectionCatalog,
    incoming_device: &DeviceIdentity,
) -> (usize, usize, usize, Vec<ConflictRecord>) {
    let mut added = 0;
    let mut updated = 0;
    let mut kept = 0;
    let mut conflicts = Vec::new();

    for inc in &incoming.connections {
        if let Some(idx) = local.connections.iter().position(|c| c.id == inc.id) {
            let loc = &local.connections[idx];
            if incoming_wins(&loc.updated_at, &inc.updated_at) {
                conflicts.push(ConflictRecord {
                    kind: "connection".into(),
                    id: inc.id.clone(),
                    name: inc.name.clone(),
                    resolution: "took_incoming".into(),
                    reason: format!(
                        "incoming updated_at {} > local {}",
                        inc.updated_at, loc.updated_at
                    ),
                });
                local.connections[idx] = inc.clone();
                updated += 1;
            } else {
                kept += 1;
                if loc.updated_at == inc.updated_at && loc != inc {
                    conflicts.push(ConflictRecord {
                        kind: "connection".into(),
                        id: loc.id.clone(),
                        name: loc.name.clone(),
                        resolution: "kept_local".into(),
                        reason: "equal updated_at; offline-first keeps local".into(),
                    });
                }
            }
            continue;
        }

        // Same name, different id → keep both; rename incoming.
        if local
            .connections
            .iter()
            .any(|c| c.name.eq_ignore_ascii_case(&inc.name))
        {
            let mut renamed = inc.clone();
            let short: String = incoming_device
                .name
                .chars()
                .take(16)
                .collect();
            renamed.name = format!("{} ({})", inc.name, short);
            conflicts.push(ConflictRecord {
                kind: "connection".into(),
                id: renamed.id.clone(),
                name: renamed.name.clone(),
                resolution: "renamed_incoming".into(),
                reason: format!("name '{}' already exists with a different id", inc.name),
            });
            local.connections.push(renamed);
            added += 1;
            continue;
        }

        local.connections.push(inc.clone());
        added += 1;
    }

    if local.default.is_none() {
        local.default = incoming.default.clone();
    }

    (added, updated, kept, conflicts)
}

pub async fn build_bundle(
    storage: &AppStorage,
    include_secrets: bool,
    platform: &str,
) -> Result<SyncBundle, String> {
    let origin = ensure_device_identity(platform)?;
    let catalog = load_catalog()?;
    let mut secrets = HashMap::new();
    if include_secrets {
        for c in &catalog.connections {
            if let Ok(pw) = credentials::get_password(&c.id) {
                if !pw.is_empty() {
                    secrets.insert(c.id.clone(), pw);
                }
            }
        }
    }
    let saved_queries = storage.list_all_queries().await.unwrap_or_default();
    let history = storage.get_query_history(1, 500).await.unwrap_or_default();
    Ok(SyncBundle {
        format: SYNC_FORMAT.into(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        origin_device: origin,
        catalog,
        secrets,
        saved_queries,
        history,
    })
}

pub fn encrypt_bundle(bundle: &SyncBundle, passphrase: &str) -> Result<String, String> {
    if passphrase.trim().len() < 8 {
        return Err("Passphrase must be at least 8 characters".into());
    }
    let json = serde_json::to_vec(bundle).map_err(|e| format!("Serialize sync bundle: {e}"))?;
    let enc = encrypt_bytes(&json, passphrase)?;
    serde_json::to_string_pretty(&enc).map_err(|e| format!("Serialize ciphertext: {e}"))
}

pub fn decrypt_bundle(ciphertext: &str, passphrase: &str) -> Result<SyncBundle, String> {
    let enc: EncryptedExportFile = serde_json::from_str(ciphertext.trim())
        .map_err(|e| format!("Invalid sync ciphertext: {e}"))?;
    let bytes = decrypt_bytes(&enc, passphrase)?;
    let bundle: SyncBundle =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid sync bundle payload: {e}"))?;
    if bundle.format != SYNC_FORMAT {
        return Err(format!(
            "Unsupported sync format '{}'. Expected {SYNC_FORMAT}.",
            bundle.format
        ));
    }
    Ok(bundle)
}

pub async fn apply_bundle(
    storage: &AppStorage,
    bundle: &SyncBundle,
    import_secrets: bool,
) -> Result<MergeReport, String> {
    let mut catalog = load_catalog()?;
    let (added, updated, kept, conflicts) =
        merge_catalog(&mut catalog, &bundle.catalog, &bundle.origin_device);
    save_catalog(&catalog)?;

    let mut queries_upserted = 0;
    for q in &bundle.saved_queries {
        storage.upsert_saved_query(q).await?;
        queries_upserted += 1;
    }

    let mut history_inserted = 0;
    for h in &bundle.history {
        storage.upsert_query_history(h).await?;
        history_inserted += 1;
    }

    let mut secrets_imported = 0;
    if import_secrets {
        for (id, pw) in &bundle.secrets {
            if pw.is_empty() {
                continue;
            }
            // Do not overwrite an existing local secret (offline-first ownership).
            if credentials::get_password(id).is_ok() {
                continue;
            }
            if credentials::save_password(id, pw).is_ok() {
                secrets_imported += 1;
            }
        }
    }

    Ok(MergeReport {
        connections_added: added,
        connections_updated: updated,
        connections_kept_local: kept,
        queries_upserted,
        history_inserted,
        secrets_imported,
        conflicts,
        origin_device_id: bundle.origin_device.id.clone(),
        origin_device_name: bundle.origin_device.name.clone(),
    })
}

pub async fn export_to_path(
    storage: &AppStorage,
    path: &Path,
    passphrase: &str,
    include_secrets: bool,
    platform: &str,
) -> Result<SyncExportReport, String> {
    let bundle = build_bundle(storage, include_secrets, platform).await?;
    let ciphertext = encrypt_bundle(&bundle, passphrase)?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(path, ciphertext.as_bytes())
        .map_err(|e| format!("Write {}: {e}", path.display()))?;
    Ok(SyncExportReport {
        path: Some(path.display().to_string()),
        ciphertext,
        connection_count: bundle.catalog.connections.len(),
        query_count: bundle.saved_queries.len(),
        history_count: bundle.history.len(),
        include_secrets,
        origin_device: bundle.origin_device,
    })
}

pub async fn export_to_string(
    storage: &AppStorage,
    passphrase: &str,
    include_secrets: bool,
    platform: &str,
) -> Result<SyncExportReport, String> {
    let bundle = build_bundle(storage, include_secrets, platform).await?;
    let ciphertext = encrypt_bundle(&bundle, passphrase)?;
    Ok(SyncExportReport {
        path: None,
        ciphertext,
        connection_count: bundle.catalog.connections.len(),
        query_count: bundle.saved_queries.len(),
        history_count: bundle.history.len(),
        include_secrets,
        origin_device: bundle.origin_device,
    })
}

pub fn suggested_export_path() -> Result<std::path::PathBuf, String> {
    let dir = sync_export_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir {}: {e}", dir.display()))?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    Ok(dir.join(format!("devdash-sync-{stamp}.ddsync")))
}

pub async fn import_from_path(
    storage: &AppStorage,
    path: &Path,
    passphrase: &str,
    import_secrets: bool,
) -> Result<MergeReport, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("Read {}: {e}", path.display()))?;
    let bundle = decrypt_bundle(&raw, passphrase)?;
    apply_bundle(storage, &bundle, import_secrets).await
}

pub async fn import_from_string(
    storage: &AppStorage,
    ciphertext: &str,
    passphrase: &str,
    import_secrets: bool,
) -> Result<MergeReport, String> {
    let bundle = decrypt_bundle(ciphertext, passphrase)?;
    apply_bundle(storage, &bundle, import_secrets).await
}

pub async fn status(storage: &AppStorage, platform: &str) -> Result<SyncStatus, String> {
    let device = ensure_device_identity(platform)?;
    let catalog = load_catalog().unwrap_or_default();
    let queries = storage.list_all_queries().await.unwrap_or_default();
    let history = storage.get_query_history(1, 1).await.unwrap_or_default();
    let export_dir = sync_export_dir();
    let last_export_path = fs::read_dir(&export_dir)
        .ok()
        .and_then(|rd| {
            let mut files: Vec<_> = rd.filter_map(|e| e.ok()).collect();
            files.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
            files.pop().map(|e| e.path().display().to_string())
        });
    Ok(SyncStatus {
        device,
        catalog_path: crate::db::paths::connections_path().display().to_string(),
        catalog_count: catalog.connections.len(),
        default_connection: catalog.default,
        saved_query_count: queries.len(),
        history_count: if history.is_empty() { 0 } else { history.len() },
        last_export_path,
    })
}

/// Merge GUI-local connections (e.g. Desktop localStorage) into the shared catalog.
pub fn ingest_gui_connections(
    incoming: Vec<CatalogConnection>,
    device_id: &str,
) -> Result<MergeReport, String> {
    let mut catalog = load_catalog()?;
    let fake_device = DeviceIdentity {
        id: device_id.to_string(),
        name: "desktop".into(),
        platform: "desktop".into(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let mut incoming_cat = ConnectionCatalog::default();
    incoming_cat.connections = incoming
        .into_iter()
        .map(|mut c| {
            if c.updated_at.trim().is_empty() {
                c.touch(device_id);
            }
            c
        })
        .collect();
    let (added, updated, kept, conflicts) =
        merge_catalog(&mut catalog, &incoming_cat, &fake_device);
    save_catalog(&catalog)?;
    Ok(MergeReport {
        connections_added: added,
        connections_updated: updated,
        connections_kept_local: kept,
        queries_upserted: 0,
        history_inserted: 0,
        secrets_imported: 0,
        conflicts,
        origin_device_id: device_id.to_string(),
        origin_device_name: fake_device.name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn(id: &str, name: &str, updated: &str) -> CatalogConnection {
        CatalogConnection {
            id: id.into(),
            name: name.into(),
            db_type: "postgres".into(),
            host: "localhost".into(),
            port: 5432,
            user: "u".into(),
            database: "db".into(),
            ssl_mode: None,
            environment: "dev".into(),
            is_read_only: false,
            allow_writes_on_prod: false,
            updated_at: updated.into(),
            origin_device_id: "dev-a".into(),
        }
    }

    fn device(id: &str, name: &str) -> DeviceIdentity {
        DeviceIdentity {
            id: id.into(),
            name: name.into(),
            platform: "cli".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
        }
    }

    #[test]
    fn newer_timestamp_wins() {
        assert!(incoming_wins("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"));
        assert!(!incoming_wins("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"));
        assert!(!incoming_wins("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"));
        assert!(!incoming_wins("2026-01-01T00:00:00Z", ""));
        assert!(incoming_wins("", "2026-01-01T00:00:00Z"));
    }

    #[test]
    fn merge_adds_and_updates_and_keeps_local() {
        let mut local = ConnectionCatalog::default();
        local.connections.push(conn("1", "alpha", "2026-01-01T00:00:00Z"));
        local.connections.push(conn("2", "beta", "2026-01-05T00:00:00Z"));

        let mut incoming = ConnectionCatalog::default();
        incoming
            .connections
            .push(conn("1", "alpha", "2026-01-03T00:00:00Z")); // newer → take
        incoming
            .connections
            .push(conn("2", "beta", "2026-01-02T00:00:00Z")); // older → keep
        incoming
            .connections
            .push(conn("3", "gamma", "2026-01-01T00:00:00Z")); // new

        let (added, updated, kept, conflicts) =
            merge_catalog(&mut local, &incoming, &device("d2", "phone"));
        assert_eq!(added, 1);
        assert_eq!(updated, 1);
        assert_eq!(kept, 1);
        assert_eq!(local.connections.len(), 3);
        assert_eq!(
            local
                .connections
                .iter()
                .find(|c| c.id == "1")
                .unwrap()
                .updated_at,
            "2026-01-03T00:00:00Z"
        );
        assert_eq!(
            local
                .connections
                .iter()
                .find(|c| c.id == "2")
                .unwrap()
                .updated_at,
            "2026-01-05T00:00:00Z"
        );
        assert!(conflicts.iter().any(|c| c.resolution == "took_incoming"));
    }

    #[test]
    fn equal_timestamp_keeps_local_even_if_fields_differ() {
        let mut local = ConnectionCatalog::default();
        let mut a = conn("1", "alpha", "2026-01-01T00:00:00Z");
        a.host = "local-host".into();
        local.connections.push(a);

        let mut incoming = ConnectionCatalog::default();
        let mut b = conn("1", "alpha", "2026-01-01T00:00:00Z");
        b.host = "remote-host".into();
        incoming.connections.push(b);

        let (_a, _u, kept, conflicts) =
            merge_catalog(&mut local, &incoming, &device("d2", "phone"));
        assert_eq!(kept, 1);
        assert_eq!(local.connections[0].host, "local-host");
        assert_eq!(conflicts[0].resolution, "kept_local");
    }

    #[test]
    fn name_collision_renames_incoming() {
        let mut local = ConnectionCatalog::default();
        local.connections.push(conn("aaa", "prod", "2026-01-01T00:00:00Z"));

        let mut incoming = ConnectionCatalog::default();
        incoming
            .connections
            .push(conn("bbb", "prod", "2026-01-02T00:00:00Z"));

        let (added, _, _, conflicts) =
            merge_catalog(&mut local, &incoming, &device("d2", "pixel-7"));
        assert_eq!(added, 1);
        assert_eq!(local.connections.len(), 2);
        assert!(local.connections.iter().any(|c| c.name == "prod"));
        assert!(local
            .connections
            .iter()
            .any(|c| c.name == "prod (pixel-7)"));
        assert_eq!(conflicts[0].resolution, "renamed_incoming");
    }

    #[test]
    fn encrypt_roundtrip_and_wrong_passphrase() {
        let bundle = SyncBundle {
            format: SYNC_FORMAT.into(),
            exported_at: "2026-01-01T00:00:00Z".into(),
            origin_device: device("d1", "laptop"),
            catalog: ConnectionCatalog::default(),
            secrets: HashMap::new(),
            saved_queries: vec![],
            history: vec![],
        };
        let ct = encrypt_bundle(&bundle, "super-secret-pass").unwrap();
        let back = decrypt_bundle(&ct, "super-secret-pass").unwrap();
        assert_eq!(back.origin_device.id, "d1");
        assert!(decrypt_bundle(&ct, "wrong-passphrase").is_err());
        assert!(encrypt_bundle(&bundle, "short").is_err());
    }

    #[tokio::test]
    async fn apply_bundle_merges_queries_and_history() {
        let storage = AppStorage::new(":memory:").await.unwrap();
        let prev = std::env::var_os("DEVDASH_CONFIG_DIR");
        let tmp = std::env::temp_dir().join(format!(
            "devdash-sync-test-{}",
            uuid::Uuid::new_v4()
        ));
        let _ = fs::create_dir_all(&tmp);
        std::env::set_var("DEVDASH_CONFIG_DIR", &tmp);

        let mut incoming = ConnectionCatalog::default();
        incoming.connections.push(conn(
            "c1",
            "mobile-db",
            "2026-04-01T00:00:00Z",
        ));
        let bundle = SyncBundle {
            format: SYNC_FORMAT.into(),
            exported_at: "2026-04-01T00:00:00Z".into(),
            origin_device: device("phone", "pixel"),
            catalog: incoming,
            secrets: HashMap::new(),
            saved_queries: vec![SavedQueryItem {
                id: "q1".into(),
                name: "active users".into(),
                sql_content: "select 1".into(),
                project_path: "local".into(),
                created_at: "2026-04-01T00:00:00Z".into(),
            }],
            history: vec![QueryHistoryItem {
                id: "h1".into(),
                query_text: "select 1".into(),
                connection_id: "c1".into(),
                timestamp: "2026-04-01T00:00:00Z".into(),
                execution_time_ms: 3.0,
                row_count: 1,
                error: None,
            }],
        };
        let report = apply_bundle(&storage, &bundle, false).await.unwrap();
        assert_eq!(report.connections_added, 1);
        assert_eq!(report.queries_upserted, 1);
        assert_eq!(report.history_inserted, 1);
        let cat = load_catalog().unwrap();
        assert_eq!(cat.connections[0].name, "mobile-db");
        let qs = storage.list_all_queries().await.unwrap();
        assert_eq!(qs[0].name, "active users");

        match prev {
            Some(v) => std::env::set_var("DEVDASH_CONFIG_DIR", v),
            None => std::env::remove_var("DEVDASH_CONFIG_DIR"),
        }
        let _ = fs::remove_dir_all(&tmp);
    }
}
