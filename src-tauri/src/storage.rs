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
    fn initialize(&self) -> Result<(), String> {
        self.connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY, text TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY, goal_id INTEGER REFERENCES goals(id), timestamp TEXT NOT NULL, process_name TEXT NOT NULL, window_title TEXT NOT NULL, idle_seconds INTEGER NOT NULL, active_seconds INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS decisions(id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, goal_id INTEGER REFERENCES goals(id), state TEXT NOT NULL, confidence REAL NOT NULL, reason TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY, decision_id INTEGER NOT NULL REFERENCES decisions(id), related INTEGER NOT NULL, timestamp TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS activity_goal ON activity(goal_id, id);
        CREATE TABLE IF NOT EXISTS preferences(name TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS suggestions(goal_id INTEGER NOT NULL REFERENCES goals(id), url TEXT NOT NULL, timestamp TEXT NOT NULL, PRIMARY KEY(goal_id,url));").map_err(|e| e.to_string())
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
            "UPDATE goals SET status='completed' WHERE status='active'",
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
