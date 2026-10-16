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
            steps: vec!["Draft proposal".into()],
        }],
        &format!("coaching-{}", Utc::now().timestamp_nanos_opt().unwrap()),
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
fn chat(s: &Storage) -> i64 {
    s.connection
        .query_row("SELECT MIN(id) FROM buddy_conversations", [], |r| r.get(0))
        .unwrap()
}
fn start(s: &Storage, goal: i64, step: Option<&str>, key: &str) -> Start {
    Start {
        request_id: key.into(),
        goal_id: goal,
        step_id: step.map(str::to_owned),
        conversation_id: chat(s),
        expected_target_revision: s.coaching_target(goal, step).unwrap().revision,
        strategy_id: "tiny_habits".into(),
        strategy_version: 1,
    }
}
fn fixture() -> (Storage, Session) {
    let mut s = store();
    let id = goal(&mut s, "Proposal fixture");
    let session = s
        .start_coaching(&start(&s, id, Some("step-0"), "start"))
        .unwrap();
    (s, session)
}
fn respond(s: &Storage, session: &Session, reply: Reply) -> Session {
    s.reply_coaching(
        session.id,
        session.conversation_id,
        session.revision,
        &format!("reply-{}", session.revision),
        &Control::Reply {
            reply: reply.into(),
        },
    )
    .unwrap()
}
fn action(s: &Storage, session: &Session) -> Session {
    s.propose_coaching_action(
        session.id,
        session.conversation_id,
        session.revision,
        &format!("proposal-{}", session.revision),
        &MicroAction {
            title: "Open the draft document".into(),
            estimated_seconds: 20,
        },
    )
    .unwrap()
}
fn feasibility(s: &Storage, session: &Session) -> Session {
    let session = respond(s, session, Reply::Ready { ready: true });
    let session = respond(
        s,
        &session,
        Reply::Barrier {
            barrier: Barrier::Overwhelm,
        },
    );
    action(s, &session)
}
fn execution(s: &Storage, session: &Session) -> Session {
    let session = respond(s, session, Reply::Ease { score: 9 });
    let session = respond(s, &session, Reply::Anchor { anchor: None });
    respond(s, &session, Reply::Commit { accepted: true })
}
fn finish(s: &Storage, session: &Session, remember: bool) -> Session {
    let session = feasibility(s, session);
    let session = execution(s, &session);
    respond(
        s,
        &session,
        Reply::Report {
            completed: true,
            remember,
        },
    )
}
fn count(s: &Storage, table: &str) -> i64 {
    s.connection
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

#[test]
fn complete_micro_action_never_completes_parent_or_starts_timer() {
    let (s, session) = fixture();
    let before = s.goal_plan(session.goal_id).unwrap();
    let done = finish(&s, &session, false);
    assert_eq!(done.outcome, Some(Outcome::ActionCompleted));
    assert_eq!(done.status, Status::Completed);
    let data: TinyState = serde_json::from_value(done.data).unwrap();
    assert!(data.micro_action_completed);
    assert_eq!(data.completion_source.as_deref(), Some("user_report"));
    assert_eq!(data.attempt_count, 1);
    assert_eq!(json!(s.goal_plan(session.goal_id).unwrap()), json!(before));
    assert!(s.coaching_target(session.goal_id, Some("step-0")).is_ok());
    assert!(s.core_timer().unwrap().is_none());
    assert_eq!(count(&s, "memories"), 0);
}

#[test]
fn start_and_replies_are_idempotent_but_request_id_reuse_is_rejected() {
    let (s, session) = fixture();
    let input = start(&s, session.goal_id, Some("step-0"), "start");
    assert_eq!(s.start_coaching(&input).unwrap(), session);
    let ready = respond(&s, &session, Reply::Ready { ready: true });
    assert_eq!(respond(&s, &session, Reply::Ready { ready: true }), ready);
    assert_eq!(count(&s, "coaching_requests"), 2);
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            0,
            "reply-0",
            &Control::Stop
        )
        .is_err());
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            0,
            "different-request",
            &Control::Stop
        )
        .is_err());
}

#[test]
fn duplicate_completion_writes_one_user_report_and_no_inference() {
    let (s, session) = fixture();
    let session = feasibility(&s, &session);
    let session = execution(&s, &session);
    let done = respond(
        &s,
        &session,
        Reply::Report {
            completed: true,
            remember: true,
        },
    );
    assert_eq!(
        respond(
            &s,
            &session,
            Reply::Report {
                completed: true,
                remember: true
            }
        ),
        done
    );
    assert_eq!(count(&s, "memories"), 1);
    let fact = s
        .list_memories(memory::MemoryQuery::default())
        .unwrap()
        .remove(0);
    assert_eq!(fact.memory_type, memory::MemoryType::ExplicitFact);
    assert_eq!(fact.scope, memory::Scope::goal(session.goal_id));
    assert!(fact.content.contains("User reported"));
    assert!(fact.content.contains("does not confirm goal"));
}

#[test]
fn invalid_steps_and_invalid_session_operations_leave_no_records() {
    let (s, session) = fixture();
    let requests = count(&s, "coaching_requests");
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            0,
            "bad-step",
            &Control::Reply {
                reply: Reply::Report {
                    completed: true,
                    remember: true
                }
                .into()
            }
        )
        .is_err());
    assert!(s
        .propose_coaching_action(
            session.id,
            session.conversation_id,
            0,
            "bad-proposal",
            &MicroAction {
                title: "Open draft".into(),
                estimated_seconds: 20
            }
        )
        .is_err());
    assert_eq!(
        s.coaching_session(session.id, session.conversation_id)
            .unwrap(),
        session
    );
    assert_eq!(count(&s, "coaching_requests"), requests);
}

#[test]
fn external_blocker_ends_coaching_without_motivational_loop() {
    let (s, session) = fixture();
    let session = respond(&s, &session, Reply::Ready { ready: true });
    let blocked = respond(
        &s,
        &session,
        Reply::Barrier {
            barrier: Barrier::ExternalDependency,
        },
    );
    assert_eq!(blocked.status, Status::Blocked);
    assert_eq!(blocked.outcome, Some(Outcome::Blocked));
    assert!(s
        .reply_coaching(
            blocked.id,
            blocked.conversation_id,
            blocked.revision,
            "after-blocked",
            &Control::Resume
        )
        .is_err());
    assert_eq!(count(&s, "memories"), 0);
}

#[test]
fn refusal_and_stop_are_terminal_and_pause_can_resume() {
    let (s, session) = fixture();
    let paused = respond(&s, &session, Reply::Ready { ready: false });
    assert_eq!(paused.status, Status::Paused);
    let resumed = s
        .reply_coaching(
            paused.id,
            paused.conversation_id,
            paused.revision,
            "resume",
            &Control::Resume,
        )
        .unwrap();
    assert_eq!(resumed.step, "readiness");
    let stopped = s
        .reply_coaching(
            resumed.id,
            resumed.conversation_id,
            resumed.revision,
            "stop",
            &Control::Stop,
        )
        .unwrap();
    assert_eq!(stopped.outcome, Some(Outcome::Declined));
    assert!(s
        .reply_coaching(
            stopped.id,
            stopped.conversation_id,
            stopped.revision,
            "resume-stopped",
            &Control::Resume
        )
        .is_err());
}

#[test]
fn commitment_refusal_stops_without_recording_success() {
    let (s, session) = fixture();
    let session = feasibility(&s, &session);
    let session = respond(&s, &session, Reply::Ease { score: 10 });
    let session = respond(
        &s,
        &session,
        Reply::Anchor {
            anchor: Some("After opening my laptop".into()),
        },
    );
    let declined = respond(&s, &session, Reply::Commit { accepted: false });
    assert_eq!(declined.status, Status::Declined);
    assert!(
        !serde_json::from_value::<TinyState>(declined.data)
            .unwrap()
            .micro_action_completed
    );
}

#[test]
fn two_revisions_limit_simplification() {
    let (s, session) = fixture();
    let mut session = feasibility(&s, &session);
    for _ in 0..2 {
        session = respond(&s, &session, Reply::Ease { score: 3 });
        assert_eq!(session.step, "tiny_action");
        session = action(&s, &session);
    }
    session = respond(&s, &session, Reply::Ease { score: 3 });
    assert_eq!(session.status, Status::Paused);
    assert_eq!(
        serde_json::from_value::<TinyState>(session.data)
            .unwrap()
            .revision_count,
        2
    );
}

#[test]
fn failed_execution_allows_only_two_attempts() {
    let (s, session) = fixture();
    let session = feasibility(&s, &session);
    let session = execution(&s, &session);
    let session = respond(
        &s,
        &session,
        Reply::Report {
            completed: false,
            remember: false,
        },
    );
    assert_eq!(session.step, "barrier");
    let session = respond(
        &s,
        &session,
        Reply::Barrier {
            barrier: Barrier::UnclearFirstStep,
        },
    );
    let session = action(&s, &session);
    let session = execution(&s, &session);
    let session = respond(
        &s,
        &session,
        Reply::Report {
            completed: false,
            remember: false,
        },
    );
    assert_eq!(session.status, Status::Paused);
    assert_eq!(
        serde_json::from_value::<TinyState>(session.data)
            .unwrap()
            .attempt_count,
        2
    );
}

#[test]
fn concurrent_replies_use_expected_revision() {
    let (s, session) = fixture();
    let first = respond(&s, &session, Reply::Ready { ready: true });
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            session.revision,
            "second-writer",
            &Control::Stop
        )
        .is_err());
    assert_eq!(
        s.coaching_session(session.id, session.conversation_id)
            .unwrap(),
        first
    );
}

#[test]
fn target_edit_and_reversal_invalidates_old_response_but_stop_still_works() {
    let (s, session) = fixture();
    s.connection
        .execute(
            "UPDATE goals SET text='Changed proposal' WHERE id=?1",
            [session.goal_id],
        )
        .unwrap();
    s.connection
        .execute(
            "UPDATE goals SET text='Proposal fixture' WHERE id=?1",
            [session.goal_id],
        )
        .unwrap();
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            0,
            "stale",
            &Control::Reply {
                reply: Reply::Ready { ready: true }.into()
            }
        )
        .is_err());
    assert!(s
        .build_coaching_context(session.id, session.conversation_id, true)
        .is_err());
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            0,
            "stop-stale",
            &Control::Stop
        )
        .is_ok());
}

#[test]
fn stale_session_is_invalidated_when_starting_with_current_target() {
    let (s, session) = fixture();
    s.connection
        .execute(
            "UPDATE core_goal_details SET description='New context' WHERE goal_id=?1",
            [session.goal_id],
        )
        .unwrap();
    // Core details may not exist until the user edits them.
    s.connection
        .execute(
            "UPDATE goals SET text='Updated proposal' WHERE id=?1",
            [session.goal_id],
        )
        .unwrap();
    let new = s
        .start_coaching(&start(&s, session.goal_id, Some("step-0"), "new-start"))
        .unwrap();
    assert_ne!(new.id, session.id);
    assert_eq!(
        s.coaching_session(session.id, session.conversation_id)
            .unwrap()
            .status,
        Status::Invalidated
    );
}

#[test]
fn target_and_conversation_identity_and_strategy_version_are_required() {
    let (mut s, session) = fixture();
    let other = goal(&mut s, "Another goal");
    assert!(s
        .start_coaching(&start(&s, other, None, "other-start"))
        .is_err());
    let mut input = start(&s, other, None, "bad-version");
    input.strategy_version = 99;
    assert!(s.start_coaching(&input).is_err());
    input.strategy_version = 1;
    input.conversation_id = 9999;
    assert!(s.start_coaching(&input).is_err());
    assert!(s.coaching_session(session.id, 9999).is_err());
    assert!(s
        .coaching_target(session.goal_id, Some("unknown-step"))
        .is_err());
}

#[test]
fn completed_goal_or_step_rejects_reply_and_new_session() {
    let (s, session) = fixture();
    s.connection
        .execute(
            "UPDATE goals SET status='completed' WHERE id=?1",
            [session.goal_id],
        )
        .unwrap();
    assert!(s.coaching_target(session.goal_id, None).is_err());
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            0,
            "completed-goal",
            &Control::Resume
        )
        .is_err());
    let mut input = Start {
        request_id: "completed-start".into(),
        goal_id: session.goal_id,
        step_id: None,
        conversation_id: session.conversation_id,
        expected_target_revision: 0,
        strategy_id: "tiny_habits".into(),
        strategy_version: 1,
    };
    assert!(s.start_coaching(&input).is_err());
    input.step_id = Some("step-0".into());
    s.connection
        .execute(
            "UPDATE goals SET status='deferred' WHERE id=?1",
            [session.goal_id],
        )
        .unwrap();
    let mut plan = s.goal_plan(session.goal_id).unwrap();
    plan.steps[0].done = true;
    s.connection
        .execute(
            "UPDATE goal_plans SET payload=?1,revision=revision+1 WHERE goal_id=?2",
            params![encode(&plan).unwrap(), session.goal_id],
        )
        .unwrap();
    assert!(s.coaching_target(session.goal_id, Some("step-0")).is_err());
}

#[test]
fn memory_controls_and_explicit_choice_gate_outcome_storage() {
    for disabled in ["enabled", "remember_work_context", "learn_from_feedback"] {
        let (s, session) = fixture();
        s.connection
            .execute(
                &format!("UPDATE memory_controls SET {disabled}=0 WHERE id=1"),
                [],
            )
            .unwrap();
        assert_eq!(finish(&s, &session, true).status, Status::Completed);
        assert_eq!(count(&s, "memories"), 0);
    }
    let (s, session) = fixture();
    finish(&s, &session, false);
    assert_eq!(count(&s, "memories"), 0);
}

#[test]
fn context_is_scoped_bounded_and_respects_sharing_and_memory_switch() {
    let (mut s, session) = fixture();
    let other = goal(&mut s, "Other private goal");
    for (scope, text) in [
        (memory::Scope::goal(other), "Other goal private fact"),
        (memory::Scope::goal(session.goal_id), "Use a short outline"),
    ] {
        s.create_memory(memory::MemoryInput {
            scope,
            memory_type: memory::MemoryType::ExplicitFact,
            content: text.into(),
        })
        .unwrap();
    }
    let context = s
        .build_coaching_context(session.id, session.conversation_id, true)
        .unwrap();
    let text = encode(&context).unwrap();
    assert!(!text.contains("Other goal private fact"));
    assert!(text.contains("Use a short outline"));
    assert!(text.len() < 8000);
    assert_eq!(
        s.build_coaching_context(session.id, session.conversation_id, false)
            .unwrap(),
        json!({"available":false})
    );
    let mut controls = s.memory_controls().unwrap();
    controls.enabled = false;
    s.set_memory_controls(&controls).unwrap();
    assert!(!encode(
        &s.build_coaching_context(session.id, session.conversation_id, true)
            .unwrap()
    )
    .unwrap()
    .contains("Use a short outline"));
}

#[test]
fn migration_is_idempotent_and_future_versions_are_rejected() {
    let (s, session) = fixture();
    s.initialize_coaching().unwrap();
    assert_eq!(
        s.coaching_session(session.id, session.conversation_id)
            .unwrap(),
        session
    );
    assert_eq!(count(&s, "coaching_migrations"), 1);
    assert_eq!(
        s.connection
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r
                .get::<_, i64>(
                0
            ))
            .unwrap(),
        0
    );
    s.connection
        .execute("INSERT INTO coaching_migrations VALUES(2,'2026-10-15')", [])
        .unwrap();
    assert!(s.initialize_coaching().is_err());
}

#[test]
fn sessions_and_idempotency_survive_restart_and_a_second_connection() {
    let path = std::env::temp_dir().join(format!(
        "buddy-coaching-{}-{}.sqlite",
        std::process::id(),
        Utc::now().timestamp_nanos_opt().unwrap()
    ));
    let mut s = Storage::open(&path).unwrap();
    let id = goal(&mut s, "Persisted proposal");
    let input = start(&s, id, None, "persistent-start");
    let session = s.start_coaching(&input).unwrap();
    let ready = respond(&s, &session, Reply::Ready { ready: true });
    drop(s);
    let s = Storage::open(&path).unwrap();
    assert_eq!(
        s.active_coaching(session.conversation_id).unwrap(),
        Some(ready.clone())
    );
    assert_eq!(
        s.coaching_session(session.id, session.conversation_id)
            .unwrap(),
        ready
    );
    assert_eq!(s.start_coaching(&input).unwrap(), session);
    let other = Storage::open(&path).unwrap();
    assert!(other
        .reply_coaching(
            session.id,
            session.conversation_id,
            0,
            "stale-connection",
            &Control::Stop
        )
        .is_err());
    assert_eq!(
        respond(&other, &session, Reply::Ready { ready: true }),
        ready
    );
    drop(other);
    drop(s);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn deleting_chat_or_goal_cascades_requests_and_remembered_report() {
    for table in ["goals", "buddy_conversations"] {
        let (s, session) = fixture();
        finish(&s, &session, true);
        let id = if table == "goals" {
            session.goal_id
        } else {
            session.conversation_id
        };
        s.connection
            .execute(&format!("DELETE FROM {table} WHERE id=?1"), [id])
            .unwrap();
        assert_eq!(count(&s, "coaching_sessions"), 0);
        assert_eq!(count(&s, "coaching_requests"), 0);
        assert_eq!(count(&s, "memories"), 0);
    }
}

#[test]
fn forgetting_a_report_erases_its_session_without_resurrecting_memory() {
    let (mut s, session) = fixture();
    finish(&s, &session, true);
    let id = s.list_memories(memory::MemoryQuery::default()).unwrap()[0].id;
    s.forget_memory(id).unwrap();
    assert_eq!(count(&s, "coaching_sessions"), 0);
    assert_eq!(count(&s, "coaching_requests"), 0);
    assert_eq!(count(&s, "memories"), 0);
}

#[test]
fn clear_and_scoped_forget_erase_workflow_state() {
    for mode in 0..4 {
        let (mut s, session) = fixture();
        match mode {
            0 => s.clear_personal_memory().unwrap(),
            1 => s
                .clear_memory_scope(&memory::Scope::goal(session.goal_id))
                .unwrap(),
            2 => s.forget_work_context(session.goal_id).unwrap(),
            _ => s
                .clear_memory_scope(&memory::Scope {
                    scope_type: memory::ScopeType::Conversation,
                    scope_id: Some(session.conversation_id),
                })
                .unwrap(),
        }
        assert_eq!(count(&s, "coaching_sessions"), 0);
        assert_eq!(count(&s, "coaching_requests"), 0);
    }
}

#[test]
fn retention_removes_only_old_workflows_and_clear_history_removes_all() {
    let (mut s, session) = fixture();
    finish(&s, &session, true);
    s.connection
        .execute(
            "UPDATE coaching_sessions SET updated_at='2000-01-01T00:00:00Z'",
            [],
        )
        .unwrap();
    s.purge_history(Some("2001-01-01T00:00:00Z")).unwrap();
    assert_eq!(count(&s, "coaching_sessions"), 0);
    assert_eq!(count(&s, "memories"), 0);
    let session = s
        .start_coaching(&start(&s, session.goal_id, None, "recent-start"))
        .unwrap();
    s.purge_history(Some("2001-01-01T00:00:00Z")).unwrap();
    assert!(s
        .coaching_session(session.id, session.conversation_id)
        .is_ok());
    s.purge_history(None).unwrap();
    assert_eq!(count(&s, "coaching_sessions"), 0);
    assert_eq!(count(&s, "coaching_requests"), 0);
}

#[test]
fn malformed_inputs_and_secret_like_actions_are_rejected_atomically() {
    assert!(serde_json::from_value::<Reply>(json!({"type":"report","completed":true,"remember":false,"suggested_next_state":"completed"})).is_err());
    let (s, session) = fixture();
    let session = feasibility(&s, &session);
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            session.revision,
            "score-zero",
            &Control::Reply {
                reply: Reply::Ease { score: 0 }.into()
            }
        )
        .is_err());
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            session.revision,
            "invalid key",
            &Control::Stop
        )
        .is_err());
    assert!(MicroAction {
        title: "api key: private".into(),
        estimated_seconds: 20
    }
    .validate()
    .is_err());
    assert!(MicroAction {
        title: "Write the entire proposal".into(),
        estimated_seconds: 120
    }
    .validate()
    .is_err());
    assert_eq!(
        s.coaching_session(session.id, session.conversation_id)
            .unwrap(),
        session
    );
}

#[test]
fn provider_proposal_cannot_report_completion_or_skip_feasibility() {
    let (s, session) = fixture();
    let session = respond(&s, &session, Reply::Ready { ready: true });
    let session = respond(
        &s,
        &session,
        Reply::Barrier {
            barrier: Barrier::Overwhelm,
        },
    );
    let proposed = action(&s, &session);
    assert_eq!(proposed.step, "feasibility");
    assert_eq!(proposed.status, Status::Active);
    assert!(s
        .reply_coaching(
            proposed.id,
            proposed.conversation_id,
            proposed.revision,
            "skip",
            &Control::Reply {
                reply: Reply::Report {
                    completed: true,
                    remember: false
                }
                .into()
            }
        )
        .is_err());
}

#[test]
fn transition_budget_does_not_prevent_stopping() {
    let (s, mut session) = fixture();
    for i in 0..64 {
        let control = if i % 2 == 0 {
            Control::Pause
        } else {
            Control::Resume
        };
        session = s
            .reply_coaching(
                session.id,
                session.conversation_id,
                session.revision,
                &format!("cycle-{i}"),
                &control,
            )
            .unwrap();
    }
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            session.revision,
            "over-budget",
            &Control::Reply {
                reply: Reply::Ready { ready: true }.into()
            }
        )
        .is_err());
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            session.revision,
            "stop-budget",
            &Control::Stop
        )
        .is_ok());
}

#[test]
fn outcome_memory_failure_rolls_back_session_and_request() {
    let (s, session) = fixture();
    let session = feasibility(&s, &session);
    let session = execution(&s, &session);
    let requests = count(&s, "coaching_requests");
    s.connection.execute_batch("CREATE TRIGGER fail_coaching_memory BEFORE INSERT ON memories BEGIN SELECT RAISE(ABORT,'Synthetic memory failure'); END;").unwrap();
    let reply = Control::Reply {
        reply: Reply::Report {
            completed: true,
            remember: true,
        }
        .into(),
    };
    assert!(s
        .reply_coaching(
            session.id,
            session.conversation_id,
            session.revision,
            "atomic-result",
            &reply
        )
        .is_err());
    assert_eq!(
        s.coaching_session(session.id, session.conversation_id)
            .unwrap(),
        session
    );
    assert_eq!(count(&s, "coaching_requests"), requests);
    assert_eq!(count(&s, "memories"), 0);
    s.connection
        .execute_batch("DROP TRIGGER fail_coaching_memory")
        .unwrap();
    assert_eq!(
        s.reply_coaching(
            session.id,
            session.conversation_id,
            session.revision,
            "atomic-result",
            &reply
        )
        .unwrap()
        .status,
        Status::Completed
    );
}

#[test]
fn pinned_report_survives_automatic_retention_until_explicit_clear() {
    let (mut s, session) = fixture();
    finish(&s, &session, true);
    let memory = s.list_memories(memory::MemoryQuery::default()).unwrap()[0].id;
    s.pin_memory(memory, true).unwrap();
    s.connection
        .execute(
            "UPDATE coaching_sessions SET updated_at='2000-01-01T00:00:00Z'",
            [],
        )
        .unwrap();
    s.connection
        .execute(
            "UPDATE buddy_conversations SET updated_at='2000-01-01T00:00:00Z'",
            [],
        )
        .unwrap();
    s.purge_history(Some("2001-01-01T00:00:00Z")).unwrap();
    assert_eq!(count(&s, "coaching_sessions"), 1);
    assert_eq!(count(&s, "memories"), 1);
    s.purge_history(None).unwrap();
    assert_eq!(count(&s, "coaching_sessions"), 0);
    assert_eq!(count(&s, "memories"), 0);
}

#[test]
fn stale_provider_and_unregistered_fields_cannot_advance_session() {
    let (s, session) = fixture();
    let session = respond(&s, &session, Reply::Ready { ready: true });
    let session = respond(
        &s,
        &session,
        Reply::Barrier {
            barrier: Barrier::Overwhelm,
        },
    );
    let requests = count(&s, "coaching_requests");
    assert!(s.propose_coaching(session.id,session.conversation_id,session.revision,"injected-state",&json!({"title":"Open document","estimated_seconds":20,"suggested_next_state":"completed"})).is_err());
    s.connection
        .execute(
            "UPDATE goal_plans SET revision=revision+1 WHERE goal_id=?1",
            [session.goal_id],
        )
        .unwrap();
    assert!(s
        .propose_coaching_action(
            session.id,
            session.conversation_id,
            session.revision,
            "stale-provider",
            &MicroAction {
                title: "Open document".into(),
                estimated_seconds: 20
            }
        )
        .is_err());
    assert_eq!(
        s.coaching_session(session.id, session.conversation_id)
            .unwrap(),
        session
    );
    assert_eq!(count(&s, "coaching_requests"), requests);
}

#[test]
fn two_conversations_cannot_coach_the_same_goal_concurrently() {
    let (s, session) = fixture();
    s.connection
        .execute(
            "INSERT INTO buddy_conversations(title,updated_at) VALUES('Other chat',?1)",
            [Utc::now().to_rfc3339()],
        )
        .unwrap();
    let other = s.connection.last_insert_rowid();
    let mut input = start(&s, session.goal_id, None, "other-conversation");
    input.conversation_id = other;
    assert!(s.start_coaching(&input).is_err());
    assert!(s.active_coaching(other).unwrap().is_none());
    assert_eq!(
        s.active_coaching(session.conversation_id).unwrap(),
        Some(session)
    );
}

#[test]
fn deleted_goal_id_reuse_cannot_accept_a_stale_start() {
    let (mut s, session) = fixture();
    let old = start(&s, session.goal_id, Some("step-0"), "old-start-retry");
    s.connection
        .execute("DELETE FROM goals WHERE id=?1", [session.goal_id])
        .unwrap();
    let replacement = goal(&mut s, "Replacement proposal");
    assert_eq!(replacement, session.goal_id);
    assert_ne!(
        s.coaching_target(replacement, Some("step-0"))
            .unwrap()
            .revision,
        old.expected_target_revision
    );
    assert!(s.start_coaching(&old).is_err());
    assert_eq!(count(&s, "coaching_sessions"), 0);
}
