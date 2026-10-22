//! Explicit debug-only native rehearsal with disposable data and no provider calls.
use super::*;
use serde_json::json;

pub fn enabled() -> bool {
    std::env::args().any(|arg| arg == "--check-mascot-windows")
        && crate::http::enabled("DEMO_MODE")
        && crate::http::enabled("AI_MOCK")
        && std::env::var_os("BUDDY_TEST_DATA_DIR").is_some()
}
pub fn seed(storage: &mut crate::storage::Storage) -> Result<(), String> {
    let mut settings = storage.user_settings()?;
    settings.onboarding.completed = true;
    settings.onboarding.tracking_consent = false;
    settings.profile.name = "Layout rehearsal".into();
    settings.profile.avatar.visible = true;
    storage.write_setting("user_settings", &settings)?;
    storage.write_setting("tracking_requested", &false)?;
    let preferences = crate::companion::engine::Preferences {
        daily_checkins: false,
        movement_reminder: false,
        deadline_reminders: false,
        screen_task_detection: false,
        hide_fullscreen: false,
        ..Default::default()
    };
    storage.write_setting("companion_preferences", &preferences)?;
    let mut ai = storage.ai_preferences()?;
    ai.enabled = false;
    storage.write_setting("ai_assistance_preferences", &ai)?;
    Ok(())
}
async fn pause(ms: u64) {
    tokio::time::sleep(Duration::from_millis(ms)).await;
}
async fn wait_painted(app: &AppHandle, mode: u8) -> Result<(), String> {
    for _ in 0..100 {
        let ready = {
            let state = app.state::<AppState>();
            let inner = state
                .inner
                .lock()
                .map_err(|_| "Rehearsal state unavailable")?;
            windows::audit_ready(&inner, mode)
        };
        if ready {
            return Ok(());
        }
        pause(50).await;
    }
    let state = app.state::<AppState>();
    let inner = state
        .inner
        .lock()
        .map_err(|_| "Rehearsal state unavailable")?;
    Err(format!(
        "Native readiness timed out: mode={mode}, panel={:?}, runtime_mode={}",
        inner.buddy.view.panel, inner.buddy.window_mode
    ))
}
pub async fn run(app: AppHandle) {
    let result = run_inner(&app).await;
    let report = match result {
        Ok(v) => v,
        Err(error) => {
            json!({"all_passed":false,"error":error,"fixture":"synthetic_native_layout","cloud_requests":0})
        }
    };
    if let Some(path) = std::env::var_os("BUDDY_LAYOUT_REPORT") {
        // Only the explicitly launched isolated developer process writes this report.
        let _ = std::fs::write(path, report.to_string());
    }
    println!("{report}");
    app.exit(if report["all_passed"] == true { 0 } else { 1 });
}
async fn run_inner(app: &AppHandle) -> Result<serde_json::Value, String> {
    let mascot = app
        .get_webview_window("mascot")
        .ok_or("Mascot unavailable")?;
    let card = app.get_webview_window("buddy").ok_or("Card unavailable")?;
    {
        let state = app.state::<AppState>();
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "Rehearsal state unavailable")?;
        inner.buddy.view.avatar = inner.storage.user_settings()?.profile.avatar;
        inner.buddy.view.preferences.suggestions_only = false;
        inner.buddy.view.quiet_reason = None;
        windows::sync(app, &mut inner, 1)?;
        crate::frontend_events::changed(app, &[crate::frontend_events::Resource::Dashboard], false);
    }
    wait_painted(app, 1).await?;
    let monitor = mascot
        .current_monitor()
        .map_err(|_| "Display unavailable")?
        .ok_or("Display unavailable")?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let width = (160.0 * scale) as i32;
    let height = (152.0 * scale) as i32;
    let offsets = [
        (20, 20),
        (area.size.width as i32 - width - 20, 20),
        (20, area.size.height as i32 - height - 20),
        (
            area.size.width as i32 - width - 20,
            area.size.height as i32 - height - 20,
        ),
        (
            (area.size.width as i32 - width) / 2,
            (area.size.height as i32 - height) / 2,
        ),
    ];
    let mut samples = 0;
    let mut directions = std::collections::BTreeSet::new();
    for cycle in 0..30 {
        if cycle % 6 == 0 {
            let (x, y) = offsets[cycle / 6];
            mascot
                .set_position(PhysicalPosition::new(
                    area.position.x + x,
                    area.position.y + y,
                ))
                .map_err(|_| "Could not place rehearsal mascot")?;
            let state = app.state::<AppState>();
            let mut inner = state
                .inner
                .lock()
                .map_err(|_| "Rehearsal state unavailable")?;
            windows::remember(app, &mut inner)?;
        }
        let before = (
            mascot
                .outer_position()
                .map_err(|_| "Mascot position unavailable")?,
            mascot.outer_size().map_err(|_| "Mascot size unavailable")?,
        );
        for mode in [3, 1, 2, 1] {
            {
                let state = app.state::<AppState>();
                let mut inner = state
                    .inner
                    .lock()
                    .map_err(|_| "Rehearsal state unavailable")?;
                inner.buddy.view.companion.chat_open = mode == 3;
                inner.buddy.view.companion.intervention =
                    (mode == 2).then(|| crate::companion::engine::Intervention {
                        id: "layout-rehearsal".into(),
                        kind: crate::companion::engine::Kind::Movement,
                        text: "A synthetic reminder. No personal data or provider request is used."
                            .into(),
                        confidence: 1.0,
                        goal_id: None,
                        plan_revision: None,
                        step_id: None,
                        expires_at: i64::MAX,
                    });
                windows::sync(app, &mut inner, mode)?;
                if let Some(panel) = &inner.buddy.view.panel {
                    directions.insert(serde_json::to_string(&panel.side).unwrap());
                }
                crate::frontend_events::changed(
                    app,
                    &[crate::frontend_events::Resource::Dashboard],
                    false,
                );
            }
            wait_painted(app, mode).await?;
            if cycle == 12 && mode == 2 {
                let inspect = std::env::var("BUDDY_LAYOUT_INSPECT_MS")
                    .ok()
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(0)
                    .min(20_000);
                pause(inspect).await;
            }
            for _ in 0..8 {
                pause(16).await;
                let after = (
                    mascot
                        .outer_position()
                        .map_err(|_| "Mascot position unavailable")?,
                    mascot.outer_size().map_err(|_| "Mascot size unavailable")?,
                );
                if after != before {
                    return Err("Mascot native geometry changed during a card transition".into());
                }
                if mode > 1
                    && !card
                        .is_visible()
                        .map_err(|_| "Card visibility unavailable")?
                {
                    return Err("A prepared card was not displayed".into());
                }
                if mode == 2 && card.is_focused().map_err(|_| "Card focus unavailable")? {
                    return Err("A background reminder acquired keyboard focus".into());
                }
                samples += 1;
            }
        }
    }
    Ok(
        json!({"all_passed":true,"fixture":"synthetic_native_layout","cloud_requests":0,"cycles":30,"native_geometry_samples":samples,"directions":directions,"scope":"Actual native window bounds and paint acknowledgements. Does not establish absence of every compositor-frame flash or physical Windows coverage."}),
    )
}
