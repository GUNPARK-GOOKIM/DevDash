// Native OS Keychain and Secret Manager credential isolation store
use keyring::Entry; // Import Entry struct from keyring crate for OS keychain operations

// Service name identifier used for registering secrets in OS Keychain
const SERVICE_NAME: &str = "devdash_app"; // Constant defining key scope namespace

// Save database password securely in host system's native credential store
pub fn save_password(connection_id: &str, password: &str) -> Result<(), String> { // Function to store password securely
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?; // Initialize OS keychain entry for connection ID
    entry.set_password(password).map_err(|e| e.to_string())?; // Store password string in OS keychain
    Ok(()) // Return success result
} // End of save_password function

// Retrieve stored database password securely from host system keychain
pub fn get_password(connection_id: &str) -> Result<String, String> { // Function to fetch password securely
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?; // Retrieve OS keychain entry for connection ID
    let secret = entry.get_password().map_err(|e| e.to_string())?; // Fetch stored password string
    Ok(secret) // Return password string result
} // End of get_password function

// Delete stored database credential from host system keychain
pub fn delete_password(connection_id: &str) -> Result<(), String> { // Function to remove password from keychain
    let entry = Entry::new(SERVICE_NAME, connection_id).map_err(|e| e.to_string())?; // Find OS keychain entry for connection ID
    entry.delete_credential().map_err(|e| e.to_string())?; // Delete secret from OS keychain using delete_credential
    Ok(()) // Return success result
} // End of delete_password function

#[cfg(test)] // Conditional compilation attribute for unit test module
mod tests { // Declare internal unit tests module
    use super::*; // Import outer module items into test scope

    #[test] // Attribute marking function as a unit test
    fn test_keyring_entry_format() { // Unit test function to verify service name format
        assert_eq!(SERVICE_NAME, "devdash_app"); // Assert that service name constant matches devdash_app
    } // End of test function
} // End of tests module
