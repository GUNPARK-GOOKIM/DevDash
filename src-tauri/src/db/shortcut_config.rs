// Keyboard Shortcut Config Store module
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShortcutBinding {
    pub action_id: String,
    pub description: String,
    pub key_combo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShortcutConfig {
    pub bindings: Vec<ShortcutBinding>,
}

pub fn get_default_shortcuts() -> ShortcutConfig {
    ShortcutConfig {
        bindings: vec![
            ShortcutBinding {
                action_id: "run_query".to_string(),
                description: "Execute active query in SQL editor".to_string(),
                key_combo: "Ctrl+Enter".to_string(),
            },
            ShortcutBinding {
                action_id: "format_sql".to_string(),
                description: "Format and beautify active SQL code".to_string(),
                key_combo: "Ctrl+Shift+I".to_string(),
            },
            ShortcutBinding {
                action_id: "new_tab".to_string(),
                description: "Open a new query editor tab".to_string(),
                key_combo: "Ctrl+T".to_string(),
            },
            ShortcutBinding {
                action_id: "close_tab".to_string(),
                description: "Close active tab".to_string(),
                key_combo: "Ctrl+W".to_string(),
            },
            ShortcutBinding {
                action_id: "open_filter".to_string(),
                description: "Open table column filter overlay".to_string(),
                key_combo: "Ctrl+F".to_string(),
            },
            ShortcutBinding {
                action_id: "refresh_table".to_string(),
                description: "Refresh table grid contents".to_string(),
                key_combo: "Ctrl+R".to_string(),
            },
        ],
    }
}

pub fn load_shortcut_config(config_path: &Path) -> ShortcutConfig {
    if !config_path.exists() {
        let defaults = get_default_shortcuts();
        let _ = save_shortcut_config(config_path, &defaults);
        return defaults;
    }

    match fs::read_to_string(config_path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|_| get_default_shortcuts()),
        Err(_) => get_default_shortcuts(),
    }
}

pub fn save_shortcut_config(config_path: &Path, config: &ShortcutConfig) -> Result<(), String> {
    if let Some(parent) = config_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize shortcut config: {}", e))?;
    fs::write(config_path, json).map_err(|e| format!("Failed to write shortcut config: {}", e))
}

pub fn update_shortcut_binding(
    config_path: &Path,
    action_id: &str,
    new_key_combo: &str,
) -> Result<ShortcutConfig, String> {
    let mut config = load_shortcut_config(config_path);
    let trimmed_combo = new_key_combo.trim();

    // Check conflict: Is new_key_combo already assigned to a DIFFERENT action?
    for b in &config.bindings {
        if b.action_id != action_id && b.key_combo.eq_ignore_ascii_case(trimmed_combo) {
            return Err(format!(
                "Shortcut conflict: '{}' is already bound to action '{}'",
                trimmed_combo, b.action_id
            ));
        }
    }

    // Find and update action
    let mut found = false;
    for b in &mut config.bindings {
        if b.action_id == action_id {
            b.key_combo = trimmed_combo.to_string();
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!("Action ID '{}' not found in shortcut config", action_id));
    }

    save_shortcut_config(config_path, &config)?;
    Ok(config)
}

pub fn reset_shortcut_config(config_path: &Path) -> Result<ShortcutConfig, String> {
    let defaults = get_default_shortcuts();
    save_shortcut_config(config_path, &defaults)?;
    Ok(defaults)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shortcut_persistence_and_conflict_rejection() {
        let temp_dir = std::env::temp_dir().join("devdash_test_shortcuts");
        let config_file = temp_dir.join("shortcuts.json");

        // Cleanup
        let _ = fs::remove_file(&config_file);

        // 1. Initial load gets defaults
        let defaults = load_shortcut_config(&config_file);
        assert_eq!(defaults.bindings.len(), 6);

        // 2. Conflict test: Attempt to set 'run_query' to 'Ctrl+T' (which is bound to 'new_tab')
        let conflict_err = update_shortcut_binding(&config_file, "run_query", "Ctrl+T");
        assert!(conflict_err.is_err());
        assert!(conflict_err.unwrap_err().contains("already bound to action 'new_tab'"));

        // 3. Valid update: Set 'run_query' to 'Ctrl+Shift+Enter'
        let updated = update_shortcut_binding(&config_file, "run_query", "Ctrl+Shift+Enter").unwrap();
        let run_binding = updated.bindings.iter().find(|b| b.action_id == "run_query").unwrap();
        assert_eq!(run_binding.key_combo, "Ctrl+Shift+Enter");

        // 4. Persistence check: Reload from disk and verify change persisted across restart
        let reloaded = load_shortcut_config(&config_file);
        let run_reloaded = reloaded.bindings.iter().find(|b| b.action_id == "run_query").unwrap();
        assert_eq!(run_reloaded.key_combo, "Ctrl+Shift+Enter");

        // Cleanup
        let _ = fs::remove_file(&config_file);
    }
}
