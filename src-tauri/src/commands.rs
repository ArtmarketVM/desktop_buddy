use crate::{collector, http, models::*, nebius, storage::Storage, tavily};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, State};

pub struct Inner {
    pub goal_matching: crate::goal_matching::Runtime,
    pub companion: crate::companion::Runtime,
    pub tracking_settings: crate::tracking::TrackingSettings,
    pub activity_state: crate::tracking::StateTracker,
    pub usage: crate::insights::UsageTracker,
    pub retention_days: u32,
    pub last_cleanup: Instant,
    pub privacy_revision: u64,
    pub buddy: crate::buddy::Runtime,
    pub storage: Storage,
    pub collector: Box<dyn collector::ActivityCollector>,
    pub status: Status,
    pub last_analysis: Option<Instant>,
    pub last_nudge: Option<Instant>,
    pub last_error: Option<String>,
}
pub struct AppState {
    pub companion_request: tokio::sync::Mutex<()>,
    pub recommendation: tokio::sync::Mutex<()>,
    pub inner: Mutex<Inner>,
    pub client: reqwest::Client,
    pub analysis: tokio::sync::Mutex<()>,
}
impl AppState {
    pub fn new(mut storage: Storage) -> Result<Self, String> {
        let demo = http::enabled("DEMO_MODE");
        let mut buddy = crate::buddy::Runtime::new(crate::attention::validate_preferences(
            storage.buddy_preferences()?,
        )?);
        buddy.position = storage.read_setting("buddy_position")?;
        buddy.view.snoozed_until = storage.read_setting("buddy_snooze")?;
        buddy.last_attempt_at = storage.read_setting("buddy_last_attempt")?;
        let retention_days = storage.read_setting("retention_days")?.unwrap_or(0);
        crate::privacy::validate_retention(retention_days)?;
        if retention_days > 0 {
            let cutoff =
                (chrono::Utc::now() - chrono::Duration::days(retention_days as i64)).to_rfc3339();
            storage.purge_history(Some(&cutoff))?;
        }
        let tracking = crate::tracking::requested(&storage)?;
        Ok(Self {
            companion_request: tokio::sync::Mutex::new(()),
            recommendation: tokio::sync::Mutex::new(()),
            inner: Mutex::new(Inner {
                goal_matching: Default::default(),
                companion: crate::companion::Runtime::load(&storage)?,
                tracking_settings: storage.tracking_settings()?,
                activity_state: Default::default(),
                usage: Default::default(),
                retention_days,
                last_cleanup: Instant::now(),
                privacy_revision: 0,
                buddy,
                storage,
                collector: collector::create(demo),
                status: Status {
                    tracking,
                    tracking_error: None,
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

#[tauri::command(async)]
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
    inner.privacy_revision += 1;
    if key.is_some() {
        inner.storage.connection.execute("UPDATE core_goal_analyses SET state='queued',message=NULL,attempts=0 WHERE state='failed'",[]).map_err(|_| "Could not resume goal suggestions")?;
    }
    inner.status.nebius_configured = http::configured("NEBIUS_API_KEY");
    inner.status.tavily_configured = http::configured("TAVILY_API_KEY");
    inner.last_error = None;
    Ok(())
}

#[tauri::command(async)]
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
        goal_matching: inner.goal_matching.view.clone(),
        user_settings: inner.storage.user_settings()?,
        app_rules: goal
            .as_ref()
            .map(|g| inner.storage.app_rules(g.id))
            .transpose()?
            .unwrap_or_default(),
        today: inner.storage.today(goal.as_ref().map(|g| g.id))?,
        goal_plan: goal
            .as_ref()
            .map(|g| inner.storage.goal_plan(g.id))
            .transpose()?,
        saved_goals: inner.storage.saved_goals()?,
        retention_days: inner.retention_days,
        recommendations: inner.storage.recommendation_history()?,
        version: env!("CARGO_PKG_VERSION"),
        buddy: inner.buddy.view.clone(),
        goal,
        activity,
        decision,
        status: inner.status.clone(),
        last_error: inner.last_error.clone(),
    })
}
#[tauri::command(async)]
pub fn set_goal(text: String, app: AppHandle, state: State<AppState>) -> Result<Goal, String> {
    let text = valid_text(&text)?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let goal = inner.storage.set_goal(text)?;
    inner.status.tracking = inner.storage.user_settings()?.onboarding.tracking_consent;
    inner.last_analysis = None;
    inner.last_nudge = None;
    inner.last_error = None;
    inner.collector = collector::create(inner.status.demo);
    inner.usage = Default::default();
    inner.activity_state.stop(false);
    inner.buddy.foreground = None;
    inner.buddy.clear();
    crate::buddy::sync(&app, &mut inner)?;
    crate::companion::emit(&app, "goal.created", &goal);
    Ok(goal)
}
#[tauri::command(async)]
pub fn get_current_goal(state: State<AppState>) -> Result<Option<Goal>, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .goal()
}
#[tauri::command(async)]
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
#[tauri::command(async)]
pub fn set_tracking(enabled: bool, app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if enabled {
        let mut settings = inner.storage.user_settings()?;
        if !settings.onboarding.completed {
            return Err("Finish onboarding before enabling activity tracking".into());
        }
        settings.onboarding.tracking_consent = true;
        inner.storage.write_setting("user_settings", &settings)?;
    }
    inner
        .storage
        .write_setting("tracking_requested", &enabled)?;
    inner.status.tracking = enabled;
    inner.goal_matching.clear();
    inner.status.tracking_error = None;
    if !enabled {
        if let Some(goal) = inner.storage.goal()? {
            if inner.activity_state.state != crate::tracking::ActivityState::Paused {
                inner
                    .storage
                    .tracking_event(goal.id, crate::tracking::ActivityEvent::Paused)?;
            }
        }
    }
    inner.activity_state.stop(false);
    inner.buddy.clear();
    inner.collector = collector::create(inner.status.demo);
    inner.usage = Default::default();
    inner.buddy.foreground = None;
    crate::buddy::sync(&app, &mut inner)?;
    Ok(())
}
#[tauri::command(async)]
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
#[tauri::command(async)]
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
#[tauri::command(async)]
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
#[tauri::command(async)]
pub fn capture_screenshot_on_demand() -> Result<Vec<u8>, String> {
    collector::capture_screenshot_on_demand()
}
#[tauri::command(async)]
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
#[tauri::command(async)]
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
#[tauri::command(async)]
pub async fn search_web(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    tavily::tavily_search(&state.client, valid_text(&query)?).await
}
#[tauri::command(async)]
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
    {
        let settings = inner.tracking_settings.clone();
        let excluded = inner.buddy.view.preferences.excluded_apps.clone();
        inner.collector.configure(&settings, &excluded);
        let mut snapshot = match inner.collector.collect() {
            Ok(snapshot) => {
                inner.status.tracking_error = None;
                snapshot
            }
            Err(error) => {
                inner.usage = Default::default();
                if error == collector::CONTEXT_CHANGED {
                    return Ok(());
                }
                inner.status.tracking_error = Some(
                    "Active-window tracking is unavailable. Pause and resume tracking to retry."
                        .into(),
                );
                return Err("Active-window tracking is unavailable".into());
            }
        };
        inner.buddy.fullscreen = !inner.status.demo && collector::foreground_fullscreen();
        let allowed = !snapshot
            .process_name
            .eq_ignore_ascii_case("desktop-buddy.exe")
            && !crate::attention::excluded(&inner.buddy.view.preferences, &snapshot.process_name);
        if !inner.tracking_settings.browser_metadata {
            snapshot.browser =
                crate::browser::context(&snapshot.process_name, &snapshot.window_title, None);
        }
        let preferences = inner.storage.ai_preferences()?;
        let matching = preferences.automatic_goal_matching;
        // Preserve local matching when cloud attribution has not been enabled.
        if !matching && allowed {
            if let Some(id) = inner
                .storage
                .match_activity(&snapshot)?
                .goal_id
                .and_then(|value| value.parse::<i64>().ok())
                .filter(|id| inner.storage.goal().ok().flatten().map(|goal| goal.id) != Some(*id))
            {
                inner.storage.transition_goal(id, "resume")?;
                inner.usage = Default::default();
                inner.activity_state.stop(false);
                inner.privacy_revision += 1;
                inner.companion.invalidate();
                inner.buddy.clear();
            }
        }
        if matching && preferences.enabled {
            inner.goal_matching.observe(
                &snapshot,
                allowed && snapshot.idle_seconds < settings.idle_seconds,
            );
        } else {
            inner.goal_matching.clear();
            if matching {
                inner.goal_matching.view.enabled = true;
                inner.goal_matching.view.reason =
                    Some("Enable AI assistance to match goals. Activity stays unassigned.".into());
            }
        }
        let goal = inner.storage.goal()?;
        let Some(goal) =
            goal.filter(|goal| !matching || inner.goal_matching.view.goal_id == Some(goal.id))
        else {
            inner.usage = Default::default();
            inner.activity_state.stop(false);
            inner.buddy.foreground = None;
            return Ok(());
        };
        let revision = inner.activity_state.revision;
        let activity_state = inner
            .activity_state
            .sample(goal.id, &snapshot, allowed, &settings);
        if allowed && inner.activity_state.revision != revision {
            inner
                .storage
                .tracking_event(goal.id, inner.activity_state.event)?;
        }
        if let Some(interval) = inner
            .usage
            .observe(goal.id, &snapshot, allowed, activity_state)
        {
            if matching {
                let view = &inner.goal_matching.view;
                let attribution = crate::relevance::ActivityMatch {
                    goal_id: view.goal_id.map(|id| id.to_string()),
                    confidence: view.confidence.unwrap_or(0.0),
                    reason: view.reason.clone().unwrap_or_else(|| "No AI match".into()),
                };
                inner
                    .storage
                    .record_interval_with_match(goal.id, &interval, Some(attribution))?;
            } else {
                inner.storage.record_interval(goal.id, &interval)?;
            }
        }
        inner.buddy.foreground = Some(snapshot.clone());
        crate::companion::observe(&mut inner, &snapshot, allowed);
        if allowed {
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
        && inner.buddy.view.avatar.visible
        && crate::tracking::notifications_allowed(&inner)
        && inner.status.ai_enabled
        && crate::insights::explicit_category(&inner).is_ok_and(|c| c.is_none())
        && inner
            .storage
            .nudge_allowed(&inner.buddy.view.preferences)
            .unwrap_or(false)
        && inner.buddy.view.quiet_reason.is_none()
        && !crate::buddy::snoozed(&inner.buddy.view)
        && !inner.status.dnd
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
    let (goal, context, activity, mock, privacy_revision) = {
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
        let activity: Vec<_> = inner
            .storage
            .recent(goal.id)?
            .into_iter()
            .filter(|a| !crate::attention::excluded(&inner.buddy.view.preferences, &a.process_name))
            .collect();
        inner.last_analysis = Some(Instant::now());
        if activity.is_empty() {
            return Err("Collect some activity before checking focus".into());
        }
        let context = inner.storage.goal_context(&goal)?;
        (
            goal,
            context,
            activity,
            inner.status.mock_ai,
            inner.privacy_revision,
        )
    };
    let result = if mock {
        Ok(nebius::mock(&activity))
    } else {
        nebius::analyze(&state.client, &context, &activity).await
    };
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if !inner.status.ai_enabled
        || inner.storage.goal()?.map(|g| g.id) != Some(goal.id)
        || inner.privacy_revision != privacy_revision
    {
        return Err("Focus check discarded because the goal or consent changed".into());
    }
    if automatic
        && (inner.buddy.view.quiet_reason.is_some()
            || crate::buddy::snoozed(&inner.buddy.view)
            || inner.status.dnd
            || !inner.status.tracking)
    {
        return Err("Focus check discarded while Buddy is quiet".into());
    }
    let mut decision = match result {
        Ok(d) => d,
        Err(error) => {
            let message = crate::goal_analysis::user_error("focus_check", &error);
            inner.last_error = Some(message.clone());
            return Err(message);
        }
    };
    inner.last_error = None;
    inner.storage.decision(goal.id, &mut decision)?;
    let cooldown = inner
        .last_nudge
        .map(|t| t.elapsed() >= Duration::from_secs(600))
        .unwrap_or(true);
    if inner.buddy.view.quiet_reason.is_none()
        && crate::tracking::notifications_allowed(&inner)
        && crate::insights::explicit_category(&inner)?.is_none()
        && !crate::buddy::snoozed(&inner.buddy.view)
        && should_nudge(
            &inner.status,
            cooldown,
            &decision,
            activity.last(),
            inner.tracking_settings.idle_seconds,
        )
    {
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
    idle_threshold: u64,
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
                a.idle_seconds < idle_threshold
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
            tracking_error: None,
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
            ..Default::default()
        };
        assert!(should_nudge(&status, true, &decision, Some(&activity), 300));
        assert!(!should_nudge(
            &status,
            false,
            &decision,
            Some(&activity),
            300
        ));
        status.dnd = true;
        assert!(!should_nudge(
            &status,
            true,
            &decision,
            Some(&activity),
            300
        ));
        status.dnd = false;
        status.tracking = false;
        assert!(!should_nudge(
            &status,
            true,
            &decision,
            Some(&activity),
            300
        ));
        status.tracking = true;
        status.ai_enabled = false;
        assert!(!should_nudge(
            &status,
            true,
            &decision,
            Some(&activity),
            300
        ));
        status.ai_enabled = true;
        activity.idle_seconds = 400;
        assert!(should_nudge(&status, true, &decision, Some(&activity), 600));
        assert!(!should_nudge(
            &status,
            true,
            &decision,
            Some(&activity),
            300
        ));
        activity.idle_seconds = 300;
        assert!(!should_nudge(
            &status,
            true,
            &decision,
            Some(&activity),
            300
        ));
        activity.idle_seconds = 0;
        activity.active_seconds = 15;
        assert!(!should_nudge(
            &status,
            true,
            &decision,
            Some(&activity),
            300
        ));
        activity.active_seconds = 180;
        decision.confidence = 0.4;
        assert!(!should_nudge(
            &status,
            true,
            &decision,
            Some(&activity),
            300
        ));
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
