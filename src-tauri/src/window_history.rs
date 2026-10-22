//! Local foreground-window sessions, independent of whether a goal has been selected.
use crate::{models::ActivitySnapshot, storage::Storage};
use chrono::{DateTime, Utc};
use rusqlite::params;
use serde::Serialize;
use std::time::Instant;

type Previous = (i64, ActivitySnapshot, Option<i64>, Instant, DateTime<Utc>);
#[derive(Default)]
pub struct Recorder {
    previous: Option<Previous>,
}
#[derive(Serialize)]
pub struct WindowSession {
    id: i64,
    pub goal_id: Option<i64>,
    goal_title: Option<String>,
    app: String,
    title: String,
    domain: Option<String>,
    started_at: String,
    ended_at: String,
    active_seconds: u64,
    idle_seconds: u64,
}
#[derive(Serialize)]
pub struct WindowHistory {
    sessions: Vec<WindowSession>,
    total_active_seconds: u64,
    total_sessions: u64,
    apps: Vec<(String, u64)>,
}
impl Recorder {
    pub fn clear(&mut self) {
        self.previous = None;
    }
    pub fn observe(
        &mut self,
        storage: &Storage,
        sample: &ActivitySnapshot,
        goal: Option<i64>,
        allowed: bool,
        idle_threshold: u64,
    ) -> Result<bool, String> {
        self.observe_at(
            storage,
            sample,
            goal,
            allowed,
            idle_threshold,
            Instant::now(),
            Utc::now(),
        )
    }
    #[allow(
        clippy::too_many_arguments,
        reason = "test seam for observe(): injects both clocks explicitly"
    )]
    fn observe_at(
        &mut self,
        storage: &Storage,
        sample: &ActivitySnapshot,
        goal: Option<i64>,
        allowed: bool,
        idle_threshold: u64,
        now: Instant,
        wall: DateTime<Utc>,
    ) -> Result<bool, String> {
        if !allowed {
            self.clear();
            return Ok(false);
        }
        if let Some((id, old, old_goal, last, last_wall)) = &self.previous {
            let elapsed = now.saturating_duration_since(*last).as_millis() as i64;
            let wall_ms = (wall - *last_wall).num_milliseconds();
            if last_wall.with_timezone(&chrono::Local).date_naive()
                == wall.with_timezone(&chrono::Local).date_naive()
                && old_goal == &goal
                && crate::tracking::same_context(old, sample)
                && elapsed <= 15000
                && wall_ms > 0
                && (wall_ms - elapsed).abs() < 1000
            {
                // Require activity at both endpoints; never charge sleep or an idle boundary.
                let active =
                    old.idle_seconds < idle_threshold && sample.idle_seconds < idle_threshold;
                let changed=storage.connection.execute("UPDATE window_activity SET ended_at=?1,active_ms=active_ms+?2,idle_ms=idle_ms+?3 WHERE id=?4",params![wall.to_rfc3339(),if active {wall_ms}else{0},if active {0}else{wall_ms},id]).map_err(|_|"Could not save local activity")?;
                if changed == 1 {
                    self.previous = Some((*id, sample.clone(), goal, now, wall));
                    return Ok(false);
                }
            }
        }
        let title = sample.window_title.chars().take(160).collect::<String>();
        let domain = sample
            .browser
            .as_ref()
            .and_then(|b| b.domain.as_deref())
            .and_then(crate::browser::sanitize_domain);
        storage.connection.execute("INSERT INTO window_activity(goal_id,app,title,domain,started_at,ended_at,active_ms,idle_ms) VALUES(?1,?2,?3,?4,?5,?5,0,0)",params![goal,sample.process_name,title,domain,wall.to_rfc3339()]).map_err(|_|"Could not save local activity")?;
        self.previous = Some((
            storage.connection.last_insert_rowid(),
            sample.clone(),
            goal,
            now,
            wall,
        ));
        Ok(true)
    }
}
impl Storage {
    pub(crate) fn initialize_window_history(&self) -> Result<(), String> {
        self.connection.execute_batch("CREATE TABLE IF NOT EXISTS window_activity(id INTEGER PRIMARY KEY,goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,app TEXT NOT NULL,title TEXT NOT NULL,domain TEXT,started_at TEXT NOT NULL,ended_at TEXT NOT NULL,active_ms INTEGER NOT NULL DEFAULT 0,idle_ms INTEGER NOT NULL DEFAULT 0);CREATE INDEX IF NOT EXISTS window_activity_started ON window_activity(started_at);").map_err(|_|"Could not initialize local window history".into())
    }
    #[cfg(test)]
    pub fn window_sessions(&self, first: &str, last: &str) -> Result<Vec<WindowSession>, String> {
        self.window_sessions_for_goal(first, last, None)
    }
    fn window_sessions_for_goal(
        &self,
        first: &str,
        last: &str,
        goal: Option<i64>,
    ) -> Result<Vec<WindowSession>, String> {
        let start = DateTime::parse_from_rfc3339(first).map_err(|_| "Invalid activity period")?;
        let end = DateTime::parse_from_rfc3339(last).map_err(|_| "Invalid activity period")?;
        if start >= end || (end - start).num_days() > 367 {
            return Err("Invalid activity period".into());
        }
        let mut q=self.connection.prepare("SELECT id,goal_id,app,title,domain,started_at,ended_at,active_ms/1000,idle_ms/1000,(SELECT text FROM goals WHERE id=window_activity.goal_id) FROM window_activity WHERE julianday(started_at)>=julianday(?1) AND julianday(started_at)<julianday(?2) AND (?3 IS NULL OR goal_id=?3) ORDER BY id DESC LIMIT 500").map_err(|_|"Activity history unavailable")?;
        let rows = q
            .query_map(params![first, last, goal], |r| {
                Ok(WindowSession {
                    id: r.get(0)?,
                    goal_id: r.get(1)?,
                    goal_title: r.get(9)?,
                    app: r.get(2)?,
                    title: r.get(3)?,
                    domain: r.get(4)?,
                    started_at: r.get(5)?,
                    ended_at: r.get(6)?,
                    active_seconds: r.get(7)?,
                    idle_seconds: r.get(8)?,
                })
            })
            .map_err(|_| "Activity history unavailable")?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Activity history unavailable".into())
    }
    fn window_history(
        &self,
        first: &str,
        last: &str,
        goal: Option<i64>,
    ) -> Result<WindowHistory, String> {
        if goal.is_some_and(|id| id <= 0) {
            return Err("Invalid goal scope".into());
        }
        let sessions = self.window_sessions_for_goal(first, last, goal)?;
        let (total_active_seconds,total_sessions)=self.connection.query_row("SELECT COALESCE(SUM(active_ms),0)/1000,COUNT(*) FROM window_activity WHERE julianday(started_at)>=julianday(?1) AND julianday(started_at)<julianday(?2) AND (?3 IS NULL OR goal_id=?3)",params![first,last,goal],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"Activity totals unavailable")?;
        let mut q=self.connection.prepare("SELECT app,SUM(active_ms)/1000 FROM window_activity WHERE julianday(started_at)>=julianday(?1) AND julianday(started_at)<julianday(?2) AND (?3 IS NULL OR goal_id=?3) GROUP BY app ORDER BY SUM(active_ms) DESC LIMIT 8").map_err(|_|"Activity totals unavailable")?;
        let apps = q
            .query_map(params![first, last, goal], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|_| "Activity totals unavailable")?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Activity totals unavailable")?;
        Ok(WindowHistory {
            sessions,
            total_active_seconds,
            total_sessions,
            apps,
        })
    }
}
#[tauri::command(async)]
pub fn get_window_activity(
    window: tauri::WebviewWindow,
    state: tauri::State<crate::commands::AppState>,
    first: String,
    last: String,
    goal_id: Option<i64>,
) -> Result<WindowHistory, String> {
    if window.label() != "main" {
        return Err("Open activity history in the main window".into());
    }
    state
        .inner
        .lock()
        .map_err(|_| "Activity state unavailable")?
        .storage
        .window_history(&first, &last, goal_id)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn period_totals_include_sessions_beyond_the_recent_list_and_filter_goal_scope() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let goal = s.set_goal("Fixture goal").unwrap().id;
        let now = Utc::now();
        let start = (now - chrono::Duration::seconds(1)).to_rfc3339();
        let end = (now + chrono::Duration::days(1)).to_rfc3339();
        for index in 0..501 {
            s.connection.execute("INSERT INTO window_activity(goal_id,app,title,started_at,ended_at,active_ms,idle_ms) VALUES(?1,'Editor','Fixture window',?2,?2,60000,0)",params![if index%2==0 {Some(goal)}else{None},now.to_rfc3339()]).unwrap();
        }
        let all = s.window_history(&start, &end, None).unwrap();
        assert_eq!(all.sessions.len(), 500);
        assert_eq!(all.total_sessions, 501);
        assert_eq!(all.total_active_seconds, 501 * 60);
        let scoped = s.window_history(&start, &end, Some(goal)).unwrap();
        assert_eq!(scoped.total_sessions, 251);
        assert_eq!(scoped.total_active_seconds, 251 * 60);
        assert!(scoped.sessions.iter().all(|row| row.goal_id == Some(goal)));
    }
    #[test]
    fn records_each_window_without_a_goal_and_skips_private_context_and_sleep() {
        let s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let mut r = Recorder::default();
        let now = Instant::now();
        let wall = Utc::now();
        let a = ActivitySnapshot {
            process_name: "Editor".into(),
            window_title: "first".into(),
            window_id: Some(1),
            ..Default::default()
        };
        assert!(r.observe_at(&s, &a, None, true, 300, now, wall).unwrap());
        assert!(!r
            .observe_at(
                &s,
                &a,
                None,
                true,
                300,
                now + std::time::Duration::from_secs(3),
                wall + chrono::Duration::seconds(3)
            )
            .unwrap());
        let b = ActivitySnapshot {
            window_id: Some(2),
            ..a.clone()
        };
        assert!(r
            .observe_at(
                &s,
                &b,
                None,
                true,
                300,
                now + std::time::Duration::from_secs(6),
                wall + chrono::Duration::seconds(6)
            )
            .unwrap());
        r.observe_at(
            &s,
            &b,
            None,
            false,
            300,
            now + std::time::Duration::from_secs(9),
            wall + chrono::Duration::seconds(9),
        )
        .unwrap();
        assert!(r
            .observe_at(
                &s,
                &a,
                None,
                true,
                300,
                now + std::time::Duration::from_secs(60),
                wall + chrono::Duration::seconds(60)
            )
            .unwrap());
        let rows = s
            .window_sessions(
                &(wall - chrono::Duration::seconds(1)).to_rfc3339(),
                &(wall + chrono::Duration::days(1)).to_rfc3339(),
            )
            .unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows.iter().map(|x| x.active_seconds).sum::<u64>(), 3);
    }
    #[test]
    fn migration_is_additive_and_history_clear_removes_windows() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        s.initialize_window_history().unwrap();
        let mut r = Recorder::default();
        r.observe(
            &s,
            &ActivitySnapshot {
                process_name: "Editor".into(),
                ..Default::default()
            },
            None,
            true,
            300,
        )
        .unwrap();
        s.purge_history(None).unwrap();
        assert_eq!(
            s.connection
                .query_row("SELECT COUNT(*) FROM window_activity", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
