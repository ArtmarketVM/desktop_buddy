use super::retriever::*;
use super::*;
use crate::core::GoalDraft;
fn db() -> Storage {
    Storage::open(std::path::Path::new(":memory:")).unwrap()
}
fn goal(s: &mut Storage, title: &str) -> i64 {
    s.core_add_goals(
        vec![GoalDraft {
            title: title.into(),
            area: "Work".into(),
            steps: vec!["Draft".into(), "Review".into()],
        }],
        &format!("phase3-{}", Utc::now().timestamp_nanos_opt().unwrap()),
    )
    .unwrap();
    s.core_snapshot(None)
        .unwrap()
        .goals
        .into_iter()
        .find(|g| g.title == title)
        .unwrap()
        .id
}
fn remember(s: &Storage, scope: Scope, kind: MemoryType, content: &str) -> Memory {
    s.create_memory(MemoryInput {
        scope,
        memory_type: kind,
        content: content.into(),
    })
    .unwrap()
}
fn request(id: i64) -> RetrievalInput {
    RetrievalInput {
        exact_scope: Some(Scope::goal(id)),
        active_goal_id: Some(id),
        user_request: "Where did I stop?".into(),
        ..Default::default()
    }
}
fn retrieve(s: &Storage, input: RetrievalInput) -> RetrievedMemory {
    s.retrieve_contextual_memory(&input, &Default::default(), true)
        .unwrap()
}
fn ids(r: &RetrievedMemory) -> Vec<i64> {
    r.context["memories"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["id"].as_i64().unwrap())
        .collect()
}
fn checkpoint(id: i64) -> WorkContextInput {
    WorkContextInput {
        goal_id: id,
        step_id: Some("step-0".into()),
        summary: "Draft reviewed".into(),
        next_action: Some("Revise the outline".into()),
        status: ContextStatus::Active,
        last_app: Some("Editor".into()),
        last_window: Some("Private unrelated window label".into()),
        waiting_for: None,
    }
}
#[test]
fn retrieval_returns_goal_checkpoint_next_action_and_related_events() {
    let mut s = db();
    let id = goal(&mut s, "Hackathon");
    s.save_work_context(checkpoint(id), None).unwrap();
    let event = s
        .record_memory_event(
            Scope::goal(id),
            EventKind::GoalResumed,
            "confirmed_event",
            None,
        )
        .unwrap();
    let pref = remember(
        &s,
        Scope::global(),
        MemoryType::ExplicitPreference,
        "I prefer concise plans",
    );
    let r = retrieve(&s, request(id));
    assert_eq!(r.context["goal"]["title"], "Hackathon");
    assert_eq!(
        r.context["work_context"]["next_action"],
        "Revise the outline"
    );
    assert!(ids(&r).contains(&event));
    assert!(ids(&r).contains(&pref.id));
    assert!(!r.context.to_string().contains("Private unrelated window"));
}
#[test]
fn retrieval_excludes_unrelated_goals_chats_facts_and_activity() {
    let mut s = db();
    let id = goal(&mut s, "Hackathon");
    let other = goal(&mut s, "Other project");
    let unrelated = remember(
        &s,
        Scope::goal(other),
        MemoryType::ExplicitFact,
        "Other project details",
    );
    s.pin_memory(unrelated.id, true).unwrap();
    let chat = s.current_conversation().unwrap();
    let other_chat = s.create_conversation().unwrap();
    let related = remember(
        &s,
        Scope {
            scope_type: ScopeType::Conversation,
            scope_id: Some(chat),
        },
        MemoryType::ExplicitFact,
        "Relevant chat context",
    );
    remember(
        &s,
        Scope {
            scope_type: ScopeType::Conversation,
            scope_id: Some(other_chat),
        },
        MemoryType::ExplicitFact,
        "Different chat context",
    );
    remember(
        &s,
        Scope::global(),
        MemoryType::ExplicitFact,
        "I collect seashells",
    );
    let mut input = request(id);
    input.current_chat_id = Some(chat);
    let r = retrieve(&s, input);
    let text = r.context.to_string();
    assert!(ids(&r).contains(&related.id));
    assert!(!ids(&r).contains(&unrelated.id));
    assert!(!text.contains("seashells"));
    assert!(!text.contains("Different chat"));
}
#[test]
fn exact_scope_overrides_ambient_goal_and_step_ids_are_validated() {
    let mut s = db();
    let id = goal(&mut s, "First");
    let other = goal(&mut s, "Second");
    let a = remember(
        &s,
        Scope::goal(id),
        MemoryType::ExplicitFact,
        "First context",
    );
    let b = remember(
        &s,
        Scope::goal(other),
        MemoryType::ExplicitFact,
        "Second context",
    );
    let mut input = request(id);
    input.active_goal_id = Some(other);
    assert_eq!(ids(&retrieve(&s, input)), vec![a.id]);
    let mut input = request(other);
    input.active_step_id = Some("missing-step".into());
    assert!(s
        .retrieve_contextual_memory(&input, &Default::default(), true)
        .is_err());
    assert!(s.memory(b.id, false).is_ok());
}
#[test]
fn pinned_memories_survive_recency_but_never_override_scope() {
    let mut s = db();
    let id = goal(&mut s, "Report");
    let pinned = remember(
        &s,
        Scope::goal(id),
        MemoryType::ExplicitPreference,
        "I prefer calm reminders",
    );
    let stale = remember(
        &s,
        Scope::goal(id),
        MemoryType::ExplicitPreference,
        "I prefer long reminders",
    );
    s.connection
        .execute("UPDATE memories SET updated_at='2020-01-01T00:00:00Z'", [])
        .unwrap();
    s.pin_memory(pinned.id, true).unwrap();
    let r = retrieve(&s, request(id));
    assert!(ids(&r).contains(&pinned.id));
    assert!(!ids(&r).contains(&stale.id));
    assert!(r.metadata.selected[0].reasons.contains(&"pinned"));
}
#[test]
fn memory_and_utf8_context_budgets_include_goal_and_checkpoint() {
    let mut s = db();
    let id = goal(&mut s, "Report");
    s.save_work_context(checkpoint(id), None).unwrap();
    for i in 0..12 {
        remember(
            &s,
            Scope::goal(id),
            MemoryType::ExplicitPreference,
            &format!("I prefer reminder number {i} with a short plan"),
        );
    }
    let budget = MemoryBudget {
        maximum_memories: 2,
        maximum_context_size: 900,
        ..Default::default()
    };
    let r = s
        .retrieve_contextual_memory(&request(id), &budget, true)
        .unwrap();
    assert!(r.metadata.passed <= 2);
    assert!(serde_json::to_vec(&r.context).unwrap().len() <= 900);
    assert_eq!(r.metadata.found, 12);
    let tiny = MemoryBudget {
        maximum_context_size: 256,
        ..Default::default()
    };
    let r = s
        .retrieve_contextual_memory(&request(id), &tiny, true)
        .unwrap();
    assert!(serde_json::to_vec(&r.context).unwrap().len() <= 256);
    assert!(s
        .retrieve_contextual_memory(
            &request(id),
            &MemoryBudget {
                maximum_memories: 0,
                ..Default::default()
            },
            true
        )
        .is_err());
}
#[test]
fn memory_off_blocks_capture_retrieval_and_new_writes_but_preserves_management() {
    let mut s = db();
    let id = goal(&mut s, "Report");
    let item = remember(&s, Scope::goal(id), MemoryType::ExplicitFact, "Saved fact");
    let mut controls = s.memory_controls().unwrap();
    controls.enabled = false;
    s.set_memory_controls(&controls).unwrap();
    assert!(s
        .create_memory(MemoryInput {
            scope: Scope::global(),
            memory_type: MemoryType::ExplicitPreference,
            content: "I prefer quiet".into()
        })
        .is_err());
    assert!(s.save_work_context(checkpoint(id), None).is_err());
    let count = s.list_memories(Default::default()).unwrap().len();
    s.core_transition(id, "defer").unwrap();
    assert_eq!(s.list_memories(Default::default()).unwrap().len(), count);
    assert_eq!(
        s.record_memory_event(
            Scope::goal(id),
            EventKind::InterventionAccepted,
            "intervention_feedback",
            None
        )
        .unwrap(),
        0
    );
    let r = retrieve(&s, request(id));
    assert!(r.metadata.disabled);
    assert!(ids(&r).is_empty());
    assert!(r.context["goal"].is_null());
    assert_eq!(s.memory_overview(0).unwrap().memories.len(), count);
    s.forget_memory(item.id).unwrap();
    assert!(s.memory(item.id, false).is_err());
}
#[test]
fn individual_toggles_gate_capture_and_recall() {
    let mut s = db();
    let id = goal(&mut s, "Report");
    let chat = s.current_conversation().unwrap();
    let pref = remember(
        &s,
        Scope::global(),
        MemoryType::ExplicitPreference,
        "I prefer concise steps",
    );
    let fact = remember(
        &s,
        Scope::goal(id),
        MemoryType::ExplicitFact,
        "Saved work note",
    );
    let chat_memory = remember(
        &s,
        Scope {
            scope_type: ScopeType::Conversation,
            scope_id: Some(chat),
        },
        MemoryType::ExplicitFact,
        "Chat-specific context",
    );
    let feedback = s
        .record_memory_event(
            Scope::goal(id),
            EventKind::ResearchAccepted,
            "research_feedback",
            None,
        )
        .unwrap();
    let mut controls = s.memory_controls().unwrap();
    controls.remember_preferences = false;
    s.set_memory_controls(&controls).unwrap();
    assert!(!ids(&retrieve(&s, request(id))).contains(&pref.id));
    controls.remember_work_context = false;
    controls.learn_from_feedback = false;
    controls.remember_conversation_context = false;
    s.set_memory_controls(&controls).unwrap();
    let mut input = request(id);
    input.current_chat_id = Some(chat);
    let r = retrieve(&s, input);
    assert!(!ids(&r).contains(&fact.id));
    assert!(!ids(&r).contains(&chat_memory.id));
    assert!(!ids(&r).contains(&feedback));
    let before = s.list_memories(Default::default()).unwrap().len();
    s.core_transition(id, "defer").unwrap();
    assert_eq!(before, s.list_memories(Default::default()).unwrap().len());
    s.write_setting("tracking_requested", &true).unwrap();
    assert_eq!(before, s.list_memories(Default::default()).unwrap().len());
}
#[test]
fn privacy_sharing_off_sends_no_personal_memory_or_checkpoint() {
    let mut s = db();
    let id = goal(&mut s, "Private goal");
    remember(
        &s,
        Scope::goal(id),
        MemoryType::ExplicitFact,
        "Private fact",
    );
    let r = s
        .retrieve_contextual_memory(&request(id), &Default::default(), false)
        .unwrap();
    assert!(r.metadata.disabled);
    assert_eq!(
        r.context,
        serde_json::json!({"goal":null,"work_context":null,"memories":[]})
    );
}
#[test]
fn diagnostics_contain_only_counts_ids_and_reasons() {
    let mut s = db();
    let id = goal(&mut s, "Private project title");
    remember(
        &s,
        Scope::goal(id),
        MemoryType::ExplicitFact,
        "My private useful fact",
    );
    let mut input = request(id);
    input.user_request = "Private message".into();
    let r = retrieve(&s, input);
    let log: String = s
        .connection
        .query_row(
            "SELECT metadata FROM memory_retrieval_debug WHERE id=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(!log.contains("Private"));
    assert!(!log.contains("private"));
    assert!(log.contains("exact_scope"));
    assert_eq!(r.metadata.passed, 1);
    let log_count: i64 = s
        .connection
        .query_row("SELECT COUNT(*) FROM memory_retrieval_debug", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(log_count, 1);
}
#[test]
fn edit_forget_and_clear_memory_never_delete_goals_steps_chat_or_activity() {
    let mut s = db();
    let id = goal(&mut s, "Report");
    let chat = s.current_conversation().unwrap();
    s.save_question_to(chat, "Keep this chat", Some(id))
        .unwrap();
    let plan = s.goal_plan(id).unwrap();
    let item = remember(
        &s,
        Scope::goal(id),
        MemoryType::ExplicitFact,
        "First summary",
    );
    let edited = s
        .update_memory(
            item.id,
            MemoryUpdate {
                content: "Correct summary".into(),
                expected_updated_at: item.updated_at,
            },
        )
        .unwrap();
    assert!(retrieve(&s, request(id))
        .context
        .to_string()
        .contains("Correct summary"));
    s.forget_memory(edited.id).unwrap();
    assert!(!ids(&retrieve(&s, request(id))).contains(&edited.id));
    remember(
        &s,
        Scope::global(),
        MemoryType::ExplicitPreference,
        "I prefer quiet reminders",
    );
    s.save_work_context(checkpoint(id), None).unwrap();
    let history = s.chat_history_of(chat).unwrap().len();
    s.connection.execute("INSERT INTO activity(goal_id,timestamp,process_name,window_title,idle_seconds,active_seconds) VALUES(?1,?2,'Editor','Existing activity',0,30)",params![id,Utc::now().to_rfc3339()]).unwrap();
    let activity = s.recent(id).unwrap().len();
    assert!(activity > 0);
    s.clear_personal_memory().unwrap();
    assert!(s.list_memories(Default::default()).unwrap().is_empty());
    assert!(s.work_context(id).unwrap().is_none());
    assert_eq!(s.goal_plan(id).unwrap().steps.len(), plan.steps.len());
    assert_eq!(s.chat_history_of(chat).unwrap().len(), history);
    assert_eq!(s.recent(id).unwrap().len(), activity);
    assert_eq!(s.core_snapshot(None).unwrap().goals.len(), 1);
}
#[test]
fn forget_goal_is_isolated_and_clears_its_checkpoint() {
    let mut s = db();
    let id = goal(&mut s, "First");
    let other = goal(&mut s, "Second");
    remember(&s, Scope::goal(id), MemoryType::ExplicitFact, "First note");
    let b = remember(
        &s,
        Scope::goal(other),
        MemoryType::ExplicitFact,
        "Second note",
    );
    s.save_work_context(checkpoint(id), None).unwrap();
    s.clear_memory_scope(&Scope::goal(id)).unwrap();
    assert!(ids(&retrieve(&s, request(id))).is_empty());
    assert!(s.work_context(id).unwrap().is_none());
    assert!(s.memory(b.id, false).is_ok());
    assert_eq!(s.core_snapshot(None).unwrap().goals.len(), 2);
}
#[test]
fn exact_title_resolution_handles_ambiguity_without_fuzzy_matching() {
    let mut s = db();
    let first = goal(&mut s, "Hackathon");
    let other = goal(&mut s, "Other project");
    assert_eq!(
        s.resolve_memory_goal("Где я остановился с Hackathon?", Some(other))
            .unwrap(),
        (Some(first), false)
    );
    assert_eq!(
        s.resolve_memory_goal("Hackathonic task", None).unwrap(),
        (None, false)
    );
    assert_eq!(
        s.resolve_memory_goal("Compare Hackathon and Other project", Some(first))
            .unwrap(),
        (None, true)
    );
    goal(&mut s, "Hackathon");
    assert_eq!(
        s.resolve_memory_goal("Hackathon", Some(first)).unwrap(),
        (None, true)
    );
}
#[test]
fn suggestions_require_explicit_verbatim_evidence_and_user_confirmation() {
    let s = db();
    let chat = s.current_conversation().unwrap();
    let mut proposal = MemoryProposal {
        operation: "store_memory".into(),
        memory_type: "preference".into(),
        content: "I prefer quiet reminders".into(),
        confidence: 0.85,
        source: "explicit_user_statement".into(),
    };
    assert!(s
        .stage_memory_proposal(&proposal, "A random message", chat)
        .is_err());
    s.stage_memory_proposal(&proposal, "I prefer quiet reminders", chat)
        .unwrap();
    assert!(s.list_memories(Default::default()).unwrap().is_empty());
    let id = s.memory_overview(0).unwrap().proposals[0]["id"]
        .as_i64()
        .unwrap();
    s.resolve_memory_proposal(id, true).unwrap();
    assert_eq!(
        s.list_memories(Default::default()).unwrap()[0].content,
        proposal.content
    );
    assert!(s.resolve_memory_proposal(id, true).is_err());
    proposal.confidence = 0.5;
    assert!(s
        .stage_memory_proposal(&proposal, "I prefer quiet reminders", chat)
        .is_err());
    proposal.confidence = 1.;
    proposal.content = "password=private-value".into();
    assert!(s
        .stage_memory_proposal(&proposal, "Remember password=private-value", chat)
        .is_err());
}
#[test]
fn revoked_permission_removes_pending_proposals_and_diagnostics() {
    let s = db();
    let chat = s.current_conversation().unwrap();
    let proposal = MemoryProposal {
        operation: "store_memory".into(),
        memory_type: "preference".into(),
        content: "I prefer concise plans".into(),
        confidence: 1.,
        source: "explicit_user_statement".into(),
    };
    s.stage_memory_proposal(&proposal, &proposal.content, chat)
        .unwrap();
    let mut controls = s.memory_controls().unwrap();
    controls.remember_conversation_context = false;
    s.set_memory_controls(&controls).unwrap();
    assert!(s.memory_overview(0).unwrap().proposals.is_empty());
    assert!(s
        .stage_memory_proposal(&proposal, &proposal.content, chat)
        .is_err());
}
#[test]
fn controls_and_checkpoint_pin_survive_database_reopen() {
    let path = std::env::temp_dir().join(format!(
        "buddy-phase3-{}.sqlite",
        Utc::now().timestamp_nanos_opt().unwrap()
    ));
    let id;
    {
        let mut s = Storage::open(&path).unwrap();
        id = goal(&mut s, "Report");
        s.save_work_context(checkpoint(id), None).unwrap();
        s.connection
            .execute("UPDATE work_contexts SET pinned=1 WHERE goal_id=?1", [id])
            .unwrap();
        let mut c = s.memory_controls().unwrap();
        c.remember_preferences = false;
        s.set_memory_controls(&c).unwrap();
    }
    {
        let s = Storage::open(&path).unwrap();
        assert!(!s.memory_controls().unwrap().remember_preferences);
        assert!(s.work_context(id).unwrap().unwrap().pinned);
    }
    std::fs::remove_file(path).unwrap();
}
#[test]
fn overview_paginates_without_hiding_older_memories() {
    let s = db();
    for i in 0..55 {
        remember(
            &s,
            Scope::global(),
            MemoryType::ExplicitPreference,
            &format!("I prefer option number {i}"),
        );
    }
    let first = s.memory_overview(0).unwrap();
    let second = s.memory_overview(50).unwrap();
    assert_eq!(first.memories.len(), 50);
    assert!(first.more);
    assert_eq!(second.memories.len(), 5);
    assert!(!second.more);
    assert!(first
        .memories
        .iter()
        .all(|a| second.memories.iter().all(|b| a.id != b.id)));
}
#[test]
fn step_metadata_ranks_matching_step_and_excludes_other_steps() {
    let mut s = db();
    let id = goal(&mut s, "Report");
    let a = s
        .record_memory_event(
            Scope::goal(id),
            EventKind::StepCompleted,
            "confirmed_event",
            None,
        )
        .unwrap();
    let b = s
        .record_memory_event(
            Scope::goal(id),
            EventKind::StepCompleted,
            "confirmed_event",
            None,
        )
        .unwrap();
    s.connection
        .execute("UPDATE memories SET step_id='step-0' WHERE id=?1", [a])
        .unwrap();
    s.connection
        .execute("UPDATE memories SET step_id='step-1' WHERE id=?1", [b])
        .unwrap();
    let mut input = request(id);
    input.active_step_id = Some("step-0".into());
    let r = retrieve(&s, input);
    assert!(ids(&r).contains(&a));
    assert!(!ids(&r).contains(&b));
    assert!(r.metadata.selected[0].reasons.contains(&"current_step"));
}
#[test]
fn old_unpinned_checkpoint_is_excluded_and_pinned_checkpoint_is_available() {
    let mut s = db();
    let id = goal(&mut s, "Report");
    s.save_work_context(checkpoint(id), None).unwrap();
    s.connection
        .execute(
            "UPDATE work_contexts SET updated_at='2020-01-01T00:00:00Z'",
            [],
        )
        .unwrap();
    assert!(retrieve(&s, request(id)).context["work_context"].is_null());
    s.connection
        .execute("UPDATE work_contexts SET pinned=1", [])
        .unwrap();
    assert!(retrieve(&s, request(id)).metadata.work_context);
}
#[test]
fn phase_two_database_migrates_in_place_with_existing_memories_and_checkpoint() {
    let mut s = Storage {
        connection: Connection::open_in_memory().unwrap(),
    };
    s.initialize().unwrap();
    s.initialize_tracking().unwrap();
    s.initialize_profile().unwrap();
    s.initialize_core().unwrap();
    s.initialize_skills().unwrap();
    s.connection.execute_batch("CREATE TABLE personal_memory_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);").unwrap();
    s.connection
        .execute_batch(include_str!("migrations/001_personal_memory.sql"))
        .unwrap();
    s.connection
        .execute(
            "INSERT INTO personal_memory_migrations VALUES(1,?1)",
            [Utc::now().to_rfc3339()],
        )
        .unwrap();
    let id = goal(&mut s, "Legacy goal");
    s.connection.execute("INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,confidence,source,evidence_count,created_at,updated_at) VALUES('explicit_fact','goal',?1,?1,'Existing fact',1,'user',1,?2,?2)",params![id,Utc::now().to_rfc3339()]).unwrap();
    s.connection.execute("INSERT INTO work_contexts(goal_id,step_id,summary,next_action,status,created_at,updated_at) VALUES(?1,'step-0','Existing checkpoint','Continue draft','active',?2,?2)",params![id,Utc::now().to_rfc3339()]).unwrap();
    s.initialize_personal_memory().unwrap();
    s.initialize_personal_memory().unwrap();
    assert_eq!(
        s.work_context(id).unwrap().unwrap().context.summary,
        "Existing checkpoint"
    );
    assert!(retrieve(&s, request(id))
        .context
        .to_string()
        .contains("Existing fact"));
    assert_eq!(
        s.connection
            .query_row(
                "SELECT MAX(version) FROM personal_memory_migrations",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
        2
    );
}
#[test]
fn malformed_model_proposals_and_malformed_controls_are_rejected() {
    assert!(serde_json::from_value::<MemoryProposal>(serde_json::json!({"operation":"store_memory","type":"preference","content":"hello","confidence":"high","source":"explicit_user_statement"})).is_err());
    assert!(serde_json::from_value::<controls::MemoryControls>(serde_json::json!({"enabled":true,"remember_work_context":true,"remember_preferences":true,"learn_from_feedback":true,"remember_conversation_context":true,"unknown":true})).is_err());
}
#[test]
fn feedback_off_does_not_block_work_and_work_off_does_not_block_feedback() {
    let mut s = db();
    let id = goal(&mut s, "Report");
    let mut controls = s.memory_controls().unwrap();
    controls.learn_from_feedback = false;
    s.set_memory_controls(&controls).unwrap();
    assert_eq!(
        s.record_memory_event(
            Scope::goal(id),
            EventKind::ResearchRejected,
            "research_feedback",
            None
        )
        .unwrap(),
        0
    );
    assert!(
        s.record_memory_event(
            Scope::goal(id),
            EventKind::GoalResumed,
            "confirmed_event",
            None
        )
        .unwrap()
            > 0
    );
    controls.learn_from_feedback = true;
    controls.remember_work_context = false;
    s.set_memory_controls(&controls).unwrap();
    let event = s
        .record_memory_event(
            Scope::goal(id),
            EventKind::ResearchAccepted,
            "research_feedback",
            None,
        )
        .unwrap();
    assert!(event > 0);
    assert!(ids(&retrieve(&s, request(id))).contains(&event));
}
#[test]
fn unrelated_global_preference_is_excluded_even_when_pinned() {
    let mut s = db();
    let id = goal(&mut s, "Hackathon");
    let food = remember(
        &s,
        Scope::global(),
        MemoryType::ExplicitPreference,
        "I prefer sushi",
    );
    s.pin_memory(food.id, true).unwrap();
    let concise = remember(
        &s,
        Scope::global(),
        MemoryType::ExplicitPreference,
        "I prefer concise plans",
    );
    let r = retrieve(&s, request(id));
    assert!(!ids(&r).contains(&food.id));
    assert!(ids(&r).contains(&concise.id));
    let mut input = request(id);
    input.user_request = "What sushi do I prefer?".into();
    assert!(ids(&retrieve(&s, input)).contains(&food.id));
}

#[test]
fn pinned_checkpoint_protects_completed_goal_from_automatic_history_retention() {
    let mut s = db();
    let id = goal(&mut s, "Report");
    s.save_work_context(checkpoint(id), None).unwrap();
    s.core_transition(id, "complete").unwrap();
    s.connection
        .execute(
            "UPDATE work_contexts SET pinned=1,updated_at='2020-01-01T00:00:00Z' WHERE goal_id=?1",
            [id],
        )
        .unwrap();
    s.connection
        .execute(
            "UPDATE goals SET created_at='2020-01-01T00:00:00Z' WHERE id=?1",
            [id],
        )
        .unwrap();
    s.purge_history(Some("2026-10-01T00:00:00Z")).unwrap();
    assert!(s.work_context(id).unwrap().unwrap().pinned);
}
