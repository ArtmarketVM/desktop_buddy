use crate::{commands::AppState, models::*, nebius, tavily};
use std::time::{Duration, Instant};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, State};

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
}
impl Runtime {
    pub fn new(preferences: BuddyPreferences) -> Self {
        Self {
            view: BuddyView {
                activity_state: Default::default(),
                activity_event: Default::default(),
                activity_revision: 0,
                preferences,
                suggestion: None,
                decision: None,
                snoozed_until: None,
                quiet_reason: None,
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
pub fn mode(status: &Status, view: &BuddyView) -> u8 {
    if !status.tracking
        || status.dnd
        || snoozed(view)
        || view
            .quiet_reason
            .as_deref()
            .is_some_and(|r| r != "Waiting for a pause in input")
    {
        0
    } else if view.suggestion.is_some() || view.decision.is_some() {
        2
    } else if !view.preferences.suggestions_only {
        1
    } else {
        0
    }
}
pub fn snoozed(view: &BuddyView) -> bool {
    view.snoozed_until
        .is_some_and(|t| t > chrono::Utc::now().timestamp())
}

pub fn remember_position(
    app: &AppHandle,
    inner: &mut crate::commands::Inner,
) -> Result<(), String> {
    if inner.buddy.window_mode == 0 || inner.buddy.window_mode == 255 || !inner.buddy.positioned {
        return Ok(());
    }
    if let Some(window) = app.get_webview_window("buddy") {
        if let (Ok(p), Ok(s)) = (window.outer_position(), window.outer_size()) {
            let position = BuddyPosition {
                x: p.x + s.width as i32 / 2,
                y: p.y + s.height as i32,
            };
            if inner.buddy.position.as_ref() != Some(&position) {
                inner.storage.write_setting("buddy_position", &position)?;
                inner.buddy.position = Some(position);
            }
        }
    }
    Ok(())
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
    remember_position(app, inner)?;
    inner.buddy.view.activity_state = inner.activity_state.state;
    inner.buddy.view.activity_event = inner.activity_state.event;
    inner.buddy.view.activity_revision = inner.activity_state.revision;
    inner.buddy.view.quiet_reason = crate::attention::quiet_reason(
        &inner.buddy.view.preferences,
        inner.buddy.foreground.as_ref(),
        inner.buddy.fullscreen,
        inner.buddy.shown.is_some(),
    );
    if !inner.tracking_settings.working_now() {
        inner.buddy.view.quiet_reason = Some("Outside working hours".into());
    } else if inner
        .buddy
        .foreground
        .as_ref()
        .is_some_and(|a| a.media_playing)
    {
        inner.buddy.view.quiet_reason = Some("Media playback".into());
    } else if inner.activity_state.state == crate::tracking::ActivityState::Paused {
        inner.buddy.view.quiet_reason = Some("You are away".into());
    }
    if inner
        .buddy
        .shown
        .is_some_and(|t| t.elapsed() >= Duration::from_secs(45))
    {
        inner.buddy.clear();
    }
    crate::insights::local_nudge(inner)?;
    let mut mode = mode(&inner.status, &inner.buddy.view);
    if mode == 0 && inner.buddy.shown.is_some() {
        inner.buddy.clear();
    }
    if mode == 2
        && inner.buddy.window_mode != 2
        && !inner.storage.reserve_nudge(&inner.buddy.view.preferences)?
    {
        inner.buddy.clear();
        mode = self::mode(&inner.status, &inner.buddy.view);
    }
    if mode == inner.buddy.window_mode {
        return Ok(());
    }
    let window = app
        .get_webview_window("buddy")
        .ok_or("Buddy window unavailable")?;
    if mode == 0 {
        window.hide().map_err(|_| "Could not hide Buddy")?;
    } else {
        let (width, height) = if mode == 1 {
            (140.0, 140.0)
        } else {
            (380.0, 440.0)
        };
        window
            .set_size(LogicalSize::new(width, height))
            .map_err(|_| "Could not resize Buddy")?;
        let saved_monitor = window.available_monitors().ok().and_then(|monitors| {
            monitors.into_iter().find(|m| {
                let a = m.work_area();
                inner.buddy.position.as_ref().is_some_and(|p| {
                    p.x >= a.position.x
                        && p.x < a.position.x + a.size.width as i32
                        && p.y > a.position.y
                        && p.y <= a.position.y + a.size.height as i32
                })
            })
        });
        if let Some(monitor) = saved_monitor.or_else(|| window.primary_monitor().ok().flatten()) {
            let area = monitor.work_area();
            let size = window
                .outer_size()
                .map_err(|_| "Could not position Buddy")?;
            let min_x = area.position.x;
            let min_y = area.position.y;
            let max_x = (min_x + area.size.width as i32 - size.width as i32).max(min_x);
            let max_y = (min_y + area.size.height as i32 - size.height as i32).max(min_y);
            let position = inner
                .buddy
                .position
                .as_ref()
                .map(|anchor| {
                    clamp_position(
                        anchor,
                        (min_x, min_y),
                        (area.size.width, area.size.height),
                        (size.width, size.height),
                    )
                })
                .unwrap_or(PhysicalPosition::new(
                    max_x.saturating_sub(20).max(min_x),
                    max_y.saturating_sub(20).max(min_y),
                ));
            window
                .set_position(position)
                .map_err(|_| "Could not position Buddy")?;
            inner.buddy.positioned = true;
        }
        window.show().map_err(|_| "Could not show Buddy")?;
    }
    inner.buddy.window_mode = mode;
    Ok(())
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
pub fn snooze_buddy(enabled: bool, app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.buddy.view.snoozed_until = if enabled {
        Some(chrono::Utc::now().timestamp() + 3600)
    } else {
        None
    };
    inner
        .storage
        .write_setting("buddy_snooze", &inner.buddy.view.snoozed_until)?;
    inner.buddy.clear();
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
    }
    app.exit(0);
    Ok(())
}
#[tauri::command(async)]
pub fn open_workspace(app: AppHandle) -> Result<(), String> {
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
pub fn due(inner: &crate::commands::Inner) -> bool {
    inner.status.tracking
        && crate::tracking::notifications_allowed(inner)
        && inner
            .storage
            .nudge_allowed(&inner.buddy.view.preferences)
            .unwrap_or(false)
        && !inner.status.dnd
        && !snoozed(&inner.buddy.view)
        && inner.buddy.view.quiet_reason.is_none()
        && inner.buddy.view.preferences.proactive
        && !inner.status.mock_ai
        && inner.status.nebius_configured
        && inner.status.tavily_configured
        && inner.buddy.shown.is_none()
        && inner.buddy.last_search.is_none_or(|t| {
            t.elapsed()
                >= Duration::from_secs(inner.buddy.view.preferences.interval_minutes as u64 * 60)
        })
        && inner.buddy.last_attempt_at.is_none_or(|t| {
            chrono::Utc::now().timestamp().saturating_sub(t)
                >= inner.buddy.view.preferences.interval_minutes as i64 * 60
        })
}
pub async fn recommend(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let _guard = state
        .recommendation
        .try_lock()
        .map_err(|_| "A suggestion is already being prepared")?;
    let (goal, context, activity, memory, revision) = {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        if !due(&inner) {
            return Ok(());
        }
        let goal = inner.storage.goal()?.ok_or("Set a goal first")?;
        let activity: Vec<_> = inner
            .storage
            .recent(goal.id)?
            .into_iter()
            .filter(|a| !crate::attention::excluded(&inner.buddy.view.preferences, &a.process_name))
            .collect();
        if activity.is_empty() || !crate::tracking::notifications_allowed(&inner) {
            return Ok(());
        }
        inner.buddy.last_search = Some(Instant::now());
        inner.buddy.last_attempt_at = Some(chrono::Utc::now().timestamp());
        inner
            .storage
            .write_setting("buddy_last_attempt", &inner.buddy.last_attempt_at)?;
        let context = inner.storage.goal_context(&goal)?;
        let memory = inner.storage.recommendation_memory(goal.id)?;
        (goal, context, activity, memory, inner.buddy.revision)
    };
    let plan = nebius::search_plan(&state.client, &context, &activity, &memory).await?;
    let Some(query) = plan.query else {
        return Ok(());
    };
    // Consent and session must still match before sending the derived query to Tavily.
    {
        let inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        if !valid(&inner, goal.id, revision)? {
            return Ok(());
        }
    }
    let results = tavily::tavily_search(&state.client, &query).await?;
    let candidates = {
        let inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        if !valid(&inner, goal.id, revision)? {
            return Ok(());
        }
        crate::recommendations::fresh_candidates(
            results,
            inner.storage.seen_resource_keys(goal.id)?,
        )
    };
    if candidates.is_empty() {
        return Ok(());
    }
    let selection = nebius::select_resource(&state.client, &context, &candidates, &memory).await?;
    let Some(index) = selection.index else {
        return Ok(());
    };
    let result = candidates
        .get(index)
        .ok_or("Nebius selected an unavailable resource")?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if !valid(&inner, goal.id, revision)? {
        return Ok(());
    }
    // Recheck against retained history at the write boundary, not just before selection.
    let seen = inner.storage.seen_resource_keys(goal.id)?;
    if crate::recommendations::resource_key(&result.url).is_none_or(|key| seen.contains(&key)) {
        return Ok(());
    }
    let reason = format!(
        "{}\nTry this: {}",
        selection.reason.trim(),
        selection
            .next_action
            .as_deref()
            .ok_or("No next action returned")?
            .trim()
    );
    let id = inner
        .storage
        .record_recommendation(goal.id, &result.title, &result.url, &reason)?;
    inner.buddy.view.suggestion = Some(Suggestion {
        id,
        title: result.title.chars().take(180).collect(),
        url: result.url.clone(),
        reason,
    });
    inner.buddy.view.decision = None;
    inner.buddy.shown = Some(Instant::now());
    inner.last_nudge = Some(Instant::now());
    sync(app, &mut inner)
}
fn valid(inner: &crate::commands::Inner, goal: i64, revision: u64) -> Result<bool, String> {
    Ok(inner.status.tracking
        && crate::tracking::notifications_allowed(inner)
        && inner.storage.nudge_allowed(&inner.buddy.view.preferences)?
        && !inner.status.dnd
        && !snoozed(&inner.buddy.view)
        && inner.buddy.view.quiet_reason.is_none()
        && inner.buddy.view.preferences.proactive
        && inner.buddy.shown.is_none()
        && inner.buddy.revision == revision
        && inner.storage.goal()?.map(|g| g.id) == Some(goal))
}
