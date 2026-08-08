// Build script for Tauri backend compilation
fn main() {
    #[cfg(feature = "gui")]
    tauri_build::build();
}
