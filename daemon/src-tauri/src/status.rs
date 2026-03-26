// Daemon status tracking
//
// Writes status.json and daemon.pid to ~/.config/heyiam/daemon/
// so `heyiam daemon status` can report on the daemon's state.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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
        session_count: None, // TODO: parse from sync output
        preserved_count: None,
        warnings: vec![],
    };

    let status_file = dir.join("status.json");
    if let Ok(json) = serde_json::to_string_pretty(&status) {
        fs::write(status_file, json).ok();
    }
}
