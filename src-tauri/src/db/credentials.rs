// Native OS Keychain and Secret Manager credential isolation store
use keyring::Entry;

const SERVICE_NAME: &str = "devdash_app";

pub fn save_password(connection_id: &str, password: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    entry.set_password(password).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_password(connection_id: &str) -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    let secret = entry.get_password().map_err(|e| e.to_string())?;
    Ok(secret)
}

pub fn delete_password(connection_id: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())?;
    Ok(())
}

/// Generic secret storage (e.g. AI API keys) under namespaced account keys.
pub fn save_secret(account: &str, secret: &str) -> Result<(), String> {
    if account.trim().is_empty() {
        return Err("Secret account key cannot be empty".to_string());
    }
    let entry = Entry::new(SERVICE_NAME, account).map_err(|e| e.to_string())?;
    entry.set_password(secret).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_secret(account: &str) -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, account).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

pub fn delete_secret(account: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, account).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}

#[cfg(test)] // Conditional compilation attribute for unit test module
mod tests { // Declare internal unit tests module
    use super::*; // Import outer module items into test scope

    #[test] // Attribute marking function as a unit test
    fn test_keyring_entry_format() { // Unit test function to verify service name format
        assert_eq!(SERVICE_NAME, "devdash_app"); // Assert that service name constant matches devdash_app
    } // End of test function
} // End of tests module
