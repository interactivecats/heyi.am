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

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

const SYNC_INTERVAL_SECS: u64 = 15 * 60; // 15 minutes

fn main() {
    let status = Arc::new(Mutex::new(status::DaemonStatus::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let handle = app.handle().clone();
            let status_ref = status.clone();

            // Build tray menu
            let sync_now = MenuItemBuilder::with_id("sync_now", "Sync now").build(app)?;
            let open_app = MenuItemBuilder::with_id("open_app", "Open heyi.am").build(app)?;
            let show_status = MenuItemBuilder::with_id("status", "Status").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&sync_now)
                .separator()
                .item(&open_app)
                .item(&show_status)
                .separator()
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("heyi.am — archiving your sessions")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "sync_now" => {
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                run_sync(&handle).await;
                            });
                        }
                        "open_app" => {
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                cli::run_heyiam(&handle, &["open"]).await;
                            });
                        }
                        "status" => {
                            // Print status to log for now
                            if let Ok(s) = status_ref.lock() {
                                eprintln!("heyi.am daemon status: {:?}", s);
                            }
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
    eprintln!("[heyiam-tray] Starting sync...");

    // Run archive first, then sync
    let archive_result = cli::run_heyiam(handle, &["archive"]).await;
    if let Some(output) = archive_result {
        eprintln!("[heyiam-tray] Archive: {}", output.trim());
    }

    let sync_result = cli::run_heyiam(handle, &["sync"]).await;
    if let Some(output) = sync_result {
        eprintln!("[heyiam-tray] Sync: {}", output.trim());
    }

    // Update status file
    status::update_status_file();

    eprintln!("[heyiam-tray] Sync complete");
}
