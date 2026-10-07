use super::*;
fn store() -> Storage {
    Storage::open(std::path::Path::new(":memory:")).unwrap()
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
