use super::*;
use crate::{
    core::{GoalDetails, GoalDraft},
    memory::{ContextStatus, EventKind, MemoryInput, WorkContextInput},
};
fn store() -> Storage {
    Storage::open(std::path::Path::new(":memory:")).unwrap()
}
fn today() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, 13).unwrap()
}
fn now() -> DateTime<Utc> {
    "2026-10-13T12:00:00Z".parse().unwrap()
}
fn goal(s: &mut Storage, title: &str) -> i64 {
    s.core_add_goals(
        vec![GoalDraft {
            title: title.into(),
            area: "Work".into(),
            steps: vec!["Draft proposal".into(), "Send proposal".into()],
        }],
        &format!("fixture-{}", Utc::now().timestamp_nanos_opt().unwrap()),
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
fn checkpoint(s: &mut Storage, id: i64, status: ContextStatus, day: &str, summary: &str) {
    let old = s.work_context(id).unwrap().map(|c| c.updated_at);
    s.save_work_context_at(
        WorkContextInput {
            goal_id: id,
            step_id: Some("step-0".into()),
            summary: summary.into(),
            next_action: Some("Ask for review".into()),
            status,
            last_app: Some("Editor".into()),
            last_window: Some("Private window label".into()),
            waiting_for: Some("Design approval".into()),
        },
        old,
        format!("{day}T12:00:00Z").parse().unwrap(),
    )
    .unwrap();
}
fn event(s: &Storage, id: i64, step: &str, title: &str, kind: &str, day: &str, source: &str) {
    s.connection.execute("INSERT INTO core_events(goal_id,step_id,title,kind,day,created_at,completion_source) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![id,step,title,kind,day,format!("{day}T12:00:00Z"),source]).unwrap();
}
fn feedback(s: &Storage, scope: Scope, kind: EventKind, key: &str, day: &str) -> i64 {
    let id = s
        .record_memory_event(
            scope,
            kind,
            if matches!(
                kind,
                EventKind::ResearchAccepted | EventKind::ResearchRejected
            ) {
                "research_feedback"
            } else {
                "intervention_feedback"
            },
            Some(key),
        )
        .unwrap();
    s.connection
        .execute(
            "UPDATE memories SET created_at=?1,updated_at=?1 WHERE id=?2",
            params![format!("{day}T10:00:00Z"), id],
        )
        .unwrap();
    id
}
fn preference(s: &Storage, scope: Scope, text: &str) -> i64 {
    s.create_memory(MemoryInput {
        scope,
        memory_type: MemoryType::ExplicitPreference,
        content: text.into(),
    })
    .unwrap()
    .id
}
#[test]
fn acceptance_positive_feedback_reduces_cooldown_without_cross_goal_leaks() {
    let mut s = store();
    let id = goal(&mut s, "Feedback acceptance");
    let other = goal(&mut s, "Other feedback fixture");
    let first_day = (today() - Duration::days(1)).to_string();
    let second_day = today().to_string();
    for i in 0..3 {
        feedback(
            &s,
            Scope::goal(id),
            EventKind::InterventionRejected,
            &format!("acceptance-reject-{i}"),
            if i == 0 { &first_day } else { &second_day },
        );
    }
    let before = s
        .adaptive_policy(Some(id), now())
        .unwrap()
        .extra_cooldown_seconds;
    assert!(before > 0);
    feedback(
        &s,
        Scope::goal(other),
        EventKind::InterventionAccepted,
        "other-accept",
        &second_day,
    );
    assert_eq!(
        s.adaptive_policy(Some(id), now())
            .unwrap()
            .extra_cooldown_seconds,
        before
    );
    feedback(
        &s,
        Scope::goal(id),
        EventKind::InterventionAccepted,
        "acceptance-positive",
        &second_day,
    );
    let after = s
        .adaptive_policy(Some(id), now())
        .unwrap()
        .extra_cooldown_seconds;
    assert!(after < before);
    assert_eq!(
        s.adaptive_policy(Some(other), now())
            .unwrap()
            .extra_cooldown_seconds,
        0
    );
}

#[test]
fn new_day_remembers_context_without_inventing_completion() {
    let mut s = store();
    let id = goal(&mut s, "Hackathon");
    checkpoint(
        &mut s,
        id,
        ContextStatus::Waiting,
        "2026-10-12",
        "Outline reviewed",
    );
    let r = s
        .continuity_report(View::Priorities, None, today())
        .unwrap();
    assert_eq!(
        r.lanes[0]
            .checkpoint
            .as_ref()
            .unwrap()
            .next_action
            .as_deref(),
        Some("Ask for review")
    );
    assert!(r.lanes[0].completed.is_empty());
    assert!(r.render().contains("Outline reviewed"));
    assert!(!r.render().contains("Private window label"));
}
#[test]
fn yesterday_uses_historical_checkpoint_even_after_today_edit() {
    let mut s = store();
    let id = goal(&mut s, "Hackathon");
    event(
        &s,
        id,
        "step-0",
        "Draft proposal",
        "completed",
        "2026-10-12",
        "manual",
    );
    event(
        &s,
        id,
        "step-1",
        "Send proposal",
        "completed",
        "2026-10-13",
        "ai_suggested_user_confirmed",
    );
    checkpoint(
        &mut s,
        id,
        ContextStatus::Waiting,
        "2026-10-12",
        "Yesterday outline",
    );
    checkpoint(
        &mut s,
        id,
        ContextStatus::Waiting,
        "2026-10-13",
        "Today revision",
    );
    let r = s.continuity_report(View::Yesterday, None, today()).unwrap();
    assert_eq!(r.day, "2026-10-12");
    assert!(r.render().contains("Yesterday outline"));
    assert!(!r.render().contains("Today revision"));
    assert_eq!(r.lanes[0].completed.len(), 1);
    assert_eq!(r.lanes[0].completed[0].source, "manual");
    assert!(r.lanes[0].remaining.is_empty());
}
#[test]
fn waiting_items_are_scoped_and_completed_lanes_excluded() {
    let mut s = store();
    let a = goal(&mut s, "Waiting lane");
    let b = goal(&mut s, "Other lane");
    checkpoint(
        &mut s,
        a,
        ContextStatus::Waiting,
        "2026-10-12",
        "Needs review",
    );
    let r = s.continuity_report(View::Waiting, None, today()).unwrap();
    assert_eq!(r.lanes.len(), 1);
    assert_eq!(r.lanes[0].goal_id, a);
    assert_eq!(
        r.lanes[0]
            .checkpoint
            .as_ref()
            .unwrap()
            .waiting_for
            .as_deref(),
        Some("Design approval")
    );
    assert!(s
        .continuity_report(View::Waiting, Some(b), today())
        .unwrap()
        .lanes
        .is_empty());
}
#[test]
fn only_grounded_completion_with_provenance_and_reopen_handling() {
    let mut s = store();
    let id = goal(&mut s, "Build fixture");
    event(
        &s,
        id,
        "a",
        "Manual result",
        "completed",
        "2026-10-13",
        "manual",
    );
    event(
        &s,
        id,
        "b",
        "AI suggested result",
        "completed",
        "2026-10-13",
        "ai_suggested_user_confirmed",
    );
    event(
        &s,
        id,
        "c",
        "Withdrawn result",
        "completed",
        "2026-10-13",
        "manual",
    );
    event(
        &s,
        id,
        "c",
        "Withdrawn result",
        "reopened",
        "2026-10-13",
        "manual",
    );
    let r = s.continuity_report(View::EndOfDay, None, today()).unwrap();
    let text = r.render();
    assert_eq!(r.lanes[0].completed.len(), 2);
    assert!(text.contains("Completed (manual): Manual result"));
    assert!(text.contains("Completed (ai_suggested_user_confirmed): AI suggested result"));
    assert!(!text.contains("Withdrawn result"));
}
#[test]
fn no_fabricated_work_from_time_or_checkpoint_or_future_data() {
    let mut s = store();
    let id = goal(&mut s, "Fixture time lane");
    s.connection
        .execute(
            "INSERT INTO core_time(day,goal_id,seconds) VALUES('2026-10-13',?1,36000)",
            [id],
        )
        .unwrap();
    checkpoint(
        &mut s,
        id,
        ContextStatus::Active,
        "2026-10-13",
        "I think it is finished",
    );
    let r = s.continuity_report(View::EndOfDay, None, today()).unwrap();
    assert!(r.lanes[0].completed.is_empty());
    assert!(r.render().contains("not verified completions"));
    let previous = s.continuity_report(View::Yesterday, None, today()).unwrap();
    assert!(previous.lanes.is_empty());
    assert!(!r.render().contains("score"));
    assert_eq!(
        s.goal_plan(id)
            .unwrap()
            .steps
            .iter()
            .filter(|s| s.done)
            .count(),
        0
    );
}
#[test]
fn rejected_interventions_reduce_frequency_only_after_repeated_evidence() {
    let s = store();
    feedback(
        &s,
        Scope::global(),
        EventKind::InterventionRejected,
        "reject-one",
        "2026-10-11",
    );
    assert_eq!(
        s.adaptive_policy(None, now())
            .unwrap()
            .extra_cooldown_seconds,
        0
    );
    feedback(
        &s,
        Scope::global(),
        EventKind::InterventionRejected,
        "reject-two",
        "2026-10-11",
    );
    feedback(
        &s,
        Scope::global(),
        EventKind::InterventionRejected,
        "reject-three",
        "2026-10-12",
    );
    let p = s.adaptive_policy(None, now()).unwrap();
    assert_eq!(p.extra_cooldown_seconds, 2700);
    assert_eq!(p.evidence_days, 2);
    assert!(!s.adaptive_offer_allowed(None, false, now().timestamp(), now().timestamp() - 60));
    assert!(s.adaptive_offer_allowed(None, false, now().timestamp(), now().timestamp() - 3000));
    assert!(s
        .list_memories(MemoryQuery {
            memory_type: Some(MemoryType::BehavioralPattern),
            ..Default::default()
        })
        .unwrap()
        .is_empty());
}
#[test]
fn explicit_preference_wins_over_feedback_and_other_lane_isolated() {
    let mut s = store();
    let a = goal(&mut s, "Lane A");
    let b = goal(&mut s, "Lane B");
    for (key, day) in [
        ("one", "2026-10-11"),
        ("two", "2026-10-11"),
        ("three", "2026-10-12"),
    ] {
        feedback(
            &s,
            Scope::goal(a),
            EventKind::InterventionRejected,
            key,
            day,
        );
    }
    preference(&s, Scope::global(), "Offer proactive help");
    assert_eq!(
        s.adaptive_policy(Some(a), now())
            .unwrap()
            .extra_cooldown_seconds,
        0
    );
    preference(&s, Scope::goal(a), "Do not offer web research");
    assert!(!s.adaptive_policy(Some(a), now()).unwrap().research_allowed);
    assert!(s.adaptive_policy(Some(b), now()).unwrap().research_allowed);
    let mut controls = s.memory_controls().unwrap();
    controls.remember_preferences = false;
    s.set_memory_controls(&controls).unwrap();
    assert_eq!(
        s.adaptive_policy(Some(a), now())
            .unwrap()
            .extra_cooldown_seconds,
        2700
    );
    assert!(s.adaptive_policy(Some(a), now()).unwrap().research_allowed);
}
#[test]
fn stale_inferred_memory_archived_and_pinned_preserved() {
    let s = store();
    for (text, pin) in [("Stale pattern", false), ("Pinned pattern", true)] {
        s.connection.execute("INSERT INTO memories(memory_type,scope_type,content,confidence,source,evidence_count,created_at,updated_at,pinned) VALUES('behavioral_pattern','global',?1,0.9,'verified_events',3,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z',?2)",params![text,pin]).unwrap();
    }
    s.maintain_personal_memory(now()).unwrap();
    let all = s
        .list_memories(MemoryQuery {
            include_archived: true,
            ..Default::default()
        })
        .unwrap();
    assert!(
        all.iter()
            .find(|m| m.content == "Stale pattern")
            .unwrap()
            .archived
    );
    assert!(
        !all.iter()
            .find(|m| m.content == "Pinned pattern")
            .unwrap()
            .archived
    );
    s.maintain_personal_memory(now()).unwrap();
    assert_eq!(
        s.list_memories(MemoryQuery {
            include_archived: true,
            ..Default::default()
        })
        .unwrap()
        .len(),
        2
    );
}
#[test]
fn exact_duplicate_merging_preserves_pinned_and_scopes_and_evidence_counts() {
    let mut s = store();
    let id = goal(&mut s, "Scope lane");
    let text = "I prefer concise plans";
    let pinned = preference(&s, Scope::global(), text);
    s.connection
        .execute("UPDATE memories SET pinned=1 WHERE id=?1", [pinned])
        .unwrap();
    preference(&s, Scope::global(), text);
    preference(&s, Scope::global(), text);
    preference(&s, Scope::goal(id), text);
    s.maintain_personal_memory(now()).unwrap();
    let all = s
        .list_memories(MemoryQuery {
            memory_type: Some(MemoryType::ExplicitPreference),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(all.len(), 3);
    assert!(all.iter().any(|m| m.id == pinned && m.pinned));
    assert!(all.iter().all(|m| m.evidence_count == 1));
}
#[test]
fn restart_and_new_date_preserve_independent_lanes() {
    let path = std::env::temp_dir().join(format!(
        "buddy-continuity-{}.sqlite",
        Utc::now().timestamp_nanos_opt().unwrap()
    ));
    let (a, b);
    {
        let mut s = Storage::open(&path).unwrap();
        a = goal(&mut s, "Fixture A");
        b = goal(&mut s, "Fixture B");
        checkpoint(
            &mut s,
            a,
            ContextStatus::Paused,
            "2026-10-12",
            "A checkpoint",
        );
        checkpoint(
            &mut s,
            b,
            ContextStatus::Waiting,
            "2026-10-12",
            "B checkpoint",
        );
    }
    let s = Storage::open(&path).unwrap();
    let r = s.continuity_report(View::Yesterday, None, today()).unwrap();
    assert_eq!(r.lanes.len(), 2);
    assert!(r.render().contains("A checkpoint"));
    assert!(r.render().contains("B checkpoint"));
    let a_only = s
        .continuity_report(View::Remaining, Some(a), today())
        .unwrap();
    assert_eq!(a_only.lanes.len(), 1);
    assert!(!a_only.render().contains("B checkpoint"));
    assert_eq!(
        s.continuity_report(View::Waiting, Some(b), today())
            .unwrap()
            .lanes
            .len(),
        1
    );
    drop(s);
    std::fs::remove_file(path).unwrap();
}
#[test]
fn memory_controls_and_forget_clear_daily_context() {
    let mut s = store();
    let id = goal(&mut s, "Privacy lane");
    checkpoint(
        &mut s,
        id,
        ContextStatus::Waiting,
        "2026-10-12",
        "Saved fixture",
    );
    let mut c = s.memory_controls().unwrap();
    c.enabled = false;
    s.set_memory_controls(&c).unwrap();
    assert!(s.continuity_report(View::Yesterday, None, today()).is_err());
    assert_eq!(s.adaptive_policy(Some(id), now()).unwrap().rejected, 0);
    c.enabled = true;
    c.learn_from_feedback = false;
    s.set_memory_controls(&c).unwrap();
    assert_eq!(
        s.adaptive_policy(Some(id), now())
            .unwrap()
            .extra_cooldown_seconds,
        0
    );
    s.clear_memory_scope(&Scope::goal(id)).unwrap();
    assert_eq!(
        s.connection
            .query_row("SELECT COUNT(*) FROM continuity_checkpoints", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert!(s.goal_plan(id).is_ok());
}
#[test]
fn migration_backfills_only_known_day_and_keeps_old_completion_unclassified() {
    let mut s = store();
    let id = goal(&mut s, "Upgrade lane");
    checkpoint(
        &mut s,
        id,
        ContextStatus::Waiting,
        "2026-10-12",
        "Old checkpoint",
    );
    s.connection.execute_batch("DROP TRIGGER continuity_context_insert; DROP TRIGGER continuity_context_update; DROP TABLE continuity_checkpoints; ALTER TABLE core_events DROP COLUMN completion_source;").unwrap();
    s.connection.execute("INSERT INTO core_events(goal_id,step_id,title,kind,day,created_at) VALUES(?1,'old','Old result','completed','2026-10-12','2026-10-12T12:00:00Z')",[id]).unwrap();
    s.initialize_continuity().unwrap();
    s.initialize_continuity().unwrap();
    let r = s.continuity_report(View::Yesterday, None, today()).unwrap();
    assert_eq!(r.lanes[0].completed[0].source, "confirmed_unspecified");
    assert!(r.render().contains("Old checkpoint"));
    assert_eq!(
        s.connection
            .query_row("SELECT COUNT(*) FROM continuity_checkpoints", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
}
#[test]
fn pinned_preferences_and_explicit_priority_from_stored_facts() {
    let mut s = store();
    let low = goal(&mut s, "Low lane");
    let high = goal(&mut s, "High lane");
    s.core_save_goal_details(
        "High lane",
        "Work",
        s.goal_plan(high).unwrap(),
        Some(GoalDetails {
            priority: Some("high".into()),
            ..Default::default()
        }),
    )
    .unwrap();
    let p = preference(&s, Scope::global(), "I prefer concise plans");
    s.connection
        .execute("UPDATE memories SET pinned=1 WHERE id=?1", [p])
        .unwrap();
    let r = s
        .continuity_report(View::Priorities, None, today())
        .unwrap();
    assert_eq!(r.lanes[0].goal_id, high);
    assert!(r.lanes.iter().any(|l| l.goal_id == low));
    assert_eq!(r.pinned_preferences, vec!["I prefer concise plans"]);
}
#[test]
fn synthetic_example_and_context_budget() {
    let mut s = store();
    let id = goal(&mut s, "Hackathon fixture");
    let mut plan = s.goal_plan(id).unwrap();
    plan.steps[0].done = true;
    s.core_save_goal("Hackathon fixture", "Work", plan).unwrap();
    s.connection.execute("UPDATE core_events SET day='2026-10-13',created_at='2026-10-13T12:00:00Z' WHERE goal_id=?1",[id]).unwrap();
    let old = s.work_context(id).unwrap().map(|c| c.updated_at);
    s.save_work_context(
        WorkContextInput {
            goal_id: id,
            step_id: Some("step-1".into()),
            summary: "Outline reviewed; work parked".into(),
            next_action: Some("Send proposal after review".into()),
            status: ContextStatus::Waiting,
            last_app: None,
            last_window: None,
            waiting_for: Some("Design approval".into()),
        },
        old,
    )
    .unwrap();
    s.connection
        .execute(
            "UPDATE work_contexts SET updated_at='2026-10-13T12:00:00Z' WHERE goal_id=?1",
            [id],
        )
        .unwrap();
    let r = s.continuity_report(View::EndOfDay, None, today()).unwrap();
    println!("{}", r.render());
    assert!(r.render().len() <= 12000);
    for i in 0..14 {
        goal(&mut s, &format!("Fixture lane {i}"));
    }
    let r = s
        .continuity_report(View::Priorities, None, today())
        .unwrap();
    assert_eq!(r.lanes.len(), 12);
    assert_eq!(r.omitted_lanes, 3);
    assert!(r.render().len() <= 12000);
}
#[test]
fn feedback_learning_uses_research_corrections_and_resume_events() {
    let mut s = store();
    let id = goal(&mut s, "Learning lane");
    for (key, kind) in [
        ("accepted-research", EventKind::ResearchAccepted),
        ("rejected-research", EventKind::ResearchRejected),
        ("correction", EventKind::MeaningfulCorrection),
        ("resumed", EventKind::GoalResumed),
    ] {
        feedback(&s, Scope::goal(id), kind, key, "2026-10-12");
    }
    let p = s.adaptive_policy(Some(id), now()).unwrap();
    assert_eq!(
        (
            p.research_accepted,
            p.research_rejected,
            p.corrections,
            p.resumes
        ),
        (1, 1, 1, 1)
    );
    assert_eq!(p.extra_cooldown_seconds, 0);
    assert!(s.goal_plan(id).unwrap().steps.iter().all(|s| !s.done));
}

#[test]
fn day_start_includes_recent_confirmed_results_with_actual_dates() {
    let mut s = store();
    let id = goal(&mut s, "Recent lane");
    event(
        &s,
        id,
        "past",
        "Recent confirmed result",
        "completed",
        "2026-10-12",
        "manual",
    );
    event(
        &s,
        id,
        "old",
        "Old result",
        "completed",
        "2026-09-01",
        "manual",
    );
    let r = s
        .continuity_report(View::Priorities, None, today())
        .unwrap();
    assert_eq!(r.lanes[0].completed.len(), 1);
    assert_eq!(r.lanes[0].completed[0].day, "2026-10-12");
    assert!(r.render().contains("recorded 2026-10-12"));
    assert!(!r.render().contains("Old result"));
    event(
        &s,
        id,
        "past",
        "Recent confirmed result",
        "reopened",
        "2026-10-13",
        "manual",
    );
    assert!(s
        .continuity_report(View::Priorities, None, today())
        .unwrap()
        .lanes[0]
        .completed
        .is_empty());
}
#[test]
fn invalid_checkpoint_timestamp_never_creates_fabricated_daily_history() {
    let mut s = store();
    let id = goal(&mut s, "Invalid timestamp lane");
    checkpoint(
        &mut s,
        id,
        ContextStatus::Active,
        "2026-10-12",
        "Stored fixture",
    );
    let count: i64 = s
        .connection
        .query_row("SELECT COUNT(*) FROM continuity_checkpoints", [], |r| {
            r.get(0)
        })
        .unwrap();
    s.connection
        .execute(
            "UPDATE work_contexts SET updated_at='invalid-version' WHERE goal_id=?1",
            [id],
        )
        .unwrap();
    assert_eq!(
        s.connection
            .query_row("SELECT COUNT(*) FROM continuity_checkpoints", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        count
    );
}

#[test]
fn explicit_global_preference_precedes_goal_inference_in_retrieval() {
    let mut s = store();
    let id = goal(&mut s, "Preference lane");
    for (key, day) in [
        ("feedback-a", "2026-10-11"),
        ("feedback-b", "2026-10-11"),
        ("feedback-c", "2026-10-12"),
    ] {
        let episode = feedback(
            &s,
            Scope::goal(id),
            EventKind::InterventionRejected,
            key,
            day,
        );
        s.observe_inference(
            MemoryInput {
                memory_type: MemoryType::InferredPreference,
                scope: Scope::goal(id),
                content: "I prefer brief reminders".into(),
            },
            episode,
            0.9,
        )
        .unwrap();
    }
    let explicit = preference(&s, Scope::global(), "I prefer concise plans");
    let context = s
        .retrieve_contextual_memory(
            &crate::memory::retriever::RetrievalInput {
                exact_scope: Some(Scope::goal(id)),
                active_goal_id: Some(id),
                ..Default::default()
            },
            &crate::memory::retriever::MemoryBudget {
                maximum_memories: 8,
                ..Default::default()
            },
            true,
        )
        .unwrap();
    let items = context.context["memories"].as_array().unwrap();
    let explicit_position = items.iter().position(|m| m["id"] == explicit).unwrap();
    let inferred_position = items
        .iter()
        .position(|m| m["type"] == "inferred_preference")
        .unwrap();
    assert!(explicit_position < inferred_position);
}
#[test]
fn historical_context_follows_history_retention_and_clear_personal_memory() {
    let mut s = store();
    let id = goal(&mut s, "Retention lane");
    checkpoint(
        &mut s,
        id,
        ContextStatus::Waiting,
        "2026-10-11",
        "Historical fixture",
    );
    let cutoff = NaiveDate::from_ymd_opt(2026, 10, 12)
        .unwrap()
        .and_hms_opt(12, 0, 0)
        .unwrap()
        .and_local_timezone(chrono::Local)
        .single()
        .unwrap()
        .to_rfc3339();
    s.purge_history(Some(&cutoff)).unwrap();
    assert_eq!(
        s.connection
            .query_row(
                "SELECT COUNT(*) FROM continuity_checkpoints WHERE day='2026-10-11'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
        0
    );
    assert!(s.work_context(id).unwrap().is_some());
    s.clear_personal_memory().unwrap();
    assert_eq!(
        s.connection
            .query_row("SELECT COUNT(*) FROM continuity_checkpoints", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert!(s.goal_plan(id).is_ok());
}

#[test]
fn legacy_double_recorded_research_decline_counts_as_one_rejection() {
    let s = store();
    feedback(
        &s,
        Scope::global(),
        EventKind::ResearchRejected,
        "offer123-declined",
        "2026-10-12",
    );
    feedback(
        &s,
        Scope::global(),
        EventKind::InterventionRejected,
        "intervention-offer123-ignore",
        "2026-10-12",
    );
    let p = s.adaptive_policy(None, now()).unwrap();
    assert_eq!(p.research_rejected, 1);
    assert_eq!(p.rejected, 0);
    assert_eq!(p.extra_cooldown_seconds, 0);
    // Historical records remain visible; deduplication changes policy, never evidence provenance.
    assert_eq!(s.list_memories(Default::default()).unwrap().len(), 2);
}
