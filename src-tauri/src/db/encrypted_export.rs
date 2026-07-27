// Encrypted Connection & Query Export module using AES-256-GCM and PBKDF2 key derivation
use crate::db::app_storage::{AppStorage, SavedConnectionProfile, SavedQueryItem};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExportPayload {
    pub connections: Vec<SavedConnectionProfile>,
    pub saved_queries: Vec<SavedQueryItem>,
    pub exported_at: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedExportFile {
    pub salt_b64: String,
    pub nonce_b64: String,
    pub ciphertext_b64: String,
}

fn derive_aes_key(passphrase: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), salt, 10_000, &mut key);
    key
}

pub fn encrypt_export_payload(
    payload: &ExportPayload,
    passphrase: &str,
) -> Result<EncryptedExportFile, String> {
    let json_bytes = serde_json::to_vec(payload)
        .map_err(|e| format!("Failed to serialize export payload: {}", e))?;

    let salt: [u8; 16] = uuid::Uuid::new_v4().as_bytes()[..16].try_into().unwrap();
    let nonce_bytes: [u8; 12] = uuid::Uuid::new_v4().as_bytes()[..12].try_into().unwrap();

    let key = derive_aes_key(passphrase, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("AES key init failed: {}", e))?;

    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, json_bytes.as_ref())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    use base64::Engine;
    let engine = base64::engine::general_purpose::STANDARD;

    Ok(EncryptedExportFile {
        salt_b64: engine.encode(salt),
        nonce_b64: engine.encode(nonce_bytes),
        ciphertext_b64: engine.encode(ciphertext),
    })
}

pub fn decrypt_export_payload(
    encrypted_file: &EncryptedExportFile,
    passphrase: &str,
) -> Result<ExportPayload, String> {
    use base64::Engine;
    let engine = base64::engine::general_purpose::STANDARD;

    let salt = engine
        .decode(&encrypted_file.salt_b64)
        .map_err(|e| format!("Invalid salt base64: {}", e))?;
    let nonce_bytes = engine
        .decode(&encrypted_file.nonce_b64)
        .map_err(|e| format!("Invalid nonce base64: {}", e))?;
    let ciphertext = engine
        .decode(&encrypted_file.ciphertext_b64)
        .map_err(|e| format!("Invalid ciphertext base64: {}", e))?;

    let key = derive_aes_key(passphrase, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("AES key init failed: {}", e))?;

    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext_bytes = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "Decryption failed: Incorrect passphrase or corrupted data".to_string())?;

    serde_json::from_slice(&plaintext_bytes)
        .map_err(|e| format!("Failed to parse decrypted payload: {}", e))
}

pub async fn export_connections_and_queries(
    storage: &AppStorage,
    export_path: &Path,
    passphrase: &str,
) -> Result<(), String> {
    let connections = storage.list_connection_profiles().await?;
    let saved_queries = storage.list_all_queries().await?;

    let payload = ExportPayload {
        connections,
        saved_queries,
        exported_at: chrono::Utc::now().to_rfc3339(),
        version: "1.0".to_string(),
    };

    let encrypted = encrypt_export_payload(&payload, passphrase)?;
    let json_str = serde_json::to_string_pretty(&encrypted)
        .map_err(|e| format!("Failed to serialize encrypted file: {}", e))?;

    if let Some(parent) = export_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(export_path, json_str).map_err(|e| format!("Failed to write export file: {}", e))
}

pub async fn import_connections_and_queries(
    storage: &AppStorage,
    import_path: &Path,
    passphrase: &str,
) -> Result<ExportPayload, String> {
    let contents = fs::read_to_string(import_path)
        .map_err(|e| format!("Failed to read import file: {}", e))?;

    let encrypted_file: EncryptedExportFile = serde_json::from_str(&contents)
        .map_err(|e| format!("Invalid encrypted file format: {}", e))?;

    let payload = decrypt_export_payload(&encrypted_file, passphrase)?;

    // Restore connections and saved queries into app storage
    for conn in &payload.connections {
        let _ = storage
            .save_connection_profile(
                &conn.name,
                &conn.db_type,
                &conn.host,
                conn.port,
                &conn.user,
                &conn.database,
                conn.project_path.as_deref(),
            )
            .await;
    }

    for q in &payload.saved_queries {
        let _ = storage.save_query(&q.name, &q.sql_content, &q.project_path).await;
    }

    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_encrypted_export_import_roundtrip_zero_passwords() {
        let storage = AppStorage::new(":memory:").await.unwrap();

        // Save connection profile and query
        let profile = storage
            .save_connection_profile(
                "Prod Postgres",
                "postgres",
                "localhost",
                5432,
                "postgres",
                "production",
                Some("/dev/app"),
            )
            .await
            .unwrap();

        let query = storage
            .save_query("Select Users", "SELECT * FROM users;", "/dev/app")
            .await
            .unwrap();

        let temp_dir = std::env::temp_dir().join("devdash_crypto_test");
        let _ = fs::create_dir_all(&temp_dir);
        let export_file = temp_dir.join("connections.devdash.enc");

        let passphrase = "SecretPassword123!";

        // 1. Export to encrypted file
        export_connections_and_queries(&storage, &export_file, passphrase)
            .await
            .unwrap();

        // Verify raw exported file contents are encrypted
        let raw_file = fs::read_to_string(&export_file).unwrap();
        assert!(!raw_file.contains("postgres"));
        assert!(!raw_file.contains("production"));

        // 2. Import into a FRESH empty storage instance
        let fresh_storage = AppStorage::new(":memory:").await.unwrap();
        let restored_payload = import_connections_and_queries(&fresh_storage, &export_file, passphrase)
            .await
            .unwrap();

        // 3. Verify exact restoration
        assert_eq!(restored_payload.connections.len(), 1);
        assert_eq!(restored_payload.connections[0].name, profile.name);
        assert_eq!(restored_payload.connections[0].database, "production");
        assert_eq!(restored_payload.saved_queries.len(), 1);
        assert_eq!(restored_payload.saved_queries[0].name, query.name);

        // Cleanup
        let _ = fs::remove_file(&export_file);
    }
}
