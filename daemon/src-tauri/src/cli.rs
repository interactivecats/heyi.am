// Shell out to `heyiam` CLI commands
//
// The daemon delegates all actual work to the Node.js CLI.
// This keeps the Rust binary thin — it's just a scheduler and tray.

use std::process::Command;

/// Run a heyiam CLI command and return its stdout.
/// Tries `heyiam` first (globally installed), falls back to `npx heyiam`.
pub async fn run_heyiam(
    _handle: &tauri::AppHandle,
    args: &[&str],
) -> Option<String> {
    // Try direct `heyiam` command first
    let result = Command::new("heyiam")
        .args(args)
        .output();

    match result {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).to_string())
        }
        _ => {
            // Fallback: try npx heyiam
            let result = Command::new("npx")
                .arg("heyiam")
                .args(args)
                .output();

            match result {
                Ok(output) if output.status.success() => {
                    Some(String::from_utf8_lossy(&output.stdout).to_string())
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    eprintln!("[heyiam-tray] Command failed: heyiam {} — {}", args.join(" "), stderr.trim());
                    None
                }
                Err(e) => {
                    eprintln!("[heyiam-tray] Failed to run heyiam: {}", e);
                    None
                }
            }
        }
    }
}
