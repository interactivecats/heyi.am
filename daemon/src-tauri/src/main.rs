// heyi.am tray daemon — background archiving and session indexing
//
// Sits in the system tray (macOS menu bar / Windows system tray / Linux appindicator).
// Periodically calls `heyiam archive` and `heyiam sync` to preserve sessions
// and keep the search index current. Also watches session source directories
// for real-time changes.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cli;
mod status;
mod watcher;

use std::time::Duration;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

const SYNC_INTERVAL_SECS: u64 = 15 * 60; // 15 minutes

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let handle = app.handle().clone();

            // Build tray menu
            let sync_now = MenuItemBuilder::with_id("sync_now", "Sync Now").build(app)?;
            let open_app = MenuItemBuilder::with_id("open_app", "Open Gallery").build(app)?;
            let show_status = MenuItemBuilder::with_id("status", "Show Status").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&sync_now)
                .separator()
                .item(&open_app)
                .item(&show_status)
                .separator()
                .item(&quit)
                .build()?;

            let icon = Image::from_path("icons/icon.png")
                .or_else(|_| {
                    // Fallback: try from the binary's directory
                    let exe_dir = std::env::current_exe()
                        .ok()
                        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
                        .unwrap_or_default();
                    Image::from_path(exe_dir.join("icons/icon.png"))
                })
                .unwrap_or_else(|_| Image::from_bytes(include_bytes!("../icons/icon.png")).expect("embedded icon"));

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .icon_as_template(true)
                .tooltip("heyi.am")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "sync_now" => {
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                run_sync_inner(&handle, true).await;
                            });
                        }
                        "open_app" => {
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                cli::run_heyiam(&handle, &["open"]).await;
                            });
                        }
                        "status" => {
                            status::show_status_notification();
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Start periodic sync loop
            let sync_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                // Initial sync on startup
                run_sync(&sync_handle).await;

                // Then every 15 minutes
                loop {
                    tokio::time::sleep(Duration::from_secs(SYNC_INTERVAL_SECS)).await;
                    run_sync(&sync_handle).await;
                }
            });

            // Start file watcher
            let watcher_handle = handle.clone();
            std::thread::spawn(move || {
                if let Err(e) = watcher::start_watching(watcher_handle) {
                    eprintln!("File watcher error: {}", e);
                }
            });

            // Write PID file for `heyiam daemon status`
            status::write_pid_file();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running heyiam tray daemon");
}

async fn run_sync(handle: &tauri::AppHandle) {
    run_sync_inner(handle, false).await;
}

async fn run_sync_inner(handle: &tauri::AppHandle, show_dialog: bool) {
    eprintln!("[heyiam-tray] Starting sync...");

    // Run archive first, then sync
    let archive_result = cli::run_heyiam(handle, &["archive"]).await;
    if let Some(output) = &archive_result {
        eprintln!("[heyiam-tray] Archive: {}", output.trim());
    }

    let sync_result = cli::run_heyiam(handle, &["sync"]).await;
    if let Some(output) = &sync_result {
        eprintln!("[heyiam-tray] Sync: {}", output.trim());
    }

    // Update status file
    status::update_status_file();

    eprintln!("[heyiam-tray] Sync complete");

    // Show dialog if user clicked "Sync Now"
    if show_dialog {
        let archive_msg = archive_result
            .as_deref()
            .unwrap_or("Archive failed")
            .trim()
            .to_string();
        let sync_msg = sync_result
            .as_deref()
            .unwrap_or("Sync failed")
            .trim()
            .to_string();
        let msg = format!("{}\\n{}", archive_msg, sync_msg);
        let script = format!(
            r#"display dialog "{}" with title "heyi.am Sync" buttons {{"OK"}} default button "OK" with icon note"#,
            msg.replace('"', "\\\"")
        );
        std::process::Command::new("osascript")
            .args(["-e", &script])
            .spawn()
            .ok();
    }
}
