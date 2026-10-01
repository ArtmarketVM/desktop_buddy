use crate::{
    commands::{AppState, Inner},
    models::*,
    storage::Storage,
};
use chrono::{DateTime, Local, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::{AppHandle, State};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    Work,
    Distraction,
    Neutral,
}

#[derive(Serialize)]
pub struct AppRule {
    pub process_name: String,
    pub category: Category,
}
#[derive(Serialize)]
pub struct AppTime {
    pub process_name: String,
    pub seconds: u64,
    pub goal_seconds: u64,
}
#[derive(Serialize)]
pub struct Today {
    pub date: String,
    pub apps: Vec<AppTime>,
    pub nudges: u32,
}

/// Separate from the legacy cumulative activity rows. Never backfill elapsed time.
#[derive(Default)]
pub struct UsageTracker {
    observation: Option<(
        i64,
        ActivitySnapshot,
        bool,
        crate::tracking::ActivityState,
        Instant,
        DateTime<Utc>,
    )>,
}
impl UsageTracker {
    pub fn observe(
        &mut self,
        goal: i64,
        a: &ActivitySnapshot,
        allowed: bool,
        state: crate::tracking::ActivityState,
    ) -> Option<crate::history::UsageInterval> {
        self.observe_at(goal, a, allowed, state, Instant::now(), Utc::now())
    }
    pub(crate) fn observe_at(
        &mut self,
        goal: i64,
        a: &ActivitySnapshot,
        allowed: bool,
        state: crate::tracking::ActivityState,
        now: Instant,
        wall: DateTime<Utc>,
    ) -> Option<crate::history::UsageInterval> {
        let interval = self.observation.as_ref().and_then(
            |(g, previous, was_allowed, previous_state, last, last_wall)| {
                let elapsed = now.duration_since(*last);
                let wall_ms = (wall - *last_wall).num_milliseconds();
                if *g == goal
                    && allowed
                    && *was_allowed
                    && state == *previous_state
                    && crate::tracking::same_context(previous, a)
                    && elapsed <= std::time::Duration::from_secs(15)
                    && wall_ms > 0
                    && (wall_ms - elapsed.as_millis() as i64).abs() < 1000
                {
                    Some(crate::history::UsageInterval {
                        start: *last_wall,
                        end: wall,
                        activity: previous.clone(),
                        state,
                    })
                } else {
                    None
                }
            },
        );
        self.observation = Some((goal, a.clone(), allowed, state, now, wall));
        interval
    }
}

#[derive(Default, Serialize, Deserialize)]
pub struct NudgeBudget {
    pub day: String,
    pub count: u32,
    pub last_at: Option<i64>,
}
impl NudgeBudget {
    pub fn permits(&self, p: &BuddyPreferences, day: &str, now: i64) -> bool {
        (self.day != day || self.count < p.daily_nudge_limit)
            && p.daily_nudge_limit > 0
            && self
                .last_at
                .is_none_or(|t| now.saturating_sub(t) >= i64::from(p.nudge_interval_minutes) * 60)
    }
}

impl Storage {
    pub fn app_rules(&self, goal: i64) -> Result<Vec<AppRule>, String> {
        let mut q = self.connection.prepare("SELECT process_name,category FROM app_rules WHERE goal_id=?1 ORDER BY process_name").map_err(|e| e.to_string())?;
        let rows = q
            .query_map([goal], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        rows.map(|r| {
            let (process_name, value) = r.map_err(|e| e.to_string())?;
            Ok(AppRule {
                process_name,
                category: serde_json::from_str(&value).map_err(|e| e.to_string())?,
            })
        })
        .collect()
    }
    pub fn category(&self, goal: i64, process: &str) -> Result<Option<Category>, String> {
        let value: Option<String> = self
            .connection
            .query_row(
                "SELECT category FROM app_rules WHERE goal_id=?1 AND process_name=?2",
                params![goal, process.to_ascii_lowercase()],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        value
            .map(|v| serde_json::from_str(&v).map_err(|e| e.to_string()))
            .transpose()
    }
    pub fn save_app_rule(
        &self,
        goal: i64,
        process: &str,
        category: Option<Category>,
    ) -> Result<(), String> {
        if self.goal()?.map(|g| g.id) != Some(goal) {
            return Err("The active goal changed. Refresh and try again.".into());
        }
        let process = process.trim().to_ascii_lowercase();
        if process.is_empty()
            || process.len() > 100
            || process.contains(['/', '\\'])
            || process.chars().any(char::is_control)
        {
            return Err("Enter a process name such as chrome.exe, not a path".into());
        }
        if let Some(category) = category {
            let count: u32 = self
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM app_rules WHERE goal_id=?1",
                    [goal],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if count >= 100 && self.category(goal, &process)?.is_none() {
                return Err("Use at most 100 app rules per goal".into());
            }
            let tx = self
                .connection
                .unchecked_transaction()
                .map_err(|e| e.to_string())?;
            tx.execute(
                "DELETE FROM preset_exclusions WHERE goal_id=?1 AND process_name=?2",
                params![goal, process],
            )
            .map_err(|e| e.to_string())?;
            tx.execute("INSERT INTO app_rules(goal_id,process_name,category) VALUES(?1,?2,?3) ON CONFLICT(goal_id,process_name) DO UPDATE SET category=excluded.category,preset_source=NULL",params![goal,process,serde_json::to_string(&category).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
        } else {
            let tx = self
                .connection
                .unchecked_transaction()
                .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT OR IGNORE INTO preset_exclusions(goal_id,process_name) VALUES(?1,?2)",
                params![goal, process],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "DELETE FROM app_rules WHERE goal_id=?1 AND process_name=?2",
                params![goal, process],
            )
            .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(test)]
    pub fn record_usage(
        &mut self,
        goal: i64,
        process: &str,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<(), String> {
        let duration = (end - start).num_milliseconds();
        if !(1..=15000).contains(&duration) {
            return Ok(());
        }
        let mut buckets = std::collections::BTreeMap::<String, i64>::new();
        let mut cursor = start.timestamp_millis();
        // Split at second boundaries, including local midnight, without assuming a 24-hour day.
        while cursor < end.timestamp_millis() {
            let next = ((cursor.div_euclid(1000) + 1) * 1000).min(end.timestamp_millis());
            let date = DateTime::from_timestamp_millis(cursor)
                .ok_or("Invalid sample time")?
                .with_timezone(&Local)
                .date_naive()
                .to_string();
            *buckets.entry(date).or_default() += next - cursor;
            cursor = next;
        }
        let tx = self.connection.transaction().map_err(|e| e.to_string())?;
        for (date, milliseconds) in buckets {
            tx.execute("INSERT INTO usage_daily(day,goal_id,process_name,milliseconds) VALUES(?1,?2,?3,?4) ON CONFLICT(day,goal_id,process_name) DO UPDATE SET milliseconds=milliseconds+excluded.milliseconds",params![date,goal,process,milliseconds]).map_err(|e|e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn today(&self, goal: Option<i64>) -> Result<Today, String> {
        let date = Local::now().date_naive().to_string();
        let mut q = self.connection.prepare("SELECT process_name,SUM(milliseconds)/1000,SUM(CASE WHEN goal_id=?2 THEN milliseconds ELSE 0 END)/1000 FROM usage_daily WHERE day=?1 GROUP BY process_name ORDER BY SUM(milliseconds) DESC,process_name").map_err(|e|e.to_string())?;
        let apps = q
            .query_map(params![date, goal], |r| {
                Ok(AppTime {
                    process_name: r.get(0)?,
                    seconds: r.get(1)?,
                    goal_seconds: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        let budget: NudgeBudget = self.read_setting("nudge_budget")?.unwrap_or_default();
        let nudges = if budget.day == date { budget.count } else { 0 };
        Ok(Today { date, apps, nudges })
    }
    pub fn nudge_allowed(&self, p: &BuddyPreferences) -> Result<bool, String> {
        let budget: NudgeBudget = self.read_setting("nudge_budget")?.unwrap_or_default();
        Ok(budget.permits(
            p,
            &Local::now().date_naive().to_string(),
            Utc::now().timestamp(),
        ))
    }
    pub fn reserve_nudge(&self, p: &BuddyPreferences) -> Result<bool, String> {
        let day = Local::now().date_naive().to_string();
        let now = Utc::now().timestamp();
        let mut budget: NudgeBudget = self.read_setting("nudge_budget")?.unwrap_or_default();
        if !budget.permits(p, &day, now) {
            return Ok(false);
        }
        budget.count = if budget.day == day {
            budget.count + 1
        } else {
            1
        };
        budget.day = day;
        budget.last_at = Some(now);
        self.write_setting("nudge_budget", &budget)?;
        Ok(true)
    }
}

pub fn explicit_category(inner: &Inner) -> Result<Option<Category>, String> {
    match (inner.storage.goal()?, &inner.buddy.foreground) {
        (Some(goal), Some(a)) => inner.storage.category(goal.id, &a.process_name),
        _ => Ok(None),
    }
}

/// Explicit rules override automatic AI judgments; they never require provider keys.
pub fn local_nudge(inner: &mut Inner) -> Result<(), String> {
    if !inner.buddy.view.avatar.visible {
        return Ok(());
    }
    if !crate::tracking::notifications_allowed(inner) {
        return Ok(());
    }
    if !inner.status.tracking
        || inner.status.dnd
        || crate::buddy::snoozed(&inner.buddy.view)
        || !inner.buddy.view.preferences.local_nudges
        || inner.buddy.shown.is_some()
        || !inner.storage.nudge_allowed(&inner.buddy.view.preferences)?
    {
        return Ok(());
    }
    let Some(a) = inner.buddy.foreground.as_ref() else {
        return Ok(());
    };
    if crate::attention::quiet_reason(
        &inner.buddy.view.preferences,
        Some(a),
        inner.buddy.fullscreen,
        false,
    )
    .is_some()
        || (inner.activity_state.state != crate::tracking::ActivityState::Drifting
            && (a.active_seconds < 120 || explicit_category(inner)? != Some(Category::Distraction)))
    {
        return Ok(());
    }
    let goal = inner.storage.goal()?.ok_or("Set a goal first")?;
    let reason = if inner.activity_state.state == crate::tracking::ActivityState::Drifting {
        "The same context has remained open with no recent input. Ready to return to your next step?".to_string()
    } else {
        format!("You marked {} as a distraction for this goal. It has been active in the same window for at least 2 minutes. Ready to return to your next step?", a.process_name)
    };
    let mut decision = Decision {
        id: None,
        state: FocusState::Drifting,
        confidence: 1.0,
        reason,
        action: Action::Intervene,
    };
    inner.storage.decision(goal.id, &mut decision)?;
    inner.buddy.decision(decision);
    Ok(())
}

#[tauri::command(async)]
pub fn set_app_rule(
    goal_id: i64,
    process_name: String,
    category: Option<Category>,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner
        .storage
        .save_app_rule(goal_id, &process_name, category)?;
    inner.privacy_revision += 1;
    inner.buddy.clear();
    crate::buddy::sync(&app, &mut inner)
}

#[cfg(test)]
#[path = "insights_tests.rs"]
mod tests;
