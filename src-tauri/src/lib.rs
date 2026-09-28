mod attention;
mod buddy;
mod collector;
mod commands;
mod credentials;
mod http;
mod models;
mod nebius;
mod privacy;
mod storage;
mod tavily;
mod tray;
use tauri::Manager;

#[cfg(test)]
mod threading_tests;

// IPC commands must use #[tauri::command(async)], including synchronous Rust functions.
// A worker can hold AppState::inner while waiting for a native window getter.
// Waiting for that mutex on the event thread would deadlock the getter's reply.
// Window/tray callbacks must likewise dispatch stateful work off the event thread.

pub fn run() {
    // Development convenience only. Release uses saved credentials or environment fallback.
    #[cfg(debug_assertions)]
    {
        let _ =
            dotenvy::from_path(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env"));
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let database = if http::enabled("DEMO_MODE") {
                "buddy-demo.db"
            } else {
                "buddy.db"
            };
            let storage =
                storage::Storage::open(&dir.join(database)).map_err(std::io::Error::other)?;
            app.manage(commands::AppState::new(storage).map_err(std::io::Error::other)?);
            tray::install(app)?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(std::time::Duration::from_secs(3));
                ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                loop {
                    ticker.tick().await;
                    let state = handle.state::<commands::AppState>();
                    if let Err(error) = commands::collect(&state) {
                        if let Ok(mut inner) = state.inner.lock() {
                            inner.last_error = Some(error);
                            inner.buddy.foreground = None;
                        }
                    }
                    let recommend = if let Ok(mut inner) = state.inner.lock() {
                        if let Err(error) = privacy::cleanup_due(&mut inner) {
                            inner.last_error = Some(error);
                        }
                        if let Err(error) = buddy::sync(&handle, &mut inner) {
                            inner.last_error = Some(error);
                        }
                        buddy::due(&inner)
                    } else {
                        false
                    };
                    if recommend {
                        let handle = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = handle.state::<commands::AppState>();
                            if let Err(error) = buddy::recommend(&handle, &state).await {
                                if let Ok(mut inner) = state.inner.lock() {
                                    inner.last_error =
                                        Some(format!("Suggestion unavailable: {error}"));
                                }
                            }
                        });
                    }
                    if commands::should_analyze(&state) {
                        // HTTP must never block the collection interval.
                        let handle = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            commands::automatic_analysis(
                                &handle,
                                &handle.state::<commands::AppState>(),
                            )
                            .await;
                        });
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            if window.label() == "buddy" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let app = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        let _ =
                            commands::dismiss_buddy(app.clone(), app.state::<commands::AppState>());
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_dashboard,
            buddy::set_buddy_preferences,
            buddy::open_workspace,
            buddy::snooze_buddy,
            buddy::reset_buddy_position,
            buddy::rate_recommendation,
            buddy::quit_app,
            privacy::get_privacy_preview,
            privacy::set_retention,
            privacy::clear_local_history,
            privacy::test_provider_connection,
            commands::set_provider_key,
            commands::set_goal,
            commands::get_current_goal,
            commands::get_recent_activity,
            commands::get_activity_snapshot,
            commands::set_tracking,
            commands::set_ai_enabled,
            commands::set_dnd,
            commands::analyze_focus,
            commands::search_web,
            commands::save_feedback,
            commands::dismiss_buddy,
            commands::capture_screenshot_on_demand
        ])
        .run(tauri::generate_context!())
        .expect("Desktop Buddy could not start");
}
