use super::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MemoryControls {
    pub enabled: bool,
    pub remember_work_context: bool,
    pub remember_preferences: bool,
    pub learn_from_feedback: bool,
    pub remember_conversation_context: bool,
}
impl MemoryControls {
    pub(super) fn allows(&self, kind: MemoryType, scope: &Scope) -> bool {
        self.enabled
            && (scope.scope_type != ScopeType::Conversation || self.remember_conversation_context)
            && match kind {
                MemoryType::ExplicitPreference => self.remember_preferences,
                MemoryType::InferredPreference => {
                    self.remember_preferences && self.learn_from_feedback
                }
                MemoryType::BehavioralPattern => self.learn_from_feedback,
                MemoryType::ExplicitFact => self.remember_work_context,
                MemoryType::Episodic => self.remember_work_context,
            }
    }
    pub(super) fn allows_item(&self, item: &Memory) -> bool {
        if item.memory_type == MemoryType::Episodic
            && matches!(
                item.event_kind,
                Some(
                    EventKind::InterventionAccepted
                        | EventKind::InterventionRejected
                        | EventKind::ResearchAccepted
                        | EventKind::ResearchRejected
                )
            )
        {
            return self.enabled
                && self.learn_from_feedback
                && (item.scope.scope_type != ScopeType::Conversation
                    || self.remember_conversation_context);
        }
        self.allows(item.memory_type, &item.scope)
    }
}
#[derive(Serialize)]
pub struct MemoryOverview {
    pub controls: MemoryControls,
    pub memories: Vec<Memory>,
    pub contexts: Vec<WorkContext>,
    pub goals: Vec<serde_json::Value>,
    pub proposals: Vec<serde_json::Value>,
    pub more: bool,
}
impl Storage {
    pub fn memory_controls(&self) -> Result<MemoryControls, String> {
        self.connection.query_row("SELECT enabled,remember_work_context,remember_preferences,learn_from_feedback,remember_conversation_context FROM memory_controls WHERE id=1", [], |r| Ok(MemoryControls {
            enabled:r.get(0)?,remember_work_context:r.get(1)?,remember_preferences:r.get(2)?,learn_from_feedback:r.get(3)?,remember_conversation_context:r.get(4)?
        })).map_err(db_error)
    }
    pub fn set_memory_controls(&self, controls: &MemoryControls) -> Result<(), String> {
        atomic(&self.connection, || {
            self.connection.execute("UPDATE memory_controls SET enabled=?1,remember_work_context=?2,remember_preferences=?3,learn_from_feedback=?4,remember_conversation_context=?5 WHERE id=1",params![controls.enabled,controls.remember_work_context,controls.remember_preferences,controls.learn_from_feedback,controls.remember_conversation_context]).map_err(db_error)?;
            // A revoked permission must not leave staged writes or a previous debug snapshot behind.
            self.connection
                .execute("DELETE FROM memory_proposals", [])
                .map_err(db_error)?;
            self.connection
                .execute("DELETE FROM memory_retrieval_debug", [])
                .map_err(db_error)?;
            Ok(())
        })
    }
    pub fn clear_personal_memory(&self) -> Result<(), String> {
        atomic(&self.connection, || {
            self.forget_coaching(None, None)?;
            self.connection.execute_batch("DELETE FROM contextual_research; DELETE FROM memory_evidence; DELETE FROM memories; DELETE FROM work_contexts; DELETE FROM memory_proposals; DELETE FROM memory_retrieval_debug;").map_err(db_error)
        })
    }
    pub fn memory_overview(&self, offset: u32) -> Result<MemoryOverview, String> {
        if offset > 1_000_000 {
            return Err("Invalid memory page".into());
        }
        let mut stmt = self
            .connection
            .prepare(&format!(
                "SELECT {COLUMNS} FROM memories ORDER BY id DESC LIMIT 51 OFFSET ?1"
            ))
            .map_err(db_error)?;
        let mut memories = stmt
            .query_map([offset], memory_row)
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        let mut stmt=self.connection.prepare("SELECT id,goal_id,step_id,summary,next_action,status,last_app,last_window,waiting_for,created_at,updated_at,pinned,last_result,parked_at,resumed_at FROM work_contexts ORDER BY id DESC LIMIT 51 OFFSET ?1").map_err(db_error)?;
        let mut contexts = stmt
            .query_map([offset], context_row)
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        for context in &mut contexts {
            context.research = self.context_research(context.id)?;
        }
        let more = memories.len() > 50 || contexts.len() > 50;
        memories.truncate(50);
        contexts.truncate(50);
        let mut stmt=self.connection.prepare("SELECT g.id,g.text FROM goals g LEFT JOIN core_goals c ON c.goal_id=g.id WHERE COALESCE(c.state,'open')!='deleted' ORDER BY g.id DESC").map_err(db_error)?;
        let goals = stmt
            .query_map([], |r| {
                Ok(serde_json::json!({"id":r.get::<_,i64>(0)?,"title":r.get::<_,String>(1)?}))
            })
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        let mut stmt = self
            .connection
            .prepare("SELECT id,content,created_at FROM memory_proposals ORDER BY id DESC LIMIT 20")
            .map_err(db_error)?;
        let proposals=stmt.query_map([],|r|Ok(serde_json::json!({"id":r.get::<_,i64>(0)?,"content":r.get::<_,String>(1)?,"created_at":r.get::<_,String>(2)?}))).map_err(db_error)?.collect::<Result<Vec<_>,_>>().map_err(db_error)?;
        Ok(MemoryOverview {
            controls: self.memory_controls()?,
            memories,
            contexts,
            goals,
            proposals,
            more,
        })
    }
    pub fn forget_work_context(&self, goal_id: i64) -> Result<(), String> {
        Scope::goal(goal_id).validate(&self.connection)?;
        atomic(&self.connection, || {
            self.forget_coaching(Some(goal_id), None)?;
            self.connection
                .execute("DELETE FROM work_contexts WHERE goal_id=?1", [goal_id])
                .map_err(db_error)?;
            Ok(())
        })
    }
    /// Model output is only a proposal. Exact quoted user evidence and explicit opt-in are required.
    pub fn stage_memory_proposal(
        &self,
        proposal: &retriever::MemoryProposal,
        user_statement: &str,
        conversation: i64,
    ) -> Result<(), String> {
        let controls = self.memory_controls()?;
        if !controls.enabled
            || !controls.remember_preferences
            || !controls.remember_conversation_context
        {
            return Err("Preference proposals are disabled".into());
        }
        Scope {
            scope_type: ScopeType::Conversation,
            scope_id: Some(conversation),
        }
        .validate(&self.connection)?;
        let content = safe_text(&proposal.content, 500)?;
        let statement = user_statement.trim().to_lowercase();
        let explicit = [
            "remember",
            "i prefer",
            "my preference",
            "запомни",
            "я предпочитаю",
        ]
        .iter()
        .any(|marker| statement.starts_with(marker));
        if proposal.operation != "store_memory"
            || proposal.memory_type != "preference"
            || proposal.source != "explicit_user_statement"
            || !proposal.confidence.is_finite()
            || !(0.85..=1.).contains(&proposal.confidence)
            || !explicit
            || !user_statement.contains(&content)
        {
            return Err("A memory suggestion needs an explicit, verbatim user preference".into());
        }
        atomic(&self.connection, || {
            self.connection.execute("INSERT OR IGNORE INTO memory_proposals(content,conversation_id,created_at) VALUES(?1,?2,?3)",params![content,conversation,Utc::now().to_rfc3339()]).map_err(db_error)?;
            self.connection.execute("DELETE FROM memory_proposals WHERE id NOT IN (SELECT id FROM memory_proposals ORDER BY id DESC LIMIT 20)",[]).map_err(db_error)?;
            Ok(())
        })
    }
    pub fn resolve_memory_proposal(&self, id: i64, accept: bool) -> Result<(), String> {
        atomic(&self.connection, || {
            let content: String = self
                .connection
                .query_row(
                    "SELECT content FROM memory_proposals WHERE id=?1",
                    [id],
                    |r| r.get(0),
                )
                .map_err(|_| "Memory suggestion no longer exists")?;
            if accept {
                if !self.memory_controls()?.remember_conversation_context {
                    return Err("Conversation memory is disabled".into());
                }
                self.create_memory(MemoryInput {
                    memory_type: MemoryType::ExplicitPreference,
                    scope: Scope::global(),
                    content,
                })?;
            }
            self.connection
                .execute("DELETE FROM memory_proposals WHERE id=?1", [id])
                .map_err(db_error)?;
            Ok(())
        })
    }
}
#[tauri::command(async)]
pub fn get_memory_overview(
    offset: u32,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<MemoryOverview, String> {
    main_window(&window)?;
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .memory_overview(offset)
}
#[tauri::command(async)]
pub fn set_memory_controls(
    controls: MemoryControls,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<(), String> {
    main_window(&window)?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.set_memory_controls(&controls)?;
    inner.privacy_revision += 1;
    Ok(())
}
#[tauri::command(async)]
pub fn clear_personal_memory(
    confirmed: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<(), String> {
    main_window(&window)?;
    if !confirmed {
        return Err("Confirm permanent deletion of personal memory".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.clear_personal_memory()?;
    inner.privacy_revision += 1;
    Ok(())
}
#[tauri::command(async)]
pub fn forget_work_context(
    goal_id: i64,
    confirmed: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<(), String> {
    main_window(&window)?;
    if !confirmed {
        return Err("Confirm deletion of this checkpoint".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.forget_work_context(goal_id)?;
    inner.privacy_revision += 1;
    Ok(())
}
#[tauri::command(async)]
pub fn resolve_memory_proposal(
    id: i64,
    accept: bool,
    confirmed: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<(), String> {
    main_window(&window)?;
    if !confirmed {
        return Err("Review the memory suggestion first".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.resolve_memory_proposal(id, accept)?;
    inner.privacy_revision += 1;
    Ok(())
}

#[tauri::command(async)]
pub fn pin_work_context(
    goal_id: i64,
    pinned: bool,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<(), String> {
    main_window(&window)?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    Scope::goal(goal_id).validate(&inner.storage.connection)?;
    if inner
        .storage
        .connection
        .execute(
            "UPDATE work_contexts SET pinned=?1 WHERE goal_id=?2",
            params![pinned, goal_id],
        )
        .map_err(db_error)?
        == 0
    {
        return Err("Checkpoint no longer exists".into());
    }
    inner.privacy_revision += 1;
    Ok(())
}
