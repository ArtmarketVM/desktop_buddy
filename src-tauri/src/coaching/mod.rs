//! Local coaching foundation. No provider calls, background offers or app mutations.
pub mod strategy;
pub mod tiny;
use crate::{memory, storage::Storage};
use chrono::Utc;
use memory::retriever::{MemoryBudget, RetrievalInput};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
pub use strategy::{Outcome, Strategy};
pub use tiny::{Barrier, MicroAction, Reply, TinyState};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Active,
    Paused,
    Completed,
    Declined,
    Blocked,
    Invalidated,
}

impl Status {
    fn open(self) -> bool {
        matches!(self, Self::Active | Self::Paused)
    }
    fn name(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Declined => "declined",
            Self::Blocked => "blocked",
            Self::Invalidated => "invalidated",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Session {
    pub id: i64,
    pub goal_id: i64,
    pub step_id: Option<String>,
    pub conversation_id: i64,
    pub strategy_id: String,
    pub strategy_version: u32,
    pub revision: u64,
    pub target_revision: u64,
    pub status: Status,
    pub step: String,
    pub resume_step: Option<String>,
    pub outcome: Option<Outcome>,
    pub data: Value,
    pub created_at: String,
    pub updated_at: String,
}

impl Session {
    fn pause(&mut self) {
        self.resume_step = Some(self.step.clone());
        self.status = Status::Paused;
        self.outcome = Some(Outcome::Deferred);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Target {
    pub goal_id: i64,
    pub title: String,
    pub step_id: Option<String>,
    pub step_title: Option<String>,
    pub revision: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Start {
    pub request_id: String,
    pub goal_id: i64,
    pub step_id: Option<String>,
    pub conversation_id: i64,
    pub expected_target_revision: u64,
    pub strategy_id: String,
    pub strategy_version: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Control {
    Reply { reply: Value },
    Pause,
    Resume,
    Stop,
}

fn db(_: rusqlite::Error) -> String {
    "Coaching storage is unavailable".into()
}
fn encode<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| "Invalid coaching data".into())
}
fn request_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 100
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
    {
        return Err(
            "Use a unique coaching request ID of up to 100 letters, digits, dashes or underscores"
                .into(),
        );
    }
    Ok(())
}

impl Storage {
    pub(crate) fn initialize_coaching(&self) -> Result<(), String> {
        let tx = self.connection.unchecked_transaction().map_err(db)?;
        tx.execute_batch("CREATE TABLE IF NOT EXISTS coaching_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);").map_err(db)?;
        let version: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(version),0) FROM coaching_migrations",
                [],
                |r| r.get(0),
            )
            .map_err(db)?;
        if version > 1 {
            return Err("This database requires a newer coaching implementation".into());
        }
        if version == 0 {
            tx.execute_batch(include_str!("schema.sql")).map_err(db)?;
            // Monotonic revisions detect changes even when values are later restored.
            for table in ["goal_plans", "core_goals", "core_goal_details"] {
                for (operation, row) in [("INSERT", "NEW"), ("UPDATE", "NEW"), ("DELETE", "OLD")] {
                    tx.execute_batch(&format!("CREATE TRIGGER coaching_version_{table}_{operation} AFTER {operation} ON {table} BEGIN UPDATE coaching_revision_clock SET revision=revision+1 WHERE id=1; UPDATE coaching_goal_versions SET revision=(SELECT revision FROM coaching_revision_clock WHERE id=1) WHERE goal_id={row}.goal_id; END;")).map_err(db)?;
                }
            }
            tx.execute(
                "INSERT INTO coaching_migrations VALUES(1,?1)",
                [Utc::now().to_rfc3339()],
            )
            .map_err(db)?;
        }
        tx.commit().map_err(db)
    }

    /// Local authoritative target; observed activity never supplies task completion.
    pub fn coaching_target(&self, goal: i64, step: Option<&str>) -> Result<Target, String> {
        let (title, revision, status): (String, u64, String) = self.connection.query_row(
            "SELECT g.text,v.revision,CASE WHEN g.status='completed' THEN 'completed' ELSE COALESCE(c.state,'open') END FROM goals g JOIN coaching_goal_versions v ON v.goal_id=g.id LEFT JOIN core_goals c ON c.goal_id=g.id WHERE g.id=?1",
            [goal], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(db)?.ok_or("Coaching goal no longer exists")?;
        if !matches!(status.as_str(), "open" | "deferred") {
            return Err("Choose an unfinished coaching goal".into());
        }
        let step_title = if let Some(id) = step {
            Some(
                self.goal_plan(goal)?
                    .steps
                    .into_iter()
                    .find(|s| s.id == id && !s.done)
                    .ok_or("Choose an unfinished step belonging to this goal")?
                    .text,
            )
        } else {
            None
        };
        Ok(Target {
            goal_id: goal,
            title,
            step_id: step.map(str::to_owned),
            step_title,
            revision,
        })
    }

    fn coaching_conversation(&self, id: i64) -> Result<(), String> {
        let exists: bool = self
            .connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM buddy_conversations WHERE id=?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(db)?;
        if !exists {
            return Err("Coaching conversation no longer exists".into());
        }
        Ok(())
    }

    pub fn coaching_session(&self, id: i64, conversation: i64) -> Result<Session, String> {
        let payload: String = self
            .connection
            .query_row(
                "SELECT payload FROM coaching_sessions WHERE id=?1 AND conversation_id=?2",
                params![id, conversation],
                |r| r.get(0),
            )
            .optional()
            .map_err(db)?
            .ok_or("Coaching session is unavailable in this conversation")?;
        serde_json::from_str(&payload).map_err(|_| "Invalid saved coaching session".into())
    }

    fn replay_coaching(&self, key: &str, request: &str) -> Result<Option<Session>, String> {
        request_id(key)?;
        let old: Option<(String, String)> = self
            .connection
            .query_row(
                "SELECT request,response FROM coaching_requests WHERE request_id=?1",
                [key],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(db)?;
        old.map(|(original, response)| {
            if original != request {
                return Err(
                    "This coaching request ID has already been used for different input".into(),
                );
            }
            serde_json::from_str(&response).map_err(|_| "Invalid saved coaching response".into())
        })
        .transpose()
    }

    /// Discover a resumable session after restart without retaining its ID in the UI.
    pub fn active_coaching(&self, conversation: i64) -> Result<Option<Session>, String> {
        self.coaching_conversation(conversation)?;
        let id: Option<i64> = self.connection.query_row("SELECT id FROM coaching_sessions WHERE conversation_id=?1 AND status IN ('active','paused')", [conversation], |r|r.get(0)).optional().map_err(db)?;
        id.map(|id| self.coaching_session(id, conversation))
            .transpose()
    }

    fn save_coaching(&self, session: &Session, key: &str, request: &str) -> Result<(), String> {
        let payload = encode(session)?;
        self.connection.execute("UPDATE coaching_sessions SET revision=?1,status=?2,payload=?3,updated_at=?4 WHERE id=?5", params![session.revision,session.status.name(),payload,session.updated_at,session.id]).map_err(db)?;
        self.connection
            .execute(
                "INSERT INTO coaching_requests VALUES(?1,?2,?3,?4,?5)",
                params![key, session.id, request, payload, session.updated_at],
            )
            .map_err(db)?;
        Ok(())
    }

    pub fn start_coaching(&self, input: &Start) -> Result<Session, String> {
        let strategy = strategy::find(&input.strategy_id, input.strategy_version)?;
        let request = encode(&json!({"start":input}))?;
        let tx = self.connection.unchecked_transaction().map_err(db)?;
        if let Some(replay) = self.replay_coaching(&input.request_id, &request)? {
            return Ok(replay);
        }
        self.coaching_conversation(input.conversation_id)?;
        let target = self.coaching_target(input.goal_id, input.step_id.as_deref())?;
        if target.revision != input.expected_target_revision {
            return Err("Coaching target changed. Reload before starting.".into());
        }
        let mut q = self.connection.prepare("SELECT id,conversation_id FROM coaching_sessions WHERE status IN ('active','paused') AND (goal_id=?1 OR conversation_id=?2)").map_err(db)?;
        let existing = q
            .query_map(params![input.goal_id, input.conversation_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
            })
            .map_err(db)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db)?;
        drop(q);
        for (id, conversation) in existing {
            let mut old = self.coaching_session(id, conversation)?;
            if self
                .coaching_target(old.goal_id, old.step_id.as_deref())
                .is_ok_and(|t| t.revision == old.target_revision)
            {
                return Err(
                    "Resume or stop the existing coaching session before starting another".into(),
                );
            }
            old.status = Status::Invalidated;
            old.step = "invalidated".into();
            old.outcome = None;
            old.resume_step = None;
            old.revision += 1;
            old.updated_at = Utc::now().to_rfc3339();
            self.connection.execute("UPDATE coaching_sessions SET status='invalidated',revision=?1,payload=?2,updated_at=?3 WHERE id=?4", params![old.revision,encode(&old)?,old.updated_at,id]).map_err(db)?;
        }
        let now = Utc::now().to_rfc3339();
        let mut session = Session {
            id: 0,
            goal_id: input.goal_id,
            step_id: input.step_id.clone(),
            conversation_id: input.conversation_id,
            strategy_id: strategy.id.into(),
            strategy_version: strategy.version,
            revision: 0,
            target_revision: target.revision,
            status: Status::Active,
            step: strategy.initial_step.into(),
            resume_step: None,
            outcome: None,
            data: strategy.handler.initial_data(),
            created_at: now.clone(),
            updated_at: now,
        };
        self.connection.execute("INSERT INTO coaching_sessions(goal_id,conversation_id,strategy_id,strategy_version,revision,target_revision,status,payload,created_at,updated_at) VALUES(?1,?2,?3,?4,0,?5,'active','',?6,?6)", params![session.goal_id,session.conversation_id,session.strategy_id,session.strategy_version,session.target_revision,session.created_at]).map_err(db)?;
        session.id = self.connection.last_insert_rowid();
        self.save_coaching(&session, &input.request_id, &request)?;
        tx.commit().map_err(db)?;
        Ok(session)
    }

    pub fn reply_coaching(
        &self,
        id: i64,
        conversation: i64,
        expected_revision: u64,
        key: &str,
        control: &Control,
    ) -> Result<Session, String> {
        self.advance_coaching(
            id,
            conversation,
            expected_revision,
            key,
            Some(control),
            None,
        )
    }

    /// Separate proposal path: a future LLM gateway can propose an action, never report success.
    pub fn propose_coaching_action(
        &self,
        id: i64,
        conversation: i64,
        expected_revision: u64,
        key: &str,
        action: &MicroAction,
    ) -> Result<Session, String> {
        action.validate()?;
        self.propose_coaching(id, conversation, expected_revision, key, &json!(action))
    }

    pub fn propose_coaching(
        &self,
        id: i64,
        conversation: i64,
        expected_revision: u64,
        key: &str,
        proposal: &Value,
    ) -> Result<Session, String> {
        self.advance_coaching(
            id,
            conversation,
            expected_revision,
            key,
            None,
            Some(proposal),
        )
    }

    fn advance_coaching(
        &self,
        id: i64,
        conversation: i64,
        expected_revision: u64,
        key: &str,
        control: Option<&Control>,
        proposal: Option<&Value>,
    ) -> Result<Session, String> {
        let request = encode(
            &json!({"session":id,"conversation":conversation,"revision":expected_revision,"control":control,"proposal":proposal}),
        )?;
        let tx = self.connection.unchecked_transaction().map_err(db)?;
        if let Some(replay) = self.replay_coaching(key, &request)? {
            return Ok(replay);
        }
        let mut session = self.coaching_session(id, conversation)?;
        if session.revision != expected_revision {
            return Err("Coaching session changed. Reload before replying.".into());
        }
        if !session.status.open() {
            return Err("This coaching session has ended".into());
        }
        let strategy = strategy::find(&session.strategy_id, session.strategy_version)?;
        let stopping = matches!(control, Some(Control::Stop | Control::Pause));
        if !stopping {
            if self
                .coaching_target(session.goal_id, session.step_id.as_deref())?
                .revision
                != session.target_revision
            {
                return Err(
                    "Coaching target changed. Stop this session and start with current context."
                        .into(),
                );
            }
            if session.revision >= u64::from(strategy.limits.max_transitions) {
                return Err(
                    "Coaching transition limit reached. Pause or stop this session.".into(),
                );
            }
        }
        let mut remembered_fact = None;
        match (control, proposal) {
            (Some(Control::Pause), None) if session.status == Status::Active => {
                session.pause();
                session.step = "paused".into();
            }
            (Some(Control::Stop), None) => {
                session.status = Status::Declined;
                session.step = "declined".into();
                session.resume_step = None;
                session.outcome = Some(Outcome::Declined);
            }
            (Some(Control::Resume), None) if session.status == Status::Paused => {
                session.step = session
                    .resume_step
                    .take()
                    .ok_or("No coaching step to resume")?;
                session.status = Status::Active;
                session.outcome = None;
            }
            (Some(Control::Reply { reply }), None) if session.status == Status::Active => {
                remembered_fact = strategy.handler.reply(&mut session, reply, strategy)?;
            }
            (None, Some(proposal)) if session.status == Status::Active => {
                strategy.handler.propose(&mut session, proposal, strategy)?;
            }
            _ => return Err("This operation is not allowed at the current coaching step".into()),
        }
        session.revision = session
            .revision
            .checked_add(1)
            .ok_or("Coaching revision limit reached")?;
        session.updated_at = Utc::now().to_rfc3339();
        if let Some(content) = remembered_fact {
            let controls = self.memory_controls()?;
            if controls.enabled && controls.remember_work_context && controls.learn_from_feedback {
                let fact = self.create_memory(memory::MemoryInput {
                    scope: memory::Scope::goal(session.goal_id),
                    memory_type: memory::MemoryType::ExplicitFact,
                    content,
                })?;
                self.connection
                    .execute(
                        "UPDATE memories SET source_key=?1 WHERE id=?2",
                        params![format!("coaching-micro-action-{}", session.id), fact.id],
                    )
                    .map_err(db)?;
                self.connection
                    .execute(
                        "UPDATE coaching_sessions SET memory_id=?1 WHERE id=?2",
                        params![fact.id, session.id],
                    )
                    .map_err(db)?;
            }
        }
        self.save_coaching(&session, key, &request)?;
        tx.commit().map_err(db)?;
        Ok(session)
    }

    /// Callers must supply current backend sharing permission; this performs no network call.
    pub fn build_coaching_context(
        &self,
        id: i64,
        conversation: i64,
        share_goal_context: bool,
    ) -> Result<Value, String> {
        if !share_goal_context {
            return Ok(json!({"available":false}));
        }
        let session = self.coaching_session(id, conversation)?;
        let target = self.coaching_target(session.goal_id, session.step_id.as_deref())?;
        if target.revision != session.target_revision {
            return Err("Coaching target changed. Reload current context.".into());
        }
        let memories = self.retrieve_contextual_memory(
            &RetrievalInput {
                active_goal_id: Some(session.goal_id),
                active_step_id: session.step_id.clone(),
                current_chat_id: Some(conversation),
                ..Default::default()
            },
            &MemoryBudget {
                maximum_context_size: 4000,
                maximum_memories: 5,
                ..Default::default()
            },
            true,
        )?;
        Ok(
            json!({"available":true,"target":target,"session":session,"personal_memory":memories.context}),
        )
    }

    pub(crate) fn forget_coaching(
        &self,
        goal: Option<i64>,
        conversation: Option<i64>,
    ) -> Result<(), String> {
        let exists: bool = self.connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='coaching_sessions')", [], |r| r.get(0)).map_err(db)?;
        if !exists {
            return Ok(());
        }
        self.connection.execute("DELETE FROM coaching_sessions WHERE (?1 IS NULL OR goal_id=?1) AND (?2 IS NULL OR conversation_id=?2)", params![goal,conversation]).map_err(db)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
