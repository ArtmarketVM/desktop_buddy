use crate::{
    commands::AppState,
    goals::{self, GoalPlan, Step},
    storage::Storage,
};
use chrono::{DateTime, Duration, Local, NaiveDate, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct CorePreferences {
    pub working_days: Vec<u8>,
    pub movement_reminders: bool,
    pub vision_model: String,
}
impl Default for CorePreferences {
    fn default() -> Self {
        Self {
            working_days: vec![1, 2, 3, 4, 5],
            movement_reminders: false,
            vision_model: String::new(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Timer {
    pub goal_id: i64,
    pub last_tick: DateTime<Utc>,
}
#[derive(Serialize)]
pub struct Area {
    pub id: i64,
    pub title: String,
}
#[derive(Serialize)]
pub struct CoreGoal {
    pub id: i64,
    pub title: String,
    pub status: String,
    pub area_id: i64,
    pub plan: GoalPlan,
    pub focused_seconds: u64,
    pub due_at: Option<String>,
    pub priority: Option<String>,
    pub description: String,
    pub created_at: String,
    pub completed_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, deny_unknown_fields)]
pub struct GoalDetails {
    pub due_at: Option<String>,
    pub priority: Option<String>,
    pub description: String,
}
impl GoalDetails {
    fn validate(mut self) -> Result<Self, String> {
        if let Some(value) = &self.due_at {
            let parsed =
                DateTime::parse_from_rfc3339(value).map_err(|_| "Choose a valid deadline")?;
            self.due_at = Some(parsed.with_timezone(&Utc).to_rfc3339());
        }
        if self
            .priority
            .as_deref()
            .is_some_and(|p| !["low", "medium", "high"].contains(&p))
        {
            return Err("Choose a valid priority".into());
        }
        self.description = self.description.trim().into();
        if self.description.chars().count() > 4000 {
            return Err("Use up to 4,000 characters for a description".into());
        }
        Ok(self)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GoalDraft {
    pub title: String,
    pub area: String,
    pub steps: Vec<String>,
}
#[derive(Serialize)]
pub struct GoalTime {
    pub goal_id: i64,
    pub title: String,
    pub area: String,
    pub seconds: u64,
}
#[derive(Serialize)]
pub struct DayProgress {
    pub day: String,
    pub completed: Vec<String>,
    pub goals: Vec<GoalTime>,
}
#[derive(Serialize)]
pub struct CoreSnapshot {
    pub date: String,
    pub selected_date: String,
    pub date_goals: Vec<i64>,
    pub carryover: Vec<i64>,
    pub day_mode: String,
    pub today: Vec<i64>,
    pub areas: Vec<Area>,
    pub goals: Vec<CoreGoal>,
    pub summary: DayProgress,
    pub week: Vec<DayProgress>,
    pub timer: Option<Timer>,
    pub focused_goal_id: Option<i64>,
    pub preferences: CorePreferences,
}
fn db(e: rusqlite::Error) -> String {
    e.to_string()
}
pub(crate) fn record_step_changes(
    tx: &rusqlite::Transaction<'_>,
    old: &GoalPlan,
    plan: &GoalPlan,
) -> Result<(), String> {
    let now = Utc::now();
    for step in &plan.steps {
        let was_done = old
            .steps
            .iter()
            .find(|previous| previous.id == step.id)
            .is_some_and(|previous| previous.done);
        if was_done != step.done {
            tx.execute("INSERT INTO core_events(goal_id,step_id,title,kind,day,created_at) VALUES(?1,?2,?3,?4,?5,?6)", params![plan.goal_id,step.id,step.text,if step.done {"completed"} else {"reopened"},now.with_timezone(&Local).date_naive().to_string(),now.to_rfc3339()]).map_err(db)?;
        }
    }
    Ok(())
}
pub(crate) fn record_legacy_transition(
    tx: &rusqlite::Transaction<'_>,
    id: i64,
    action: &str,
) -> Result<(), String> {
    let state = match action {
        "resume" => "open",
        "complete" => "completed",
        _ => "deferred",
    };
    tx.execute(
        "UPDATE core_goals SET state=?1 WHERE goal_id=?2",
        params![state, id],
    )
    .map_err(db)?;
    if action == "complete" {
        let title: String = tx
            .query_row("SELECT text FROM goals WHERE id=?1", [id], |row| row.get(0))
            .map_err(db)?;
        let now = Utc::now();
        tx.execute("INSERT INTO core_events(goal_id,step_id,title,kind,day,created_at) VALUES(?1,'goal',?2,'completed',?3,?4)", params![id,title,now.with_timezone(&Local).date_naive().to_string(),now.to_rfc3339()]).map_err(db)?;
    }
    if action != "resume" {
        let timer: Option<String> = tx
            .query_row(
                "SELECT value FROM preferences WHERE name='core_timer'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(db)?;
        if timer
            .and_then(|value| serde_json::from_str::<Option<Timer>>(&value).ok())
            .flatten()
            .is_some_and(|timer| timer.goal_id == id)
        {
            tx.execute(
                "UPDATE preferences SET value='null' WHERE name='core_timer'",
                [],
            )
            .map_err(db)?;
        }
    }
    Ok(())
}
fn day(value: &str) -> Result<NaiveDate, String> {
    if value.len() != 10 {
        return Err("Choose a valid date".into());
    }
    let date = NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| "Choose a valid date")?;
    if date.to_string() != value {
        return Err("Choose a valid date".into());
    }
    Ok(date)
}
fn area_title(value: &str) -> Result<String, String> {
    let title = value.trim();
    if title.chars().count() > 80 || title.chars().any(char::is_control) {
        return Err("Use up to 80 characters for an area".into());
    }
    Ok(if title.is_empty() {
        "General".into()
    } else {
        title.into()
    })
}
pub fn validate_drafts(mut drafts: Vec<GoalDraft>) -> Result<Vec<GoalDraft>, String> {
    if drafts.is_empty() || drafts.len() > 20 {
        return Err("Add between 1 and 20 goals at a time".into());
    }
    for draft in &mut drafts {
        draft.title = goals::text(&draft.title, true)?;
        draft.area = area_title(&draft.area)?;
        if draft.steps.len() > 20 {
            return Err("Use at most 20 steps per goal".into());
        }
        for step in &mut draft.steps {
            *step = goals::text(step, true)?;
        }
    }
    Ok(drafts)
}
impl Storage {
    pub(crate) fn initialize_core(&self) -> Result<(), String> {
        self.connection.execute_batch("CREATE TABLE IF NOT EXISTS core_areas(id INTEGER PRIMARY KEY,title TEXT NOT NULL COLLATE NOCASE UNIQUE);
            CREATE TABLE IF NOT EXISTS core_goals(goal_id INTEGER PRIMARY KEY REFERENCES goals(id) ON DELETE CASCADE,area_id INTEGER NOT NULL REFERENCES core_areas(id),state TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS core_days(day TEXT PRIMARY KEY,mode TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS core_day_items(day TEXT NOT NULL,goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,PRIMARY KEY(day,goal_id));
            CREATE TABLE IF NOT EXISTS core_events(id INTEGER PRIMARY KEY,goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,step_id TEXT NOT NULL,title TEXT NOT NULL,kind TEXT NOT NULL,day TEXT NOT NULL,created_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS core_events_day ON core_events(day);
            CREATE TABLE IF NOT EXISTS core_time(day TEXT NOT NULL,goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,seconds INTEGER NOT NULL,PRIMARY KEY(day,goal_id));
            CREATE TABLE IF NOT EXISTS core_import_batches(batch_id TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS core_goal_details(goal_id INTEGER PRIMARY KEY REFERENCES goals(id) ON DELETE CASCADE,due_at TEXT,priority TEXT,description TEXT NOT NULL DEFAULT '');
            CREATE TABLE IF NOT EXISTS core_carryover_dismissals(day TEXT NOT NULL,goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,PRIMARY KEY(day,goal_id));").map_err(db)?;
        self.connection.execute_batch("CREATE TABLE IF NOT EXISTS core_quick_batches(batch_id TEXT PRIMARY KEY,goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL);").map_err(db)?;
        // A manual timer resumes only after an explicit user action on a new app run.
        self.write_setting("core_timer", &Option::<Timer>::None)?;
        self.adopt_core_goals()
    }
    fn adopt_core_goals(&self) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT OR IGNORE INTO core_areas(title) VALUES('General')",
                [],
            )
            .map_err(db)?;
        self.connection.execute("INSERT OR IGNORE INTO core_goals(goal_id,area_id,state) SELECT id,(SELECT id FROM core_areas WHERE title='General'),CASE status WHEN 'active' THEN 'open' WHEN 'completed' THEN 'completed' ELSE 'deferred' END FROM goals", []).map_err(db)?;
        Ok(())
    }
    pub fn core_add_goals(&mut self, drafts: Vec<GoalDraft>, batch: &str) -> Result<(), String> {
        let drafts = validate_drafts(drafts)?;
        if batch.is_empty()
            || batch.len() > 80
            || !batch
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        {
            return Err("Invalid import identifier".into());
        }
        let count: u32 = self
            .connection
            .query_row("SELECT COUNT(*) FROM goals", [], |r| r.get(0))
            .map_err(db)?;
        let tx = self.connection.transaction().map_err(db)?;
        let inserted = tx
            .execute(
                "INSERT OR IGNORE INTO core_import_batches(batch_id) VALUES(?1)",
                [batch],
            )
            .map_err(db)?;
        if inserted == 0 {
            return Ok(());
        }
        if count + drafts.len() as u32 > 500 {
            return Err("Keep up to 500 goals; remove an older goal before adding more".into());
        }
        let now = Utc::now().to_rfc3339();
        for draft in drafts {
            tx.execute(
                "INSERT OR IGNORE INTO core_areas(title) VALUES(?1)",
                [&draft.area],
            )
            .map_err(db)?;
            let area: i64 = tx
                .query_row(
                    "SELECT id FROM core_areas WHERE title=?1 COLLATE NOCASE",
                    [&draft.area],
                    |r| r.get(0),
                )
                .map_err(db)?;
            // Keep parallel goals separate from the legacy singleton focus selection.
            tx.execute(
                "INSERT INTO goals(text,status,created_at) VALUES(?1,'deferred',?2)",
                params![draft.title, now],
            )
            .map_err(db)?;
            let id = tx.last_insert_rowid();
            tx.execute(
                "INSERT INTO core_goals(goal_id,area_id,state) VALUES(?1,?2,'open')",
                params![id, area],
            )
            .map_err(db)?;
            let plan = GoalPlan {
                goal_id: id,
                revision: 1,
                done_when: String::new(),
                current_step: None,
                steps: draft
                    .steps
                    .into_iter()
                    .enumerate()
                    .map(|(i, text)| Step {
                        id: format!("step-{i}"),
                        text,
                        done: false,
                    })
                    .collect(),
            };
            tx.execute(
                "INSERT INTO goal_plans(goal_id,revision,payload) VALUES(?1,1,?2)",
                params![
                    id,
                    serde_json::to_string(&plan).map_err(|_| "Could not save steps")?
                ],
            )
            .map_err(db)?;
        }
        tx.commit().map_err(db)
    }
    #[cfg(test)]
    pub fn core_save_goal(
        &mut self,
        title: &str,
        area: &str,
        plan: GoalPlan,
    ) -> Result<(), String> {
        self.core_save_goal_details(title, area, plan, None)
    }
    pub fn core_save_goal_details(
        &mut self,
        title: &str,
        area: &str,
        mut plan: GoalPlan,
        details: Option<GoalDetails>,
    ) -> Result<(), String> {
        let details = details.map(GoalDetails::validate).transpose()?;
        let title = goals::text(title, true)?;
        let area = area_title(area)?;
        plan = goals::validate(plan)?;
        let old = self.goal_plan(plan.goal_id)?;
        if old.revision != plan.revision {
            return Err("This goal changed. Reload before saving.".into());
        }
        let tx = self.connection.transaction().map_err(db)?;
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM core_goals WHERE goal_id=?1)",
                [plan.goal_id],
                |r| r.get(0),
            )
            .map_err(db)?;
        if !exists {
            return Err("Goal no longer exists".into());
        }
        tx.execute(
            "INSERT OR IGNORE INTO core_areas(title) VALUES(?1)",
            [&area],
        )
        .map_err(db)?;
        tx.execute("UPDATE core_goals SET area_id=(SELECT id FROM core_areas WHERE title=?1 COLLATE NOCASE) WHERE goal_id=?2", params![area,plan.goal_id]).map_err(db)?;
        tx.execute(
            "UPDATE goals SET text=?1 WHERE id=?2",
            params![title, plan.goal_id],
        )
        .map_err(db)?;
        if let Some(details) = details {
            tx.execute("INSERT INTO core_goal_details(goal_id,due_at,priority,description) VALUES(?1,?2,?3,?4) ON CONFLICT(goal_id) DO UPDATE SET due_at=excluded.due_at,priority=excluded.priority,description=excluded.description", params![plan.goal_id,details.due_at,details.priority,details.description]).map_err(db)?;
        }
        record_step_changes(&tx, &old, &plan)?;
        plan.revision = plan
            .revision
            .checked_add(1)
            .ok_or("Goal revision limit reached")?;
        tx.execute("INSERT INTO goal_plans(goal_id,revision,payload) VALUES(?1,?2,?3) ON CONFLICT(goal_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload", params![plan.goal_id,plan.revision,serde_json::to_string(&plan).map_err(|_| "Could not save steps")?]).map_err(db)?;
        tx.commit().map_err(db)
    }
    pub fn core_transition(&mut self, id: i64, action: &str) -> Result<(), String> {
        let new_state = match action {
            "complete" => "completed",
            "defer" => "deferred",
            "resume" => "open",
            "delete" => "deleted",
            _ => return Err("Unknown goal action".into()),
        };
        let tx = self.connection.transaction().map_err(db)?;
        let previous: String = tx.query_row("SELECT CASE WHEN g.status='completed' THEN 'completed' ELSE c.state END FROM core_goals c JOIN goals g ON g.id=c.goal_id WHERE c.goal_id=?1", [id], |r| r.get(0)).map_err(|_| "Goal no longer exists")?;
        if action == "delete" {
            tx.execute("DELETE FROM feedback WHERE decision_id IN(SELECT id FROM decisions WHERE goal_id=?1)", [id]).map_err(db)?;
            for table in [
                "activity",
                "decisions",
                "suggestions",
                "recommendation_history",
            ] {
                tx.execute(&format!("DELETE FROM {table} WHERE goal_id=?1"), [id])
                    .map_err(db)?;
            }
            tx.execute("DELETE FROM goals WHERE id=?1", [id])
                .map_err(db)?;
        } else if previous != new_state {
            let now = Utc::now();
            tx.execute(
                "UPDATE core_goals SET state=?1 WHERE goal_id=?2",
                params![new_state, id],
            )
            .map_err(db)?;
            tx.execute(
                "UPDATE goals SET status=?1,completed_at=?2 WHERE id=?3",
                params![
                    if new_state == "completed" {
                        "completed"
                    } else {
                        "deferred"
                    },
                    if new_state == "completed" {
                        Some(now.to_rfc3339())
                    } else {
                        None
                    },
                    id
                ],
            )
            .map_err(db)?;
            if action == "complete" || (action == "resume" && previous == "completed") {
                let title: String = tx
                    .query_row("SELECT text FROM goals WHERE id=?1", [id], |r| r.get(0))
                    .map_err(db)?;
                tx.execute("INSERT INTO core_events(goal_id,step_id,title,kind,day,created_at) VALUES(?1,'goal',?2,?3,?4,?5)", params![id,title,if action=="complete" {"completed"} else {"reopened"},now.with_timezone(&Local).date_naive().to_string(),now.to_rfc3339()]).map_err(db)?;
            }
        }
        tx.commit().map_err(db)?;
        if self.core_timer()?.is_some_and(|t| t.goal_id == id) {
            self.write_setting("core_timer", &Option::<Timer>::None)?;
        }
        Ok(())
    }
    pub fn core_today(&mut self, id: i64, include: bool, date: &str) -> Result<(), String> {
        day(date)?;
        let tx = self.connection.transaction().map_err(db)?;
        if include {
            let state: String = tx
                .query_row("SELECT state FROM core_goals WHERE goal_id=?1", [id], |r| {
                    r.get(0)
                })
                .map_err(|_| "Goal no longer exists")?;
            if state != "open" {
                return Err("Resume this goal before adding it to Today".into());
            }
            let count: u32 = tx
                .query_row(
                    "SELECT COUNT(*) FROM core_day_items WHERE day=?1 AND goal_id!=?2",
                    params![date, id],
                    |r| r.get(0),
                )
                .map_err(db)?;
            if count >= 3 {
                return Err("Choose up to three goals for Today".into());
            }
            tx.execute(
                "INSERT OR IGNORE INTO core_day_items(day,goal_id) VALUES(?1,?2)",
                params![date, id],
            )
            .map_err(db)?;
            tx.execute("INSERT INTO core_days(day,mode) VALUES(?1,'plan') ON CONFLICT(day) DO UPDATE SET mode='plan'", [date]).map_err(db)?;
        } else {
            tx.execute(
                "DELETE FROM core_day_items WHERE day=?1 AND goal_id=?2",
                params![date, id],
            )
            .map_err(db)?;
        }
        tx.commit().map_err(db)
    }
    pub fn core_plan_day(&mut self, date: &str, no_plan: bool) -> Result<(), String> {
        day(date)?;
        let tx = self.connection.transaction().map_err(db)?;
        tx.execute("INSERT INTO core_days(day,mode) VALUES(?1,?2) ON CONFLICT(day) DO UPDATE SET mode=excluded.mode", params![date,if no_plan {"no_plan"} else {"plan"}]).map_err(db)?;
        if no_plan {
            tx.execute("DELETE FROM core_day_items WHERE day=?1", [date])
                .map_err(db)?;
        }
        tx.commit().map_err(db)
    }
    pub fn core_dismiss_carryover(&self, id: i64, date: &str) -> Result<(), String> {
        day(date)?;
        self.connection
            .execute(
                "INSERT OR IGNORE INTO core_carryover_dismissals(day,goal_id) VALUES(?1,?2)",
                params![date, id],
            )
            .map_err(db)?;
        Ok(())
    }
    pub fn core_create_goal(&mut self, title: &str, batch: &str, date: &str) -> Result<(), String> {
        let title = goals::text(title, true)?;
        day(date)?;
        if batch.is_empty()
            || batch.len() > 80
            || !batch
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        {
            return Err("Invalid draft identifier".into());
        }
        let tx = self.connection.transaction().map_err(db)?;
        let seen: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM core_quick_batches WHERE batch_id=?1)",
                [batch],
                |r| r.get(0),
            )
            .map_err(db)?;
        if seen {
            return Ok(());
        }
        let count: u32 = tx
            .query_row("SELECT COUNT(*) FROM goals", [], |r| r.get(0))
            .map_err(db)?;
        if count >= 500 {
            return Err("Keep up to 500 goals; remove an older goal before adding more".into());
        }
        tx.execute(
            "INSERT OR IGNORE INTO core_areas(title) VALUES('General')",
            [],
        )
        .map_err(db)?;
        tx.execute(
            "INSERT INTO goals(text,status,created_at) VALUES(?1,'deferred',?2)",
            params![title, Utc::now().to_rfc3339()],
        )
        .map_err(db)?;
        let id = tx.last_insert_rowid();
        tx.execute("INSERT INTO core_goals(goal_id,area_id,state) VALUES(?1,(SELECT id FROM core_areas WHERE title='General'),'open')", [id]).map_err(db)?;
        tx.execute(
            "INSERT INTO core_quick_batches(batch_id,goal_id) VALUES(?1,?2)",
            params![batch, id],
        )
        .map_err(db)?;
        let today_count: u32 = tx
            .query_row(
                "SELECT COUNT(*) FROM core_day_items WHERE day=?1",
                [date],
                |r| r.get(0),
            )
            .map_err(db)?;
        if today_count < 3 {
            tx.execute(
                "INSERT INTO core_day_items(day,goal_id) VALUES(?1,?2)",
                params![date, id],
            )
            .map_err(db)?;
            tx.execute("INSERT INTO core_days(day,mode) VALUES(?1,'plan') ON CONFLICT(day) DO UPDATE SET mode='plan'", [date]).map_err(db)?;
        }
        tx.commit().map_err(db)
    }
    pub fn core_goals_for_date(&self, date: &str) -> Result<Vec<i64>, String> {
        day(date)?;
        let mut query = self
            .connection
            .prepare("SELECT goal_id FROM core_day_items WHERE day=?1 ORDER BY rowid")
            .map_err(db)?;
        let rows = query.query_map([date], |r| r.get(0)).map_err(db)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db)
    }
    pub fn core_carryover(&self, date: &str) -> Result<Vec<i64>, String> {
        day(date)?;
        let mut query = self.connection.prepare("SELECT c.goal_id FROM core_goals c JOIN goals g ON g.id=c.goal_id WHERE c.state='open' AND g.status!='completed' AND EXISTS(SELECT 1 FROM core_day_items d WHERE d.goal_id=c.goal_id AND d.day<?1) AND NOT EXISTS(SELECT 1 FROM core_day_items d WHERE d.goal_id=c.goal_id AND d.day=?1) AND NOT EXISTS(SELECT 1 FROM core_carryover_dismissals x WHERE x.goal_id=c.goal_id AND x.day=?1) ORDER BY c.goal_id").map_err(db)?;
        let rows = query.query_map([date], |r| r.get(0)).map_err(db)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db)
    }
    pub fn core_timer(&self) -> Result<Option<Timer>, String> {
        self.read_setting("core_timer")
    }
    pub fn core_tick_at(&mut self, now: DateTime<Utc>) -> Result<(), String> {
        if let Some(mut timer) = self.core_timer()? {
            let tx = self.connection.transaction().map_err(db)?;
            let duration = (now - timer.last_tick).num_seconds();
            // Count only live heartbeats, never app downtime, sleep or throttled gaps.
            if (1..=30).contains(&duration) {
                let mut cursor = timer.last_tick;
                for _ in 0..duration {
                    let date = cursor.with_timezone(&Local).date_naive().to_string();
                    tx.execute("INSERT INTO core_time(day,goal_id,seconds) VALUES(?1,?2,1) ON CONFLICT(day,goal_id) DO UPDATE SET seconds=seconds+1",params![date,timer.goal_id]).map_err(db)?;
                    cursor += Duration::seconds(1);
                }
            }
            if now >= timer.last_tick {
                timer.last_tick = if duration <= 30 {
                    timer.last_tick + Duration::seconds(duration)
                } else {
                    now
                };
                tx.execute(
                    "INSERT OR REPLACE INTO preferences(name,value) VALUES('core_timer',?1)",
                    [serde_json::to_string(&timer).map_err(|_| "Could not save timer")?],
                )
                .map_err(db)?;
            }
            tx.commit().map_err(db)?;
        }
        Ok(())
    }
    pub fn core_set_timer(&mut self, id: Option<i64>) -> Result<(), String> {
        self.core_tick_at(Utc::now())?;
        if let Some(id) = id {
            let state: String = self
                .connection
                .query_row("SELECT state FROM core_goals WHERE goal_id=?1", [id], |r| {
                    r.get(0)
                })
                .map_err(|_| "Goal no longer exists")?;
            if state != "open" {
                return Err("Resume the goal before starting its timer".into());
            }
        }
        self.write_setting(
            "core_timer",
            &id.map(|goal_id| Timer {
                goal_id,
                last_tick: Utc::now(),
            }),
        )
    }
    fn core_progress(&self, date: &str) -> Result<DayProgress, String> {
        let mut q=self.connection.prepare("SELECT e.title FROM core_events e WHERE e.day=?1 AND e.kind='completed' AND e.id=(SELECT MAX(x.id) FROM core_events x WHERE x.goal_id=e.goal_id AND x.step_id=e.step_id AND x.day=e.day) ORDER BY e.id").map_err(db)?;
        let completed = q
            .query_map([date], |r| r.get::<_, String>(0))
            .map_err(db)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db)?;
        let mut q=self.connection.prepare("SELECT t.goal_id,g.text,a.title,t.seconds FROM core_time t JOIN goals g ON g.id=t.goal_id JOIN core_goals c ON c.goal_id=g.id JOIN core_areas a ON a.id=c.area_id WHERE t.day=?1 ORDER BY t.seconds DESC,g.id").map_err(db)?;
        let goals = q
            .query_map([date], |r| {
                Ok(GoalTime {
                    goal_id: r.get(0)?,
                    title: r.get(1)?,
                    area: r.get(2)?,
                    seconds: r.get(3)?,
                })
            })
            .map_err(db)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db)?;
        Ok(DayProgress {
            day: date.into(),
            completed,
            goals,
        })
    }
    pub fn core_snapshot(&self, anchor: Option<&str>) -> Result<CoreSnapshot, String> {
        self.adopt_core_goals()?;
        let today = Local::now().date_naive();
        let date = today.to_string();
        let anchor = anchor.map(day).transpose()?.unwrap_or(today);
        let mut q = self
            .connection
            .prepare("SELECT id,title FROM core_areas ORDER BY title COLLATE NOCASE")
            .map_err(db)?;
        let areas = q
            .query_map([], |r| {
                Ok(Area {
                    id: r.get(0)?,
                    title: r.get(1)?,
                })
            })
            .map_err(db)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db)?;
        let mut q=self.connection.prepare("SELECT g.id,g.text,CASE WHEN g.status='completed' THEN 'completed' ELSE c.state END,c.area_id,COALESCE((SELECT SUM(seconds) FROM core_time WHERE goal_id=g.id),0),m.due_at,m.priority,COALESCE(m.description,''),g.created_at,g.completed_at FROM goals g JOIN core_goals c ON c.goal_id=g.id LEFT JOIN core_goal_details m ON m.goal_id=g.id ORDER BY CASE c.state WHEN 'open' THEN 0 WHEN 'deferred' THEN 1 ELSE 2 END,g.id DESC").map_err(db)?;
        let rows = q
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, u64>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, Option<String>>(6)?,
                    r.get::<_, String>(7)?,
                    r.get::<_, String>(8)?,
                    r.get::<_, Option<String>>(9)?,
                ))
            })
            .map_err(db)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db)?;
        let goals = rows
            .into_iter()
            .map(
                |(
                    id,
                    title,
                    status,
                    area_id,
                    focused_seconds,
                    due_at,
                    priority,
                    description,
                    created_at,
                    completed_at,
                )| {
                    Ok(CoreGoal {
                        id,
                        title,
                        status,
                        area_id,
                        plan: self.goal_plan(id)?,
                        focused_seconds,
                        due_at,
                        priority,
                        description,
                        created_at,
                        completed_at,
                    })
                },
            )
            .collect::<Result<Vec<_>, String>>()?;
        let mut q = self
            .connection
            .prepare("SELECT goal_id FROM core_day_items WHERE day=?1 ORDER BY rowid")
            .map_err(db)?;
        let items = q
            .query_map([&date], |r| r.get(0))
            .map_err(db)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db)?;
        let mode = self
            .connection
            .query_row("SELECT mode FROM core_days WHERE day=?1", [&date], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .map_err(db)?
            .unwrap_or_else(|| "unset".into());
        let week = (0..7)
            .map(|offset| self.core_progress(&(anchor - Duration::days(offset)).to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(CoreSnapshot {
            date: date.clone(),
            selected_date: anchor.to_string(),
            date_goals: self.core_goals_for_date(&anchor.to_string())?,
            carryover: self.core_carryover(&date)?,
            day_mode: mode,
            today: items,
            areas,
            goals,
            summary: self.core_progress(&date)?,
            week,
            timer: self.core_timer()?,
            focused_goal_id: self.goal()?.map(|g| g.id),
            preferences: self.read_setting("core_preferences")?.unwrap_or_default(),
        })
    }
}

#[tauri::command(async)]
pub fn finish_core_setup(
    state: State<AppState>,
    app: AppHandle,
    name: String,
    drafts: Vec<GoalDraft>,
    batch: String,
    allow_tracking: bool,
) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 120 || name.chars().any(char::is_control) {
        return Err("Enter your name, up to 120 characters".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let mut settings = inner.storage.user_settings()?;
    if settings.onboarding.completed {
        return Err("Setup is already complete".into());
    }
    settings.profile.name = name.into();
    crate::profile::validate_profile(&mut settings.profile, false)?;
    if !drafts.is_empty() {
        inner.storage.core_add_goals(drafts, &batch)?;
    }
    let snapshot = inner.storage.core_snapshot(None)?;
    let open: Vec<i64> = snapshot
        .goals
        .iter()
        .filter(|g| g.status == "open")
        .map(|g| g.id)
        .collect();
    for id in open.iter().take(3) {
        inner.storage.core_today(*id, true, &snapshot.date)?;
    }
    if allow_tracking && inner.storage.goal()?.is_none() {
        if let Some(id) = open.first() {
            inner.storage.transition_goal(*id, "resume")?;
        }
    }
    settings.onboarding.completed = true;
    settings.onboarding.step = 3;
    settings.onboarding.tracking_consent = allow_tracking;
    crate::autostart::sync(settings.autostart)?;
    inner.storage.write_setting("user_settings", &settings)?;
    inner.status.tracking = allow_tracking && inner.storage.goal()?.is_some();
    inner.collector = crate::collector::create(inner.status.demo);
    inner.usage = Default::default();
    inner.activity_state.stop(false);
    crate::buddy::sync(&app, &mut inner)
}

#[tauri::command(async)]
pub fn save_core_identity(
    state: State<AppState>,
    app: AppHandle,
    name: String,
    autostart: bool,
    avatar: Option<crate::profile::AvatarPreferences>,
) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let mut settings = inner.storage.user_settings()?;
    settings.profile.name = name.trim().into();
    if let Some(avatar) = avatar {
        settings.profile.avatar = avatar;
    }
    if settings.profile.name.is_empty() {
        return Err("Enter your name".into());
    }
    crate::profile::validate_profile(&mut settings.profile, false)?;
    crate::autostart::sync(autostart)?;
    settings.autostart = autostart;
    inner.storage.write_setting("user_settings", &settings)?;
    crate::buddy::sync(&app, &mut inner)
}
fn mutate(
    state: &AppState,
    app: &AppHandle,
    work: impl FnOnce(&mut Storage) -> Result<(), String>,
) -> Result<CoreSnapshot, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let focus = inner.storage.goal()?.map(|g| g.id);
    work(&mut inner.storage)?;
    if focus != inner.storage.goal()?.map(|g| g.id) {
        inner.status.tracking = false;
        inner.collector = crate::collector::create(inner.status.demo);
        inner.usage = Default::default();
        inner.activity_state.stop(false);
    }
    inner.privacy_revision += 1;
    inner.companion.invalidate();
    inner.buddy.clear();
    inner.last_analysis = None;
    crate::buddy::sync(app, &mut inner)?;
    inner.storage.core_snapshot(None)
}
#[tauri::command(async)]
pub fn get_core_snapshot(
    state: State<AppState>,
    anchor: Option<String>,
) -> Result<CoreSnapshot, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .core_snapshot(anchor.as_deref())
}
#[tauri::command(async)]
pub fn add_core_goals(
    state: State<AppState>,
    app: AppHandle,
    drafts: Vec<GoalDraft>,
    batch: String,
) -> Result<CoreSnapshot, String> {
    mutate(&state, &app, |s| s.core_add_goals(drafts, &batch))
}
#[tauri::command(async)]
pub fn create_core_goal(
    state: State<AppState>,
    app: AppHandle,
    title: String,
    batch: String,
) -> Result<CoreSnapshot, String> {
    mutate(&state, &app, |s| {
        s.core_create_goal(&title, &batch, &Local::now().date_naive().to_string())
    })
}
#[tauri::command(async)]
pub fn save_core_goal(
    state: State<AppState>,
    app: AppHandle,
    title: String,
    area: String,
    plan: GoalPlan,
    details: Option<GoalDetails>,
) -> Result<CoreSnapshot, String> {
    mutate(&state, &app, |s| {
        s.core_save_goal_details(&title, &area, plan, details)
    })
}
#[tauri::command(async)]
pub fn dismiss_core_carryover(
    state: State<AppState>,
    app: AppHandle,
    id: i64,
) -> Result<CoreSnapshot, String> {
    mutate(&state, &app, |s| {
        s.core_dismiss_carryover(id, &Local::now().date_naive().to_string())
    })
}
#[tauri::command(async)]
pub fn transition_core_goal(
    state: State<AppState>,
    app: AppHandle,
    id: i64,
    action: String,
    confirmed: bool,
) -> Result<CoreSnapshot, String> {
    if matches!(action.as_str(), "delete" | "complete") && !confirmed {
        return Err("Confirm this goal action first".into());
    }
    mutate(&state, &app, |s| s.core_transition(id, &action))
}
#[tauri::command(async)]
pub fn set_core_today(
    state: State<AppState>,
    app: AppHandle,
    id: i64,
    include: bool,
) -> Result<CoreSnapshot, String> {
    mutate(&state, &app, |s| {
        s.core_today(id, include, &Local::now().date_naive().to_string())
    })
}
#[tauri::command(async)]
pub fn plan_core_day(
    state: State<AppState>,
    app: AppHandle,
    no_plan: bool,
) -> Result<CoreSnapshot, String> {
    mutate(&state, &app, |s| {
        s.core_plan_day(&Local::now().date_naive().to_string(), no_plan)
    })
}
#[tauri::command(async)]
pub fn set_core_timer(
    state: State<AppState>,
    app: AppHandle,
    id: Option<i64>,
) -> Result<CoreSnapshot, String> {
    mutate(&state, &app, |storage| {
        storage.core_set_timer(id)?;
        if let Some(id) = id {
            if storage.goal()?.map(|goal| goal.id) != Some(id) {
                storage.transition_goal(id, "resume")?;
            }
        }
        Ok(())
    })
}
#[tauri::command(async)]
pub fn tick_core_timer(state: State<AppState>) -> Result<CoreSnapshot, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.core_tick_at(Utc::now())?;
    inner.storage.core_snapshot(None)
}
#[tauri::command(async)]
pub fn set_core_preferences(
    state: State<AppState>,
    mut preferences: CorePreferences,
) -> Result<(), String> {
    preferences.working_days.sort_unstable();
    preferences.working_days.dedup();
    if preferences.working_days.iter().any(|d| *d > 6)
        || preferences.vision_model.len() > 160
        || preferences.vision_model.chars().any(char::is_control)
    {
        return Err("Invalid workspace settings".into());
    }
    preferences.vision_model = preferences.vision_model.trim().into();
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .write_setting("core_preferences", &preferences)
}

#[cfg(test)]
#[path = "core_tests.rs"]
mod tests;
