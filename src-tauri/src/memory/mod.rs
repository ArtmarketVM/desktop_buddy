//! Local personal memory with deterministic retrieval and explicit user controls.
pub mod controls;
pub mod retriever;
use crate::{
    commands::{AppState, Inner},
    storage::Storage,
};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{State, WebviewWindow};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryType {
    ExplicitFact,
    ExplicitPreference,
    InferredPreference,
    BehavioralPattern,
    Episodic,
}
impl MemoryType {
    fn name(self) -> &'static str {
        match self {
            Self::ExplicitFact => "explicit_fact",
            Self::ExplicitPreference => "explicit_preference",
            Self::InferredPreference => "inferred_preference",
            Self::BehavioralPattern => "behavioral_pattern",
            Self::Episodic => "episodic",
        }
    }
    fn inferred(self) -> bool {
        matches!(self, Self::InferredPreference | Self::BehavioralPattern)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScopeType {
    Global,
    Goal,
    Conversation,
}
impl ScopeType {
    fn name(self) -> &'static str {
        match self {
            Self::Global => "global",
            Self::Goal => "goal",
            Self::Conversation => "conversation",
        }
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Scope {
    pub scope_type: ScopeType,
    pub scope_id: Option<i64>,
}
impl Scope {
    pub fn global() -> Self {
        Self {
            scope_type: ScopeType::Global,
            scope_id: None,
        }
    }
    pub fn goal(id: i64) -> Self {
        Self {
            scope_type: ScopeType::Goal,
            scope_id: Some(id),
        }
    }
    fn validate(&self, db: &Connection) -> Result<(), String> {
        match (self.scope_type, self.scope_id) {
            (ScopeType::Global, None) => Ok(()),
            (ScopeType::Goal, Some(id)) | (ScopeType::Conversation, Some(id)) if id > 0 => {
                let sql = if self.scope_type == ScopeType::Goal {
                    "SELECT EXISTS(SELECT 1 FROM goals g LEFT JOIN core_goals c ON c.goal_id=g.id WHERE g.id=?1 AND COALESCE(c.state,'open')!='deleted')"
                } else {
                    "SELECT EXISTS(SELECT 1 FROM buddy_conversations WHERE id=?1)"
                };
                if db
                    .query_row(sql, [id], |r| r.get::<_, bool>(0))
                    .map_err(db_error)?
                {
                    Ok(())
                } else {
                    Err("The memory scope no longer exists".into())
                }
            }
            _ => Err("Choose a valid memory scope".into()),
        }
    }
    fn goal_id(&self) -> Option<i64> {
        (self.scope_type == ScopeType::Goal)
            .then_some(self.scope_id)
            .flatten()
    }
    fn conversation_id(&self) -> Option<i64> {
        (self.scope_type == ScopeType::Conversation)
            .then_some(self.scope_id)
            .flatten()
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    GoalStarted,
    GoalParked,
    GoalResumed,
    StepCompleted,
    StepReopened,
    GoalCompleted,
    InterventionAccepted,
    InterventionRejected,
    ResearchAccepted,
    ResearchRejected,
    WaitingState,
    MeaningfulCorrection,
}
impl EventKind {
    fn name(self) -> String {
        serde_json::to_value(self)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string()
    }
    fn content(self) -> &'static str {
        match self {
            Self::GoalStarted => "Goal selected for work",
            Self::GoalParked => "Goal set aside",
            Self::GoalResumed => "Goal resumed",
            Self::StepCompleted => "Step completed",
            Self::StepReopened => "Step reopened",
            Self::GoalCompleted => "Goal completed",
            Self::InterventionAccepted => "Intervention accepted",
            Self::InterventionRejected => "Intervention rejected",
            Self::ResearchAccepted => "Research recommendation accepted",
            Self::ResearchRejected => "Research recommendation rejected",
            Self::WaitingState => "Waiting for a dependency",
            Self::MeaningfulCorrection => "User corrected remembered information",
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MemoryInput {
    pub memory_type: MemoryType,
    pub scope: Scope,
    pub content: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Memory {
    pub id: i64,
    pub memory_type: MemoryType,
    pub scope: Scope,
    pub content: String,
    pub event_kind: Option<EventKind>,
    pub confidence: f64,
    pub source: String,
    pub evidence_count: u32,
    pub created_at: String,
    pub updated_at: String,
    pub last_used_at: Option<String>,
    pub pinned: bool,
    pub archived: bool,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MemoryUpdate {
    pub content: String,
    pub expected_updated_at: String,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct MemoryQuery {
    pub scope: Option<Scope>,
    pub memory_type: Option<MemoryType>,
    pub limit: u32,
    pub include_archived: bool,
}
impl Default for MemoryQuery {
    fn default() -> Self {
        Self {
            scope: None,
            memory_type: None,
            limit: 50,
            include_archived: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContextStatus {
    Active,
    Paused,
    Waiting,
    Completed,
}
impl ContextStatus {
    pub(crate) fn name(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Paused => "paused",
            Self::Waiting => "waiting",
            Self::Completed => "completed",
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkContextInput {
    pub goal_id: i64,
    pub step_id: Option<String>,
    pub summary: String,
    pub next_action: Option<String>,
    pub status: ContextStatus,
    pub last_app: Option<String>,
    pub last_window: Option<String>,
    pub waiting_for: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkContext {
    #[serde(default)]
    pub research: Vec<crate::research::Attachment>,
    pub id: i64,
    pub pinned: bool,
    pub last_result: Option<String>,
    pub parked_at: Option<String>,
    pub resumed_at: Option<String>,
    #[serde(flatten)]
    pub context: WorkContextInput,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Serialize)]
pub struct WorkingMemory {
    pub active_goal_id: Option<i64>,
    pub active_step_id: Option<String>,
    pub current_app: Option<String>,
    pub current_context: Option<String>,
    pub state: crate::tracking::ActivityState,
    pub session_started_at: String,
    pub last_activity_at: Option<String>,
    pub sampled_at: String,
}

fn db_error(_: rusqlite::Error) -> String {
    "Personal memory storage is unavailable".into()
}
pub(crate) fn atomic<T>(
    db: &Connection,
    operation: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    db.execute_batch("SAVEPOINT buddy_personal_memory")
        .map_err(db_error)?;
    let result = operation();
    if result.is_err() {
        db.execute_batch("ROLLBACK TO buddy_personal_memory; RELEASE buddy_personal_memory")
            .map_err(db_error)?;
    } else {
        db.execute_batch("RELEASE buddy_personal_memory")
            .map_err(db_error)?;
    }
    result
}
fn parse<T: serde::de::DeserializeOwned>(value: String) -> rusqlite::Result<T> {
    serde_json::from_value(serde_json::Value::String(value)).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })
}
const COLUMNS:&str="id,memory_type,scope_type,scope_id,content,event_kind,confidence,source,evidence_count,created_at,updated_at,last_used_at,pinned,archived";
fn memory_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Memory> {
    Ok(Memory {
        id: r.get(0)?,
        memory_type: parse(r.get(1)?)?,
        scope: Scope {
            scope_type: parse(r.get(2)?)?,
            scope_id: r.get(3)?,
        },
        content: r.get(4)?,
        event_kind: r.get::<_, Option<String>>(5)?.map(parse).transpose()?,
        confidence: r.get(6)?,
        source: r.get(7)?,
        evidence_count: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
        last_used_at: r.get(11)?,
        pinned: r.get(12)?,
        archived: r.get(13)?,
    })
}
fn context_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<WorkContext> {
    Ok(WorkContext {
        research: vec![],
        id: r.get(0)?,
        pinned: r.get(11)?,
        last_result: r.get(12)?,
        parked_at: r.get(13)?,
        resumed_at: r.get(14)?,
        context: WorkContextInput {
            goal_id: r.get(1)?,
            step_id: r.get(2)?,
            summary: r.get(3)?,
            next_action: r.get(4)?,
            status: parse(r.get(5)?)?,
            last_app: r.get(6)?,
            last_window: r.get(7)?,
            waiting_for: r.get(8)?,
        },
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
    })
}
/// A conservative guard, not a general-purpose secret detector. Automatic sources never pass raw text.
pub fn safe_text(value: &str, max: usize) -> Result<String, String> {
    let value = value.trim();
    let lower = value.to_lowercase();
    if value.is_empty() || value.chars().count() > max || value.chars().any(char::is_control) {
        return Err(format!("Use a single line of 1–{max} characters"));
    }
    if [
        "password",
        "passwd",
        "api key",
        "api_key",
        "private key",
        "authorization",
        "bearer ",
        "access_token",
        "access token",
        "secret=",
        "secret:",
        "sk-",
        "tvly-",
        "ghp_",
        "github_pat_",
        "-----begin",
        "пароль",
        "пароли",
        "токен",
        "секрет",
        "ключ api",
    ]
    .iter()
    .any(|s| lower.contains(s))
        || value.split_whitespace().any(|word| {
            word.len() >= 32
                && word
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_=+.".contains(&b))
        })
    {
        return Err("Do not store credentials, secrets, or password-like text in memory".into());
    }
    Ok(value.into())
}
fn optional_text(value: &Option<String>, max: usize) -> Result<Option<String>, String> {
    value.as_deref().map(|s| safe_text(s, max)).transpose()
}

impl Storage {
    pub fn initialize_personal_memory(&self) -> Result<(), String> {
        let tx = self.connection.unchecked_transaction().map_err(db_error)?;
        tx.execute_batch("CREATE TABLE IF NOT EXISTS personal_memory_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);").map_err(db_error)?;
        let version: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(version),0) FROM personal_memory_migrations",
                [],
                |r| r.get(0),
            )
            .map_err(db_error)?;
        if version > 3 {
            return Err("This database needs a newer personal memory implementation".into());
        }
        if version == 0 {
            tx.execute_batch(include_str!("migrations/001_personal_memory.sql"))
                .map_err(db_error)?;
            tx.execute(
                "INSERT INTO personal_memory_migrations(version,applied_at) VALUES(1,?1)",
                [Utc::now().to_rfc3339()],
            )
            .map_err(db_error)?;
        }
        if version < 2 {
            tx.execute_batch(include_str!("migrations/002_memory_controls.sql"))
                .map_err(db_error)?;
            tx.execute(
                "INSERT INTO personal_memory_migrations(version,applied_at) VALUES(2,?1)",
                [Utc::now().to_rfc3339()],
            )
            .map_err(db_error)?;
        }
        if version < 3 {
            tx.execute_batch(include_str!("migrations/003_park_resume.sql"))
                .map_err(db_error)?;
            for table in ["work_contexts", "memory_controls", "memories"] {
                for event in ["INSERT", "UPDATE", "DELETE"] {
                    let filter = if table == "memories" && event == "UPDATE" {
                        " WHEN NEW.updated_at!=OLD.updated_at OR NEW.pinned!=OLD.pinned OR NEW.archived!=OLD.archived"
                    } else {
                        ""
                    };
                    tx.execute_batch(&format!("CREATE TRIGGER buddy_version_{table}_{event} AFTER {event} ON {table}{filter} BEGIN UPDATE buddy_action_version SET revision=revision+1 WHERE id=1; END;")).map_err(db_error)?;
                }
            }
            tx.execute(
                "INSERT INTO personal_memory_migrations(version,applied_at) VALUES(3,?1)",
                [Utc::now().to_rfc3339()],
            )
            .map_err(db_error)?;
        }
        // Research is an additive checkpoint extension. Create it in the same migration
        // transaction, including callers upgrading a legacy memory database in place.
        tx.execute_batch(include_str!("../research/schema.sql"))
            .map_err(db_error)?;
        tx.commit().map_err(db_error)
    }
    pub fn create_memory(&self, input: MemoryInput) -> Result<Memory, String> {
        if !matches!(
            input.memory_type,
            MemoryType::ExplicitFact | MemoryType::ExplicitPreference
        ) {
            return Err("Only explicit user facts and preferences can be created directly".into());
        }
        if !self
            .memory_controls()?
            .allows(input.memory_type, &input.scope)
        {
            return Err("Enable the matching Memory control before saving new memories".into());
        }
        let content = safe_text(&input.content, 500)?;
        input.scope.validate(&self.connection)?;
        let now = Utc::now().to_rfc3339();
        self.connection.execute("INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,conversation_id,content,confidence,source,evidence_count,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,1,'user',1,?7,?7)",params![input.memory_type.name(),input.scope.scope_type.name(),input.scope.scope_id,input.scope.goal_id(),input.scope.conversation_id(),content,now]).map_err(db_error)?;
        self.memory(self.connection.last_insert_rowid(), false)
    }
    pub fn memory(&self, id: i64, mark_used: bool) -> Result<Memory, String> {
        if id <= 0 {
            return Err("Choose a valid memory ID".into());
        }
        let item = self
            .connection
            .query_row(
                &format!("SELECT {COLUMNS} FROM memories WHERE id=?1"),
                [id],
                memory_row,
            )
            .optional()
            .map_err(db_error)?
            .ok_or("Memory no longer exists")?;
        if mark_used && !item.archived {
            let now = Utc::now().to_rfc3339();
            self.connection
                .execute(
                    "UPDATE memories SET last_used_at=?1 WHERE id=?2",
                    params![now, id],
                )
                .map_err(db_error)?;
            return Ok(Memory {
                last_used_at: Some(now),
                ..item
            });
        }
        Ok(item)
    }
    pub fn list_memories(&self, query: MemoryQuery) -> Result<Vec<Memory>, String> {
        if !(1..=100).contains(&query.limit) {
            return Err("List between 1 and 100 memories".into());
        }
        if let Some(scope) = &query.scope {
            scope.validate(&self.connection)?;
        }
        let mut q=self.connection.prepare(&format!("SELECT {COLUMNS} FROM memories WHERE (?1 IS NULL OR (scope_type=?1 AND scope_id IS ?2)) AND (?3 IS NULL OR memory_type=?3) AND (?4 OR archived=0) ORDER BY updated_at DESC,id DESC LIMIT ?5")).map_err(db_error)?;
        let rows = q
            .query_map(
                params![
                    query.scope.as_ref().map(|s| s.scope_type.name()),
                    query.scope.as_ref().and_then(|s| s.scope_id),
                    query.memory_type.map(MemoryType::name),
                    query.include_archived,
                    query.limit
                ],
                memory_row,
            )
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        Ok(rows)
    }
    pub fn update_memory(&mut self, id: i64, input: MemoryUpdate) -> Result<Memory, String> {
        let content = safe_text(&input.content, 500)?;
        let old = self.memory(id, false)?;
        if old.updated_at != input.expected_updated_at {
            return Err("This memory changed. Reload before editing.".into());
        }
        let kind = match old.memory_type {
            MemoryType::InferredPreference => MemoryType::ExplicitPreference,
            MemoryType::BehavioralPattern => MemoryType::ExplicitFact,
            other => other,
        };
        atomic(&self.connection, || {
            self.connection.execute("DELETE FROM memory_evidence WHERE memory_type=?1 AND scope_type=?2 AND scope_key=?3 AND content=?4",params![old.memory_type.name(),old.scope.scope_type.name(),old.scope.scope_id.unwrap_or(0),old.content]).map_err(db_error)?;
            let now = Utc::now().to_rfc3339();
            self.connection.execute("UPDATE memories SET content=?1,memory_type=?2,source='user',source_key=NULL,confidence=1,evidence_count=1,updated_at=?3 WHERE id=?4",params![content,kind.name(),now,id]).map_err(db_error)?;
            self.record_memory_event(old.scope, EventKind::MeaningfulCorrection, "user", None)?;
            self.memory(id, false)
        })
    }
    pub fn archive_memory(&self, id: i64, archived: bool) -> Result<Memory, String> {
        let item = self.memory(id, false)?;
        let (count, confidence) = if !archived && item.memory_type.inferred() {
            let (valid, count, confidence) = self.inference_support(&item)?;
            if !valid {
                return Err("This inference no longer has sufficient evidence".into());
            }
            (count, confidence)
        } else {
            (item.evidence_count, item.confidence)
        };
        self.connection
            .execute(
                "UPDATE memories SET archived=?1,updated_at=?2,evidence_count=?4,confidence=?5 WHERE id=?3",
                params![archived, Utc::now().to_rfc3339(), id,count,confidence],
            )
            .map_err(db_error)?;
        self.memory(id, false)
    }
    pub fn pin_memory(&self, id: i64, pinned: bool) -> Result<Memory, String> {
        self.memory(id, false)?;
        self.connection
            .execute(
                "UPDATE memories SET pinned=?1,updated_at=?2 WHERE id=?3",
                params![pinned, Utc::now().to_rfc3339(), id],
            )
            .map_err(db_error)?;
        self.memory(id, false)
    }
    pub fn forget_memory(&mut self, id: i64) -> Result<(), String> {
        let item = self.memory(id, false)?;
        let tx = self.connection.savepoint().map_err(db_error)?;
        tx.execute("DELETE FROM memory_evidence WHERE memory_type=?1 AND scope_type=?2 AND scope_key=?3 AND content=?4",params![item.memory_type.name(),item.scope.scope_type.name(),item.scope.scope_id.unwrap_or(0),item.content]).map_err(db_error)?;
        tx.execute("DELETE FROM memories WHERE id=?1", [id])
            .map_err(db_error)?;
        tx.commit().map_err(db_error)
    }
    pub fn clear_memory_scope(&mut self, scope: &Scope) -> Result<(), String> {
        scope.validate(&self.connection)?;
        let tx = self.connection.savepoint().map_err(db_error)?;
        tx.execute(
            "DELETE FROM memory_evidence WHERE scope_type=?1 AND scope_key=?2",
            params![scope.scope_type.name(), scope.scope_id.unwrap_or(0)],
        )
        .map_err(db_error)?;
        tx.execute(
            "DELETE FROM memories WHERE scope_type=?1 AND scope_id IS ?2",
            params![scope.scope_type.name(), scope.scope_id],
        )
        .map_err(db_error)?;
        if let Some(id) = scope.goal_id() {
            tx.execute("DELETE FROM contextual_research WHERE goal_id=?1", [id])
                .map_err(db_error)?;
            tx.execute("DELETE FROM work_contexts WHERE goal_id=?1", [id])
                .map_err(db_error)?;
        }
        tx.commit().map_err(db_error)
    }
    pub(crate) fn record_memory_event(
        &self,
        scope: Scope,
        kind: EventKind,
        source: &str,
        key: Option<&str>,
    ) -> Result<i64, String> {
        scope.validate(&self.connection)?;
        let controls = self.memory_controls()?;
        let feedback = matches!(
            kind,
            EventKind::InterventionAccepted
                | EventKind::InterventionRejected
                | EventKind::ResearchAccepted
                | EventKind::ResearchRejected
        );
        if !controls.enabled
            || (feedback && !controls.learn_from_feedback)
            || (!feedback && !controls.remember_work_context)
            || (scope.scope_type == ScopeType::Conversation
                && !controls.remember_conversation_context)
        {
            return Ok(0);
        }
        if ![
            "user",
            "confirmed_event",
            "intervention_feedback",
            "research_feedback",
        ]
        .contains(&source)
        {
            return Err("Unsupported episode source".into());
        }
        if key.is_some_and(|k| {
            k.is_empty()
                || k.len() > 200
                || !k
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-:_".contains(&b))
        }) {
            return Err("Invalid event identity".into());
        }
        let now = Utc::now().to_rfc3339();
        self.connection.execute("INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,conversation_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at) VALUES('episodic',?1,?2,?3,?4,?5,?6,1,?7,1,?8,?9,?9) ON CONFLICT(source_key) DO NOTHING",params![scope.scope_type.name(),scope.scope_id,scope.goal_id(),scope.conversation_id(),kind.content(),kind.name(),source,key,now]).map_err(db_error)?;
        if let Some(key) = key {
            let id = self
                .connection
                .query_row("SELECT id FROM memories WHERE source_key=?1", [key], |r| {
                    r.get(0)
                })
                .map_err(db_error)?;
            let existing = self.memory(id, false)?;
            if existing.scope != scope
                || existing.event_kind != Some(kind)
                || existing.source != source
            {
                return Err("This event identity belongs to a different source or scope".into());
            }
            Ok(id)
        } else {
            Ok(self.connection.last_insert_rowid())
        }
    }
    /// Inference can only cite distinct, same-scope confirmed episodes, never raw observations.
    pub(crate) fn observe_inference(
        &mut self,
        input: MemoryInput,
        episode_id: i64,
        confidence: f64,
    ) -> Result<Option<Memory>, String> {
        if !self
            .memory_controls()?
            .allows(input.memory_type, &input.scope)
        {
            return Err("Learning from feedback is disabled".into());
        }
        if !input.memory_type.inferred()
            || !confidence.is_finite()
            || !(0.85..=1.0).contains(&confidence)
        {
            return Err(
                "Inferred memory requires strong evidence and confidence of at least 0.85".into(),
            );
        }
        let content = safe_text(&input.content, 500)?;
        input.scope.validate(&self.connection)?;
        let episode = self.memory(episode_id, false)?;
        if episode.memory_type != MemoryType::Episodic
            || episode.archived
            || episode.scope != input.scope
            || ![
                "confirmed_event",
                "intervention_feedback",
                "research_feedback",
            ]
            .contains(&episode.source.as_str())
        {
            return Err("Choose a confirmed, same-scope episode as evidence".into());
        }
        let tx = self.connection.savepoint().map_err(db_error)?;
        tx.execute("INSERT OR IGNORE INTO memory_evidence(memory_type,scope_type,scope_key,content,episode_id,confidence,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![input.memory_type.name(),input.scope.scope_type.name(),input.scope.scope_id.unwrap_or(0),content,episode_id,confidence,Utc::now().to_rfc3339()]).map_err(db_error)?;
        tx.commit().map_err(db_error)?;
        let proposal = Memory {
            id: 0,
            memory_type: input.memory_type,
            scope: input.scope,
            content,
            event_kind: None,
            confidence,
            source: "verified_events".into(),
            evidence_count: 1,
            created_at: String::new(),
            updated_at: String::new(),
            last_used_at: None,
            pinned: false,
            archived: false,
        };
        let (ready, count, confidence) = self.inference_support(&proposal)?;
        if !ready {
            return Ok(None);
        }
        let existing:Option<i64>=self.connection.query_row("SELECT id FROM memories WHERE memory_type=?1 AND scope_type=?2 AND scope_id IS ?3 AND content=?4 ORDER BY id LIMIT 1",params![proposal.memory_type.name(),proposal.scope.scope_type.name(),proposal.scope.scope_id,proposal.content],|r|r.get(0)).optional().map_err(db_error)?;
        let now = Utc::now().to_rfc3339();
        if let Some(id) = existing {
            self.connection
                .execute(
                    "UPDATE memories SET confidence=?1,evidence_count=?2,updated_at=?3 WHERE id=?4",
                    params![confidence, count, now, id],
                )
                .map_err(db_error)?;
            let item = self.memory(id, false)?;
            return Ok((!item.archived).then_some(item));
        }
        self.connection.execute("INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,conversation_id,content,confidence,source,evidence_count,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,'verified_events',?8,?9,?9)",params![proposal.memory_type.name(),proposal.scope.scope_type.name(),proposal.scope.scope_id,proposal.scope.goal_id(),proposal.scope.conversation_id(),proposal.content,confidence,count,now]).map_err(db_error)?;
        self.memory(self.connection.last_insert_rowid(), false)
            .map(Some)
    }
    fn inference_support(&self, item: &Memory) -> Result<(bool, u32, f64), String> {
        let (count,days,confidence):(u32,u32,f64)=self.connection.query_row("SELECT COUNT(*),COUNT(DISTINCT date(m.created_at)),COALESCE(MIN(e.confidence),0) FROM memory_evidence e JOIN memories m ON m.id=e.episode_id WHERE e.memory_type=?1 AND e.scope_type=?2 AND e.scope_key=?3 AND e.content=?4 AND m.memory_type='episodic' AND m.archived=0 AND m.source IN ('confirmed_event','intervention_feedback','research_feedback')",params![item.memory_type.name(),item.scope.scope_type.name(),item.scope.scope_id.unwrap_or(0),item.content],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(db_error)?;
        Ok((
            count >= 3 && days >= 2 && confidence >= 0.85,
            count,
            confidence,
        ))
    }
    pub fn work_context(&self, goal_id: i64) -> Result<Option<WorkContext>, String> {
        Scope::goal(goal_id).validate(&self.connection)?;
        let mut context: Option<WorkContext> = self.connection.query_row("SELECT id,goal_id,step_id,summary,next_action,status,last_app,last_window,waiting_for,created_at,updated_at,pinned,last_result,parked_at,resumed_at FROM work_contexts WHERE goal_id=?1",[goal_id],context_row).optional().map_err(db_error)?;
        if let Some(c) = &mut context {
            c.research = self.context_research(c.id)?;
        }
        Ok(context)
    }
    pub fn save_work_context(
        &mut self,
        input: WorkContextInput,
        expected_updated_at: Option<String>,
    ) -> Result<WorkContext, String> {
        self.save_work_context_at(input, expected_updated_at, Utc::now())
    }
    // Keep historical fixtures independent of the runner's wall clock. IPC never supplies this time.
    pub(crate) fn save_work_context_at(
        &mut self,
        mut input: WorkContextInput,
        expected_updated_at: Option<String>,
        at: chrono::DateTime<Utc>,
    ) -> Result<WorkContext, String> {
        if !self.memory_controls()?.remember_work_context || !self.memory_controls()?.enabled {
            return Err("Remember work context is disabled".into());
        }
        let scope = Scope::goal(input.goal_id);
        scope.validate(&self.connection)?;
        input.summary = safe_text(&input.summary, 500)?;
        input.next_action = optional_text(&input.next_action, 500)?;
        input.last_app = optional_text(&input.last_app, 120)?;
        input.last_window = optional_text(&input.last_window, 160)?;
        input.waiting_for = optional_text(&input.waiting_for, 500)?;
        if input.status == ContextStatus::Waiting && input.waiting_for.is_none() {
            return Err("Describe what this goal is waiting for".into());
        }
        let plan = self.goal_plan(input.goal_id)?;
        if input
            .step_id
            .as_ref()
            .is_some_and(|id| !plan.steps.iter().any(|s| &s.id == id && !s.done))
        {
            return Err("Choose an unfinished step belonging to this goal".into());
        }
        let old = self.work_context(input.goal_id)?;
        if old.as_ref().map(|c| &c.updated_at) != expected_updated_at.as_ref() {
            return Err("This checkpoint changed. Reload before saving.".into());
        }
        let state: String = self
            .connection
            .query_row(
                "SELECT c.state FROM core_goals c WHERE c.goal_id=?1",
                [input.goal_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(db_error)?
            .unwrap_or_else(|| "open".into());
        if (state == "completed") != (input.status == ContextStatus::Completed)
            || (state == "deferred" && input.status == ContextStatus::Active)
        {
            return Err("The checkpoint status must agree with the current goal state".into());
        }
        atomic(&self.connection, || {
            let now = at.to_rfc3339();
            self.connection.execute("INSERT INTO work_contexts(goal_id,step_id,summary,next_action,status,last_app,last_window,waiting_for,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9) ON CONFLICT(goal_id) DO UPDATE SET step_id=excluded.step_id,summary=excluded.summary,next_action=excluded.next_action,status=excluded.status,last_app=excluded.last_app,last_window=excluded.last_window,waiting_for=excluded.waiting_for,updated_at=excluded.updated_at",params![input.goal_id,input.step_id,input.summary,input.next_action,input.status.name(),input.last_app,input.last_window,input.waiting_for,now]).map_err(db_error)?;
            if input.status == ContextStatus::Waiting
                && old.as_ref().is_none_or(|c| {
                    c.context.status != ContextStatus::Waiting
                        || c.context.waiting_for != input.waiting_for
                })
            {
                self.record_memory_event(scope, EventKind::WaitingState, "confirmed_event", None)?;
            }
            self.work_context(input.goal_id)?
                .ok_or("Checkpoint unavailable".into())
        })
    }
    /// Whitelisted scalar settings only. Never serialize whole settings, provider keys, or profiles.
    pub(crate) fn remember_setting<T: Serialize>(
        &self,
        name: &str,
        value: &T,
        previous: Option<&str>,
    ) -> Result<(), String> {
        if ![
            "tracking_requested",
            "companion_preferences",
            "ai_assistance_preferences",
        ]
        .contains(&name)
        {
            return Ok(());
        }
        let exists: bool = self
            .connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='memory_controls')",
                [],
                |r| r.get(0),
            )
            .map_err(db_error)?;
        if !exists {
            return Ok(());
        }
        let controls = self.memory_controls()?;
        if !controls.enabled || !controls.remember_preferences {
            return Ok(());
        }
        let value = serde_json::to_value(value).map_err(|_| "Invalid preference value")?;
        let baseline = previous
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .unwrap_or_else(|| match name {
                "companion_preferences" => {
                    serde_json::to_value(crate::companion::engine::Preferences::default()).unwrap()
                }
                "ai_assistance_preferences" => {
                    serde_json::to_value(crate::goal_analysis::AiPreferences::default()).unwrap()
                }
                _ => serde_json::Value::Null,
            });
        let fields: Vec<(&str, serde_json::Value)> = if name == "tracking_requested" {
            vec![("enabled", value)]
        } else {
            value
                .as_object()
                .map(|o| {
                    o.iter()
                        .filter(|(_, v)| v.is_boolean())
                        .map(|(k, v)| (k.as_str(), v.clone()))
                        .collect()
                })
                .unwrap_or_default()
        };
        for (field, value) in fields {
            if name != "tracking_requested" && baseline.get(field) == Some(&value) {
                continue;
            }
            if !value.is_boolean()
                || ![
                    "enabled",
                    "share_goal_context",
                    "web_research",
                    "automatic_goal_matching",
                    "paused",
                    "screen_task_detection",
                    "daily_checkins",
                    "hide_fullscreen",
                ]
                .contains(&field)
            {
                continue;
            }
            let key = format!("setting:{name}:{field}");
            let content = format!("{name}.{field} = {value}");
            let now = Utc::now().to_rfc3339();
            self.connection.execute("INSERT INTO memories(memory_type,scope_type,content,confidence,source,evidence_count,source_key,created_at,updated_at) VALUES('explicit_preference','global',?1,1,'setting',1,?2,?3,?3) ON CONFLICT(source_key) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at WHERE memories.content!=excluded.content",params![content,key,now]).map_err(db_error)?;
        }
        Ok(())
    }
}

pub fn working_memory(inner: &Inner) -> Result<WorkingMemory, String> {
    let goal = inner.storage.goal()?;
    let step = goal
        .as_ref()
        .map(|g| inner.storage.goal_plan(g.id))
        .transpose()?
        .and_then(|p| p.current_step);
    let foreground = inner
        .status
        .tracking
        .then(|| inner.buddy.foreground.as_ref())
        .flatten();
    Ok(WorkingMemory {
        active_goal_id: goal.map(|g| g.id),
        active_step_id: step,
        current_app: foreground.and_then(|a| safe_text(&a.process_name, 120).ok()),
        current_context: foreground.map(|_| "Foreground activity is available".into()),
        state: inner.activity_state.state,
        session_started_at: inner.memory_session_started_at.clone(),
        last_activity_at: inner.status.last_collected_at.clone(),
        sampled_at: Utc::now().to_rfc3339(),
    })
}

fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Manage personal memory in the workspace".into())
    }
}
#[tauri::command(async)]
pub fn create_memory(
    input: MemoryInput,
    confirmed: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<Memory, String> {
    main_window(&window)?;
    if !confirmed {
        return Err("Confirm the fact or preference to remember".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let item = inner.storage.create_memory(input)?;
    inner.privacy_revision += 1;
    Ok(item)
}
#[tauri::command(async)]
pub fn retrieve_memory(
    id: i64,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<Memory, String> {
    main_window(&window)?;
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .memory(id, true)
}
#[tauri::command(async)]
pub fn list_memories(
    query: MemoryQuery,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<Vec<Memory>, String> {
    main_window(&window)?;
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .list_memories(query)
}
#[tauri::command(async)]
pub fn update_memory(
    id: i64,
    input: MemoryUpdate,
    confirmed: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<Memory, String> {
    main_window(&window)?;
    if !confirmed {
        return Err("Confirm the corrected memory".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let item = inner.storage.update_memory(id, input)?;
    inner.privacy_revision += 1;
    Ok(item)
}
#[tauri::command(async)]
pub fn forget_memory(
    id: i64,
    confirmed: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<(), String> {
    main_window(&window)?;
    if !confirmed {
        return Err("Confirm permanent deletion of this memory".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.forget_memory(id)?;
    inner.privacy_revision += 1;
    Ok(())
}
#[tauri::command(async)]
pub fn archive_memory(
    id: i64,
    archived: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<Memory, String> {
    main_window(&window)?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let item = inner.storage.archive_memory(id, archived)?;
    inner.privacy_revision += 1;
    Ok(item)
}
#[tauri::command(async)]
pub fn pin_memory(
    id: i64,
    pinned: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<Memory, String> {
    main_window(&window)?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let item = inner.storage.pin_memory(id, pinned)?;
    inner.privacy_revision += 1;
    Ok(item)
}
#[tauri::command(async)]
pub fn clear_memory_scope(
    scope: Scope,
    confirmed: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<(), String> {
    main_window(&window)?;
    if !confirmed {
        return Err("Confirm permanent deletion of this memory scope".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.clear_memory_scope(&scope)?;
    inner.privacy_revision += 1;
    Ok(())
}
#[tauri::command(async)]
pub fn retrieve_work_context(
    goal_id: i64,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<Option<WorkContext>, String> {
    main_window(&window)?;
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .work_context(goal_id)
}
#[tauri::command(async)]
pub fn save_work_context(
    input: WorkContextInput,
    expected_updated_at: Option<String>,
    confirmed: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<WorkContext, String> {
    main_window(&window)?;
    if !confirmed {
        return Err("Review and confirm this checkpoint before saving".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let item = inner
        .storage
        .save_work_context(input, expected_updated_at)?;
    inner.privacy_revision += 1;
    Ok(item)
}
#[tauri::command(async)]
pub fn get_working_memory(
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<WorkingMemory, String> {
    main_window(&window)?;
    let inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    working_memory(&inner)
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod retrieval_tests;
