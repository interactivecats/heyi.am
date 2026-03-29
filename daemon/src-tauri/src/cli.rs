// Shell out to `heyiam` CLI commands
//
// The daemon delegates all actual work to the Node.js CLI.
// This keeps the Rust binary thin -- it's just a scheduler and tray.

use std::process::Command;

/// Resolve the full path to npx, since GUI apps on macOS don't inherit
/// the shell PATH. Checks common Node manager locations.
fn find_npx() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    let candidates = [
        // Homebrew (Apple Silicon)
        "/opt/homebrew/bin/npx".to_string(),
        // Homebrew (Intel)
        "/usr/local/bin/npx".to_string(),
        // fnm
        format!(
            "{}/.local/share/fnm/aliases/default/bin/npx",
            home.display(),
        ),
    ];

    for path in &candidates {
        if std::path::Path::new(path.as_str()).exists() {
            return path.clone();
        }
    }

    // Fallback: try shell -l -c which npx to resolve from login shell
    if let Ok(output) = Command::new("/bin/zsh")
        .args(["-l", "-c", "which npx"])
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return path;
            }
        }
    }

    // Last resort
    "npx".to_string()
}

/// Augmented PATH that includes common Node.js binary directories.
/// macOS GUI apps launch with a minimal PATH that excludes Homebrew, nvm, etc.
fn augmented_path() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    let existing = std::env::var("PATH").unwrap_or_default();
    format!(
        "/opt/homebrew/bin:/usr/local/bin:{}/.local/share/fnm/aliases/default/bin:{}",
        home.display(),
        existing
    )
}

/// Run a heyiam CLI command and return its stdout.
/// Search order: tsx dev build (absolute npx path) -> global heyiam -> npx fallback.
pub async fn run_heyiam(
    _handle: &tauri::AppHandle,
    args: &[&str],
) -> Option<String> {
    let npx = find_npx();
    let path_env = augmented_path();

    // Try local dev build via tsx (development only — compiled out in release)
    #[cfg(debug_assertions)]
    {
        let cli_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("cli");
        let index_ts = cli_dir.join("src/index.ts");

        if index_ts.exists() {
            let result = Command::new(&npx)
                .args(["tsx", "src/index.ts"])
                .args(args)
                .current_dir(&cli_dir)
                .env("PATH", &path_env)
                .output();

            if let Ok(output) = result {
                if output.status.success() {
                    return Some(String::from_utf8_lossy(&output.stdout).to_string());
                }
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!(
                    "[heyiam-tray] tsx dev failed ({}): {}",
                    args.join(" "),
                    stderr.lines().next().unwrap_or("unknown error")
                );
            }
        }
    }

    // Try global `heyiam` command
    let result = Command::new("heyiam")
        .args(args)
        .env("PATH", &path_env)
        .output();

    match result {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).to_string())
        }
        _ => {
            eprintln!(
                "[heyiam-tray] heyiam {} not found globally, no further fallback",
                args.join(" ")
            );
            None
        }
    }
}
