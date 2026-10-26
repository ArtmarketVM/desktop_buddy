use super::*;
use crate::{history::UsageInterval, storage::Storage};
use rusqlite::params;
fn db(e: rusqlite::Error) -> String {
    e.to_string()
}
impl Storage {
    pub(crate) fn initialize_unplanned_work(&self) -> Result<(), String> {
        self.connection.execute_batch("CREATE TABLE IF NOT EXISTS unplanned_work_intervals(
            id INTEGER PRIMARY KEY AUTOINCREMENT,context_key TEXT NOT NULL,bucket_key TEXT NOT NULL,day TEXT NOT NULL,
            started_at TEXT NOT NULL,ended_at TEXT NOT NULL,milliseconds INTEGER NOT NULL,
            app TEXT NOT NULL,title TEXT NOT NULL,domain TEXT,page_title TEXT,
            source_interval_id INTEGER UNIQUE REFERENCES usage_intervals(id) ON DELETE CASCADE,
            source_step TEXT NOT NULL DEFAULT '',UNIQUE(started_at,ended_at));
            CREATE INDEX IF NOT EXISTS unplanned_work_context ON unplanned_work_intervals(day,context_key);
            CREATE TABLE IF NOT EXISTS unplanned_work_decisions(context_key TEXT NOT NULL,day TEXT NOT NULL,
            goal_id INTEGER REFERENCES goals(id) ON DELETE CASCADE,PRIMARY KEY(context_key,day));").map_err(db)
    }
    pub(super) fn unplanned_decided(&self, key: &str, day: &str) -> Result<bool, String> {
        self.connection.query_row("SELECT EXISTS(SELECT 1 FROM unplanned_work_decisions WHERE context_key=?1 AND day=?2)",params![key,day],|r|r.get(0)).map_err(db)
    }
    #[cfg(test)]
    pub(super) fn unplanned_milliseconds(&self, key: &str, day: &str) -> Result<i64, String> {
        self.unplanned_milliseconds_between(key, day, None, None)
    }
    /// Unassigned time of one context within optional bounds on interval start.
    pub(super) fn unplanned_milliseconds_between(
        &self,
        key: &str,
        day: &str,
        since: Option<&DateTime<Utc>>,
        until: Option<&DateTime<Utc>>,
    ) -> Result<i64, String> {
        self.connection.query_row("SELECT COALESCE(SUM(milliseconds),0) FROM unplanned_work_intervals u WHERE context_key=?1 AND day=?2 AND (?3 IS NULL OR julianday(started_at)>=julianday(?3)) AND (?4 IS NULL OR julianday(started_at)<=julianday(?4)) AND NOT EXISTS(SELECT 1 FROM review_intervals r WHERE r.started_at=u.started_at AND r.ended_at=u.ended_at AND (r.manual=1 OR r.status='assigned'))",params![key,day,since.map(|t|t.to_rfc3339()),until.map(|t|t.to_rfc3339())],|r|r.get(0)).map_err(db)
    }
    pub(super) fn observe_unplanned_interval(
        &self,
        interval: &UsageInterval,
        goal: Option<i64>,
        session: &str,
    ) -> Result<(), String> {
        let ms = (interval.end - interval.start).num_milliseconds();
        let day = interval
            .start
            .with_timezone(&Local)
            .date_naive()
            .to_string();
        if !metadata_allowed(&interval.activity)
            || crate::companion::sensitive_window(&interval.activity)
            || !(1..=15000).contains(&ms)
            || interval.state == crate::tracking::ActivityState::Paused
            || interval.activity.media_playing
            || interval.end.with_timezone(&Local).date_naive().to_string() != day
        {
            return Ok(());
        }
        let bucket = context_key(&interval.activity);
        let key = session;
        let reviewed:bool=self.connection.query_row("SELECT EXISTS(SELECT 1 FROM review_intervals WHERE started_at=?1 AND ended_at=?2 AND (manual=1 OR status='assigned'))",params![interval.start.to_rfc3339(),interval.end.to_rfc3339()],|r|r.get(0)).map_err(db)?;
        if reviewed {
            return Ok(());
        }
        if self.unplanned_decided(&bucket, &day)? {
            return Ok(());
        }
        let (source, step) = if let Some(goal) = goal {
            let source=self.connection.query_row("SELECT id FROM usage_intervals WHERE goal_id=?1 AND started_at=?2 AND ended_at=?3",params![goal,interval.start.to_rfc3339(),interval.end.to_rfc3339()],|r|r.get::<_,i64>(0)).map_err(db)?;
            (Some(source), self.attributed_step(goal)?)
        } else {
            (None, String::new())
        };
        // Defensive global overlap rejection, including retries and clock rollback.
        let overlaps:bool=self.connection.query_row("SELECT EXISTS(SELECT 1 FROM unplanned_work_intervals WHERE julianday(started_at)<julianday(?2) AND julianday(ended_at)>julianday(?1))",params![interval.start.to_rfc3339(),interval.end.to_rfc3339()],|r|r.get(0)).map_err(db)?;
        if overlaps {
            return Ok(());
        }
        self.connection.execute("INSERT INTO unplanned_work_intervals(context_key,bucket_key,day,started_at,ended_at,milliseconds,app,title,domain,page_title,source_interval_id,source_step) VALUES(?1,?12,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",params![key,day,interval.start.to_rfc3339(),interval.end.to_rfc3339(),ms,interval.activity.process_name.to_lowercase(),crate::browser::minimize_title(&interval.activity.window_title),interval.activity.browser.as_ref().and_then(|b|b.domain.as_deref()).and_then(crate::browser::sanitize_domain),interval.activity.browser.as_ref().map(|b|crate::browser::minimize_title(&b.page_title)),source,step,bucket]).map_err(db)?;
        Ok(())
    }
    pub(super) fn dismiss_unplanned_work(&self, key: &str, day: &str) -> Result<(), String> {
        let bucket = self.unplanned_bucket(key, day)?;
        self.connection
            .execute(
                "INSERT INTO unplanned_work_decisions(context_key,day) VALUES(?1,?2)",
                params![bucket, day],
            )
            .map_err(db)?;
        Ok(())
    }
    fn unplanned_bucket(&self, key: &str, day: &str) -> Result<String, String> {
        self.connection.query_row("SELECT bucket_key FROM unplanned_work_intervals WHERE context_key=?1 AND day=?2 LIMIT 1",params![key,day],|r|r.get(0)).map_err(db)
    }
    /// Moves exactly the episodes' intervals to a new goal: the current presence and the
    /// earlier contexts the model named. Other time in the same contexts stays unassigned.
    pub(super) fn confirm_unplanned_work(
        &mut self,
        episodes: &[Episode],
        key: &str,
        day: &str,
        title: &str,
        completed: bool,
        receipt_key: Option<&str>,
    ) -> Result<i64, String> {
        if !valid_title(title) {
            return Err("Enter a valid task title".into());
        }
        let bucket = self.unplanned_bucket(key, day)?;
        if self.unplanned_decided(&bucket, day)? {
            return Err("This work was already reviewed".into());
        }
        let total: i64 = episodes
            .iter()
            .map(|e| {
                self.unplanned_milliseconds_between(&e.key, day, e.since.as_ref(), e.until.as_ref())
            })
            .sum::<Result<i64, String>>()?;
        if total < MIN_ACTIVE_MS {
            return Err("Observed time is no longer available".into());
        }
        let duplicate:bool=self.connection.query_row("SELECT EXISTS(SELECT 1 FROM goals g JOIN core_goals c ON c.goal_id=g.id WHERE lower(trim(g.text))=lower(trim(?1)) AND (c.state!='completed' OR EXISTS(SELECT 1 FROM core_day_items d WHERE d.goal_id=g.id AND d.day=?2)))",params![title,day],|r|r.get(0)).map_err(db)?;
        if duplicate {
            return Err(
                "A goal with that title already exists. Rename this work before adding it.".into(),
            );
        }
        let mut q=self.connection.prepare("SELECT u.started_at,u.ended_at,u.milliseconds,u.app,u.title,u.domain,u.page_title,u.source_interval_id,u.source_step,i.goal_id,i.match_confidence,u.id FROM unplanned_work_intervals u LEFT JOIN usage_intervals i ON i.id=u.source_interval_id WHERE u.context_key=?1 AND u.day=?2 AND (?3 IS NULL OR julianday(u.started_at)>=julianday(?3)) AND (?4 IS NULL OR julianday(u.started_at)<=julianday(?4)) AND NOT EXISTS(SELECT 1 FROM review_intervals r WHERE r.started_at=u.started_at AND r.ended_at=u.ended_at AND (r.manual=1 OR r.status='assigned')) ORDER BY u.id").map_err(db)?;
        let mut rows: Vec<Recorded> = Vec::new();
        for episode in episodes {
            let found = q
                .query_map(
                    params![
                        episode.key,
                        day,
                        episode.since.map(|t| t.to_rfc3339()),
                        episode.until.map(|t| t.to_rfc3339())
                    ],
                    |r| {
                        Ok(Recorded {
                            from: r.get(0)?,
                            to: r.get(1)?,
                            ms: r.get(2)?,
                            app: r.get(3)?,
                            title: r.get(4)?,
                            domain: r.get(5)?,
                            page: r.get(6)?,
                            source: r.get(7)?,
                            step: r.get(8)?,
                            old_goal: r.get(9)?,
                            old_confidence: r.get::<_, Option<f64>>(10)?.unwrap_or(0.0),
                            id: r.get(11)?,
                        })
                    },
                )
                .map_err(db)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(db)?;
            for row in found {
                if !rows.iter().any(|r| r.id == row.id) {
                    rows.push(row);
                }
            }
        }
        drop(q);
        // Keep an immutable connection borrow so the daily summary can be
        // refreshed inside this same transaction. SQLite still rejects nesting.
        let tx = self.connection.unchecked_transaction().map_err(db)?;
        tx.execute("INSERT OR IGNORE INTO core_areas(title) VALUES('Work')", [])
            .map_err(db)?;
        let area: i64 = tx
            .query_row("SELECT id FROM core_areas WHERE title='Work'", [], |r| {
                r.get(0)
            })
            .map_err(db)?;
        let now = Utc::now().to_rfc3339();
        tx.execute(
            "INSERT INTO goals(text,status,created_at,completed_at) VALUES(?1,?3,?2,?4)",
            params![
                title,
                now,
                if completed { "completed" } else { "deferred" },
                completed.then_some(&now)
            ],
        )
        .map_err(db)?;
        let goal = tx.last_insert_rowid();
        tx.execute(
            "INSERT INTO core_goals(goal_id,area_id,state) VALUES(?1,?2,?3)",
            params![goal, area, if completed { "completed" } else { "open" }],
        )
        .map_err(db)?;
        tx.execute(
            "INSERT INTO core_day_items(day,goal_id) VALUES(?1,?2)",
            params![day, goal],
        )
        .map_err(db)?;
        if completed {
            tx.execute("INSERT INTO core_events(goal_id,step_id,title,kind,day,created_at,completion_source) VALUES(?1,'goal',?2,'completed',?3,?4,'ai_suggested_user_confirmed')",params![goal,title,day,now]).map_err(db)?;
        }
        tx.execute("INSERT INTO work_events(evidence_key,goal_id,title,app,occurred_at,source,status) VALUES(?1,?2,?3,'Foreground work',?4,?5,?6)",params![format!("accepted:{key}"),goal,title,now,if completed {"user_confirmed_unplanned"}else{"user_planned"},if completed {"completed"}else{"planned"}]).map_err(db)?;
        tx.execute("UPDATE work_events SET source_event_id=(SELECT id FROM work_events WHERE evidence_key=?1),receipt_key=?2,occurred_at=COALESCE((SELECT occurred_at FROM work_events WHERE evidence_key=?1),occurred_at) WHERE evidence_key=?3",params![format!("noticed:{key}"),receipt_key,format!("accepted:{key}")]).map_err(db)?;
        if completed {
            let plan = crate::goals::GoalPlan {
                goal_id: goal,
                revision: 0,
                done_when: String::new(),
                steps: vec![],
                current_step: None,
            };
            tx.execute("UPDATE work_events SET undo_plan=?1,after_revision=0,core_event_id=(SELECT MAX(id) FROM core_events WHERE goal_id=?2) WHERE evidence_key=?3",params![serde_json::to_string(&plan).map_err(|_|"Invalid undo snapshot")?,goal,format!("accepted:{key}")]).map_err(db)?;
        }
        let moved: Vec<i64> = rows.iter().map(|r| r.id).collect();
        for row in rows {
            // The original interval is moved, never copied. No elapsed duration is
            // inferred from a session's first/last timestamp or from model output.
            if let Some(source) = row.source {
                if row.old_goal.is_none() {
                    return Err("Source activity was removed".into());
                }
                tx.execute("UPDATE usage_intervals SET goal_id=?1,state='\"focused\"',category='\"work\"',match_confidence=1,match_reason='User-confirmed unplanned work' WHERE id=?2",params![goal,source]).map_err(db)?;
            } else {
                let overlap:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM usage_intervals WHERE julianday(started_at)<julianday(?2) AND julianday(ended_at)>julianday(?1))",params![row.from,row.to],|r|r.get(0)).map_err(db)?;
                if overlap {
                    return Err(
                        "Activity was already assigned; refresh Today before trying again".into(),
                    );
                }
                tx.execute("INSERT INTO usage_intervals(goal_id,started_at,ended_at,milliseconds,process_name,window_title,domain,page_title,state,category,media_playing,match_confidence,match_reason) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'\"focused\"','\"work\"',0,1,'User-confirmed unplanned work')",params![goal,row.from,row.to,row.ms,row.app,row.title,row.domain,row.page]).map_err(db)?;
            }
            // Collection drops the midnight boundary, so each interval is wholly
            // in this local day, just like its existing aggregate contributions.
            if let Some(old) = row.old_goal {
                tx.execute("UPDATE usage_daily SET milliseconds=MAX(0,milliseconds-?1) WHERE day=?2 AND goal_id=?3 AND process_name=?4",params![row.ms,day,old,row.app]).map_err(db)?;
                if row.old_confidence > 0.0 {
                    tx.execute("UPDATE goal_relevant_daily SET milliseconds=MAX(0,milliseconds-?1) WHERE day=?2 AND goal_id=?3 AND process_name=?4",params![row.ms,day,old,row.app]).map_err(db)?;
                    tx.execute("UPDATE goal_relevant_step_daily SET milliseconds=MAX(0,milliseconds-?1) WHERE day=?2 AND goal_id=?3 AND step_id=?4",params![row.ms,day,old,row.step]).map_err(db)?;
                }
            }
            tx.execute("INSERT INTO usage_daily(day,goal_id,process_name,milliseconds) VALUES(?1,?2,?3,?4) ON CONFLICT(day,goal_id,process_name) DO UPDATE SET milliseconds=milliseconds+excluded.milliseconds",params![day,goal,row.app,row.ms]).map_err(db)?;
            tx.execute("INSERT INTO goal_relevant_daily(day,goal_id,process_name,milliseconds) VALUES(?1,?2,?3,?4) ON CONFLICT(day,goal_id,process_name) DO UPDATE SET milliseconds=milliseconds+excluded.milliseconds",params![day,goal,row.app,row.ms]).map_err(db)?;
            tx.execute("INSERT INTO goal_relevant_step_daily(day,goal_id,step_id,milliseconds) VALUES(?1,?2,'',?3) ON CONFLICT(day,goal_id,step_id) DO UPDATE SET milliseconds=milliseconds+excluded.milliseconds",params![day,goal,row.ms]).map_err(db)?;
            tx.execute("UPDATE review_intervals SET goal_id=?1,status='assigned',source_id=(SELECT id FROM usage_intervals WHERE goal_id=?1 AND started_at=?2 AND ended_at=?3),source_step='',manual=1,reason='User accepted noticed work' WHERE started_at=?2 AND ended_at=?3",params![goal,row.from,row.to]).map_err(db)?;
        }
        tx.execute(
            "INSERT INTO unplanned_work_decisions(context_key,day,goal_id) VALUES(?1,?2,?3)",
            params![bucket, day, goal],
        )
        .map_err(db)?;
        for id in moved {
            tx.execute("DELETE FROM unplanned_work_intervals WHERE id=?1", [id])
                .map_err(db)?;
        }
        let periods = {
            let mut q = tx
                .prepare(
                    "SELECT DISTINCT period_id FROM review_intervals WHERE goal_id=?1 AND manual=1",
                )
                .map_err(db)?;
            let rows = q
                .query_map([goal], |r| r.get::<_, i64>(0))
                .map_err(db)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(db)?;
            rows
        };
        for period in periods {
            self.refresh_review_summary(period)?;
        }
        tx.commit().map_err(db)?;
        Ok(goal)
    }
}
struct Recorded {
    from: String,
    to: String,
    ms: i64,
    app: String,
    title: String,
    domain: Option<String>,
    page: Option<String>,
    source: Option<i64>,
    step: String,
    old_goal: Option<i64>,
    old_confidence: f64,
    id: i64,
}
