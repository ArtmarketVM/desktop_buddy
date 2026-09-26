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
    pub shown: Option<Instant>,
    window_mode: u8,
    positioned: bool,
}
impl Runtime {
    pub fn new(preferences: BuddyPreferences) -> Self {
        Self {
            view: BuddyView {
                preferences,
                suggestion: None,
                decision: None,
            },
            revision: 0,
            last_search: None,
            shown: None,
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
    if !status.tracking || status.dnd {
        0
    } else if view.suggestion.is_some() || view.decision.is_some() {
        2
    } else if !view.preferences.suggestions_only {
        1
    } else {
        0
    }
}
pub fn sync(app: &AppHandle, inner: &mut crate::commands::Inner) -> Result<(), String> {
    if inner
        .buddy
        .shown
        .is_some_and(|t| t.elapsed() >= Duration::from_secs(45))
    {
        inner.buddy.clear();
    }
    let mode = mode(&inner.status, &inner.buddy.view);
    if mode == inner.buddy.window_mode {
        return Ok(());
    }
    let window = app
        .get_webview_window("buddy")
        .ok_or("Buddy window unavailable")?;
    if mode == 0 {
        window.hide().map_err(|_| "Could not hide Buddy")?;
    } else {
        let old_position = window.outer_position().ok();
        let old_size = window.outer_size().ok();
        let (width, height) = if mode == 1 {
            (140.0, 140.0)
        } else {
            (380.0, 440.0)
        };
        window
            .set_size(LogicalSize::new(width, height))
            .map_err(|_| "Could not resize Buddy")?;
        if let Some(monitor) = window
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| window.primary_monitor().ok().flatten())
        {
            let area = monitor.work_area();
            let size = window
                .outer_size()
                .map_err(|_| "Could not position Buddy")?;
            let min_x = area.position.x;
            let min_y = area.position.y;
            let max_x = (min_x + area.size.width as i32 - size.width as i32).max(min_x);
            let max_y = (min_y + area.size.height as i32 - size.height as i32).max(min_y);
            let previous = match (old_position, old_size) {
                (Some(p), Some(s)) => PhysicalPosition::new(
                    p.x + (s.width as i32 - size.width as i32) / 2,
                    p.y + s.height as i32 - size.height as i32,
                ),
                _ => PhysicalPosition::new(max_x, max_y),
            };
            let position = if !inner.buddy.positioned {
                PhysicalPosition::new(
                    max_x.saturating_sub(20).max(min_x),
                    max_y.saturating_sub(20).max(min_y),
                )
            } else {
                PhysicalPosition::new(
                    previous.x.clamp(min_x, max_x),
                    previous.y.clamp(min_y, max_y),
                )
            };
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
#[tauri::command]
pub fn set_buddy_preferences(
    preferences: BuddyPreferences,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.save_buddy_preferences(&preferences)?;
    inner.buddy.clear();
    inner.buddy.view.preferences = preferences;
    sync(&app, &mut inner)
}
#[tauri::command]
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
        && !inner.status.dnd
        && inner.buddy.view.preferences.proactive
        && !inner.status.mock_ai
        && inner.status.nebius_configured
        && inner.status.tavily_configured
        && inner.buddy.shown.is_none()
        && inner
            .buddy
            .last_search
            .is_none_or(|t| t.elapsed() >= Duration::from_secs(900))
}
pub async fn recommend(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let _guard = state
        .recommendation
        .try_lock()
        .map_err(|_| "A suggestion is already being prepared")?;
    let (goal, activity, revision) = {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        if !due(&inner) {
            return Ok(());
        }
        let goal = inner.storage.goal()?.ok_or("Set a goal first")?;
        let activity = inner.storage.recent(goal.id)?;
        if activity.is_empty() || activity.last().is_some_and(|a| a.idle_seconds >= 60) {
            return Ok(());
        }
        inner.buddy.last_search = Some(Instant::now());
        (goal, activity, inner.buddy.revision)
    };
    let plan = nebius::search_plan(&state.client, &goal.text, &activity).await?;
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
    let results = tavily::tavily_search(&state.client, &plan.query).await?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if !valid(&inner, goal.id, revision)? {
        return Ok(());
    }
    for result in results {
        let Ok(mut url) = reqwest::Url::parse(&result.url) else {
            continue;
        };
        if !url.username().is_empty() || url.password().is_some() {
            continue;
        }
        url.set_fragment(None);
        let url = url.to_string();
        if inner.storage.seen_suggestion(goal.id, &url)? {
            continue;
        }
        inner.storage.save_suggestion(goal.id, &url)?;
        inner.buddy.view.suggestion = Some(Suggestion {
            title: result.title.chars().take(180).collect(),
            url,
            reason: plan.reason,
        });
        inner.buddy.view.decision = None;
        inner.buddy.shown = Some(Instant::now());
        inner.last_nudge = Some(Instant::now());
        return sync(app, &mut inner);
    }
    Ok(())
}
fn valid(inner: &crate::commands::Inner, goal: i64, revision: u64) -> Result<bool, String> {
    Ok(inner.status.tracking
        && !inner.status.dnd
        && inner.buddy.view.preferences.proactive
        && inner.buddy.shown.is_none()
        && inner.buddy.revision == revision
        && inner.storage.goal()?.map(|g| g.id) == Some(goal))
}
