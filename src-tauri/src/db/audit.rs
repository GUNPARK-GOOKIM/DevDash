// Append-only local audit trail logger (JSONL). Not a full SOC2/HIPAA compliance product.
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: String,
    pub user: String,
    pub connection_name: String,
    pub action_type: String,
    pub sql: String,
    pub affected_rows: u64,
    pub status: String,
    pub client_ip: String,
}

/// Default audit log directory under the user config folder.
pub fn default_audit_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("devdash")
        .join("audit")
}

pub fn append_audit_entry(log_dir: &Path, entry: &AuditEntry) -> Result<(), String> {
    std::fs::create_dir_all(log_dir).map_err(|e| format!("Failed to create log dir: {}", e))?;
    let file_path = log_dir.join("audit_log.jsonl");

    let json_line =
        serde_json::to_string(entry).map_err(|e| format!("Serialization failed: {}", e))?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(file_path)
        .map_err(|e| format!("Failed to open audit log: {}", e))?;

    writeln!(file, "{}", json_line).map_err(|e| format!("Failed to write log entry: {}", e))?;
    Ok(())
}

/// Convenience helper used by IPC command handlers.
pub fn log_action(
    connection_name: &str,
    action_type: &str,
    sql: &str,
    affected_rows: u64,
    status: &str,
) -> Result<(), String> {
    let entry = AuditEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        user: whoami_fallback(),
        connection_name: connection_name.to_string(),
        action_type: action_type.to_string(),
        sql: sql.to_string(),
        affected_rows,
        status: status.to_string(),
        // Desktop app has no remote client; record local loopback explicitly as "local".
        client_ip: "local".to_string(),
    };
    append_audit_entry(&default_audit_dir(), &entry)
}

fn whoami_fallback() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "local".to_string())
}

/// Read the most recent audit entries (newest last in file; returned newest-first).
pub fn read_audit_entries(log_dir: &Path, limit: usize) -> Result<Vec<AuditEntry>, String> {
    let file_path = log_dir.join("audit_log.jsonl");
    if !file_path.exists() {
        return Ok(vec![]);
    }
    let file = std::fs::File::open(&file_path)
        .map_err(|e| format!("Failed to open audit log: {}", e))?;
    let reader = BufReader::new(file);
    let mut entries: Vec<AuditEntry> = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read audit log: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<AuditEntry>(&line) {
            entries.push(entry);
        }
    }
    entries.reverse();
    if entries.len() > limit {
        entries.truncate(limit);
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn test_append_audit_entry_jsonl() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let log_dir = std::env::temp_dir().join(format!("devdash_audit_test_{}", nanos));
        let _ = std::fs::remove_dir_all(&log_dir);

        let entry = AuditEntry {
            id: "audit-101".to_string(),
            timestamp: "2026-07-31T00:00:00Z".to_string(),
            user: "admin".to_string(),
            connection_name: "prod_db".to_string(),
            action_type: "STAGE_COMMIT".to_string(),
            sql: "UPDATE users SET active = true WHERE id = 1;".to_string(),
            affected_rows: 1,
            status: "SUCCESS".to_string(),
            client_ip: "127.0.0.1".to_string(),
        };

        let result = append_audit_entry(&log_dir, &entry);
        assert!(result.is_ok());

        let file_path = log_dir.join("audit_log.jsonl");
        let content = std::fs::read_to_string(file_path).unwrap();
        assert!(content.contains("audit-101"));
        assert!(content.contains("admin"));
        assert!(content.contains("STAGE_COMMIT"));

        let loaded = read_audit_entries(&log_dir, 10).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "audit-101");

        let _ = std::fs::remove_dir_all(&log_dir);
    }
}
