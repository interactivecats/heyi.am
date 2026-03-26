// File watcher — monitors session source directories for changes
//
// When a new or modified session file is detected, triggers an
// immediate archive + sync via the CLI. Uses the `notify` crate
// for cross-platform file watching.

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

const DEBOUNCE_SECS: u64 = 5;

/// Directories to watch for session file changes.
fn watch_dirs() -> Vec<PathBuf> {
    let home = dirs::home_dir().expect("Could not determine home directory");
    vec![
        home.join(".claude").join("projects"),
        home.join(".codex").join("sessions"),
        home.join(".gemini").join("tmp"),
    ]
}

/// Start watching session directories. Blocks the calling thread.
/// Triggers `heyiam archive && heyiam sync` on file changes with debouncing.
pub fn start_watching(handle: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let (tx, rx) = mpsc::channel::<Event>();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                tx.send(event).ok();
            }
        },
        Config::default(),
    )?;

    // Watch each directory that exists
    for dir in watch_dirs() {
        if dir.exists() {
            match watcher.watch(&dir, RecursiveMode::Recursive) {
                Ok(()) => eprintln!("[heyiam-tray] Watching: {}", dir.display()),
                Err(e) => eprintln!("[heyiam-tray] Cannot watch {}: {}", dir.display(), e),
            }
        }
    }

    // Debounced event loop
    let mut last_sync = Instant::now() - Duration::from_secs(DEBOUNCE_SECS * 2);

    loop {
        match rx.recv_timeout(Duration::from_secs(1)) {
            Ok(event) => {
                // Only care about file modifications and creations
                let dominated = matches!(
                    event.kind,
                    EventKind::Create(_) | EventKind::Modify(_)
                );

                if !dominated {
                    continue;
                }

                // Check if any path is a session file
                let is_session = event.paths.iter().any(|p| {
                    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                    ext == "jsonl" || ext == "json"
                });

                if !is_session {
                    continue;
                }

                // Debounce: skip if we synced recently
                let elapsed = last_sync.elapsed();
                if elapsed < Duration::from_secs(DEBOUNCE_SECS) {
                    continue;
                }

                last_sync = Instant::now();

                let h = handle.clone();
                tauri::async_runtime::spawn(async move {
                    eprintln!("[heyiam-tray] File change detected, syncing...");
                    crate::run_sync(&h).await;
                });
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // No events — keep looping
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                eprintln!("[heyiam-tray] Watcher channel disconnected");
                break;
            }
        }
    }

    Ok(())
}
