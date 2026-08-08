//! DevDash CLI entrypoint (`devdash`).
//!
//!   cargo install --path src-tauri --bin devdash --locked --no-default-features --features cli
fn main() -> std::process::ExitCode {
    devdash_backend::cli::run()
}
