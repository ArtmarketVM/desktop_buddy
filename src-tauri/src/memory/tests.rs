use super::*;
use crate::core::GoalDraft;
fn store() -> Storage {
    Storage::open(std::path::Path::new(":memory:")).unwrap()
}
fn goal(s: &mut Storage, title: &str) -> i64 {
    s.core_add_goals(
        vec![GoalDraft {
            title: title.into(),
            area: "Work".into(),
            steps: vec!["Review the draft".into()],
        }],
        &format!("test-{}", Utc::now().timestamp_nanos_opt().unwrap()),
    )
    .unwrap();
    s.core_snapshot(None)
        .unwrap()
        .goals
        .iter()
        .find(|g| g.title == title)
        .unwrap()
        .id
}
fn input(scope: Scope, content: &str) -> MemoryInput {
    MemoryInput {
        memory_type: MemoryType::ExplicitFact,
        scope,
        content: content.into(),
    }
}
fn context(id: i64) -> WorkContextInput {
    WorkContextInput {
        goal_id: id,
        step_id: Some("step-0".into()),
        summary: "Reviewed the outline".into(),
        next_action: Some("Write the introduction".into()),
        status: ContextStatus::Active,
        last_app: Some("Editor".into()),
        last_window: None,
        waiting_for: None,
    }
}
fn list(s: &Storage, scope: Scope) -> Vec<Memory> {
    s.list_memories(MemoryQuery {
        scope: Some(scope),
        ..Default::default()
    })
    .unwrap()
}
fn temp() -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "buddy-memory-{}-{}.sqlite",
        std::process::id(),
        Utc::now().timestamp_nanos_opt().unwrap()
    ))
}

#[test]
fn memory_survives_database_reopen() {
    let path = temp();
    let id;
    {
        let s = Storage::open(&path).unwrap();
        id = s
            .create_memory(input(Scope::global(), "I live in Haifa"))
            .unwrap()
            .id;
    }
    {
        let s = Storage::open(&path).unwrap();
        let memory = s.memory(id, true).unwrap();
        assert_eq!(memory.content, "I live in Haifa");
        assert!(memory.last_used_at.is_some());
        assert_eq!(memory.source, "user");
    }
    std::fs::remove_file(path).unwrap();
}
#[test]
fn work_context_is_persistent_and_preserves_creation_timestamp() {
    let path = temp();
    let (id, created);
    {
        let mut s = Storage::open(&path).unwrap();
        id = goal(&mut s, "Report");
        let checkpoint = s.save_work_context(context(id), None).unwrap();
        created = checkpoint.created_at;
    }
    {
        let mut s = Storage::open(&path).unwrap();
        let saved = s.work_context(id).unwrap().unwrap();
        assert_eq!(
            saved.context.next_action.as_deref(),
            Some("Write the introduction")
        );
        let mut edited = saved.context;
        edited.summary = "Finished the outline review".into();
        let updated = s.save_work_context(edited, Some(saved.updated_at)).unwrap();
        assert_eq!(updated.created_at, created);
        assert!(updated.context.last_window.is_none());
    }
    std::fs::remove_file(path).unwrap();
}
#[test]
fn goal_scoped_memory_never_mixes_with_other_goals_or_global_scope() {
    let mut s = store();
    let a = goal(&mut s, "A");
    let b = goal(&mut s, "B");
    s.create_memory(input(Scope::goal(a), "Use the approved report template"))
        .unwrap();
    s.create_memory(input(Scope::goal(b), "Ask the reviewer first"))
        .unwrap();
    s.create_memory(input(Scope::global(), "I prefer concise replies"))
        .unwrap();
    assert_eq!(
        list(&s, Scope::goal(a))[0].content,
        "Use the approved report template"
    );
    assert_eq!(list(&s, Scope::goal(b)).len(), 1);
    assert_eq!(list(&s, Scope::global()).len(), 1);
    s.clear_memory_scope(&Scope::goal(a)).unwrap();
    assert!(list(&s, Scope::goal(a)).is_empty());
    assert_eq!(list(&s, Scope::goal(b)).len(), 1);
    assert_eq!(s.core_snapshot(None).unwrap().goals.len(), 2);
}
#[test]
fn explicit_preference_is_saved_without_training_or_inference() {
    let s = store();
    let mut draft = input(Scope::global(), "Use short answers");
    draft.memory_type = MemoryType::ExplicitPreference;
    let saved = s.create_memory(draft).unwrap();
    assert_eq!(saved.memory_type, MemoryType::ExplicitPreference);
    assert_eq!(saved.confidence, 1.0);
    assert_eq!(saved.evidence_count, 1);
    let selected = s
        .list_memories(MemoryQuery {
            memory_type: Some(MemoryType::ExplicitPreference),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(selected.len(), 1);
}
fn evidence(s: &Storage, key: &str, day: &str) -> i64 {
    let id = s
        .record_memory_event(
            Scope::global(),
            EventKind::ResearchAccepted,
            "research_feedback",
            Some(key),
        )
        .unwrap();
    s.connection
        .execute(
            "UPDATE memories SET created_at=?1 WHERE id=?2",
            params![format!("{day}T10:00:00Z"), id],
        )
        .unwrap();
    id
}
fn proposal() -> MemoryInput {
    MemoryInput {
        memory_type: MemoryType::InferredPreference,
        scope: Scope::global(),
        content: "Prefers practical reference guides".into(),
    }
}
#[test]
fn inference_requires_three_independent_events_across_two_days() {
    let mut s = store();
    let one = evidence(&s, "one", "2026-10-10");
    assert!(s.observe_inference(proposal(), one, 0.9).unwrap().is_none());
    assert!(s.observe_inference(proposal(), one, 0.9).unwrap().is_none());
    let two = evidence(&s, "two", "2026-10-10");
    assert!(s.observe_inference(proposal(), two, 0.9).unwrap().is_none());
    let three = evidence(&s, "three", "2026-10-10");
    assert!(s
        .observe_inference(proposal(), three, 0.9)
        .unwrap()
        .is_none());
    assert!(s
        .list_memories(MemoryQuery {
            memory_type: Some(MemoryType::InferredPreference),
            ..Default::default()
        })
        .unwrap()
        .is_empty());
    let four = evidence(&s, "four", "2026-10-11");
    let inferred = s
        .observe_inference(proposal(), four, 0.87)
        .unwrap()
        .unwrap();
    assert_eq!(inferred.evidence_count, 4);
    assert_eq!(inferred.confidence, 0.87);
    assert_eq!(inferred.source, "verified_events");
}
#[test]
fn weak_guesses_wrong_scope_and_user_written_events_are_not_evidence() {
    let mut s = store();
    let event = evidence(&s, "one", "2026-10-10");
    for confidence in [0.4, f64::NAN, f64::INFINITY] {
        assert!(s.observe_inference(proposal(), event, confidence).is_err());
    }
    let goal_id = goal(&mut s, "Report");
    let mut scoped = proposal();
    scoped.scope = Scope::goal(goal_id);
    assert!(s.observe_inference(scoped, event, 0.9).is_err());
    let manual = s
        .record_memory_event(
            Scope::global(),
            EventKind::MeaningfulCorrection,
            "user",
            None,
        )
        .unwrap();
    assert!(s.observe_inference(proposal(), manual, 0.9).is_err());
    assert!(s.create_memory(proposal()).is_err());
}
#[test]
fn forget_removes_memory_and_inference_candidate_evidence() {
    let mut s = store();
    let item = s
        .create_memory(input(Scope::global(), "I work in product design"))
        .unwrap();
    s.forget_memory(item.id).unwrap();
    assert!(s.memory(item.id, false).is_err());
    let mut last = None;
    for (key, day) in [
        ("one", "2026-10-10"),
        ("two", "2026-10-10"),
        ("three", "2026-10-11"),
    ] {
        let id = evidence(&s, key, day);
        last = s.observe_inference(proposal(), id, 0.9).unwrap();
    }
    s.forget_memory(last.unwrap().id).unwrap();
    assert_eq!(
        s.connection
            .query_row("SELECT COUNT(*) FROM memory_evidence", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
}
#[test]
fn pin_and_archive_persist_and_archived_memories_are_not_retrieved_by_default() {
    let path = temp();
    let id;
    {
        let s = Storage::open(&path).unwrap();
        id = s
            .create_memory(input(Scope::global(), "I prefer morning work"))
            .unwrap()
            .id;
        s.pin_memory(id, true).unwrap();
        s.archive_memory(id, true).unwrap();
        assert!(list(&s, Scope::global()).is_empty());
    }
    {
        let s = Storage::open(&path).unwrap();
        let item = s.memory(id, false).unwrap();
        assert!(item.pinned);
        assert!(item.archived);
        assert_eq!(
            s.list_memories(MemoryQuery {
                include_archived: true,
                ..Default::default()
            })
            .unwrap()
            .len(),
            1
        );
        s.archive_memory(id, false).unwrap();
        assert_eq!(list(&s, Scope::global()).len(), 1);
    }
    std::fs::remove_file(path).unwrap();
}
#[test]
fn migration_preserves_existing_goals_chats_and_activity_and_is_idempotent() {
    let path = temp();
    let id;
    {
        let mut s = Storage::open(&path).unwrap();
        id = goal(&mut s, "Legacy report");
        s.save_chat_turn(
            "Saved question",
            &crate::ai_chat::ChatReply {
                message: "Saved answer".into(),
                ..Default::default()
            },
            Some(id),
        )
        .unwrap();
        s.activity(
            id,
            &crate::models::ActivitySnapshot {
                timestamp: Utc::now().to_rfc3339(),
                process_name: "Editor".into(),
                window_title: "Existing title".into(),
                ..Default::default()
            },
        )
        .unwrap();
        let triggers: Vec<String> = {
            let mut q = s
                .connection
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'memory_%'",
                )
                .unwrap();
            q.query_map([], |r| r.get(0))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };
        for trigger in triggers {
            s.connection
                .execute_batch(&format!("DROP TRIGGER {trigger}"))
                .unwrap();
        }
        s.connection.execute_batch("DROP TABLE memory_evidence; DROP TABLE work_contexts; DROP TABLE memories; DROP TABLE personal_memory_migrations;").unwrap();
    }
    {
        let s = Storage::open(&path).unwrap();
        s.initialize_personal_memory().unwrap();
        assert_eq!(
            s.core_snapshot(None).unwrap().goals[0].title,
            "Legacy report"
        );
        assert_eq!(s.chat_history().unwrap().len(), 2);
        assert_eq!(s.recent(id).unwrap()[0].window_title, "Existing title");
        assert_eq!(
            s.connection
                .query_row("SELECT COUNT(*) FROM personal_memory_migrations", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert!(s.list_memories(Default::default()).unwrap().is_empty());
    }
    std::fs::remove_file(path).unwrap();
}
#[test]
fn malformed_inputs_and_secrets_are_rejected_without_storing_them() {
    let s = store();
    for value in [
        "",
        "a\nb",
        "password: abc123",
        "my API key is short",
        "sk-example",
        "Bearer value",
        "мой пароль qwerty",
        "AbCdEf0123456789AbCdEf0123456789AbCdEf0123",
    ] {
        assert!(
            s.create_memory(input(Scope::global(), value)).is_err(),
            "Accepted sensitive or malformed fixture"
        );
    }
    assert!(s
        .create_memory(input(Scope::global(), &"a".repeat(501)))
        .is_err());
    assert!(s
        .create_memory(input(Scope::goal(9999), "A useful fact"))
        .is_err());
    assert!(serde_json::from_value::<MemoryInput>(serde_json::json!({"memory_type":"explicit_fact","scope":{"scope_type":"global","scope_id":null},"content":"Fact","confidence":1})).is_err());
    assert!(s
        .list_memories(MemoryQuery {
            limit: 1000,
            ..Default::default()
        })
        .is_err());
    assert!(s.list_memories(Default::default()).unwrap().is_empty());
}
#[test]
fn stale_edits_do_not_overwrite_memory_or_checkpoint() {
    let mut s = store();
    let item = s
        .create_memory(input(Scope::global(), "I live in Haifa"))
        .unwrap();
    s.update_memory(
        item.id,
        MemoryUpdate {
            content: "I live in Tel Aviv".into(),
            expected_updated_at: item.updated_at.clone(),
        },
    )
    .unwrap();
    assert!(s
        .update_memory(
            item.id,
            MemoryUpdate {
                content: "Stale correction".into(),
                expected_updated_at: item.updated_at
            }
        )
        .is_err());
    assert_eq!(
        s.memory(item.id, false).unwrap().content,
        "I live in Tel Aviv"
    );
    let id = goal(&mut s, "Report");
    let checkpoint = s.save_work_context(context(id), None).unwrap();
    s.save_work_context(context(id), Some(checkpoint.updated_at.clone()))
        .unwrap();
    assert!(s
        .save_work_context(context(id), Some(checkpoint.updated_at))
        .is_err());
}
#[test]
fn confirmed_completions_create_static_episodes_and_update_checkpoint() {
    let mut s = store();
    let id = goal(&mut s, "Private report title");
    s.save_work_context(context(id), None).unwrap();
    let mut plan = s.goal_plan(id).unwrap();
    plan.steps[0].done = true;
    s.core_save_goal("Private report title", "Work", plan)
        .unwrap();
    let items = list(&s, Scope::goal(id));
    assert!(items
        .iter()
        .any(|m| m.event_kind == Some(EventKind::StepCompleted)));
    assert!(items
        .iter()
        .any(|m| m.event_kind == Some(EventKind::GoalCompleted)));
    assert!(items.iter().all(|m| !m.content.contains("Private report")));
    assert_eq!(
        s.work_context(id).unwrap().unwrap().context.status,
        ContextStatus::Completed
    );
}
#[test]
fn start_park_resume_and_waiting_events_reuse_existing_lifecycle() {
    let mut s = store();
    let id = goal(&mut s, "Report");
    s.core_today(id, true, &chrono::Local::now().date_naive().to_string())
        .unwrap();
    s.transition_goal(id, "resume").unwrap();
    assert!(s.work_context(id).unwrap().is_some());
    s.core_transition(id, "defer").unwrap();
    s.core_transition(id, "resume").unwrap();
    let old = s.work_context(id).unwrap().unwrap();
    let mut waiting = context(id);
    waiting.status = ContextStatus::Waiting;
    waiting.waiting_for = Some("Reviewer approval".into());
    s.save_work_context(waiting, Some(old.updated_at)).unwrap();
    let kinds: Vec<_> = list(&s, Scope::goal(id))
        .into_iter()
        .filter_map(|m| m.event_kind)
        .collect();
    for kind in [
        EventKind::GoalStarted,
        EventKind::GoalParked,
        EventKind::GoalResumed,
        EventKind::WaitingState,
    ] {
        assert!(kinds.contains(&kind));
    }
}
#[test]
fn activity_ticks_do_not_create_memory_or_copy_window_text() {
    let mut s = store();
    let id = goal(&mut s, "Report");
    let before = s.list_memories(Default::default()).unwrap().len();
    for _ in 0..10 {
        s.activity(
            id,
            &crate::models::ActivitySnapshot {
                timestamp: Utc::now().to_rfc3339(),
                process_name: "Editor".into(),
                window_title: "Sensitive complete window content".into(),
                ..Default::default()
            },
        )
        .unwrap();
    }
    assert_eq!(s.list_memories(Default::default()).unwrap().len(), before);
    assert!(s.work_context(id).unwrap().is_none());
}
#[test]
fn safe_settings_are_remembered_once_and_forget_is_not_undone_by_identical_writes() {
    let mut s = store();
    s.write_setting("tracking_requested", &true).unwrap();
    let items = list(&s, Scope::global());
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].memory_type, MemoryType::ExplicitPreference);
    s.write_setting("tracking_requested", &true).unwrap();
    assert_eq!(list(&s, Scope::global()).len(), 1);
    s.forget_memory(items[0].id).unwrap();
    s.write_setting("tracking_requested", &true).unwrap();
    assert!(list(&s, Scope::global()).is_empty());
    s.write_setting("tracking_requested", &false).unwrap();
    assert_eq!(list(&s, Scope::global()).len(), 1);
    s.write_setting("unsupported_settings", &"Unreviewed context")
        .unwrap();
    assert_eq!(list(&s, Scope::global()).len(), 1);
}
#[test]
fn feedback_creates_meaningful_events_without_snippets_and_repeated_rating_is_deduplicated() {
    let mut s = store();
    let id = goal(&mut s, "Report");
    let recommendation = s
        .record_recommendation(
            id,
            "Sensitive source title",
            "https://example.com",
            "Full private snippet",
        )
        .unwrap();
    s.rate_recommendation(recommendation, Some(true)).unwrap();
    s.rate_recommendation(recommendation, Some(true)).unwrap();
    let items = list(&s, Scope::goal(id));
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].event_kind, Some(EventKind::ResearchAccepted));
    assert!(!items[0].content.contains("private"));
    s.rate_recommendation(recommendation, Some(false)).unwrap();
    assert_eq!(list(&s, Scope::goal(id)).len(), 2);
}
#[test]
fn withdrawing_evidence_archives_inference_and_prevents_unverified_unarchive() {
    let mut s = store();
    let mut last = None;
    let mut episodes = vec![];
    for (key, day) in [
        ("one", "2026-10-10"),
        ("two", "2026-10-10"),
        ("three", "2026-10-11"),
    ] {
        let id = evidence(&s, key, day);
        episodes.push(id);
        last = s.observe_inference(proposal(), id, 0.9).unwrap();
    }
    let inferred = last.unwrap();
    s.forget_memory(episodes[0]).unwrap();
    assert!(s.memory(inferred.id, false).unwrap().archived);
    assert!(s.archive_memory(inferred.id, false).is_err());
}
#[test]
fn explicit_correction_of_inference_becomes_user_fact_and_records_correction() {
    let mut s = store();
    let mut last = None;
    for (key, day) in [
        ("one", "2026-10-10"),
        ("two", "2026-10-10"),
        ("three", "2026-10-11"),
    ] {
        let id = evidence(&s, key, day);
        last = s.observe_inference(proposal(), id, 0.9).unwrap();
    }
    let inferred = last.unwrap();
    let edited = s
        .update_memory(
            inferred.id,
            MemoryUpdate {
                content: "I prefer concise official documentation".into(),
                expected_updated_at: inferred.updated_at,
            },
        )
        .unwrap();
    assert_eq!(edited.memory_type, MemoryType::ExplicitPreference);
    assert_eq!(edited.source, "user");
    assert_eq!(edited.evidence_count, 1);
    assert_eq!(edited.confidence, 1.0);
    assert!(list(&s, Scope::global())
        .iter()
        .any(|m| m.event_kind == Some(EventKind::MeaningfulCorrection)));
}
#[test]
fn history_retention_clears_episodes_but_keeps_pinned_and_explicit_memories_until_full_clear() {
    let mut s = store();
    let fact = s
        .create_memory(input(Scope::global(), "I prefer morning work"))
        .unwrap();
    let old = evidence(&s, "old", "2020-01-01");
    let pinned = evidence(&s, "pinned", "2020-01-01");
    s.pin_memory(pinned, true).unwrap();
    s.purge_history(Some("2026-10-01T00:00:00Z")).unwrap();
    assert!(s.memory(old, false).is_err());
    assert!(s.memory(fact.id, false).is_ok());
    assert!(s.memory(pinned, false).is_ok());
    s.purge_history(None).unwrap();
    assert!(s
        .list_memories(MemoryQuery {
            include_archived: true,
            ..Default::default()
        })
        .unwrap()
        .is_empty());
}
#[test]
fn goal_and_conversation_deletion_cascade_their_memories_without_id_reuse_leaks() {
    let mut s = store();
    let id = goal(&mut s, "Original");
    let item = s
        .create_memory(input(Scope::goal(id), "Original context"))
        .unwrap();
    s.save_work_context(context(id), None).unwrap();
    s.core_transition(id, "delete").unwrap();
    assert!(s.memory(item.id, false).is_err());
    let replacement = goal(&mut s, "Replacement");
    assert_eq!(replacement, id);
    assert!(list(&s, Scope::goal(replacement)).is_empty());
    assert!(s.work_context(replacement).unwrap().is_none());
    let c = s.current_conversation().unwrap();
    let chat = s
        .create_memory(input(
            Scope {
                scope_type: ScopeType::Conversation,
                scope_id: Some(c),
            },
            "A chat specific fact",
        ))
        .unwrap();
    s.delete_conversation(c).unwrap();
    assert!(s.memory(chat.id, false).is_err());
}
#[test]
fn deleted_or_completed_step_cannot_be_saved_as_active_context() {
    let mut s = store();
    let id = goal(&mut s, "Report");
    let old = s.save_work_context(context(id), None).unwrap();
    let mut plan = s.goal_plan(id).unwrap();
    plan.steps.clear();
    s.core_save_goal("Report", "Work", plan).unwrap();
    let changed = s.work_context(id).unwrap().unwrap();
    assert!(changed.context.step_id.is_none());
    assert_eq!(changed.context.status, ContextStatus::Paused);
    assert!(s
        .save_work_context(context(id), Some(old.updated_at))
        .is_err());
}
#[test]
fn working_memory_is_transient_and_does_not_store_window_text() {
    let mut s = store();
    let id = goal(&mut s, "Report");
    s.core_today(id, true, &chrono::Local::now().date_naive().to_string())
        .unwrap();
    let state = AppState::new(s).unwrap();
    let mut inner = state.inner.lock().unwrap();
    let before = inner
        .storage
        .list_memories(Default::default())
        .unwrap()
        .len();
    inner.status.tracking = true;
    inner.buddy.foreground = Some(crate::models::ActivitySnapshot {
        process_name: "Editor".into(),
        window_title: "Full confidential window text".into(),
        ..Default::default()
    });
    let working = working_memory(&inner).unwrap();
    assert_eq!(working.current_app.as_deref(), Some("Editor"));
    assert!(!serde_json::to_string(&working)
        .unwrap()
        .contains("confidential"));
    assert_eq!(
        inner
            .storage
            .list_memories(Default::default())
            .unwrap()
            .len(),
        before
    );
}

#[test]
fn migration_failure_rolls_back_without_replacing_existing_data() {
    let s = store();
    s.connection
        .execute("UPDATE personal_memory_migrations SET version=99", [])
        .unwrap();
    assert!(s.initialize_personal_memory().is_err());
    assert_eq!(
        s.connection
            .query_row("SELECT version FROM personal_memory_migrations", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap(),
        99
    );
}

#[test]
fn default_preferences_are_not_reclassified_as_explicit_user_choices() {
    let s = store();
    let mut prefs = crate::goal_analysis::AiPreferences::default();
    prefs.enabled = false;
    s.write_setting("ai_assistance_preferences", &prefs)
        .unwrap();
    let items = list(&s, Scope::global());
    assert_eq!(items.len(), 1);
    assert_eq!(
        items[0].content,
        "ai_assistance_preferences.enabled = false"
    );
}

#[test]
fn failed_episode_write_rolls_back_checkpoint_and_memory_correction() {
    let mut s = store();
    let id = goal(&mut s, "Report");
    let item = s
        .create_memory(input(Scope::global(), "Original fact"))
        .unwrap();
    s.connection.execute_batch("CREATE TRIGGER test_episode_failure BEFORE INSERT ON memories WHEN NEW.memory_type='episodic' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;").unwrap();
    let mut checkpoint = context(id);
    checkpoint.status = ContextStatus::Waiting;
    checkpoint.waiting_for = Some("Review".into());
    assert!(s.save_work_context(checkpoint, None).is_err());
    assert!(s.work_context(id).unwrap().is_none());
    assert!(s
        .update_memory(
            item.id,
            MemoryUpdate {
                content: "Changed fact".into(),
                expected_updated_at: item.updated_at
            }
        )
        .is_err());
    assert_eq!(s.memory(item.id, false).unwrap().content, "Original fact");
}

#[test]
fn pinned_scoped_memories_protect_their_owner_from_automatic_retention() {
    let mut s = store();
    let id = goal(&mut s, "Report");
    s.core_transition(id, "complete").unwrap();
    let item = s
        .create_memory(input(Scope::goal(id), "Keep this reference"))
        .unwrap();
    s.pin_memory(item.id, true).unwrap();
    s.connection
        .execute(
            "UPDATE goals SET created_at='2020-01-01T00:00:00Z' WHERE id=?1",
            [id],
        )
        .unwrap();
    let c = s.current_conversation().unwrap();
    s.connection
        .execute(
            "UPDATE buddy_conversations SET updated_at='2020-01-01T00:00:00Z' WHERE id=?1",
            [c],
        )
        .unwrap();
    let chat = s
        .create_memory(input(
            Scope {
                scope_type: ScopeType::Conversation,
                scope_id: Some(c),
            },
            "Keep this conversation reference",
        ))
        .unwrap();
    s.pin_memory(chat.id, true).unwrap();
    s.purge_history(Some("2026-10-01T00:00:00Z")).unwrap();
    assert!(s.memory(item.id, false).is_ok());
    assert!(s.memory(chat.id, false).is_ok());
    assert!(s.conversation_exists(c));
}

#[test]
fn checkpoint_cannot_claim_completion_or_active_work_on_a_parked_goal() {
    let mut s = store();
    let id = goal(&mut s, "Report");
    let mut draft = context(id);
    draft.status = ContextStatus::Completed;
    draft.step_id = None;
    assert!(s.save_work_context(draft, None).is_err());
    s.core_transition(id, "defer").unwrap();
    assert!(s.save_work_context(context(id), None).is_err());
}

#[test]
fn behavioral_pattern_has_evidence_threshold_and_unarchive_recounts_support() {
    let mut s = store();
    let mut candidate = proposal();
    candidate.memory_type = MemoryType::BehavioralPattern;
    let mut result = None;
    let mut episodes = vec![];
    for (key, day) in [
        ("one", "2026-10-10"),
        ("two", "2026-10-10"),
        ("three", "2026-10-11"),
        ("four", "2026-10-11"),
    ] {
        let id = evidence(&s, key, day);
        episodes.push(id);
        result = s.observe_inference(candidate.clone(), id, 0.9).unwrap();
        if episodes.len() < 3 {
            assert!(result.is_none());
        }
    }
    let pattern = result.unwrap();
    assert_eq!(pattern.memory_type, MemoryType::BehavioralPattern);
    assert_eq!(pattern.evidence_count, 4);
    s.forget_memory(episodes[0]).unwrap();
    assert!(s.memory(pattern.id, false).unwrap().archived);
    let restored = s.archive_memory(pattern.id, false).unwrap();
    assert_eq!(restored.evidence_count, 3);
    assert!(!restored.archived);
}
