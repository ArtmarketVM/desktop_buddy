use crate::models::*;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
pub struct Storage {
    pub connection: Connection,
}
impl Storage {
    pub fn open(path: &std::path::Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|e| e.to_string())?;
        let store = Self { connection };
        store.initialize()?;
        Ok(store)
    }
    pub(crate) fn initialize(&self) -> Result<(), String> {
        self.connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY, text TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS goal_plans(goal_id INTEGER PRIMARY KEY REFERENCES goals(id) ON DELETE CASCADE, revision INTEGER NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS app_rules(goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE, process_name TEXT NOT NULL, category TEXT NOT NULL, PRIMARY KEY(goal_id,process_name));
        CREATE TABLE IF NOT EXISTS usage_daily(day TEXT NOT NULL, goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE, process_name TEXT NOT NULL, milliseconds INTEGER NOT NULL, PRIMARY KEY(day,goal_id,process_name));
        CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY, goal_id INTEGER REFERENCES goals(id), timestamp TEXT NOT NULL, process_name TEXT NOT NULL, window_title TEXT NOT NULL, idle_seconds INTEGER NOT NULL, active_seconds INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS decisions(id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, goal_id INTEGER REFERENCES goals(id), state TEXT NOT NULL, confidence REAL NOT NULL, reason TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY, decision_id INTEGER NOT NULL REFERENCES decisions(id), related INTEGER NOT NULL, timestamp TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS activity_goal ON activity(goal_id, id);
        CREATE TABLE IF NOT EXISTS preferences(name TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS suggestions(goal_id INTEGER NOT NULL REFERENCES goals(id), url TEXT NOT NULL, timestamp TEXT NOT NULL, PRIMARY KEY(goal_id,url));
        CREATE TABLE IF NOT EXISTS recommendation_history(id INTEGER PRIMARY KEY, goal_id INTEGER NOT NULL REFERENCES goals(id), title TEXT NOT NULL, url TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, feedback INTEGER CHECK(feedback IN (0,1)), UNIQUE(goal_id,url));
        INSERT OR IGNORE INTO recommendation_history(goal_id,title,url,reason,created_at) SELECT goal_id,url,url,'Offered by an earlier version. Details were not retained.',timestamp FROM suggestions;").map_err(|e| e.to_string())
    }
    pub fn read_setting<T: serde::de::DeserializeOwned>(
        &self,
        name: &str,
    ) -> Result<Option<T>, String> {
        let value: Option<String> = self
            .connection
            .query_row("SELECT value FROM preferences WHERE name=?1", [name], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;
        value
            .map(|v| {
                serde_json::from_str::<Option<T>>(&v)
                    .map_err(|_| format!("Invalid saved {name} setting"))
            })
            .transpose()
            .map(Option::flatten)
    }
    pub fn write_setting<T: serde::Serialize>(&self, name: &str, value: &T) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO preferences(name,value) VALUES(?1,?2)",
                params![
                    name,
                    serde_json::to_string(value).map_err(|e| e.to_string())?
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    /// Removes local history, not settings, keys, or the active goal. None means all history.
    pub fn purge_history(&mut self, cutoff: Option<&str>) -> Result<(), String> {
        let cutoff_day = cutoff
            .map(|v| {
                chrono::DateTime::parse_from_rfc3339(v)
                    .map(|d| d.with_timezone(&chrono::Local).date_naive().to_string())
                    .map_err(|e| e.to_string())
            })
            .transpose()?;
        let tx = self.connection.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM usage_daily WHERE ?1 IS NULL OR day<?1",
            [cutoff_day],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM feedback WHERE ?1 IS NULL OR julianday(timestamp)<julianday(?1) OR decision_id IN (SELECT id FROM decisions WHERE julianday(timestamp)<julianday(?1))",[cutoff]).map_err(|e|e.to_string())?;
        for (table, column) in [
            ("decisions", "timestamp"),
            ("activity", "timestamp"),
            ("recommendation_history", "created_at"),
            ("suggestions", "timestamp"),
        ] {
            tx.execute(
                &format!(
                    "DELETE FROM {table} WHERE ?1 IS NULL OR julianday({column})<julianday(?1)"
                ),
                [cutoff],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.execute("DELETE FROM goals WHERE status!='active' AND (?1 IS NULL OR (status!='deferred' AND julianday(created_at)<julianday(?1))) AND NOT EXISTS(SELECT 1 FROM usage_daily WHERE goal_id=goals.id) AND NOT EXISTS(SELECT 1 FROM activity WHERE goal_id=goals.id) AND NOT EXISTS(SELECT 1 FROM decisions WHERE goal_id=goals.id) AND NOT EXISTS(SELECT 1 FROM recommendation_history WHERE goal_id=goals.id) AND NOT EXISTS(SELECT 1 FROM suggestions WHERE goal_id=goals.id)",[cutoff]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn record_recommendation(
        &mut self,
        goal: i64,
        title: &str,
        url: &str,
        reason: &str,
    ) -> Result<i64, String> {
        let tx = self.connection.transaction().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        tx.execute("INSERT INTO recommendation_history(goal_id,title,url,reason,created_at) VALUES(?1,?2,?3,?4,?5)",params![goal,title,url,reason,now]).map_err(|e|e.to_string())?;
        let id = tx.last_insert_rowid();
        tx.execute(
            "INSERT OR IGNORE INTO suggestions(goal_id,url,timestamp) VALUES(?1,?2,?3)",
            params![goal, url, now],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(id)
    }
    pub fn recommendation_history(&self) -> Result<Vec<Recommendation>, String> {
        let mut query = self.connection.prepare("SELECT r.id,r.goal_id,g.text,r.title,r.url,r.reason,r.created_at,r.feedback FROM recommendation_history r JOIN goals g ON g.id=r.goal_id ORDER BY r.id DESC LIMIT 100").map_err(|e|e.to_string())?;
        let rows = query
            .query_map([], |r| {
                Ok(Recommendation {
                    id: r.get(0)?,
                    goal_id: r.get(1)?,
                    goal: r.get(2)?,
                    title: r.get(3)?,
                    url: r.get(4)?,
                    reason: r.get(5)?,
                    created_at: r.get(6)?,
                    feedback: r.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
    pub fn rate_recommendation(&self, id: i64, helpful: Option<bool>) -> Result<(), String> {
        let changed = self
            .connection
            .execute(
                "UPDATE recommendation_history SET feedback=?1 WHERE id=?2",
                params![helpful, id],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("Recommendation not found".into());
        }
        Ok(())
    }
    pub fn buddy_preferences(&self) -> Result<BuddyPreferences, String> {
        let value: Option<String> = self
            .connection
            .query_row(
                "SELECT value FROM preferences WHERE name='buddy'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        value
            .map(|v| serde_json::from_str(&v).map_err(|_| "Invalid Buddy preferences".into()))
            .unwrap_or_else(|| Ok(BuddyPreferences::default()))
    }
    pub fn save_buddy_preferences(&self, value: &BuddyPreferences) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT OR REPLACE INTO preferences(name,value) VALUES('buddy',?1)",
                [serde_json::to_string(value).map_err(|e| e.to_string())?],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn seen_suggestion(&self, goal: i64, url: &str) -> Result<bool, String> {
        self.connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM suggestions WHERE goal_id=?1 AND url=?2)",
                params![goal, url],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())
    }
    #[cfg(test)]
    pub fn save_suggestion(&self, goal: i64, url: &str) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT OR IGNORE INTO suggestions(goal_id,url,timestamp) VALUES(?1,?2,?3)",
                params![goal, url, Utc::now().to_rfc3339()],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn goal(&self) -> Result<Option<Goal>, String> {
        self.connection.query_row("SELECT id,text,created_at FROM goals WHERE status='active' ORDER BY id DESC LIMIT 1", [], |r| Ok(Goal { id: r.get(0)?, text: r.get(1)?, created_at: r.get(2)? })).optional().map_err(|e| e.to_string())
    }
    pub fn set_goal(&mut self, text: &str) -> Result<Goal, String> {
        let tx = self.connection.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE goals SET status='deferred' WHERE status='active'",
            [],
        )
        .map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        tx.execute(
            "INSERT INTO goals(text,status,created_at) VALUES (?1,'active',?2)",
            params![text, now],
        )
        .map_err(|e| e.to_string())?;
        let id = tx.last_insert_rowid();
        tx.commit().map_err(|e| e.to_string())?;
        Ok(Goal {
            id,
            text: text.into(),
            created_at: now,
        })
    }
    pub fn activity(&self, goal: i64, item: &ActivitySnapshot) -> Result<(), String> {
        let last: Option<(i64, String, String, u64)> = self.connection.query_row("SELECT id,process_name,window_title,active_seconds FROM activity WHERE goal_id=?1 ORDER BY id DESC LIMIT 1", [goal], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).optional().map_err(|e| e.to_string())?;
        if let Some((id, process, title, seconds)) = last {
            if process == item.process_name
                && title == item.window_title
                && item.active_seconds >= seconds
            {
                self.connection
                    .execute(
                        "UPDATE activity SET idle_seconds=?1,active_seconds=?2 WHERE id=?3",
                        params![item.idle_seconds, item.active_seconds, id],
                    )
                    .map_err(|e| e.to_string())?;
                return Ok(());
            }
        }
        self.connection.execute("INSERT INTO activity(goal_id,timestamp,process_name,window_title,idle_seconds,active_seconds) VALUES (?1,?2,?3,?4,?5,?6)", params![goal,item.timestamp,item.process_name,item.window_title,item.idle_seconds,item.active_seconds]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn recent(&self, goal: i64) -> Result<Vec<ActivitySnapshot>, String> {
        let mut q = self.connection.prepare("SELECT timestamp,process_name,window_title,idle_seconds,active_seconds FROM activity WHERE goal_id=?1 ORDER BY id DESC LIMIT 20").map_err(|e| e.to_string())?;
        let rows = q
            .query_map([goal], |r| {
                Ok(ActivitySnapshot {
                    timestamp: r.get(0)?,
                    process_name: r.get(1)?,
                    window_title: r.get(2)?,
                    idle_seconds: r.get(3)?,
                    active_seconds: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut items = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        items.reverse();
        Ok(items)
    }
    pub fn decision(&self, goal: i64, decision: &mut Decision) -> Result<(), String> {
        self.connection.execute("INSERT INTO decisions(timestamp,goal_id,state,confidence,reason,action,payload) VALUES (?1,?2,?3,?4,?5,?6,?7)", params![Utc::now().to_rfc3339(),goal,serde_json::to_string(&decision.state).unwrap(),decision.confidence,decision.reason,serde_json::to_string(&decision.action).unwrap(),serde_json::to_string(decision).unwrap()]).map_err(|e| e.to_string())?;
        decision.id = Some(self.connection.last_insert_rowid());
        Ok(())
    }
    pub fn latest_decision(&self, goal: i64) -> Result<Option<Decision>, String> {
        let row: Option<(i64, String)> = self
            .connection
            .query_row(
                "SELECT id,payload FROM decisions WHERE goal_id=?1 ORDER BY id DESC LIMIT 1",
                [goal],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        row.map(|(id, payload)| {
            let mut d: Decision = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
            d.id = Some(id);
            Ok(d)
        })
        .transpose()
    }
    pub fn feedback(&self, id: i64, related: bool) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT INTO feedback(decision_id,related,timestamp) VALUES (?1,?2,?3)",
                params![id, related, Utc::now().to_rfc3339()],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reopens_saved_goal_from_disk() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "buddy-storage-test-{}-{unique}.db",
            std::process::id()
        ));
        {
            let mut store = Storage::open(&path).unwrap();
            store.set_goal("Saved across restarts").unwrap();
        }
        {
            let store = Storage::open(&path).unwrap();
            assert_eq!(store.goal().unwrap().unwrap().text, "Saved across restarts");
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn persists_goal_activity_and_feedback() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let g = s.set_goal("Build a demo").unwrap();
        let mut a = ActivitySnapshot {
            timestamp: Utc::now().to_rfc3339(),
            process_name: "editor.exe".into(),
            window_title: "Demo".into(),
            idle_seconds: 0,
            active_seconds: 3,
        };
        s.activity(g.id, &a).unwrap();
        a.active_seconds = 6;
        s.activity(g.id, &a).unwrap();
        assert_eq!(s.recent(g.id).unwrap().len(), 1);
        assert_eq!(s.recent(g.id).unwrap()[0].active_seconds, 6);
        let mut d = Decision {
            id: None,
            state: FocusState::Focused,
            confidence: 0.9,
            reason: "Editing the demo".into(),
            action: Action::Wait,
        };
        s.decision(g.id, &mut d).unwrap();
        s.feedback(d.id.unwrap(), true).unwrap();
        assert_eq!(s.latest_decision(g.id).unwrap().unwrap().id, d.id);
        let next = s.set_goal("Next task").unwrap();
        assert_eq!(s.goal().unwrap().unwrap().id, next.id);
        assert!(s.recent(next.id).unwrap().is_empty());
    }
}
