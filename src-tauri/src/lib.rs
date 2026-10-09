mod ai_chat;
mod attention;
mod automatic_goals;
mod autostart;
mod browser;
mod buddy;
mod collector;
mod commands;
mod companion;
mod contact;
mod core;
mod core_capture;
mod core_import;
mod credentials;
mod goal_analysis;
mod goal_matching;
mod goals;
mod history;
mod http;
mod insights;
mod installed_apps;
#[cfg(any(target_os = "macos", test))]
mod macos_speech;
mod models;
mod nebius;
mod privacy;
mod product_feedback;
mod profile;
mod recommendations;
mod relevance;
mod signing_trust;
mod startup;
mod storage;
mod tavily;
mod tracking;
mod tray;
mod updates;
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
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            #[cfg(debug_assertions)]
            let dir = if http::enabled("DEMO_MODE") && http::enabled("AI_MOCK") {
                std::env::var_os("BUDDY_TEST_DATA_DIR")
                    .map(std::path::PathBuf::from)
                    .unwrap_or(dir)
            } else {
                dir
            };
            std::fs::create_dir_all(&dir)?;
            let database = if http::enabled("DEMO_MODE") {
                "buddy-demo.db"
            } else {
                "buddy.db"
            };
            let storage =
                storage::Storage::open(&dir.join(database)).map_err(std::io::Error::other)?;
            startup::initialize(app, storage)?;
            core_capture::install(app.handle())?;
            tray::install(app)?;
            #[cfg(windows)]
            companion::windows::install_selection_shortcut(app.handle().clone());
            let settings = app
                .state::<commands::AppState>()
                .inner
                .lock()
                .map_err(|_| std::io::Error::other("Application state unavailable"))?
                .storage
                .user_settings()
                .map_err(std::io::Error::other)?;
            // Isolated UI validation must not rewrite the installed app's startup entry.
            let isolated_test = cfg!(debug_assertions)
                && http::enabled("DEMO_MODE")
                && http::enabled("AI_MOCK")
                && std::env::var_os("BUDDY_TEST_DATA_DIR").is_some();
            if settings.onboarding.completed && !isolated_test {
                if let Err(error) = autostart::sync(settings.autostart) {
                    if let Ok(mut inner) = app.state::<commands::AppState>().inner.lock() {
                        inner.last_error = Some(error);
                    }
                }
            }
            profile::apply_theme(app.handle(), &settings.theme).map_err(std::io::Error::other)?;
            if std::env::args().any(|arg| arg == "--background") {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide()?;
                }
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(std::time::Duration::from_secs(3));
                ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                loop {
                    ticker.tick().await;
                    let state = handle.state::<commands::AppState>();
                    if let Ok(mut inner) = state.inner.lock() {
                        if let Err(error) = automatic_goals::sync_focus(&mut inner) {
                            inner.last_error = Some(error);
                        }
                        if let Err(error) = inner.storage.core_tick_at(chrono::Utc::now()) {
                            inner.last_error = Some(error);
                        }
                    }
                    if let Err(error) = commands::collect(&state) {
                        if let Ok(mut inner) = state.inner.lock() {
                            if error != collector::CONTEXT_CHANGED {
                                inner.last_error = Some(error);
                            }
                            inner.buddy.foreground = None;
                            inner.usage = Default::default();
                            inner.activity_state.stop(false);
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
                    {
                        let app = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            automatic_goals::run_pending(&app).await;
                        });
                    }
                    if goal_matching::due(&state) {
                        let matching_handle = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            goal_matching::identify(
                                &matching_handle,
                                &matching_handle.state::<commands::AppState>(),
                            )
                            .await;
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
                    let detect = state
                        .inner
                        .lock()
                        .is_ok_and(|inner| companion::detection_due(&inner));
                    if detect {
                        let handle = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = handle.state::<commands::AppState>();
                            // Missing accessibility support is normal; do not spam the workspace.
                            let _ = companion::detect(&handle, &state).await;
                        });
                    }
                }
            });
            Ok(())
        })
        .on_menu_event(|app, event| {
            let Some(intent) = event.id().as_ref().strip_prefix("companion-") else {
                return;
            };
            let app = app.clone();
            let intent = intent.to_string();
            tauri::async_runtime::spawn(async move {
                let state = app.state::<commands::AppState>();
                let result = match intent.as_str() {
                    "hide" => buddy::show_desktop_buddy(false, app.clone(), state),
                    "open" => buddy::open_workspace(app.clone()),
                    "goal" => core_capture::capture_companion_goal(app.clone(), state),
                    _ => companion::open_companion_chat(intent, app.clone(), state),
                };
                if let Err(error) = result {
                    if let Ok(mut inner) = app.state::<commands::AppState>().inner.lock() {
                        inner.companion.view.notice = Some(error);
                    }
                }
            });
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
                        let _ = companion::close_companion_chat(
                            app.clone(),
                            app.state::<commands::AppState>(),
                        );
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            companion::get_companion_view,
            companion::get_companion_goal_context,
            companion::set_companion_preferences,
            companion::open_companion_chat,
            companion::close_companion_chat,
            companion::open_companion_context,
            companion::companion_voice_input,
            goal_analysis::get_ai_preferences,
            goal_analysis::set_ai_preferences,
            goal_analysis::analyze_core_goal,
            automatic_goals::retry_core_goal_analysis,
            automatic_goals::select_core_goal,
            relevance::get_goal_progress,
            ai_chat::get_buddy_chat_history,
            ai_chat::get_buddy_conversations,
            ai_chat::create_buddy_conversation,
            ai_chat::select_buddy_conversation,
            ai_chat::delete_buddy_conversation,
            ai_chat::clear_buddy_chat,
            ai_chat::send_buddy_message,
            ai_chat::record_resource_view,
            ai_chat::set_goal_expected_minutes,
            ai_chat::get_buddy_coaching,
            history::get_activity_segments,
            companion::companion_submit,
            companion::respond_companion_intervention,
            companion::update_companion_inbox,
            core::get_core_snapshot,
            core_capture::get_core_drafts,
            core_capture::resolve_core_draft,
            core::add_core_goals,
            core::create_core_goal,
            core::save_core_goal,
            core::transition_core_goal,
            core::set_core_today,
            core::reorder_core_goals,
            core::plan_core_day,
            core::dismiss_core_carryover,
            core::set_core_timer,
            core::tick_core_timer,
            core::set_core_preferences,
            core::finish_core_setup,
            core::save_core_identity,
            core_import::propose_core_import,
            core_import::transcribe_core_voice,
            core_import::get_local_voice_languages,
            updates::check_app_update,
            updates::install_app_update,
            profile::save_onboarding,
            profile::create_onboarding_goal,
            profile::finish_onboarding,
            profile::save_user_profile,
            profile::set_user_theme,
            profile::reset_local_profile,
            installed_apps::get_installed_apps,
            contact::open_feedback_draft,
            contact::get_contact_endpoint,
            contact::set_contact_endpoint,
            contact::send_contact_feedback,
            contact::subscribe_contact_email,
            contact::share_role_profile,
            buddy::show_desktop_buddy,
            product_feedback::save_product_feedback,
            tracking::get_tracking_settings,
            tracking::set_tracking_settings,
            history::get_goal_history,
            insights::set_app_rule,
            goals::save_goal_plan,
            goals::transition_goal,
            goals::refine_goal,
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
