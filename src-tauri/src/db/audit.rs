// Native Rust SOC2 / HIPAA Compliance Audit Trail Engine for DevDash
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

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

pub fn append_audit_entry(log_dir: &PathBuf, entry: &AuditEntry) -> Result<(), String> {
    std::fs::create_dir_all(log_dir).map_err(|e| format!("Failed to create log dir: {}", e))?;
    let file_path = log_dir.join("audit_log.jsonl");

    let json_line = serde_json::to_string(entry).map_err(|e| format!("Serialization failed: {}", e))?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(file_path)
        .map_err(|e| format!("Failed to open audit log: {}", e))?;

    writeln!(file, "{}", json_line).map_err(|e| format!("Failed to write log entry: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_append_audit_entry_jsonl() {
        let dir = tempdir().unwrap();
        let log_dir = dir.path().to_path_buf();

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
    }
}
