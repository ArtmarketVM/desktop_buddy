use crate::{commands::AppState, models::*};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State};
#[cfg(debug_assertions)]
pub mod layout_check;
pub mod placement;
pub mod windows;

#[cfg(test)]
#[path = "buddy_tests.rs"]
mod tests;

pub struct Runtime {
    pub view: BuddyView,
    pub revision: u64,
    pub last_search: Option<Instant>,
    pub last_attempt_at: Option<i64>,
    pub shown: Option<Instant>,
    pub position: Option<BuddyPosition>,
    pub foreground: Option<ActivitySnapshot>,
    pub fullscreen: bool,
    window_mode: u8,
    positioned: bool,
    windows: windows::WindowState,
}
impl Runtime {
    pub fn new(preferences: BuddyPreferences) -> Self {
        Self {
            view: BuddyView {
                mascot_offset: [0.0; 2],
                panel: None,
                companion: Default::default(),
                avatar: Default::default(),
                activity_state: Default::default(),
                activity_event: Default::default(),
                activity_revision: 0,
                completion_revision: 0,
                background_thinking: false,
                preferences,
                suggestion: None,
                decision: None,
                quiet_reason: None,
                desktop_visible: false,
                visibility_reason: Some("Starting sumi".into()),
            },
            revision: 0,
            last_search: None,
            last_attempt_at: None,
            shown: None,
            position: None,
            foreground: None,
            fullscreen: false,
            window_mode: 255,
            positioned: false,
            windows: Default::default(),
        }
    }
    pub fn clear(&mut self) {
        self.view.suggestion = None;
        self.view.decision = None;
        self.shown = None;
        self.revision += 1;
    }
    pub fn decision(&mut self, decision: Decision) {
        self.view.suggestion = None;
        self.view.decision = Some(decision);
        self.shown = Some(Instant::now());
    }
}
#[allow(
    clippy::if_same_then_else,
    reason = "interventions and suggestions share the expanded mode but have separate eligibility rules"
)]
pub fn mode(status: &Status, view: &BuddyView) -> u8 {
    if status.dnd || view.companion.quiet_mode {
        if view.avatar.visible && !view.preferences.suggestions_only {
            1
        } else {
            0
        }
    } else if view.companion.chat_open {
        3
    } else if view.companion.intervention.is_some()
        && !status.dnd
        && !view.companion.preferences.paused
        && view.quiet_reason.is_none()
    {
        2
    } else if status.tracking
        && !status.dnd
        && !view
            .quiet_reason
            .as_deref()
            .is_some_and(|r| r != "Waiting for a pause in input")
        && (view.suggestion.is_some() || view.decision.is_some())
    {
        2
    } else if view.avatar.visible && !view.preferences.suggestions_only {
        1
    } else {
        0
    }
}
pub fn display_mode(status: &Status, view: &BuddyView, fullscreen: bool) -> u8 {
    if fullscreen && view.companion.preferences.hide_fullscreen {
        0
    } else {
        mode(status, view)
    }
}

fn visibility_reason(view: &BuddyView, fullscreen: bool) -> Option<String> {
    if !view.avatar.visible {
        Some("Hidden in Settings".into())
    } else if fullscreen && view.companion.preferences.hide_fullscreen {
        Some("Hidden in full-screen apps".into())
    } else if view.preferences.suggestions_only {
        Some("Waiting for a suggestion".into())
    } else {
        None
    }
}

pub fn remember_position(
    app: &AppHandle,
    inner: &mut crate::commands::Inner,
) -> Result<(), String> {
    windows::remember(app, inner)
}

pub fn clamp_position(
    anchor: &BuddyPosition,
    origin: (i32, i32),
    area: (u32, u32),
    size: (u32, u32),
) -> PhysicalPosition<i32> {
    let max_x = (origin.0 as i64 + area.0 as i64 - size.0 as i64).max(origin.0 as i64);
    let max_y = (origin.1 as i64 + area.1 as i64 - size.1 as i64).max(origin.1 as i64);
    PhysicalPosition::new(
        (anchor.x as i64 - size.0 as i64 / 2).clamp(origin.0 as i64, max_x) as i32,
        (anchor.y as i64 - size.1 as i64).clamp(origin.1 as i64, max_y) as i32,
    )
}
pub fn sync(app: &AppHandle, inner: &mut crate::commands::Inner) -> Result<(), String> {
    sync_window(app, inner)?;
    if let Err(error) = crate::frontend_events::sync(app, inner) {
        inner.last_error = Some(error);
    }
    Ok(())
}
fn sync_window(app: &AppHandle, inner: &mut crate::commands::Inner) -> Result<(), String> {
    remember_position(app, inner)?;
    let settings = inner.storage.user_settings()?;
    inner.buddy.view.avatar = settings.profile.avatar;
    if !settings.onboarding.completed {
        inner.buddy.view.avatar.visible = false;
    }
    inner.buddy.view.activity_state = inner.activity_state.state;
    inner.buddy.view.activity_event = inner.activity_state.event;
    inner.buddy.view.activity_revision = inner.activity_state.revision;
    inner.buddy.view.completion_revision = inner
        .storage
        .read_setting("mascot_completion_revision")?
        .unwrap_or(0);
    inner.buddy.view.background_thinking = inner.agent.is_thinking();
    inner.buddy.fullscreen = !inner.status.demo && crate::collector::foreground_fullscreen();
    inner.buddy.view.quiet_reason = crate::companion::delivery_reason(inner);
    if inner
        .buddy
        .shown
        .is_some_and(|t| t.elapsed() >= Duration::from_secs(45))
    {
        inner.buddy.clear();
    }
    crate::companion::tick(app, inner)?;
    inner.buddy.view.companion = inner.companion.view.clone();
    if !inner.companion.view.chat_open && inner.companion.view.intervention.is_none() {
        crate::insights::local_nudge(inner)?;
    }
    let legacy_card = inner.buddy.view.suggestion.is_some() || inner.buddy.view.decision.is_some();
    if legacy_card
        && inner.buddy.window_mode != 2
        && !inner.companion.memory.allowed(
            chrono::Utc::now().timestamp(),
            &inner.companion.view.preferences,
            chrono::Timelike::hour(&chrono::Local::now()) * 60
                + chrono::Timelike::minute(&chrono::Local::now()),
            inner.status.dnd || inner.companion.view.preferences.paused,
        )
    {
        inner.buddy.clear();
    }
    let mut mode = display_mode(&inner.status, &inner.buddy.view, inner.buddy.fullscreen);
    if mode != 2 && inner.buddy.shown.is_some() {
        inner.buddy.clear();
    }
    if mode == 2
        && inner.companion.view.intervention.is_none()
        && inner.buddy.window_mode != 2
        && !inner.storage.reserve_nudge(&inner.buddy.view.preferences)?
    {
        inner.buddy.clear();
        mode = display_mode(&inner.status, &inner.buddy.view, inner.buddy.fullscreen);
    }
    if mode == 2 && inner.buddy.window_mode != 2 && inner.companion.view.intervention.is_none() {
        let now = chrono::Utc::now().timestamp();
        let reason = inner
            .buddy
            .view
            .suggestion
            .as_ref()
            .map(|s| s.reason.as_str())
            .or_else(|| {
                inner
                    .buddy
                    .view
                    .decision
                    .as_ref()
                    .map(|d| d.reason.as_str())
            })
            .unwrap_or("");
        let prompt = crate::companion::engine::Intervention {
            id: crate::companion::engine::fingerprint(&format!(
                "legacy:{}:{reason}",
                inner.companion.memory.day
            )),
            kind: crate::companion::engine::Kind::Midday,
            text: String::new(),
            confidence: 1.0,
            goal_id: None,
            plan_revision: None,
            step_id: None,
            expires_at: now + 45,
        };
        if inner.companion.memory.reserve(&prompt, now) {
            inner
                .storage
                .write_setting("companion_memory", &inner.companion.memory)?;
        } else {
            inner.buddy.clear();
            mode = display_mode(&inner.status, &inner.buddy.view, inner.buddy.fullscreen);
        }
    }
    windows::sync(app, inner, mode)
}

#[tauri::command(async)]
pub fn show_desktop_buddy(
    visible: bool,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let mut settings = inner.storage.user_settings()?;
    if !settings.onboarding.completed {
        return Err("Finish setup before showing your desktop companion".into());
    }
    settings.profile.avatar.visible = visible;
    if !visible {
        inner.companion.view.chat_open = false;
        inner.companion.invalidate();
    }
    inner.storage.write_setting("user_settings", &settings)?;
    if visible {
        inner.buddy.view.preferences.suggestions_only = false;
        inner
            .storage
            .save_buddy_preferences(&inner.buddy.view.preferences)?;
    }
    inner.buddy.clear();
    sync(&app, &mut inner)
}
#[tauri::command(async)]
pub fn set_buddy_preferences(
    preferences: BuddyPreferences,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let preferences = crate::attention::validate_preferences(preferences)?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.save_buddy_preferences(&preferences)?;
    inner.privacy_revision += 1;
    inner.buddy.clear();
    inner.buddy.view.preferences = preferences;
    inner.usage = Default::default();
    inner.collector = crate::collector::create(inner.status.demo);
    inner.buddy.foreground = None;
    sync(&app, &mut inner)
}
#[tauri::command(async)]
pub fn reset_buddy_position(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.buddy.position = None;
    inner.buddy.positioned = false;
    inner.buddy.windows.forget_position();
    inner.buddy.window_mode = 255;
    inner
        .storage
        .write_setting("buddy_position", &Option::<BuddyPosition>::None)?;
    sync(&app, &mut inner)
}
#[tauri::command(async)]
pub fn rate_recommendation(
    id: i64,
    helpful: Option<bool>,
    state: State<AppState>,
) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.rate_recommendation(id, helpful)?;
    // Cancel a selection made with outdated preference feedback.
    inner.buddy.revision += 1;
    Ok(())
}
#[tauri::command(async)]
pub fn quit_app(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        remember_position(&app, &mut inner)?;
        inner.agent.cancel();
        inner.agent.diagnostics.last_event = Some(crate::agent_runtime::EventKind::SessionEnded);
    }
    app.exit(0);
    Ok(())
}
#[tauri::command(async)]
pub fn open_workspace(app: AppHandle) -> Result<(), String> {
    if let Ok(mut inner) = app.state::<AppState>().inner.lock() {
        inner.companion.planning_date = chrono::Local::now().date_naive().to_string();
    }
    let window = app
        .get_webview_window("main")
        .ok_or("Workspace unavailable")?;
    window.show().map_err(|_| "Could not show workspace")?;
    window
        .unminimize()
        .map_err(|_| "Could not restore workspace")?;
    window
        .set_focus()
        .map_err(|_| "Could not focus workspace".to_string())
}
/// Automatic research/help offers are retired. Research stays explicitly requested.
pub fn due(_inner: &crate::commands::Inner) -> bool {
    false
}
