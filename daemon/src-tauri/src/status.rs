// Daemon status tracking
//
// Writes status.json and daemon.pid to ~/.config/heyiam/daemon/
// so `heyiam daemon status` can report on the daemon's state.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonStatus {
    pub last_sync: Option<String>,
    pub session_count: Option<u64>,
    pub preserved_count: Option<u64>,
    pub warnings: Vec<String>,
}

fn daemon_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Could not determine home directory");
    home.join(".config").join("heyiam").join("daemon")
}

pub fn write_pid_file() {
    let dir = daemon_dir();
    fs::create_dir_all(&dir).ok();

    let pid = std::process::id();
    let pid_file = dir.join("daemon.pid");
    fs::write(pid_file, pid.to_string()).ok();
}

pub fn update_status_file() {
    let dir = daemon_dir();
    fs::create_dir_all(&dir).ok();

    let status = DaemonStatus {
        last_sync: Some(chrono::Utc::now().to_rfc3339()),
        session_count: None,
        preserved_count: None,
        warnings: vec![],
    };

    let status_file = dir.join("status.json");
    if let Ok(json) = serde_json::to_string_pretty(&status) {
        fs::write(status_file, json).ok();
    }
}

/// Read status from disk and show a macOS dialog box.
/// Uses osascript display dialog (no notification permission needed).
pub fn show_status_notification() {
    let status_file = daemon_dir().join("status.json");

    let message = if let Ok(contents) = fs::read_to_string(&status_file) {
        if let Ok(status) = serde_json::from_str::<DaemonStatus>(&contents) {
            let sync_ago = status
                .last_sync
                .as_deref()
                .and_then(|s| {
                    chrono::DateTime::parse_from_rfc3339(s).ok().map(|dt| {
                        let mins = (chrono::Utc::now() - dt.with_timezone(&chrono::Utc))
                            .num_minutes();
                        if mins < 1 {
                            "just now".to_string()
                        } else if mins < 60 {
                            format!("{}m ago", mins)
                        } else {
                            format!("{}h ago", mins / 60)
                        }
                    })
                })
                .unwrap_or_else(|| "never".to_string());

            let sessions = status
                .session_count
                .map(|n| format!("{} sessions indexed", n))
                .unwrap_or_else(|| "Indexing...".to_string());

            let preserved = status
                .preserved_count
                .map(|n| format!("{} preserved", n))
                .unwrap_or_default();

            let warnings = if status.warnings.is_empty() {
                "No warnings".to_string()
            } else {
                status.warnings.join("\n")
            };

            format!(
                "Last sync: {}\n{}\n{}\n{}",
                sync_ago, sessions, preserved, warnings
            )
        } else {
            "Status file unreadable".to_string()
        }
    } else {
        "No sync completed yet.\n\nThe daemon will sync automatically every 15 minutes.".to_string()
    };

    // Use display dialog instead of notification (no permissions needed)
    let script = format!(
        r#"display dialog "{}" with title "heyi.am Daemon" buttons {{"OK"}} default button "OK" with icon note"#,
        message.replace('"', "\\\"").replace('\n', "\\n")
    );

    Command::new("osascript")
        .args(["-e", &script])
        .spawn()
        .ok();
}
