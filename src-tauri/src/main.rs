// Main executable binary entry point for DevDash backend desktop application
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // Hide Windows console window in release builds

fn main() { // Main binary entry point function
    devdash_backend::run(); // Delegate application setup and execution to lib.rs run function
} // End of main function
