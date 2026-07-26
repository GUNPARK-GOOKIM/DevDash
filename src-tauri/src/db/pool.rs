// Unified multi-database connection pool manager using sqlx::AnyPool
use dashmap::DashMap; // Import DashMap for concurrent thread-safe pool caching
use sqlx::any::AnyPoolOptions; // Import AnyPoolOptions from sqlx::any
use sqlx::AnyPool; // Import AnyPool from sqlx root crate
use std::sync::Arc; // Import Arc for atomic reference counting across threads

// Central connection manager struct holding active database pools
#[derive(Clone)] // Derive Clone trait for cheap reference sharing across handlers
pub struct ConnectionManager { // Define ConnectionManager struct
    pools: Arc<DashMap<String, AnyPool>>, // Thread-safe concurrent map storing pools keyed by connection ID
} // End of ConnectionManager struct definition

impl ConnectionManager { // Implementation block for ConnectionManager
    // Construct a new empty ConnectionManager instance
    pub fn new() -> Self { // Constructor function initializing empty pools map
        Self { // Return new instance
            pools: Arc::new(DashMap::new()), // Instantiate atomic reference counted DashMap
        } // End of struct construction
    } // End of new constructor function

    // Register sqlx default database drivers (Postgres, MySQL, SQLite)
    pub fn init_drivers() { // Function to register database drivers dynamically
        sqlx::any::install_default_drivers(); // Register built-in drivers into sqlx driver registry
    } // End of init_drivers function

    // Establish a connection pool for a connection string and store it
    pub async fn connect(&self, id: &str, url: &str) -> Result<(), String> { // Async function to connect to database
        let pool = AnyPoolOptions::new() // Initialize connection pool options builder
            .max_connections(5) // Limit maximum active pool connections to 5
            .connect(url) // Connect asynchronously to the target connection URL
            .await // Await pool connection result
            .map_err(|e| format!("Failed to connect to database: {}", e))?; // Map pool creation error to string

        self.pools.insert(id.to_string(), pool); // Cache created pool in thread-safe map under connection ID
        Ok(()) // Return successful result
    } // End of connect function

    // Retrieve an active connection pool reference by connection ID
    pub fn get_pool(&self, id: &str) -> Result<AnyPool, String> { // Function to look up cached pool
        self.pools // Access active pools map
            .get(id) // Search map for given connection ID key
            .map(|r| r.value().clone()) // Clone pool instance reference if found
            .ok_or_else(|| format!("Connection ID '{}' not found or active", id)) // Return error if connection not found
    } // End of get_pool function

    // Disconnect and remove a connection pool from cache
    pub async fn disconnect(&self, id: &str) -> Result<(), String> { // Async function to close pool connection
        if let Some((_, pool)) = self.pools.remove(id) { // Remove pool entry from active pools map
            pool.close().await; // Close underlying database connection pool asynchronously
        } // End of if let statement
        Ok(()) // Return success result
    } // End of disconnect function
} // End of ConnectionManager implementation block

#[cfg(test)] // Conditional compilation for unit tests
mod tests { // Unit test module declaration
    use super::*; // Import items from parent module scope

    #[tokio::test] // Tokio async test annotation
    async fn test_connection_manager_instantiation() { // Test function for creating connection manager
        ConnectionManager::init_drivers(); // Call driver initialization logic
        let manager = ConnectionManager::new(); // Create new manager instance
        assert!(manager.get_pool("invalid_id").is_err()); // Verify that invalid connection ID returns error
    } // End of test function
} // End of tests module
