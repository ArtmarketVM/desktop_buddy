use super::*;
fn store() -> Storage {
    Storage::open(std::path::Path::new(":memory:")).unwrap()
}
fn draft(title: &str, area: &str) -> GoalDraft {
    GoalDraft {
        title: title.into(),
        area: area.into(),
        steps: vec!["Review result".into()],
    }
}
#[test]
fn parallel_goals_and_today_are_persisted_without_replacing_the_legacy_focus() {
    let mut s = store();
    let legacy = s.set_goal("Original focus").unwrap();
    s.core_add_goals(
        vec![
            draft("Ship", "Work"),
            draft("Read", "Learning"),
            draft("Walk", "Personal"),
        ],
        "batch-1",
    )
    .unwrap();
    s.core_add_goals(vec![draft("Duplicate retry", "Work")], "batch-1")
        .unwrap();
    assert_eq!(s.goal().unwrap().unwrap().id, legacy.id);
    let snap = s.core_snapshot(None).unwrap();
    assert_eq!(snap.goals.len(), 4);
    let open: Vec<_> = snap
        .goals
        .iter()
        .filter(|g| g.status == "open")
        .map(|g| g.id)
        .collect();
    for id in &open[..3] {
        s.core_today(*id, true, &snap.date).unwrap();
    }
    assert!(s.core_today(open[3], true, &snap.date).is_err());
    s.core_plan_day(&snap.date, true).unwrap();
    assert!(s.core_snapshot(None).unwrap().today.is_empty());
    assert_eq!(s.core_snapshot(None).unwrap().day_mode, "no_plan");
    assert!(s.core_snapshot(Some("2025-02-30")).is_err());
}
#[test]
fn steps_use_revisions_and_do_not_complete_goals_automatically() {
    let mut s = store();
    s.core_add_goals(vec![draft("Plan", "Work")], "one")
        .unwrap();
    let snap = s.core_snapshot(None).unwrap();
    let g = &snap.goals[0];
    let mut plan = g.plan.clone();
    plan.steps[0].done = true;
    s.core_save_goal(&g.title, "Work", plan.clone()).unwrap();
    assert!(s.core_save_goal("Stale", "Work", plan).is_err());
    let snap = s.core_snapshot(None).unwrap();
    assert_eq!(snap.goals[0].status, "open");
    assert_eq!(snap.summary.completed, vec!["Review result"]);
    let mut plan = snap.goals[0].plan.clone();
    plan.steps[0].done = false;
    s.core_save_goal("Plan", "Work", plan).unwrap();
    assert!(s.core_snapshot(None).unwrap().summary.completed.is_empty());
    s.core_transition(g.id, "complete").unwrap();
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].status, "completed");
    s.core_transition(g.id, "resume").unwrap();
    assert!(s.core_snapshot(None).unwrap().summary.completed.is_empty());
    s.core_transition(g.id, "delete").unwrap();
    assert!(s.core_snapshot(None).unwrap().goals.is_empty());
}
#[test]
fn focus_timer_skips_sleep_and_restart_and_never_counts_another_goal() {
    let mut s = store();
    s.core_add_goals(vec![draft("Timer", "Work")], "timer")
        .unwrap();
    let id = s.core_snapshot(None).unwrap().goals[0].id;
    let now = Utc::now();
    s.write_setting(
        "core_timer",
        &Timer {
            goal_id: id,
            last_tick: now,
        },
    )
    .unwrap();
    s.core_tick_at(now + Duration::seconds(15)).unwrap();
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].focused_seconds, 15);
    s.core_tick_at(now + Duration::hours(2)).unwrap();
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].focused_seconds, 15);
    s.initialize_core().unwrap();
    assert!(s.core_timer().unwrap().is_none());
}
#[test]
fn import_validation_is_atomic_and_goal_deletion_handles_existing_foreign_keys() {
    let mut s = store();
    assert!(s
        .core_add_goals(vec![draft("Valid", "Work"), draft("", "Work")], "bad")
        .is_err());
    assert!(s.core_snapshot(None).unwrap().goals.is_empty());
    let goal = s.set_goal("Legacy").unwrap();
    s.core_snapshot(None).unwrap();
    let activity = crate::models::ActivitySnapshot {
        timestamp: Utc::now().to_rfc3339(),
        process_name: "fixture.exe".into(),
        window_title: "Fixture".into(),
        idle_seconds: 0,
        active_seconds: 1,
        window_id: None,
        browser: None,
        media_playing: false,
    };
    s.activity(goal.id, &activity).unwrap();
    s.core_transition(goal.id, "delete").unwrap();
    assert!(s.goal().unwrap().is_none());
}
#[test]
fn companion_plan_changes_share_revisions_and_progress_with_core_goals() {
    let mut s = store();
    let goal = s.set_goal("Shared goal").unwrap();
    s.core_snapshot(None).unwrap();
    let mut plan = s.goal_plan(goal.id).unwrap();
    plan.steps.push(Step {
        id: "buddy-fixture".into(),
        text: "Send the deck".into(),
        done: false,
    });
    s.save_goal_plan(&goal.text, plan).unwrap();
    let snapshot = s.core_snapshot(None).unwrap();
    let stale = snapshot.goals[0].plan.clone();
    let mut completed = stale.clone();
    completed.steps[0].done = true;
    s.save_goal_plan(&goal.text, completed).unwrap();
    assert_eq!(
        s.core_snapshot(None).unwrap().summary.completed,
        vec!["Send the deck"]
    );
    assert!(s.core_save_goal("Stale edit", "General", stale).is_err());
    s.core_set_timer(Some(goal.id)).unwrap();
    s.transition_goal(goal.id, "defer").unwrap();
    let snapshot = s.core_snapshot(None).unwrap();
    assert_eq!(snapshot.goals[0].status, "deferred");
    assert!(snapshot.timer.is_none());
    s.transition_goal(goal.id, "resume").unwrap();
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].status, "open");
}
#[test]
fn clear_history_keeps_parallel_goals_and_clears_progress_and_timer() {
    let mut s = store();
    s.core_add_goals(vec![draft("Keep me", "Work")], "keep")
        .unwrap();
    let goal = &s.core_snapshot(None).unwrap().goals[0];
    let now = Utc::now();
    s.write_setting(
        "core_timer",
        &Timer {
            goal_id: goal.id,
            last_tick: now,
        },
    )
    .unwrap();
    s.core_tick_at(now + Duration::milliseconds(2900)).unwrap();
    s.core_tick_at(now + Duration::milliseconds(5900)).unwrap();
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].focused_seconds, 5);
    s.purge_history(None).unwrap();
    let snapshot = s.core_snapshot(None).unwrap();
    assert_eq!(snapshot.goals.len(), 1);
    assert_eq!(snapshot.goals[0].focused_seconds, 0);
    assert!(snapshot.timer.is_none());
    assert!(snapshot.summary.completed.is_empty());
}
