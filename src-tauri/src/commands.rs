use crate::{collector, http, models::*, nebius, storage::Storage, tavily};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, State};

pub struct Inner {
    pub buddy: crate::buddy::Runtime,
    pub storage: Storage,
    pub collector: Box<dyn collector::ActivityCollector>,
    pub status: Status,
    pub last_analysis: Option<Instant>,
    pub last_nudge: Option<Instant>,
    pub last_error: Option<String>,
}
pub struct AppState {
    pub recommendation: tokio::sync::Mutex<()>,
    pub inner: Mutex<Inner>,
    pub client: reqwest::Client,
    pub analysis: tokio::sync::Mutex<()>,
}
impl AppState {
    pub fn new(storage: Storage) -> Result<Self, String> {
        let demo = http::enabled("DEMO_MODE");
        Ok(Self {
            recommendation: tokio::sync::Mutex::new(()),
            inner: Mutex::new(Inner {
                buddy: crate::buddy::Runtime::new(storage.buddy_preferences()?),
                storage,
                collector: collector::create(demo),
                status: Status {
                    tracking: false,
                    ai_enabled: false,
                    dnd: false,
                    demo,
                    mock_ai: http::enabled("AI_MOCK"),
                    nebius_configured: http::configured("NEBIUS_API_KEY"),
                    tavily_configured: http::configured("TAVILY_API_KEY"),
                },
                last_analysis: None,
                last_nudge: None,
                last_error: None,
            }),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(20))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|_| "Could not initialize HTTP client")?,
            analysis: tokio::sync::Mutex::new(()),
        })
    }
}
fn valid_text(text: &str) -> Result<&str, String> {
    let text = text.trim();
    if text.is_empty() || text.chars().count() > 500 {
        Err("Enter between 1 and 500 characters".into())
    } else {
        Ok(text)
    }
}

#[tauri::command]
pub fn set_provider_key(
    window: tauri::WebviewWindow,
    state: State<AppState>,
    provider: String,
    key: Option<String>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Open Settings in the main window".into());
    }
    let name = crate::credentials::provider_name(&provider)?;
    let key = key
        .as_deref()
        .map(crate::credentials::validate_key)
        .transpose()?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    crate::credentials::write(name, key)?;
    inner.status.nebius_configured = http::configured("NEBIUS_API_KEY");
    inner.status.tavily_configured = http::configured("TAVILY_API_KEY");
    inner.last_error = None;
    Ok(())
}

#[tauri::command]
pub fn get_dashboard(state: State<AppState>) -> Result<Dashboard, String> {
    let inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let goal = inner.storage.goal()?;
    let activity = if let Some(g) = &goal {
        inner.storage.recent(g.id)?
    } else {
        vec![]
    };
    let decision = if let Some(g) = &goal {
        inner.storage.latest_decision(g.id)?
    } else {
        None
    };
    Ok(Dashboard {
        version: env!("CARGO_PKG_VERSION"),
        buddy: inner.buddy.view.clone(),
        goal,
        activity,
        decision,
        status: inner.status.clone(),
        last_error: inner.last_error.clone(),
    })
}
#[tauri::command]
pub fn set_goal(text: String, app: AppHandle, state: State<AppState>) -> Result<Goal, String> {
    let text = valid_text(&text)?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let goal = inner.storage.set_goal(text)?;
    inner.status.tracking = true;
    inner.last_analysis = None;
    inner.last_nudge = None;
    inner.last_error = None;
    inner.collector = collector::create(inner.status.demo);
    inner.buddy.clear();
    crate::buddy::sync(&app, &mut inner)?;
    Ok(goal)
}
#[tauri::command]
pub fn get_current_goal(state: State<AppState>) -> Result<Option<Goal>, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .goal()
}
#[tauri::command]
pub fn get_recent_activity(state: State<AppState>) -> Result<Vec<ActivitySnapshot>, String> {
    let inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if let Some(goal) = inner.storage.goal()? {
        inner.storage.recent(goal.id)
    } else {
        Ok(vec![])
    }
}
#[tauri::command]
pub fn set_tracking(enabled: bool, app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if enabled && inner.storage.goal()?.is_none() {
        return Err("Set a goal first".into());
    }
    inner.status.tracking = enabled;
    inner.buddy.clear();
    inner.collector = collector::create(inner.status.demo);
    crate::buddy::sync(&app, &mut inner)?;
    Ok(())
}
#[tauri::command]
pub fn set_ai_enabled(enabled: bool, app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.status.ai_enabled = enabled;
    inner.last_error = None;
    if !enabled {
        inner.buddy.clear();
        crate::buddy::sync(&app, &mut inner)?;
    }
    Ok(())
}
#[tauri::command]
pub fn set_dnd(enabled: bool, app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.status.dnd = enabled;
    inner.buddy.clear();
    crate::buddy::sync(&app, &mut inner)?;
    Ok(())
}
#[tauri::command]
pub fn get_activity_snapshot(state: State<AppState>) -> Result<ActivitySnapshot, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if !inner.status.tracking {
        return Err("Activity tracking is paused".into());
    }
    inner.collector.collect()
}
#[tauri::command]
pub fn capture_screenshot_on_demand() -> Result<Vec<u8>, String> {
    collector::capture_screenshot_on_demand()
}
#[tauri::command]
pub fn dismiss_buddy(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.last_nudge = Some(Instant::now());
    inner.buddy.clear();
    crate::buddy::sync(&app, &mut inner)?;
    Ok(())
}
#[tauri::command]
pub fn save_feedback(
    decision_id: i64,
    related: bool,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.feedback(decision_id, related)?;
    inner.last_nudge = Some(Instant::now());
    inner.buddy.clear();
    crate::buddy::sync(&app, &mut inner)?;
    Ok(())
}
#[tauri::command]
pub async fn search_web(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    tavily::tavily_search(&state.client, valid_text(&query)?).await
}
#[tauri::command]
pub async fn analyze_focus(app: AppHandle, state: State<'_, AppState>) -> Result<Decision, String> {
    analyze(&app, &state, false).await
}

pub fn collect(state: &AppState) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if !inner.status.tracking {
        return Ok(());
    }
    if let Some(goal) = inner.storage.goal()? {
        let snapshot = inner.collector.collect()?;
        if !snapshot
            .process_name
            .eq_ignore_ascii_case("desktop-buddy.exe")
        {
            inner.storage.activity(goal.id, &snapshot)?;
        }
    }
    Ok(())
}
pub fn should_analyze(state: &AppState) -> bool {
    let Ok(inner) = state.inner.lock() else {
        return false;
    };
    inner.status.tracking
        && inner.status.ai_enabled
        && inner
            .last_analysis
            .map(|t| t.elapsed() >= Duration::from_secs(if inner.status.demo { 20 } else { 60 }))
            .unwrap_or(true)
}
async fn analyze(app: &AppHandle, state: &AppState, automatic: bool) -> Result<Decision, String> {
    let _guard = state
        .analysis
        .try_lock()
        .map_err(|_| "A focus check is already running")?;
    let (goal, activity, mock) = {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        if !inner.status.ai_enabled {
            return Err("Enable AI check-ins before sending activity to Nebius".into());
        }
        if automatic && !inner.status.tracking {
            return Err("Activity tracking is paused".into());
        }
        let goal = inner.storage.goal()?.ok_or("Set a goal first")?;
        let activity = inner.storage.recent(goal.id)?;
        inner.last_analysis = Some(Instant::now());
        if activity.is_empty() {
            return Err("Collect some activity before checking focus".into());
        }
        (goal, activity, inner.status.mock_ai)
    };
    let result = if mock {
        Ok(nebius::mock(&activity))
    } else {
        nebius::analyze(&state.client, &goal.text, &activity).await
    };
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if !inner.status.ai_enabled || inner.storage.goal()?.map(|g| g.id) != Some(goal.id) {
        return Err("Focus check discarded because the goal or consent changed".into());
    }
    let mut decision = match result {
        Ok(d) => d,
        Err(error) => {
            inner.last_error = Some(format!(
                "Focus check unavailable: {error}. Tracking remains local."
            ));
            return Err(error);
        }
    };
    inner.last_error = None;
    inner.storage.decision(goal.id, &mut decision)?;
    let cooldown = inner
        .last_nudge
        .map(|t| t.elapsed() >= Duration::from_secs(600))
        .unwrap_or(true);
    if should_nudge(&inner.status, cooldown, &decision, activity.last()) {
        if inner.buddy.shown.is_none() {
            inner.buddy.decision(decision.clone());
            crate::buddy::sync(app, &mut inner)?;
            inner.last_nudge = Some(Instant::now());
        }
    }
    Ok(decision)
}
pub async fn automatic_analysis(app: &AppHandle, state: &AppState) {
    let _ = analyze(app, state, true).await;
}

fn should_nudge(
    status: &Status,
    cooldown: bool,
    decision: &Decision,
    latest: Option<&ActivitySnapshot>,
) -> bool {
    status.tracking
        && status.ai_enabled
        && !status.dnd
        && cooldown
        && decision.confidence >= 0.75
        && decision.state != FocusState::Focused
        && decision.action != Action::Wait
        && latest
            .map(|a| {
                a.idle_seconds < 60
                    && (decision.action == Action::OfferHelp || a.active_seconds >= 120)
            })
            .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nudges_respect_consent_pause_dnd_idle_and_confidence() {
        let mut status = Status {
            tracking: true,
            ai_enabled: true,
            dnd: false,
            demo: false,
            mock_ai: false,
            nebius_configured: true,
            tavily_configured: true,
        };
        let mut decision = Decision {
            id: None,
            state: FocusState::Drifting,
            confidence: 0.9,
            reason: "Unrelated videos".into(),
            action: Action::Intervene,
        };
        let mut activity = ActivitySnapshot {
            timestamp: String::new(),
            process_name: "browser".into(),
            window_title: "Videos".into(),
            idle_seconds: 0,
            active_seconds: 180,
        };
        assert!(should_nudge(&status, true, &decision, Some(&activity)));
        assert!(!should_nudge(&status, false, &decision, Some(&activity)));
        status.dnd = true;
        assert!(!should_nudge(&status, true, &decision, Some(&activity)));
        status.dnd = false;
        status.tracking = false;
        assert!(!should_nudge(&status, true, &decision, Some(&activity)));
        status.tracking = true;
        status.ai_enabled = false;
        assert!(!should_nudge(&status, true, &decision, Some(&activity)));
        status.ai_enabled = true;
        activity.idle_seconds = 60;
        assert!(!should_nudge(&status, true, &decision, Some(&activity)));
        activity.idle_seconds = 0;
        activity.active_seconds = 15;
        assert!(!should_nudge(&status, true, &decision, Some(&activity)));
        activity.active_seconds = 180;
        decision.confidence = 0.4;
        assert!(!should_nudge(&status, true, &decision, Some(&activity)));
    }
    #[test]
    fn rejects_empty_and_oversized_input() {
        assert!(valid_text("  ").is_err());
        assert!(valid_text(&"a".repeat(501)).is_err());
        assert_eq!(valid_text("  Build a demo  ").unwrap(), "Build a demo");
    }

    #[test]
    fn demo_runs_from_goal_through_feedback() {
        let mut storage = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let goal = storage
            .set_goal("Finish the hackathon presentation")
            .unwrap();
        let mut collector = collector::create(true);
        for _ in 0..15 {
            storage
                .activity(goal.id, &collector.collect().unwrap())
                .unwrap();
        }
        let activity = storage.recent(goal.id).unwrap();
        assert_eq!(activity.len(), 3);
        assert_eq!(
            activity
                .iter()
                .map(|a| a.active_seconds)
                .collect::<Vec<_>>(),
            vec![600, 300, 420]
        );
        let mut decision = nebius::mock(&activity);
        assert_eq!(decision.state, FocusState::Drifting);
        storage.decision(goal.id, &mut decision).unwrap();
        storage.feedback(decision.id.unwrap(), true).unwrap();
        let saved = storage.latest_decision(goal.id).unwrap().unwrap();
        assert_eq!(saved.id, decision.id);
        let feedback_count: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM feedback WHERE decision_id=?1 AND related=1",
                [saved.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(feedback_count, 1);
    }
}
