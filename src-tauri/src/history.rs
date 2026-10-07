use crate::{models::*, storage::Storage, tracking::ActivityState};
use chrono::{DateTime, Utc};
use rusqlite::params;
use serde::Serialize;
use tauri::State;

pub struct UsageInterval {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub activity: ActivitySnapshot,
    pub state: ActivityState,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySegment {
    pub goal_id: String,
    pub app: String,
    pub title: Option<String>,
    pub url: Option<String>,
    pub domain: Option<String>,
    pub started_at: String,
    pub ended_at: String,
    pub duration_seconds: f64,
    pub state: String,
    pub activity_match: crate::relevance::ActivityMatch,
}
impl Storage {
    pub fn activity_segments(&self, goal_id: Option<i64>) -> Result<Vec<ActivitySegment>, String> {
        let mut query = self.connection.prepare("SELECT goal_id,process_name,COALESCE(page_title,window_title),domain,started_at,ended_at,milliseconds,state,match_confidence,match_reason FROM usage_intervals WHERE (?1 IS NULL OR goal_id=?1) ORDER BY id DESC LIMIT 500").map_err(|e|e.to_string())?;
        let rows = query
            .query_map([goal_id], |r| {
                Ok(ActivitySegment {
                    goal_id: r.get::<_, i64>(0)?.to_string(),
                    activity_match: crate::relevance::ActivityMatch {
                        goal_id: if r.get::<_, f64>(8)? >= crate::relevance::THRESHOLD {
                            Some(r.get::<_, i64>(0)?.to_string())
                        } else {
                            None
                        },
                        confidence: r.get(8)?,
                        reason: r
                            .get::<_, Option<String>>(9)?
                            .unwrap_or_else(|| "No relevance evidence recorded".into()),
                    },
                    app: r.get(1)?,
                    title: r.get(2)?,
                    domain: r.get(3)?,
                    url: None,
                    started_at: r.get(4)?,
                    ended_at: r.get(5)?,
                    duration_seconds: r.get::<_, u64>(6)? as f64 / 1000.,
                    state: r.get::<_, String>(7)?.trim_matches('"').to_string(),
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    }
}
#[tauri::command(async)]
pub fn get_activity_segments(
    goal_id: Option<i64>,
    state: State<crate::commands::AppState>,
) -> Result<Vec<ActivitySegment>, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .activity_segments(goal_id)
}

#[derive(Serialize)]
pub struct ContextTime {
    pub process_name: String,
    pub domain: Option<String>,
    pub page_title: Option<String>,
    pub active_milliseconds: u64,
    pub idle_milliseconds: u64,
    pub drifting_milliseconds: u64,
}
#[derive(Serialize)]
pub struct GoalHistory {
    pub goal: Goal,
    pub status: String,
    pub completed_at: Option<String>,
    pub elapsed_milliseconds: Option<i64>,
    pub first_observed_at: Option<String>,
    pub last_observed_at: Option<String>,
    pub active_milliseconds: u64,
    pub unattributed_active_milliseconds: u64,
    /// Observable engagement, not a claim that work was productive.
    pub focused_milliseconds: u64,
    pub work_app_milliseconds: u64,
    pub idle_milliseconds: u64,
    pub drifting_milliseconds: u64,
    pub distraction_app_milliseconds: u64,
    pub drifting_events: u64,
    pub pause_events: u64,
    pub interventions: u64,
    pub applications: Vec<ContextTime>,
    pub sites: Vec<ContextTime>,
    pub tabs: Vec<ContextTime>,
    pub recommendations: Vec<Recommendation>,
}

impl Storage {
    /// Additive, idempotent migrations. Legacy cumulative activity is preserved
    /// and never converted into elapsed usage intervals.
    pub(crate) fn initialize_tracking(&self) -> Result<(), String> {
        for (table, column, declaration) in [
            ("goals", "completed_at", "TEXT"),
            ("activity", "browser_context", "TEXT"),
            ("activity", "window_id", "INTEGER"),
            ("activity", "media_playing", "INTEGER NOT NULL DEFAULT 0"),
        ] {
            let mut query = self
                .connection
                .prepare(&format!("PRAGMA table_info({table})"))
                .map_err(|e| e.to_string())?;
            let columns = query
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            if !columns.iter().any(|c| c == column) {
                self.connection
                    .execute(
                        &format!("ALTER TABLE {table} ADD COLUMN {column} {declaration}"),
                        [],
                    )
                    .map_err(|e| e.to_string())?;
            }
        }
        self.connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS usage_intervals(
            id INTEGER PRIMARY KEY, goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            started_at TEXT NOT NULL, ended_at TEXT NOT NULL, milliseconds INTEGER NOT NULL,
            process_name TEXT NOT NULL, domain TEXT, page_title TEXT, state TEXT NOT NULL,
            category TEXT, media_playing INTEGER NOT NULL DEFAULT 0);
            CREATE INDEX IF NOT EXISTS usage_intervals_goal ON usage_intervals(goal_id,id);
            CREATE TABLE IF NOT EXISTS tracking_events(id INTEGER PRIMARY KEY,
            goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            timestamp TEXT NOT NULL, event TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS tracking_events_goal ON tracking_events(goal_id,id);",
            )
            .map_err(|e| e.to_string())?;
        let mut query = self
            .connection
            .prepare("PRAGMA table_info(usage_intervals)")
            .map_err(|e| e.to_string())?;
        let columns = query
            .query_map([], |r| r.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        if !columns.iter().any(|c| c == "window_title") {
            self.connection
                .execute(
                    "ALTER TABLE usage_intervals ADD COLUMN window_title TEXT",
                    [],
                )
                .map_err(|e| e.to_string())?;
        }
        for (name, declaration) in [
            ("match_confidence", "REAL NOT NULL DEFAULT 0"),
            ("match_reason", "TEXT"),
        ] {
            if !columns.iter().any(|c| c == name) {
                self.connection
                    .execute(
                        &format!("ALTER TABLE usage_intervals ADD COLUMN {name} {declaration}"),
                        [],
                    )
                    .map_err(|e| e.to_string())?;
            }
        }
        self.connection.execute_batch("CREATE TABLE IF NOT EXISTS goal_relevant_daily(day TEXT NOT NULL,goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,process_name TEXT NOT NULL,milliseconds INTEGER NOT NULL,PRIMARY KEY(day,goal_id,process_name));").map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn tracking_event(
        &self,
        goal: i64,
        event: crate::tracking::ActivityEvent,
    ) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT INTO tracking_events(goal_id,timestamp,event) VALUES(?1,?2,?3)",
                params![
                    goal,
                    Utc::now().to_rfc3339(),
                    serde_json::to_string(&event).map_err(|e| e.to_string())?
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn record_interval(&mut self, goal: i64, interval: &UsageInterval) -> Result<(), String> {
        self.record_interval_with_match(goal, interval, None)
    }
    pub(crate) fn record_interval_with_match(
        &mut self,
        goal: i64,
        interval: &UsageInterval,
        attribution: Option<crate::relevance::ActivityMatch>,
    ) -> Result<(), String> {
        let duration = (interval.end - interval.start).num_milliseconds();
        if !(1..=15000).contains(&duration) {
            return Ok(());
        }
        if self.goal()?.map(|g| g.id) != Some(goal) {
            return Err("The active goal changed".into());
        }
        let process = interval.activity.process_name.to_ascii_lowercase();
        let category = self.category(goal, &process)?;
        let domain = interval
            .activity
            .browser
            .as_ref()
            .and_then(|b| b.domain.as_deref())
            .and_then(crate::browser::sanitize_domain);
        let title = interval
            .activity
            .browser
            .as_ref()
            .map(|b| b.page_title.chars().take(160).collect::<String>());
        let matched = match attribution {
            Some(matched) => matched,
            None => self.match_activity(&interval.activity)?,
        };
        let relevant = interval.state == ActivityState::Focused
            && category != Some(crate::insights::Category::Distraction)
            && matched.confidence.is_finite()
            && (crate::relevance::THRESHOLD..=1.0).contains(&matched.confidence)
            && matched.goal_id.as_deref() == Some(goal.to_string().as_str());
        let tx = self.connection.transaction().map_err(|e| e.to_string())?;
        // Intervals are strictly disjoint per goal. Reject retries and overlap
        // rather than inflating the daily or historical totals.
        let overlaps: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM usage_intervals WHERE goal_id=?1 AND julianday(started_at)<julianday(?3) AND julianday(ended_at)>julianday(?2))",
            params![goal,interval.start.to_rfc3339(),interval.end.to_rfc3339()], |r| r.get(0)).map_err(|e| e.to_string())?;
        if overlaps {
            return Err("Overlapping usage interval rejected".into());
        }
        tx.execute("INSERT INTO usage_intervals(goal_id,started_at,ended_at,milliseconds,process_name,domain,page_title,state,category,media_playing,window_title,match_confidence,match_reason) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![goal, interval.start.to_rfc3339(), interval.end.to_rfc3339(), duration, process, domain, title,
                serde_json::to_string(&interval.state).map_err(|e| e.to_string())?,
                category.map(|c| serde_json::to_string(&c)).transpose().map_err(|e| e.to_string())?, interval.activity.media_playing, crate::browser::minimize_title(&interval.activity.window_title),if relevant {matched.confidence} else {0.0},matched.reason]).map_err(|e| e.to_string())?;
        if interval.state != ActivityState::Paused {
            let mut cursor = interval.start.timestamp_millis();
            while cursor < interval.end.timestamp_millis() {
                let next =
                    ((cursor.div_euclid(1000) + 1) * 1000).min(interval.end.timestamp_millis());
                let day = DateTime::from_timestamp_millis(cursor)
                    .ok_or("Invalid sample time")?
                    .with_timezone(&chrono::Local)
                    .date_naive()
                    .to_string();
                tx.execute("INSERT INTO usage_daily(day,goal_id,process_name,milliseconds) VALUES(?1,?2,?3,?4) ON CONFLICT(day,goal_id,process_name) DO UPDATE SET milliseconds=milliseconds+excluded.milliseconds",
                    params![day,goal,process,next-cursor]).map_err(|e| e.to_string())?;
                if relevant {
                    tx.execute("INSERT INTO goal_relevant_daily(day,goal_id,process_name,milliseconds) VALUES(?1,?2,?3,?4) ON CONFLICT(day,goal_id,process_name) DO UPDATE SET milliseconds=milliseconds+excluded.milliseconds",params![day,goal,process,next-cursor]).map_err(|e|e.to_string())?;
                }
                cursor = next;
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }
    fn context_times(&self, goal: i64, grouping: &str) -> Result<Vec<ContextTime>, String> {
        if grouping == "app" {
            let mut q = self.connection.prepare("WITH active AS (SELECT process_name,SUM(milliseconds) AS milliseconds FROM usage_daily WHERE goal_id=?1 GROUP BY process_name), detail AS (SELECT process_name,SUM(CASE WHEN state='\"paused\"' THEN milliseconds ELSE 0 END) AS idle,SUM(CASE WHEN state='\"drifting\"' THEN milliseconds ELSE 0 END) AS drifting FROM usage_intervals WHERE goal_id=?1 GROUP BY process_name), apps AS (SELECT process_name FROM active UNION SELECT process_name FROM detail) SELECT apps.process_name,COALESCE(active.milliseconds,0),COALESCE(detail.idle,0),COALESCE(detail.drifting,0) FROM apps LEFT JOIN active USING(process_name) LEFT JOIN detail USING(process_name) ORDER BY COALESCE(active.milliseconds,0) DESC").map_err(|e|e.to_string())?;
            return q
                .query_map([goal], |r| {
                    Ok(ContextTime {
                        process_name: r.get(0)?,
                        domain: None,
                        page_title: None,
                        active_milliseconds: r.get(1)?,
                        idle_milliseconds: r.get(2)?,
                        drifting_milliseconds: r.get(3)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<_, _>>()
                .map_err(|e| e.to_string());
        }
        let (columns, filter, group) = match grouping {
            "site" => (
                "process_name,domain,NULL",
                "AND domain IS NOT NULL",
                "process_name,domain",
            ),
            "tab" => (
                "process_name,domain,page_title",
                "AND page_title IS NOT NULL",
                "process_name,domain,page_title",
            ),
            _ => ("process_name,NULL,NULL", "", "process_name"),
        };
        let mut q = self.connection.prepare(&format!("SELECT {columns},COALESCE(SUM(CASE WHEN state!='\"paused\"' THEN milliseconds ELSE 0 END),0),COALESCE(SUM(CASE WHEN state='\"paused\"' THEN milliseconds ELSE 0 END),0),COALESCE(SUM(CASE WHEN state='\"drifting\"' THEN milliseconds ELSE 0 END),0) FROM usage_intervals WHERE goal_id=?1 {filter} GROUP BY {group} ORDER BY SUM(milliseconds) DESC")).map_err(|e| e.to_string())?;
        let rows = q
            .query_map([goal], |r| {
                Ok(ContextTime {
                    process_name: r.get(0)?,
                    domain: r.get(1)?,
                    page_title: r.get(2)?,
                    active_milliseconds: r.get(3)?,
                    idle_milliseconds: r.get(4)?,
                    drifting_milliseconds: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    }
    pub fn goal_history(&self, id: Option<i64>) -> Result<Vec<GoalHistory>, String> {
        let mut q = self.connection.prepare("SELECT id,text,created_at,status,completed_at FROM goals WHERE (?1 IS NULL AND status='completed') OR id=?1 ORDER BY id DESC LIMIT 100").map_err(|e|e.to_string())?;
        let goals = q
            .query_map([id], |r| {
                Ok((
                    Goal {
                        id: r.get(0)?,
                        text: r.get(1)?,
                        created_at: r.get(2)?,
                    },
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        goals.into_iter().map(|(goal,status,completed_at)| {
            let (first,last,active,focused,idle,drifting,work,distraction) = self.connection.query_row("SELECT MIN(started_at),MAX(ended_at),COALESCE(SUM(CASE WHEN state!='\"paused\"' THEN milliseconds ELSE 0 END),0),COALESCE(SUM(CASE WHEN state='\"focused\"' THEN milliseconds ELSE 0 END),0),COALESCE(SUM(CASE WHEN state='\"paused\"' THEN milliseconds ELSE 0 END),0),COALESCE(SUM(CASE WHEN state='\"drifting\"' THEN milliseconds ELSE 0 END),0),COALESCE(SUM(CASE WHEN category='\"work\"' AND state!='\"paused\"' THEN milliseconds ELSE 0 END),0),COALESCE(SUM(CASE WHEN category='\"distraction\"' AND state!='\"paused\"' THEN milliseconds ELSE 0 END),0) FROM usage_intervals WHERE goal_id=?1", [goal.id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?))).map_err(|e|e.to_string())?;
            let event_count = |event: &str| -> Result<u64,String> { self.connection.query_row("SELECT COUNT(*) FROM tracking_events WHERE goal_id=?1 AND event=?2",params![goal.id,format!("\"{event}\"")], |r|r.get(0)).map_err(|e|e.to_string()) };
            let interventions = self.connection.query_row("SELECT COUNT(*) FROM decisions WHERE goal_id=?1 AND action='\"intervene\"'",[goal.id],|r|r.get(0)).map_err(|e|e.to_string())?;
            let mut rq = self.connection.prepare("SELECT id,title,url,reason,created_at,feedback FROM recommendation_history WHERE goal_id=?1 ORDER BY id DESC").map_err(|e|e.to_string())?;
            let recommendations = rq.query_map([goal.id],|r| Ok(Recommendation{id:r.get(0)?,goal_id:goal.id,goal:goal.text.clone(),title:r.get(1)?,url:r.get(2)?,reason:r.get(3)?,created_at:r.get(4)?,feedback:r.get(5)?})).map_err(|e|e.to_string())?.collect::<Result<_,_>>().map_err(|e|e.to_string())?;
            let elapsed_milliseconds = completed_at.as_ref().and_then(|end| {
                Some((DateTime::parse_from_rfc3339(end).ok()? - DateTime::parse_from_rfc3339(&goal.created_at).ok()?).num_milliseconds().max(0))
            });
            let total_active: u64 = self.connection.query_row("SELECT COALESCE(SUM(milliseconds),0) FROM usage_daily WHERE goal_id=?1",[goal.id],|r|r.get(0)).map_err(|e|e.to_string())?;
            Ok(GoalHistory { applications:self.context_times(goal.id,"app")?, sites:self.context_times(goal.id,"site")?, tabs:self.context_times(goal.id,"tab")?,
                drifting_events:event_count("drifting")?,pause_events:event_count("paused")?,interventions,
                goal,status,completed_at,elapsed_milliseconds, first_observed_at:first,last_observed_at:last,
                active_milliseconds:total_active,unattributed_active_milliseconds:total_active.saturating_sub(active),focused_milliseconds:focused,idle_milliseconds:idle,drifting_milliseconds:drifting,
                work_app_milliseconds:work,distraction_app_milliseconds:distraction,recommendations })
        }).collect()
    }
}

#[tauri::command(async)]
pub fn get_goal_history(
    goal_id: Option<i64>,
    state: State<crate::commands::AppState>,
) -> Result<Vec<GoalHistory>, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .goal_history(goal_id)
}
