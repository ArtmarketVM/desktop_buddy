use super::*;
use serde_json::{json, Value};

#[derive(Debug, Default)]
pub struct RetrievalInput {
    pub user_request: String,
    pub exact_scope: Option<Scope>,
    pub active_goal_id: Option<i64>,
    pub active_step_id: Option<String>,
    pub current_chat_id: Option<i64>,
    /// A process name, never window or Accessibility text. Used only for local ranking.
    pub current_app: Option<String>,
    pub event_type: Option<EventKind>,
}
#[derive(Clone, Debug)]
pub struct MemoryBudget {
    pub maximum_memories: usize,
    /// UTF-8 bytes of the entire serialized memory context, including its envelope.
    pub maximum_context_size: usize,
    pub episodic_days: i64,
    pub personal_days: i64,
}
impl Default for MemoryBudget {
    fn default() -> Self {
        Self {
            maximum_memories: 8,
            maximum_context_size: 6000,
            episodic_days: 30,
            personal_days: 180,
        }
    }
}
#[derive(Debug, Serialize)]
pub struct SelectionReason {
    pub id: i64,
    pub reasons: Vec<&'static str>,
}
#[derive(Debug, Serialize)]
pub struct RetrievalDebug {
    pub found: usize,
    pub passed: usize,
    pub context_bytes: usize,
    pub maximum_memories: usize,
    pub maximum_context_size: usize,
    pub selected: Vec<SelectionReason>,
    pub work_context: bool,
    pub work_context_reasons: Vec<&'static str>,
    pub disabled: bool,
    pub candidate_limit_reached: bool,
}
#[derive(Debug, Serialize)]
pub struct RetrievedMemory {
    pub context: Value,
    pub metadata: RetrievalDebug,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MemoryProposal {
    pub operation: String,
    #[serde(rename = "type")]
    pub memory_type: String,
    pub content: String,
    pub confidence: f64,
    pub source: String,
}
fn size(value: &Value) -> usize {
    serde_json::to_vec(value).unwrap().len()
}
impl Storage {
    /// Exact complete titles only; multiple matching titles require clarification, never fuzzy selection.
    pub fn resolve_memory_goal(
        &self,
        request: &str,
        fallback: Option<i64>,
    ) -> Result<(Option<i64>, bool), String> {
        let mut stmt=self.connection.prepare("SELECT g.id,g.text FROM goals g LEFT JOIN core_goals c ON c.goal_id=g.id WHERE COALESCE(c.state,'open')!='deleted'").map_err(db_error)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(db_error)?;
        let request = request.to_lowercase();
        let mut matches = Vec::new();
        for row in rows {
            let (id, title) = row.map_err(db_error)?;
            let title = title.trim().to_lowercase();
            if title.chars().count() >= 3
                && request.match_indices(&title).any(|(i, _)| {
                    let before = request[..i].chars().next_back();
                    let after = request[i + title.len()..].chars().next();
                    before.is_none_or(|c| !c.is_alphanumeric())
                        && after.is_none_or(|c| !c.is_alphanumeric())
                })
            {
                matches.push(id);
            }
        }
        Ok(match matches.as_slice() {
            [id] => (Some(*id), false),
            [] => (fallback, false),
            _ => (None, true),
        })
    }
    pub fn retrieve_contextual_memory(
        &self,
        input: &RetrievalInput,
        budget: &MemoryBudget,
        share_goal_context: bool,
    ) -> Result<RetrievedMemory, String> {
        if !(1..=20).contains(&budget.maximum_memories)
            || !(256..=12000).contains(&budget.maximum_context_size)
            || !(1..=90).contains(&budget.episodic_days)
            || !(1..=730).contains(&budget.personal_days)
        {
            return Err("Invalid memory retrieval budget".into());
        }
        let controls = self.memory_controls()?;
        let mut context = json!({"goal":null,"work_context":null,"memories":[]});
        let mut metadata = RetrievalDebug {
            found: 0,
            passed: 0,
            context_bytes: size(&context),
            maximum_memories: budget.maximum_memories,
            maximum_context_size: budget.maximum_context_size,
            selected: vec![],
            work_context: false,
            work_context_reasons: vec![],
            disabled: !controls.enabled || !share_goal_context,
            candidate_limit_reached: false,
        };
        if metadata.disabled {
            return self.finish_retrieval(context, metadata);
        }
        if let Some(scope) = &input.exact_scope {
            scope.validate(&self.connection)?;
        }
        let goal_id = input
            .exact_scope
            .as_ref()
            .and_then(Scope::goal_id)
            .or(input.active_goal_id);
        let chat_id = input
            .exact_scope
            .as_ref()
            .and_then(Scope::conversation_id)
            .or(input.current_chat_id)
            .filter(|_| controls.remember_conversation_context);
        if let Some(id) = goal_id {
            Scope::goal(id).validate(&self.connection)?;
        }
        if let Some(id) = chat_id {
            Scope {
                scope_type: ScopeType::Conversation,
                scope_id: Some(id),
            }
            .validate(&self.connection)?;
        }
        if let Some(step) = &input.active_step_id {
            if goal_id.is_none()
                || !self
                    .goal_plan(goal_id.unwrap())?
                    .steps
                    .iter()
                    .any(|s| &s.id == step)
            {
                return Err("The retrieval step must belong to the current goal".into());
            }
        }
        if let Some(id) = goal_id {
            let title: String = self
                .connection
                .query_row("SELECT text FROM goals WHERE id=?1", [id], |r| r.get(0))
                .map_err(db_error)?;
            let goal = json!({"id":id,"title":title.chars().take(300).collect::<String>(),"step_id":input.active_step_id});
            context["goal"] = goal;
            if size(&context) > budget.maximum_context_size {
                context["goal"] = Value::Null;
            }
            if controls.remember_work_context {
                if let Some(checkpoint) = self.work_context(id)? {
                    // Full window text is never passed, even when a manually saved checkpoint contains a label.
                    let valid_step = checkpoint.context.step_id.as_ref().is_none_or(|step| {
                        self.goal_plan(id)
                            .is_ok_and(|p| p.steps.iter().any(|s| &s.id == step && !s.done))
                    });
                    let fresh = checkpoint.pinned
                        || chrono::DateTime::parse_from_rfc3339(&checkpoint.updated_at)
                            .is_ok_and(|t| Utc::now().signed_duration_since(t).num_days() <= 90);
                    let live_state: Option<String> = self
                        .connection
                        .query_row("SELECT state FROM core_goals WHERE goal_id=?1", [id], |r| {
                            r.get(0)
                        })
                        .optional()
                        .map_err(db_error)?;
                    let state_agrees = match live_state.as_deref() {
                        Some("completed") => checkpoint.context.status == ContextStatus::Completed,
                        Some("deferred") => {
                            checkpoint.context.status == ContextStatus::Paused
                                || checkpoint.context.status == ContextStatus::Waiting
                        }
                        _ => checkpoint.context.status != ContextStatus::Completed,
                    };
                    if valid_step && fresh && state_agrees {
                        let c = &checkpoint.context;
                        context["work_context"] = json!({"goal_id":id,"step_id":c.step_id,"summary":c.summary,"next_action":c.next_action,"status":c.status,"waiting_for":c.waiting_for,"updated_at":checkpoint.updated_at,"last_result":checkpoint.last_result,"parked_at":checkpoint.parked_at,"resumed_at":checkpoint.resumed_at,"research":checkpoint.research});
                        // Keep the checkpoint before optional older research if the budget is tight.
                        while size(&context) > budget.maximum_context_size {
                            let Some(items) = context["work_context"]["research"].as_array_mut()
                            else {
                                break;
                            };
                            if items.pop().is_none() {
                                break;
                            }
                        }
                        if size(&context) > budget.maximum_context_size {
                            context["work_context"] = Value::Null;
                        } else {
                            metadata.work_context = true;
                            metadata.work_context_reasons.push("current_goal");
                            metadata.work_context_reasons.push(if checkpoint.pinned {
                                "pinned_checkpoint"
                            } else {
                                "recent_checkpoint"
                            });
                            if c.step_id.is_some() && c.step_id == input.active_step_id {
                                metadata.work_context_reasons.push("current_step");
                            }
                            if input.current_app.is_some() && c.last_app == input.current_app {
                                metadata.work_context_reasons.push("current_app");
                            }
                        }
                    }
                }
            }
        }
        // The SQL query only visits eligible scopes. Pinned items in other goals/chats never enter the pool.
        let exact = input.exact_scope.as_ref();
        let sql=format!("SELECT {COLUMNS},step_id FROM memories WHERE archived=0 AND (scope_type='global' OR (scope_type='goal' AND scope_id=?1) OR (scope_type='conversation' AND scope_id=?2)) ORDER BY CASE WHEN scope_type=?3 AND scope_id IS ?4 THEN 0 WHEN scope_type='goal' THEN 1 WHEN scope_type='conversation' THEN 2 ELSE 3 END, CASE WHEN step_id=?5 THEN 0 WHEN step_id IS NULL THEN 1 ELSE 2 END,CASE memory_type WHEN 'explicit_preference' THEN 0 WHEN 'explicit_fact' THEN 1 WHEN 'inferred_preference' THEN 2 WHEN 'behavioral_pattern' THEN 3 ELSE 4 END,pinned DESC,updated_at DESC,id DESC LIMIT 501");
        let mut stmt = self.connection.prepare(&sql).map_err(db_error)?;
        let mut rows = stmt
            .query_map(
                params![
                    goal_id,
                    chat_id,
                    exact.map(|s| s.scope_type.name()),
                    exact.and_then(|s| s.scope_id),
                    input.active_step_id
                ],
                |r| Ok((memory_row(r)?, r.get::<_, Option<String>>(14)?)),
            )
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        metadata.candidate_limit_reached = rows.len() > 500;
        rows.truncate(500);
        metadata.found = self.connection.query_row("SELECT COUNT(*) FROM memories WHERE archived=0 AND (scope_type='global' OR (scope_type='goal' AND scope_id=?1) OR (scope_type='conversation' AND scope_id=?2))",params![goal_id,chat_id],|r|r.get(0)).map_err(db_error)?;
        let now = Utc::now();
        let relevance = format!("{} {}", input.user_request, context["goal"]);
        let words: Vec<_> = relevance
            .split(|c: char| !c.is_alphanumeric())
            .filter(|s| s.chars().count() >= 4)
            .map(str::to_lowercase)
            .take(100)
            .collect();
        // Structured event relevance breaks otherwise equal candidates without looking at activity history.
        rows.sort_by_key(|(m, step)| {
            (
                // Explicit preferences precede every inferred preference, including across eligible scopes.
                matches!(
                    m.memory_type,
                    MemoryType::InferredPreference | MemoryType::BehavioralPattern
                ),
                if exact == Some(&m.scope) {
                    0
                } else if m.scope.goal_id() == goal_id && goal_id.is_some() {
                    1
                } else if m.scope.scope_type == ScopeType::Conversation {
                    2
                } else {
                    3
                },
                if step.as_ref() == input.active_step_id.as_ref() && step.is_some() {
                    0
                } else if step.is_none() {
                    1
                } else {
                    2
                },
                match m.memory_type {
                    MemoryType::ExplicitPreference => 0,
                    MemoryType::ExplicitFact => 1,
                    MemoryType::InferredPreference => 2,
                    MemoryType::BehavioralPattern => 3,
                    MemoryType::Episodic => 4,
                },
                !m.pinned,
                std::cmp::Reverse(m.updated_at.clone()),
                m.event_kind != input.event_type,
                std::cmp::Reverse(m.id),
            )
        });
        for (item, step) in rows {
            if !controls.allows_item(&item) {
                continue;
            }
            if step.is_some() && input.active_step_id.is_some() && step != input.active_step_id {
                continue;
            }
            let Ok(updated) = chrono::DateTime::parse_from_rfc3339(&item.updated_at) else {
                continue;
            };
            let age = now.signed_duration_since(updated).num_days();
            if !item.pinned
                && age
                    > if item.memory_type == MemoryType::Episodic {
                        budget.episodic_days
                    } else {
                        if matches!(
                            item.memory_type,
                            MemoryType::InferredPreference | MemoryType::BehavioralPattern
                        ) {
                            budget.personal_days.min(90)
                        } else {
                            budget.personal_days
                        }
                    }
            {
                continue;
            }
            if item.scope.scope_type == ScopeType::Global {
                let content_words: Vec<_> = item
                    .content
                    .split(|c: char| !c.is_alphanumeric())
                    .map(str::to_lowercase)
                    .collect();
                let request_match = words.iter().any(|word| content_words.contains(word));
                let general_preference = matches!(
                    item.memory_type,
                    MemoryType::ExplicitPreference
                        | MemoryType::InferredPreference
                        | MemoryType::BehavioralPattern
                ) && (item.source == "setting"
                    || content_words.iter().any(|word| {
                        [
                            "concise",
                            "brief",
                            "steps",
                            "plans",
                            "reminders",
                            "language",
                            "english",
                            "russian",
                            "кратко",
                            "шаги",
                            "напоминания",
                            "русском",
                        ]
                        .contains(&word.as_str())
                    }));
                if !request_match && !general_preference {
                    continue;
                }
            }
            if metadata.passed >= budget.maximum_memories {
                break;
            }
            let mut candidate = context.clone();
            candidate["memories"].as_array_mut().unwrap().push(json!({"id":item.id,"type":item.memory_type,"scope":item.scope,"content":item.content,"confidence":item.confidence,"source":item.source,"updated_at":item.updated_at,"event":item.event_kind,"step_id":step}));
            if size(&candidate) > budget.maximum_context_size {
                continue;
            }
            context = candidate;
            metadata.passed += 1;
            let mut reasons = vec![
                if exact == Some(&item.scope) {
                    "exact_scope"
                } else if item.scope.scope_type == ScopeType::Goal {
                    "current_goal"
                } else if item.scope.scope_type == ScopeType::Conversation {
                    "current_chat"
                } else {
                    "relevant_global_type"
                },
                "memory_type",
            ];
            if step.is_some() && step == input.active_step_id {
                reasons.push("current_step");
            }
            if item.pinned {
                reasons.push("pinned");
            } else {
                reasons.push("recent");
            }
            if item.event_kind.is_some() && item.event_kind == input.event_type {
                reasons.push("event_type");
            }
            metadata.selected.push(SelectionReason {
                id: item.id,
                reasons,
            });
        }
        metadata.context_bytes = size(&context);
        atomic(&self.connection, || {
            for item in &metadata.selected {
                self.connection
                    .execute(
                        "UPDATE memories SET last_used_at=?1 WHERE id=?2",
                        params![Utc::now().to_rfc3339(), item.id],
                    )
                    .map_err(db_error)?;
            }
            self.finish_retrieval(context, metadata)
        })
    }
    fn finish_retrieval(
        &self,
        context: Value,
        metadata: RetrievalDebug,
    ) -> Result<RetrievedMemory, String> {
        let serialized = serde_json::to_string(&metadata).map_err(|_| "Invalid memory metadata")?;
        self.connection.execute("INSERT INTO memory_retrieval_debug(id,metadata) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata",[serialized]).map_err(db_error)?;
        Ok(RetrievedMemory { context, metadata })
    }
}
#[tauri::command(async)]
pub fn get_memory_retrieval_debug(
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<Option<Value>, String> {
    main_window(&window)?;
    let inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let value: Option<String> = inner
        .storage
        .connection
        .query_row(
            "SELECT metadata FROM memory_retrieval_debug WHERE id=1",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(db_error)?;
    value
        .map(|v| serde_json::from_str(&v).map_err(|_| "Invalid debug metadata".into()))
        .transpose()
}
