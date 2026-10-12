use super::*;
use crate::{core::GoalDraft, models::ActivitySnapshot};
fn db() -> Storage {
    Storage::open(std::path::Path::new(":memory:")).unwrap()
}
fn goal(s: &mut Storage, title: &str, with_step: bool) -> i64 {
    s.core_add_goals(
        vec![GoalDraft {
            title: title.into(),
            area: "Work".into(),
            steps: if with_step {
                vec!["Write outline".into(), "Review draft".into()]
            } else {
                vec![]
            },
        }],
        &format!("workflow-{}", Utc::now().timestamp_nanos_opt().unwrap()),
    )
    .unwrap();
    let id = s
        .core_snapshot(None)
        .unwrap()
        .goals
        .iter()
        .find(|g| g.title == title)
        .unwrap()
        .id;
    if with_step {
        let mut plan = s.goal_plan(id).unwrap();
        plan.current_step = Some("step-0".into());
        s.core_save_goal(title, "Work", plan).unwrap();
    }
    id
}
fn focus(s: &mut Storage, id: i64) {
    s.core_today(id, true, &Local::now().date_naive().to_string())
        .unwrap();
    if s.goal().unwrap().map(|g| g.id) != Some(id) {
        s.transition_goal(id, "resume").unwrap();
    }
}
fn draft(summary: &str, next: &str) -> CheckpointDraft {
    CheckpointDraft {
        summary: summary.into(),
        next_action: next.into(),
        waiting_for: None,
    }
}
fn input(id: i64) -> Value {
    json!({"goal":{"goal_id":id,"reference":null},"checkpoint":{"summary":"Outline started","next_action":"Finish the outline","waiting_for":null},"current_app":null})
}
fn execute(s: &mut Storage, name: &str, input: Value) -> Result<skills::Execution, String> {
    let c = s.current_conversation()?;
    let snap = skills::snapshot(s, c)?;
    let plan = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions: vec![skills::Action {
            name: name.into(),
            input,
            instruction: Some("Perform this work context action".into()),
        }],
        clarification: None,
    };
    skills::execute(
        s,
        &snap,
        &plan,
        "Perform this work context action",
        true,
        false,
    )
}
#[test]
fn park_active_goal_saves_step_and_stops_its_timer_without_claiming_completion() {
    let mut s = db();
    let id = goal(&mut s, "Hackathon", true);
    focus(&mut s, id);
    s.core_set_timer(Some(id)).unwrap();
    let context = s
        .park_work_context(
            id,
            draft("Outline started", "Finish outline"),
            Some("Editor".into()),
        )
        .unwrap();
    assert_eq!(context.context.step_id.as_deref(), Some("step-0"));
    assert_eq!(context.context.status, ContextStatus::Paused);
    assert!(context.parked_at.is_some());
    assert!(context.resumed_at.is_none());
    assert!(context.last_result.is_none());
    assert_eq!(context.context.last_app.as_deref(), Some("Editor"));
    assert!(context.context.last_window.is_none());
    assert!(s.core_timer().unwrap().is_none());
    assert!(s.goal().unwrap().is_none());
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].status, "deferred");
    assert!(!s.goal_plan(id).unwrap().steps[0].done);
}
#[test]
fn park_without_active_step_is_supported() {
    let mut s = db();
    let id = goal(&mut s, "Deloitte", false);
    let c = s
        .park_work_context(id, draft("Research not started", "Define the scope"), None)
        .unwrap();
    assert!(c.context.step_id.is_none());
    assert_eq!(c.context.next_action.as_deref(), Some("Define the scope"));
}
#[test]
fn resume_restores_context_focus_and_step_without_starting_a_timer() {
    let mut s = db();
    let a = goal(&mut s, "A", true);
    let b = goal(&mut s, "B", true);
    focus(&mut s, a);
    s.park_work_context(a, draft("A outline started", "Finish A outline"), None)
        .unwrap();
    focus(&mut s, b);
    let c = s.resume_work_context(a, true).unwrap();
    assert_eq!(c.context.summary, "A outline started");
    assert_eq!(c.context.status, ContextStatus::Active);
    assert!(c.resumed_at.is_some());
    assert_eq!(s.goal().unwrap().unwrap().id, a);
    assert!(s.core_timer().unwrap().is_none());
    assert_eq!(
        s.goal_plan(a).unwrap().current_step.as_deref(),
        Some("step-0")
    );
    assert!(s.core_snapshot(None).unwrap().today.contains(&a));
}
#[test]
fn restart_and_day_change_preserve_next_action_waiting_and_independent_lanes() {
    let path = std::env::temp_dir().join(format!(
        "buddy-workflow-{}.db",
        Utc::now().timestamp_nanos_opt().unwrap()
    ));
    let a;
    {
        let mut s = Storage::open(&path).unwrap();
        a = goal(&mut s, "Hackathon", true);
        let b = goal(&mut s, "Deloitte", true);
        let mut d = draft("Draft ready", "Send revision");
        d.waiting_for = Some("Reviewer feedback".into());
        s.park_work_context(a, d, None).unwrap();
        s.park_work_context(b, draft("B paused", "Continue B"), None)
            .unwrap();
        s.connection.execute("UPDATE work_contexts SET parked_at='2020-01-01T10:00:00Z',updated_at='2020-01-01T10:00:00Z' WHERE goal_id=?1",[a]).unwrap();
        s.connection
            .execute("DELETE FROM core_day_items", [])
            .unwrap();
    }
    {
        let mut s = Storage::open(&path).unwrap();
        let c = s.resume_work_context(a, true).unwrap();
        assert_eq!(c.context.next_action.as_deref(), Some("Send revision"));
        assert_eq!(c.context.waiting_for.as_deref(), Some("Reviewer feedback"));
        assert_eq!(c.context.status, ContextStatus::Waiting);
        assert!(s.core_snapshot(None).unwrap().today.contains(&a));
        let other = s
            .core_snapshot(None)
            .unwrap()
            .goals
            .into_iter()
            .find(|g| g.title == "Deloitte")
            .unwrap();
        assert_eq!(other.work_context.unwrap().context.summary, "B paused");
        assert_eq!(other.status, "deferred");
    }
    std::fs::remove_file(path).unwrap();
}
#[test]
fn six_parallel_contexts_are_isolated() {
    let mut s = db();
    let mut ids = Vec::new();
    for i in 0..6 {
        let id = goal(&mut s, &format!("Project {i}"), true);
        s.park_work_context(
            id,
            draft(&format!("Summary {i}"), &format!("Next action {i}")),
            None,
        )
        .unwrap();
        ids.push(id);
    }
    for (i, id) in ids.iter().enumerate() {
        let c = s.inspect_work_context(*id).unwrap().unwrap();
        assert_eq!(c.context.summary, format!("Summary {i}"));
        assert_eq!(c.context.next_action, Some(format!("Next action {i}")));
    }
    s.resume_work_context(ids[3], true).unwrap();
    for (i, id) in ids.iter().enumerate() {
        assert_eq!(
            s.work_context(*id).unwrap().unwrap().context.status,
            if i == 3 {
                ContextStatus::Active
            } else {
                ContextStatus::Paused
            }
        );
    }
}
#[test]
fn structured_skills_have_validated_inputs_results_and_active_reference() {
    let mut s = db();
    let id = goal(&mut s, "Hackathon", true);
    focus(&mut s, id);
    let mut args = input(id);
    args["goal"] = json!({"goal_id":null,"reference":"active_goal"});
    let parked = execute(&mut s, "park_context", args).unwrap();
    assert!(parked.fallback_message().contains("Parked"));
    assert_eq!(parked.results[0].goal_id, Some(id));
    let inspected = execute(
        &mut s,
        "inspect_work_context",
        json!({"goal":{"goal_id":id,"reference":null}}),
    )
    .unwrap();
    assert!(!inspected.committed_changes());
    assert_eq!(
        inspected.results[0].data["checkpoint"]["next_action"],
        "Finish the outline"
    );
    let resumed = execute(
        &mut s,
        "resume_context",
        json!({"goal":{"goal_id":id,"reference":null},"set_focus":true}),
    )
    .unwrap();
    assert!(resumed.fallback_message().contains("Resumed"));
    assert!(resumed.committed_changes());
    let mut bad = input(id);
    bad["checkpoint"]["raw_accessibility_text"] = json!("private text");
    assert!(execute(&mut s, "park_context", bad).is_err());
    assert!(execute(
        &mut s,
        "resume_context",
        json!({"goal":{"goal_id":id,"reference":null},"set_focus":"yes"})
    )
    .is_err());
}
#[test]
fn ambiguous_parked_goal_requires_clarification_and_named_id_is_exact() {
    let mut s = db();
    let a = goal(&mut s, "Hackathon", true);
    let b = goal(&mut s, "Deloitte", true);
    for id in [a, b] {
        s.park_work_context(id, draft("Paused", "Continue"), None)
            .unwrap();
    }
    let error = execute(
        &mut s,
        "resume_context",
        json!({"goal":{"goal_id":null,"reference":"only_parked"},"set_focus":true}),
    )
    .err()
    .unwrap();
    assert!(error.contains("Which parked goal"));
    assert!(s.goal().unwrap().is_none());
    execute(
        &mut s,
        "resume_context",
        json!({"goal":{"goal_id":b,"reference":null},"set_focus":true}),
    )
    .unwrap();
    assert_eq!(s.goal().unwrap().unwrap().id, b);
    assert_eq!(
        s.work_context(a).unwrap().unwrap().context.status,
        ContextStatus::Paused
    );
}
#[test]
fn inspect_does_not_resume_or_change_focus_and_resume_can_leave_focus_unchanged() {
    let mut s = db();
    let a = goal(&mut s, "A", true);
    let b = goal(&mut s, "B", true);
    s.park_work_context(a, draft("A paused", "Continue A"), None)
        .unwrap();
    focus(&mut s, b);
    let before = s.work_context(a).unwrap().unwrap().updated_at;
    let r = execute(
        &mut s,
        "inspect_work_context",
        json!({"goal":{"goal_id":a,"reference":null}}),
    )
    .unwrap();
    assert!(!r.committed_changes());
    assert_eq!(s.work_context(a).unwrap().unwrap().updated_at, before);
    assert_eq!(s.goal().unwrap().unwrap().id, b);
    s.resume_work_context(a, false).unwrap();
    assert_eq!(s.goal().unwrap().unwrap().id, b);
    assert_eq!(
        s.work_context(a).unwrap().unwrap().context.status,
        ContextStatus::Active
    );
}
#[test]
fn stale_state_invalidates_context_and_memory_permissions_changes() {
    let mut s = db();
    let id = goal(&mut s, "A", true);
    let c = s.current_conversation().unwrap();
    let snap = skills::snapshot(&s, c).unwrap();
    let plan = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions: vec![skills::Action {
            name: "park_context".into(),
            input: input(id),
            instruction: Some("Park this goal".into()),
        }],
        clarification: None,
    };
    s.park_work_context(
        id,
        draft("Different checkpoint", "Different next action"),
        None,
    )
    .unwrap();
    assert!(skills::execute(&mut s, &snap, &plan, "Park this goal", true, false).is_err());
    assert_eq!(
        s.work_context(id).unwrap().unwrap().context.summary,
        "Different checkpoint"
    );
    let snap = skills::snapshot(&s, c).unwrap();
    let plan = Plan {
        state_version: snap.version.clone(),
        ..plan
    };
    let mut controls = s.memory_controls().unwrap();
    controls.enabled = false;
    s.set_memory_controls(&controls).unwrap();
    assert!(skills::execute(&mut s, &snap, &plan, "Park this goal", true, false).is_err());
}
#[test]
fn invalid_sensitive_checkpoint_is_rejected_atomically() {
    let mut s = db();
    let id = goal(&mut s, "A", true);
    focus(&mut s, id);
    let old = s.work_context(id).unwrap();
    for summary in ["password=private-value", "Line one\nRaw screen line two"] {
        assert!(s
            .park_work_context(id, draft(summary, "Continue"), None)
            .is_err());
        assert_eq!(s.goal().unwrap().unwrap().id, id);
        assert_eq!(
            s.work_context(id).unwrap().map(|c| c.updated_at),
            old.as_ref().map(|c| c.updated_at.clone())
        );
    }
    assert!(serde_json::from_value::<CheckpointDraft>(json!({"summary":"Hi","next_action":"Continue","waiting_for":null,"raw_accessibility_text":"secret"})).is_err());
}
#[test]
fn current_window_text_never_enters_checkpoint_source_or_storage() {
    let mut s = db();
    let id = goal(&mut s, "A", true);
    focus(&mut s, id);
    let state = AppState::new(s).unwrap();
    let mut inner = state.inner.lock().unwrap();
    inner.status.tracking = true;
    inner.buddy.foreground = Some(ActivitySnapshot {
        process_name: "Editor".into(),
        window_title: "PRIVATE RAW WINDOW CONTENT".into(),
        idle_seconds: 0,
        timestamp: Utc::now().to_rfc3339(),
        ..ActivitySnapshot::default()
    });
    let (app, window) = foreground_metadata(&inner);
    let chat = inner.storage.current_conversation().unwrap();
    let source = inner
        .storage
        .workflow_source(id, chat, "Park this", app.clone(), window)
        .unwrap();
    assert_eq!(source["window_available"], true);
    assert!(!source.to_string().contains("PRIVATE RAW"));
    let saved = inner
        .storage
        .park_work_context(id, draft("Outline started", "Finish outline"), app)
        .unwrap();
    assert!(saved.context.last_window.is_none());
    assert!(!serde_json::to_string(&saved)
        .unwrap()
        .contains("PRIVATE RAW"));
}
#[test]
fn last_result_uses_only_confirmed_completion_and_waiting_survives_resume() {
    let mut s = db();
    let id = goal(&mut s, "A", true);
    let mut plan = s.goal_plan(id).unwrap();
    plan.steps[0].done = true;
    plan.current_step = Some("step-1".into());
    s.core_save_goal("A", "Work", plan).unwrap();
    let mut d = draft("Outline finished", "Review draft");
    d.waiting_for = Some("Reviewer approval".into());
    let saved = s.park_work_context(id, d, None).unwrap();
    assert_eq!(saved.last_result.as_deref(), Some("Write outline"));
    let resumed = s.resume_work_context(id, true).unwrap();
    assert_eq!(resumed.last_result, saved.last_result);
    assert_eq!(
        resumed.context.waiting_for.as_deref(),
        Some("Reviewer approval")
    );
    assert_eq!(resumed.context.status, ContextStatus::Waiting);
}
#[test]
fn missing_checkpoint_completed_goal_and_memory_off_do_not_mutate() {
    let mut s = db();
    let id = goal(&mut s, "A", true);
    assert!(s.resume_work_context(id, true).is_err());
    let mut controls = s.memory_controls().unwrap();
    controls.remember_work_context = false;
    s.set_memory_controls(&controls).unwrap();
    assert!(s.park_work_context(id, draft("Hi", "Next"), None).is_err());
    controls.remember_work_context = true;
    s.set_memory_controls(&controls).unwrap();
    s.core_transition(id, "complete").unwrap();
    assert!(s.park_work_context(id, draft("Hi", "Next"), None).is_err());
}
#[test]
fn park_batch_rejects_mutating_the_same_goal_before_checkpoint() {
    let mut s = db();
    let id = goal(&mut s, "A", true);
    let chat = s.current_conversation().unwrap();
    let snap = skills::snapshot(&s, chat).unwrap();
    let p = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions: vec![
            skills::Action {
                name: "rename_goal".into(),
                input: json!({"goal":{"goal_id":id,"reference":null},"title":"Changed"}),
                instruction: Some("Rename then park".into()),
            },
            skills::Action {
                name: "park_context".into(),
                input: input(id),
                instruction: Some("Rename then park".into()),
            },
        ],
        clarification: None,
    };
    assert!(skills::execute(&mut s, &snap, &p, "Rename then park", true, false).is_err());
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].title, "A");
}

#[test]
fn phase_three_database_migrates_without_losing_existing_checkpoint_or_history() {
    let mut s = Storage {
        connection: rusqlite::Connection::open_in_memory().unwrap(),
    };
    s.initialize().unwrap();
    s.initialize_tracking().unwrap();
    s.initialize_profile().unwrap();
    s.initialize_core().unwrap();
    s.initialize_skills().unwrap();
    s.connection.execute_batch("CREATE TABLE personal_memory_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);").unwrap();
    s.connection
        .execute_batch(include_str!("../memory/migrations/001_personal_memory.sql"))
        .unwrap();
    s.connection
        .execute_batch(include_str!("../memory/migrations/002_memory_controls.sql"))
        .unwrap();
    s.connection
        .execute(
            "INSERT INTO personal_memory_migrations VALUES(1,?1),(2,?1)",
            [Utc::now().to_rfc3339()],
        )
        .unwrap();
    let id = goal(&mut s, "Existing goal", true);
    s.connection.execute("INSERT INTO work_contexts(goal_id,step_id,summary,next_action,status,waiting_for,created_at,updated_at) VALUES(?1,'step-0','Existing saved outline','Finish outline','waiting','Reviewer',?2,?2)", params![id,Utc::now().to_rfc3339()]).unwrap();
    s.initialize_personal_memory().unwrap();
    s.initialize_personal_memory().unwrap();
    let context = s.work_context(id).unwrap().unwrap();
    assert_eq!(context.context.summary, "Existing saved outline");
    assert_eq!(
        context.context.next_action.as_deref(),
        Some("Finish outline")
    );
    assert_eq!(context.context.waiting_for.as_deref(), Some("Reviewer"));
    assert!(context.parked_at.is_some());
    assert!(context.resumed_at.is_none());
    assert!(context.last_result.is_none());
    assert_eq!(s.goal_plan(id).unwrap().steps.len(), 2);
    assert_eq!(
        s.connection
            .query_row("SELECT COUNT(*) FROM personal_memory_migrations", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        3
    );
}

#[test]
fn resume_restores_the_checkpoint_step_even_when_current_step_was_cleared() {
    let mut s = db();
    let id = goal(&mut s, "Hackathon", true);
    s.park_work_context(id, draft("Outline started", "Finish outline"), None)
        .unwrap();
    let mut plan = s.goal_plan(id).unwrap();
    plan.current_step = None;
    s.core_save_goal("Hackathon", "Work", plan).unwrap();
    let context = s.resume_work_context(id, true).unwrap();
    assert_eq!(context.context.step_id.as_deref(), Some("step-0"));
    assert_eq!(
        s.goal_plan(id).unwrap().current_step.as_deref(),
        Some("step-0")
    );
    assert!(s.core_timer().unwrap().is_none());
}
