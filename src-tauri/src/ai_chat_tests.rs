use super::*;
fn store() -> Storage {
    Storage::open(std::path::Path::new(":memory:")).unwrap()
}
#[test]
fn conversations_isolate_messages_and_delete_only_the_selected_history() {
    let mut storage = store();
    let first = storage.current_conversation().unwrap();
    let reply = ChatReply {
        message: "Answer".into(),
        resources: vec![],
        ..Default::default()
    };
    storage
        .save_chat_turn("First question", &reply, None)
        .unwrap();
    let second = storage.create_conversation().unwrap();
    assert_ne!(first, second);
    assert!(storage.chat_history().unwrap().is_empty());
    for _ in 0..60 {
        storage
            .save_chat_turn("Second question", &reply, None)
            .unwrap();
    }
    assert_eq!(storage.chat_history().unwrap().len(), 100);
    storage.select_conversation(first).unwrap();
    assert_eq!(storage.chat_history().unwrap()[0].text, "First question");
    assert_eq!(storage.chat_history().unwrap().len(), 2);
    storage.delete_conversation(first).unwrap();
    assert_eq!(storage.current_conversation().unwrap(), second);
    assert_eq!(storage.chat_history().unwrap().len(), 100);
    assert!(storage.select_conversation(first).is_err());
    storage.purge_history(None).unwrap();
    assert!(storage.chat_history().unwrap().is_empty());
    assert!(storage
        .conversations()
        .unwrap()
        .iter()
        .all(|item| item.title == "New chat"));
}
#[test]
fn legacy_chat_migration_preserves_turns_and_is_idempotent() {
    let mut storage = store();
    let reply = ChatReply {
        message: "Earlier answer".into(),
        resources: vec![],
        ..Default::default()
    };
    storage
        .save_chat_turn("Earlier question", &reply, None)
        .unwrap();
    storage
        .connection
        .execute("DELETE FROM buddy_conversation_messages", [])
        .unwrap();
    storage
        .connection
        .execute("DELETE FROM buddy_conversations", [])
        .unwrap();
    storage.initialize().unwrap();
    storage.initialize().unwrap();
    assert_eq!(storage.conversations().unwrap().len(), 1);
    assert_eq!(storage.chat_history().unwrap().len(), 2);
    assert_eq!(storage.chat_history().unwrap()[0].text, "Earlier question");
}
#[test]
fn conversation_survives_reopening_the_database_without_an_active_goal() {
    let path = std::env::temp_dir().join(format!(
        "buddy-chat-{}-{}.sqlite",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap()
    ));
    {
        let mut storage = Storage::open(&path).unwrap();
        storage
            .save_chat_turn(
                "A question without a goal",
                &ChatReply {
                    message: "A helpful answer".into(),
                    resources: vec![],
                    ..Default::default()
                },
                None,
            )
            .unwrap();
    }
    {
        let storage = Storage::open(&path).unwrap();
        assert!(storage.goal().unwrap().is_none());
        let messages = storage.chat_history().unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].text, "A question without a goal");
        assert_eq!(messages[1].text, "A helpful answer");
    }
    std::fs::remove_file(path).unwrap();
}
#[test]
fn unknown_duration_does_not_trigger_coaching_and_completed_goals_are_suppressed() {
    let mut storage = store();
    let id = goal(&mut storage, "No estimate", "unknown");
    let now = chrono::Utc::now().timestamp();
    assert!(!crate::companion::stuck_due(&storage, id, now).unwrap());
    storage.connection.execute("INSERT INTO core_goal_details(goal_id,due_at) VALUES(?1,?2) ON CONFLICT(goal_id) DO UPDATE SET due_at=excluded.due_at",params![id,chrono::Utc::now().to_rfc3339()]).unwrap();
    assert!(crate::companion::stuck_due(&storage, id, now + 1).unwrap());
    storage.transition_goal(id, "resume").unwrap();
    storage.transition_goal(id, "complete").unwrap();
    assert!(!crate::companion::stuck_due(&storage, id, now + 1).unwrap());
}
fn goal(store: &mut Storage, title: &str, batch: &str) -> i64 {
    store
        .core_add_goals(
            vec![crate::core::GoalDraft {
                title: title.into(),
                area: "Work".into(),
                steps: vec![],
            }],
            batch,
        )
        .unwrap();
    store
        .core_snapshot(None)
        .unwrap()
        .goals
        .into_iter()
        .find(|g| g.title == title)
        .unwrap()
        .id
}
#[test]
fn conversation_is_shared_across_goals_bounded_and_cleared_by_retention() {
    let mut storage = store();
    let id = goal(&mut storage, "First", "first");
    let reply = ChatReply {
        message: "Choose one next step.".into(),
        resources: vec![],
        ..Default::default()
    };
    storage
        .save_chat_turn("What is blocking me?", &reply, Some(id))
        .unwrap();
    storage
        .save_chat_turn("A separate question", &reply, None)
        .unwrap();
    let history = storage.chat_history().unwrap();
    assert_eq!(history.len(), 4);
    assert_eq!(history[0].role, "user");
    assert_eq!(history[1].role, "assistant");
    assert!(history[2].goal_id.is_none());
    for _ in 0..55 {
        storage
            .save_chat_turn("Next request", &reply, Some(id))
            .unwrap();
    }
    let history = storage.chat_history().unwrap();
    assert_eq!(history.len(), 100);
    assert_eq!(history[0].role, "user");
    storage.purge_history(None).unwrap();
    assert!(storage.chat_history().unwrap().is_empty());
}
#[test]
fn chat_sources_cannot_be_invented_and_no_goal_is_changed_by_a_reply() {
    let mut storage = store();
    let id = goal(&mut storage, "Original goal", "original");
    let original = storage.goal_plan(id).unwrap();
    let response = json!({"choices":[{"finish_reason":"stop","message":{"content":json!({"message":"Try a next step.","resources":[{"title":"Invented","url":"https://invented.example/","whyRelevant":"Claims to help"}]}).to_string()}}]});
    let reply = parse_chat(&response, &[]).unwrap();
    assert!(reply.resources.is_empty());
    let invented = json!({"choices":[{"finish_reason":"stop","message":{"content":json!({"message":"Read https://invented.example/","resources":[]}).to_string()}}]});
    assert!(parse_chat(&invented, &[]).is_err());
    storage.save_chat_turn("Help", &reply, Some(id)).unwrap();
    assert_eq!(storage.goal_plan(id).unwrap().revision, original.revision);
    assert_eq!(
        storage.core_snapshot(None).unwrap().goals[0].title,
        "Original goal"
    );
}
#[test]
fn observed_time_reaches_progress_without_double_counting_timer_and_drives_stuck_trigger() {
    let mut storage = store();
    let id = goal(&mut storage, "Work", "work");
    storage.transition_goal(id, "resume").unwrap();
    let day = chrono::Local::now().date_naive().to_string();
    storage
        .connection
        .execute(
            "INSERT INTO core_time(day,goal_id,seconds) VALUES(?1,?2,60)",
            params![day, id],
        )
        .unwrap();
    storage.connection.execute("INSERT INTO usage_daily(day,goal_id,process_name,milliseconds) VALUES(?1,?2,'editor.exe',180000)",params![day,id]).unwrap();
    storage
        .connection
        .execute(
            "INSERT INTO ai_goal_estimates(goal_id,minutes) VALUES(?1,2)",
            [id],
        )
        .unwrap();
    let snapshot = storage.core_snapshot(None).unwrap();
    let progress = &snapshot.summary.goals[0];
    assert_eq!(progress.seconds, 60);
    assert_eq!(progress.tracked_seconds, 180);
    assert_eq!(snapshot.goals[0].tracked_seconds, 180);
    assert!(!storage.coaching_context(id).unwrap()["over_expected"]
        .as_bool()
        .unwrap());
    storage.connection.execute("INSERT INTO goal_relevant_daily(day,goal_id,process_name,milliseconds) VALUES(?1,?2,'editor.exe',180000)",params![day,id]).unwrap();
    assert!(storage.coaching_context(id).unwrap()["over_expected"]
        .as_bool()
        .unwrap());
    assert!(crate::companion::stuck_due(&storage, id, chrono::Utc::now().timestamp()).unwrap());
}
#[test]
fn tracking_requires_both_persistent_request_and_consent_and_keeps_pause_after_goal_switch() {
    let mut storage = store();
    let first = goal(&mut storage, "First", "first");
    let second = goal(&mut storage, "Second", "second");
    storage.transition_goal(first, "resume").unwrap();
    let mut settings = storage.user_settings().unwrap();
    settings.onboarding.completed = true;
    settings.onboarding.tracking_consent = true;
    storage.write_setting("user_settings", &settings).unwrap();
    assert!(crate::tracking::requested(&storage).unwrap());
    storage.write_setting("tracking_requested", &true).unwrap();
    assert!(crate::tracking::requested(&storage).unwrap());
    storage.transition_goal(second, "resume").unwrap();
    assert!(crate::tracking::requested(&storage).unwrap());
    storage.write_setting("tracking_requested", &false).unwrap();
    storage.transition_goal(first, "resume").unwrap();
    assert!(!crate::tracking::requested(&storage).unwrap());
    storage.write_setting("tracking_requested", &true).unwrap();
    settings.onboarding.tracking_consent = false;
    storage.write_setting("user_settings", &settings).unwrap();
    assert!(!crate::tracking::requested(&storage).unwrap());
}

#[tokio::test]
#[ignore = "Uses configured Nebius/Tavily accounts with synthetic data; provider charges may apply"]
async fn live_ai_goal_and_chat_smoke() {
    std::env::set_var("BUDDY_LIVE_DIAGNOSTICS", "true");
    let _ = dotenvy::from_path(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env"));
    let mut storage = store();
    let id = goal(
        &mut storage,
        "Create a Tauri desktop onboarding flow",
        "live-smoke",
    );
    storage.ensure_today_focus().unwrap();
    let state = AppState::new(storage).unwrap();
    {
        let mut inner = state.inner.lock().unwrap();
        inner.status.mock_ai = false;
    }
    let input = {
        let inner = state.inner.lock().unwrap();
        crate::automatic_goals::input(
            inner
                .storage
                .core_snapshot(None)
                .unwrap()
                .goals
                .iter()
                .find(|g| g.id == id)
                .unwrap(),
        )
    };
    let result = crate::goal_analysis::analyze_goal(input, true, &state)
        .await
        .map_err(|e| {
            eprintln!(
                "Live goal failure category: {}",
                if e.contains("incomplete") {
                    "incomplete"
                } else if e.contains("goal suggestions") {
                    "suggestion_schema"
                } else if e.contains("invalid goal suggestion fields") {
                    "suggestion_bounds"
                } else if e.contains("classification") {
                    "classifier"
                } else {
                    "other"
                }
            );
            crate::goal_analysis::user_error("live_analysis", &e)
        })
        .unwrap();
    assert!(
        (3..=5).contains(&result.suggested_steps.len()),
        "Live goal suggestions did not contain 3–5 steps"
    );
    assert!(
        result.improved_title.is_some(),
        "Live title suggestion missing"
    );
    assert!(
        !result.resources.is_empty(),
        "No grounded web sources returned"
    );
    let reply = send_message(
        "Help me start the first onboarding step".into(),
        None,
        None,
        &state,
    )
    .await
    .map_err(|e| crate::goal_analysis::user_error("live_chat", &e))
    .unwrap();
    assert!(!reply.message.trim().is_empty());
    assert_eq!(
        state
            .inner
            .lock()
            .unwrap()
            .storage
            .chat_history()
            .unwrap()
            .len(),
        2
    );
    println!(
        "Live synthetic smoke passed: title, {} steps, {} grounded sources, persistent chat",
        result.suggested_steps.len(),
        result.resources.len()
    );
}
#[test]
fn chat_actions_add_goals_and_steps_and_report_exact_results() {
    let mut storage = store();
    let id = goal(&mut storage, "Update the app", "chat-actions");
    let action =
        |kind: &str, goal_id: Option<i64>, title: Option<&str>, steps: &[&str]| ChatAction {
            kind: kind.into(),
            goal_id,
            title: title.map(str::to_string),
            steps: steps.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        };
    let lines = apply_chat_actions(
        &mut storage,
        Some(id),
        &[
            action(
                "add_steps",
                None,
                None,
                &["fix the toggles", "Fix the toggles", "ship it"],
            ),
            action(
                "add_goal",
                None,
                Some("publish a website"),
                &["pick a domain", "write the pages"],
            ),
            action("add_steps", Some(9999), None, &["x"]),
            action("add_steps", Some(id), None, &["ship it"]),
        ],
    );
    assert_eq!(lines.len(), 4);
    assert!(lines[0].starts_with("Added 2 steps to"));
    assert!(lines[1].contains("Publish a website") && lines[1].contains("2 steps"));
    assert!(lines[2].starts_with("Couldn't"));
    assert!(lines[3].starts_with("Nothing new"));
    let snapshot = storage.core_snapshot(None).unwrap();
    let existing = snapshot.goals.iter().find(|g| g.id == id).unwrap();
    let texts: Vec<_> = existing
        .plan
        .steps
        .iter()
        .map(|s| s.text.as_str())
        .collect();
    assert!(texts.contains(&"Fix the toggles") && texts.contains(&"Ship it"));
    assert_eq!(
        texts
            .iter()
            .filter(|t| t.to_lowercase() == "fix the toggles")
            .count(),
        1
    );
    let created = snapshot
        .goals
        .iter()
        .find(|g| g.title == "Publish a website")
        .unwrap();
    assert_eq!(created.plan.steps.len(), 2);
    assert_eq!(created.plan.steps[0].text, "Pick a domain");
}
#[test]
fn add_requests_are_classified_into_strict_intents() {
    let ok = |body: Value| json!({"choices":[{"finish_reason":"stop","message":{"content":body.to_string()}}]});
    let intent = parse_intent(&ok(
        json!({"intent":"add_steps","goal_id":3,"title":null,"steps":["One","Two"]}),
    ))
    .unwrap();
    assert_eq!(intent.intent, "add_steps");
    assert_eq!(intent.goal_id, Some(3));
    assert_eq!(intent.steps.len(), 2);
    assert!(parse_intent(&ok(
        json!({"intent":"format_disk","goal_id":3,"title":null,"steps":[]})
    ))
    .is_err());
    assert!(parse_intent(&ok(
        json!({"intent":"none","goal_id":null,"title":null,"steps":[],"extra":1})
    ))
    .is_err());
}
#[test]
fn chat_goals_go_to_today_and_are_never_duplicated() {
    let mut storage = store();
    let existing = goal(&mut storage, "Existing goal", "chat-today");
    let action =
        |kind: &str, goal_id: Option<i64>, title: Option<&str>, steps: &[&str]| ChatAction {
            kind: kind.into(),
            goal_id,
            title: title.map(str::to_string),
            steps: steps.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        };
    let lines = apply_chat_actions(
        &mut storage,
        Some(existing),
        &[action(
            "add_goal",
            None,
            Some("fix the chats"),
            &["send with enter", "clear the input"],
        )],
    );
    assert!(lines[0].contains("Added the goal \"Fix the chats\" with 2 steps"));
    assert!(lines[0].contains("Also added it to Today."));
    let snapshot = storage.core_snapshot(None).unwrap();
    let created = snapshot
        .goals
        .iter()
        .find(|g| g.title == "Fix the chats")
        .unwrap();
    assert!(snapshot.today.contains(&created.id));
    // Asking again for the same goal does not create a copy; it only fills in what is missing.
    let again = apply_chat_actions(
        &mut storage,
        Some(existing),
        &[action(
            "add_goal",
            None,
            Some("Fix the chats"),
            &["send with enter", "keep focus after sending"],
        )],
    );
    assert!(again[0].contains("already in your goals"));
    assert!(again[0].contains("Added 1 new step"));
    let snapshot = storage.core_snapshot(None).unwrap();
    assert_eq!(
        snapshot
            .goals
            .iter()
            .filter(|g| g.title == "Fix the chats")
            .count(),
        1
    );
    // An existing goal can be put on Today by name, and Today has no size limit.
    let one = apply_chat_actions(
        &mut storage,
        None,
        &[action("add_to_today", None, Some("existing goal"), &[])],
    );
    assert!(one[0].contains("Also added it to Today"));
    for title in ["Third goal", "Fourth goal"] {
        apply_chat_actions(
            &mut storage,
            None,
            &[action("add_goal", None, Some(title), &["x"])],
        );
    }
    let snapshot = storage.core_snapshot(None).unwrap();
    assert_eq!(snapshot.today.len(), 4);
    let fourth = snapshot
        .goals
        .iter()
        .find(|g| g.title == "Fourth goal")
        .unwrap();
    assert!(snapshot.today.contains(&fourth.id));
}
#[test]
fn chat_can_rename_edit_complete_and_remove_but_reports_what_it_did() {
    let mut storage = store();
    let id = goal(&mut storage, "Old name", "chat-edit");
    apply_chat_actions(
        &mut storage,
        Some(id),
        &[ChatAction {
            kind: "add_steps".into(),
            steps: vec!["write the intro".into(), "write the outro".into()],
            ..Default::default()
        }],
    );
    let run = |storage: &mut Storage,
               kind: &str,
               title: Option<&str>,
               target: Option<&str>,
               new_text: Option<&str>| {
        apply_chat_actions(
            storage,
            Some(id),
            &[ChatAction {
                kind: kind.into(),
                goal_id: Some(id),
                title: title.map(str::to_string),
                target: target.map(str::to_string),
                new_text: new_text.map(str::to_string),
                ..Default::default()
            }],
        )
        .remove(0)
    };
    let steps = |storage: &Storage| -> Vec<(String, bool)> {
        storage.core_snapshot(None).unwrap().goals[0]
            .plan
            .steps
            .iter()
            .map(|s| (s.text.clone(), s.done))
            .collect()
    };
    assert!(
        run(&mut storage, "rename_goal", Some("new name"), None, None)
            .contains("Renamed \"Old name\" to \"New name\"")
    );
    assert_eq!(
        storage.core_snapshot(None).unwrap().goals[0].title,
        "New name"
    );
    assert!(run(
        &mut storage,
        "edit_step",
        None,
        Some("intro"),
        Some("write a better intro")
    )
    .contains("Changed the step"));
    assert!(run(&mut storage, "complete_step", None, Some("outro"), None).contains("Marked"));
    assert_eq!(
        steps(&storage),
        vec![
            ("Write a better intro".to_string(), false),
            ("Write the outro".to_string(), true)
        ]
    );
    // Ambiguous or unknown steps are reported, never guessed.
    assert!(
        run(&mut storage, "delete_step", None, Some("write"), None).starts_with("More than one")
    );
    assert!(
        run(&mut storage, "delete_step", None, Some("conclusion"), None).starts_with("I couldn't")
    );
    assert!(run(
        &mut storage,
        "delete_step",
        None,
        Some("write the outro"),
        None
    )
    .contains("Removed the step"));
    assert_eq!(steps(&storage).len(), 1);
    // Completing and reopening a goal.
    assert!(run(&mut storage, "complete_goal", None, None, None).contains("Completed"));
    assert_eq!(
        storage.core_snapshot(None).unwrap().goals[0].status,
        "completed"
    );
    assert!(run(&mut storage, "reopen_goal", None, None, None).contains("Reopened"));
    assert_eq!(storage.core_snapshot(None).unwrap().goals[0].status, "open");
}
#[test]
fn chat_deletes_at_once_and_can_restore_the_goal_with_its_steps() {
    let mut storage = store();
    let id = goal(&mut storage, "Delete me", "chat-delete");
    apply_chat_actions(
        &mut storage,
        Some(id),
        &[ChatAction {
            kind: "add_steps".into(),
            steps: vec!["first step".into(), "second step".into()],
            ..Default::default()
        }],
    );
    let mut plan = storage.core_snapshot(None).unwrap().goals[0].plan.clone();
    plan.steps[0].done = true;
    storage
        .core_save_goal_details("Delete me", "General", plan, None)
        .unwrap();
    let first_step = storage.core_snapshot(None).unwrap().goals[0].plan.steps[0]
        .id
        .clone();
    storage.connection.execute("INSERT INTO goal_relevant_daily(day,goal_id,process_name,milliseconds) VALUES('2026-10-12',?1,'editor',120000)", [id]).unwrap();
    storage.connection.execute("INSERT INTO goal_relevant_step_daily(day,goal_id,step_id,milliseconds) VALUES('2026-10-12',?1,?2,120000)", params![id, first_step]).unwrap();
    storage
        .connection
        .execute(
            "INSERT INTO core_time(day,goal_id,seconds) VALUES('2026-10-12',?1,300)",
            [id],
        )
        .unwrap();
    let line = apply_chat_actions(
        &mut storage,
        None,
        &[ChatAction {
            kind: "delete_goal".into(),
            goal_id: Some(id),
            ..Default::default()
        }],
    )
    .remove(0);
    assert!(line.starts_with("Deleted \"Delete me\""));
    assert!(storage.core_snapshot(None).unwrap().goals.is_empty());
    assert_eq!(deleted_goals(&storage).len(), 1);
    let line = apply_chat_actions(
        &mut storage,
        None,
        &[ChatAction {
            kind: "restore_goal".into(),
            ..Default::default()
        }],
    )
    .remove(0);
    assert!(line.starts_with("Restored \"Delete me\" with 2 steps"));
    let snapshot = storage.core_snapshot(None).unwrap();
    assert_eq!(snapshot.goals.len(), 1);
    let steps: Vec<_> = snapshot.goals[0]
        .plan
        .steps
        .iter()
        .map(|s| (s.text.as_str(), s.done))
        .collect();
    assert_eq!(steps, vec![("First step", true), ("Second step", false)]);
    // The recorded time came back with the goal, tied to the same step ids.
    let new_id = snapshot.goals[0].id;
    assert_eq!(storage.relevant_seconds(new_id, None).unwrap(), 120);
    assert_eq!(snapshot.goals[0].focused_seconds, 300);
    let times = storage.step_times(new_id, "2026-10-12").unwrap();
    assert_eq!(times.len(), 1);
    assert_eq!(
        (times[0].step_id.as_str(), times[0].seconds),
        (first_step.as_str(), 120)
    );
    assert!(deleted_goals(&storage).is_empty());
    let again = apply_chat_actions(
        &mut storage,
        None,
        &[ChatAction {
            kind: "restore_goal".into(),
            ..Default::default()
        }],
    )
    .remove(0);
    assert_eq!(again, "There is no deleted goal to restore.");
}
#[test]
fn deleted_goal_backups_follow_history_retention() {
    let mut storage = store();
    let id = goal(&mut storage, "Temporary", "chat-retention");
    apply_chat_actions(
        &mut storage,
        None,
        &[ChatAction {
            kind: "delete_goal".into(),
            goal_id: Some(id),
            ..Default::default()
        }],
    );
    assert_eq!(deleted_goals(&storage), vec!["Temporary".to_string()]);
    // Backups older than 30 days disappear on their own.
    storage
        .connection
        .execute(
            "UPDATE deleted_goal_backups SET deleted_at=deleted_at-?1",
            [KEEP_DELETED_SECONDS + 10],
        )
        .unwrap();
    assert!(deleted_goals(&storage).is_empty());
    // Deleting all history also removes them.
    let again = goal(&mut storage, "Another", "chat-retention-2");
    apply_chat_actions(
        &mut storage,
        None,
        &[ChatAction {
            kind: "delete_goal".into(),
            goal_id: Some(again),
            ..Default::default()
        }],
    );
    assert_eq!(deleted_goals(&storage).len(), 1);
    storage.purge_history(None).unwrap();
    assert!(deleted_goals(&storage).is_empty());
}
