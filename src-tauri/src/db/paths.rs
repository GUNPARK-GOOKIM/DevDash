//! Shared on-disk locations for Desktop, CLI, and Mobile.
//! Default: OS config dir + `/devdash`. Override with `DEVDASH_CONFIG_DIR`.
use std::path::PathBuf;

pub fn config_dir() -> PathBuf {
    if let Ok(raw) = std::env::var("DEVDASH_CONFIG_DIR") {
        let p = PathBuf::from(raw);
        if !p.as_os_str().is_empty() {
            return p;
        }
    }
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("devdash")
}

pub fn connections_path() -> PathBuf {
    config_dir().join("connections.json")
}

pub fn app_db_path() -> PathBuf {
    config_dir().join("devdash_internal.db")
}

pub fn device_identity_path() -> PathBuf {
    config_dir().join("device.json")
}

pub fn sync_export_dir() -> PathBuf {
    config_dir().join("sync-exports")
}

pub fn ensure_config_dir() -> Result<PathBuf, String> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn override_config_dir_from_env() {
        let prev = std::env::var_os("DEVDASH_CONFIG_DIR");
        std::env::set_var("DEVDASH_CONFIG_DIR", "/tmp/devdash-test-cfg");
        assert_eq!(config_dir(), PathBuf::from("/tmp/devdash-test-cfg"));
        assert_eq!(
            connections_path(),
            PathBuf::from("/tmp/devdash-test-cfg/connections.json")
        );
        assert_eq!(
            device_identity_path(),
            PathBuf::from("/tmp/devdash-test-cfg/device.json")
        );
        match prev {
            Some(v) => std::env::set_var("DEVDASH_CONFIG_DIR", v),
            None => std::env::remove_var("DEVDASH_CONFIG_DIR"),
        }
    }
}
