use super::*;
use crate::skills::{
    execute, execute_for_event, pending_reply, planning_context, registry, snapshot, validate_offer,
};

fn store() -> Storage {
    Storage::open(std::path::Path::new(":memory:")).unwrap()
}
fn action(name: &str, input: Value) -> Action {
    Action {
        name: name.into(),
        input,
        instruction: Some("Do this".into()),
    }
}
fn goal(id: i64) -> Value {
    json!({"goal_id":id,"reference":null})
}
fn step(id: &str) -> Value {
    json!({"step_id":id,"ordinal":null,"reference":null})
}
fn run(store: &mut Storage, actions: Vec<Action>) -> Execution {
    let conversation = store.current_conversation().unwrap();
    let snap = snapshot(store, conversation).unwrap();
    let plan = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions,
        clarification: None,
    };
    let out = execute(store, &snap, &plan, "Do this", true, false).unwrap();
    // Existing executor fixtures explicitly accept goal completion consequences.
    if out.status == "confirmation_required"
        && plan.actions.iter().all(|a| {
            a.name == "complete_goal"
                || registry()
                    .iter()
                    .any(|s| s.name == a.name && s.safety != Safety::Confirmation)
        })
    {
        return pending_reply(store, conversation, "Confirm", true, 0)
            .unwrap()
            .unwrap();
    }
    out
}
fn create(store: &mut Storage, title: &str, steps: Vec<&str>) -> i64 {
    run(
        store,
        vec![action("create_goal", json!({"title":title,"steps":steps}))],
    )
    .results[0]
        .goal_id
        .unwrap()
}
fn fail(store: &mut Storage, actions: Vec<Action>) -> String {
    let conv = store.current_conversation().unwrap();
    let snap = snapshot(store, conv).unwrap();
    let plan = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions,
        clarification: None,
    };
    execute(store, &snap, &plan, "Do this", true, false)
        .err()
        .unwrap()
}

fn enhanced(name: &str, supplied: Value) -> Action {
    let skill = registry().into_iter().find(|s| s.name == name).unwrap();
    let mut input = serde_json::Map::new();
    for (key, schema) in skill.input_schema["properties"].as_object().unwrap() {
        let default = match schema["type"].as_str() {
            Some("array") => json!([]),
            Some("integer") => json!(if key == "limit" { 20 } else { 0 }),
            Some("boolean") => json!(false),
            _ => Value::Null,
        };
        input.insert(key.clone(), supplied.get(key).cloned().unwrap_or(default));
    }
    action(name, Value::Object(input))
}

#[test]
fn planned_goal_properties_backlog_and_date_are_persisted() {
    let mut s = store();
    let out = run(
        &mut s,
        vec![enhanced(
            "create_planned_goal",
            json!({"title":"Release plan","area":"Work","description":"Ship safely","priority":"high","due_at":"2026-12-20T12:00:00+01:00","done_when":"Both builds verified","steps":["Build Windows","Build macOS"]}),
        )],
    );
    let id = out.results[0].goal_id.unwrap();
    let core = s.core_snapshot(None).unwrap();
    let g = core.goals.iter().find(|g| g.id == id).unwrap();
    assert!(!core.today.contains(&id));
    assert_eq!(g.description, "Ship safely");
    assert_eq!(g.plan.done_when, "Both builds verified");
    assert_eq!(g.due_at.as_deref(), Some("2026-12-20T11:00:00+00:00"));
    assert!(out.fallback_message().contains("- [ ] Build macOS"));
    run(
        &mut s,
        vec![enhanced(
            "schedule_goal",
            json!({"goal":goal(id),"date":"2026-12-19","include":true}),
        )],
    );
    assert!(s
        .core_snapshot(Some("2026-12-19"))
        .unwrap()
        .date_goals
        .contains(&id));
    run(
        &mut s,
        vec![enhanced(
            "update_goal",
            json!({"goal":goal(id),"priority":"low","clear_fields":["due_at"]}),
        )],
    );
    let g = s
        .core_snapshot(None)
        .unwrap()
        .goals
        .into_iter()
        .find(|g| g.id == id)
        .unwrap();
    assert!(g.due_at.is_none());
    assert_eq!(g.description, "Ship safely");
    assert_eq!(g.priority.as_deref(), Some("low"));
}

#[test]
fn find_goals_reaches_beyond_planning_details_and_preserves_filters() {
    let mut s = store();
    for n in 0..45 {
        create(&mut s, &format!("Goal {n}"), vec![]);
    }
    let conversation = s.current_conversation().unwrap();
    let context = planning_context(&snapshot(&s, conversation).unwrap(), true);
    assert_eq!(context["goals"].as_array().unwrap().len(), 40);
    assert!(context.get("goal_index").is_none());
    let out = run(
        &mut s,
        vec![enhanced(
            "find_goals",
            json!({"query":"Goal","status":"open","offset":40,"limit":5}),
        )],
    );
    assert_eq!(out.results[0].data["total"], 45);
    assert_eq!(out.results[0].data["goals"].as_array().unwrap().len(), 5);
    assert_eq!(
        s.action_references(conversation)
            .unwrap()
            .last_action
            .unwrap()["data"]["filters"]["query"],
        "Goal"
    );
}

#[test]
fn undo_survives_reads_and_is_scoped_to_the_request_conversation() {
    let mut s = store();
    let id = create(&mut s, "Before", vec!["One"]);
    let original = s.current_conversation().unwrap();
    run(
        &mut s,
        vec![enhanced(
            "update_goal",
            json!({"goal":goal(id),"title":"After"}),
        )],
    );
    run(
        &mut s,
        vec![action("inspect_goal", json!({"goal":goal(id)}))],
    );
    run(&mut s, vec![action("inspect_work_queue", json!({}))]);
    assert!(snapshot(&s, original).unwrap().data["last_goal_edit"].is_object());
    let other = s.create_conversation().unwrap();
    assert!(
        fail(&mut s, vec![enhanced("undo_last_goal_edit", json!({}))]).contains("No supported")
    );
    let snap = snapshot(&s, original).unwrap();
    let plan = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions: vec![enhanced("undo_last_goal_edit", json!({}))],
        clarification: None,
    };
    execute(&mut s, &snap, &plan, "Do this", true, false).unwrap();
    assert_eq!(s.current_conversation().unwrap(), other);
    assert_eq!(
        s.core_snapshot(None)
            .unwrap()
            .goals
            .iter()
            .find(|g| g.id == id)
            .unwrap()
            .title,
        "Before"
    );
}

#[test]
fn search_packet_is_bounded_and_search_pagination_survives_unrelated_reads() {
    let mut s = store();
    for n in 0..45 {
        create(
            &mut s,
            &format!("Goal {n} {}", "x".repeat(470)),
            vec!["Long step"],
        );
    }
    let out = run(
        &mut s,
        vec![enhanced("find_goals", json!({"query":"Goal","limit":40}))],
    );
    let registry = registry();
    let skill = registry.iter().find(|s| s.name == "find_goals").unwrap();
    assert!(valid_result(
        &skill.result_schema,
        &serde_json::to_value(&out.results[0]).unwrap()
    ));
    assert!(serde_json::to_string(&out.results).unwrap().len() < 32 * 1024);
    assert_eq!(out.results[0].data["goals"][0]["clipped"], true);
    run(&mut s, vec![action("list_goals", json!({}))]);
    let conversation = s.current_conversation().unwrap();
    let snap = snapshot(&s, conversation).unwrap();
    let state = crate::dialogue_context::workspace(&snap, true, None);
    assert_eq!(state["last_goal_search"]["filters"]["query"], "Goal");
    assert_eq!(state["last_goal_search"]["total"], 45);
    let private = crate::dialogue_context::workspace(&snap, false, None);
    assert!(private.get("last_goal_search").is_none());
    assert!(private.get("last_goal_edit").is_none());
}

#[test]
fn undo_preserves_saved_queue_order_for_metadata_and_schedule_edits() {
    let mut s = store();
    let first = create(&mut s, "First", vec![]);
    let middle = create(&mut s, "Middle", vec![]);
    let last = create(&mut s, "Last", vec![]);
    let day = chrono::Local::now().date_naive().to_string();
    let queue = |s: &Storage| s.core_snapshot(Some(&day)).unwrap().date_goals;
    let original = queue(&s);
    assert_eq!(original, vec![first, middle, last]);
    run(
        &mut s,
        vec![enhanced(
            "update_goal",
            json!({"goal":goal(middle),"priority":"high"}),
        )],
    );
    run(&mut s, vec![enhanced("undo_last_goal_edit", json!({}))]);
    assert_eq!(queue(&s), original);
    run(
        &mut s,
        vec![enhanced(
            "schedule_goal",
            json!({"goal":goal(middle),"date":day,"include":false}),
        )],
    );
    assert_eq!(queue(&s), vec![first, last]);
    run(&mut s, vec![enhanced("undo_last_goal_edit", json!({}))]);
    assert_eq!(queue(&s), original);
}

#[test]
fn goal_receipts_preserve_checkpoints_and_work_without_memory_sharing() {
    let mut s = store();
    let id = create(&mut s, "Checkpoint", vec!["Review"]);
    run(
        &mut s,
        vec![enhanced(
            "update_work_context",
            json!({"goal":goal(id),"summary":"Private checkpoint","next_action":"Review findings"}),
        )],
    );
    let out = run(
        &mut s,
        vec![action("inspect_goal", json!({"goal":goal(id)}))],
    );
    assert_eq!(
        out.results[0].data["checkpoint"]["summary"],
        "Private checkpoint"
    );
    run(
        &mut s,
        vec![enhanced(
            "update_goal",
            json!({"goal":goal(id),"priority":"high"}),
        )],
    );
    let raw: String = s
        .connection
        .query_row("SELECT payload FROM buddy_goal_edit_undo", [], |r| r.get(0))
        .unwrap();
    assert!(!raw.contains("Private checkpoint"));
    let mut controls = s.memory_controls().unwrap();
    controls.enabled = false;
    s.set_memory_controls(&controls).unwrap();
    let out = run(
        &mut s,
        vec![action("inspect_goal", json!({"goal":goal(id)}))],
    );
    assert!(out.results[0].data["checkpoint"].is_null());
    assert!(snapshot(&s, s.current_conversation().unwrap())
        .unwrap()
        .data["last_goal_edit"]
        .is_null());
}

#[test]
fn reopen_preserves_progress_and_restart_requires_confirmation() {
    let mut s = store();
    let id = create(&mut s, "Reusable checklist", vec!["One", "Two"]);
    let conversation = s.current_conversation().unwrap();
    let snap = snapshot(&s, conversation).unwrap();
    let plan = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions: vec![action("complete_goal", json!({"goal":goal(id)}))],
        clarification: None,
    };
    let preview = execute(&mut s, &snap, &plan, "Do this", true, false).unwrap();
    assert_eq!(preview.status, "confirmation_required");
    assert!(!s.goal_plan(id).unwrap().steps[0].done);
    assert!(preview.fallback_message().contains("all 2 steps"));
    pending_reply(&mut s, conversation, "Confirm", true, 0)
        .unwrap()
        .unwrap();
    run(
        &mut s,
        vec![action("reopen_goal", json!({"goal":goal(id)}))],
    );
    assert!(s.goal_plan(id).unwrap().steps.iter().all(|s| s.done));
    s.core_settle_goals().unwrap();
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].status, "open");
    run(
        &mut s,
        vec![enhanced(
            "update_goal",
            json!({"goal":goal(id),"title":"Still open"}),
        )],
    );
    s.core_settle_goals().unwrap();
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].status, "open");
    let preview = run(
        &mut s,
        vec![enhanced("restart_goal", json!({"goal":goal(id)}))],
    );
    assert_eq!(preview.status, "confirmation_required");
    assert!(s.goal_plan(id).unwrap().steps.iter().all(|s| s.done));
    pending_reply(&mut s, conversation, "Cancel", true, 0)
        .unwrap()
        .unwrap();
    assert!(s.goal_plan(id).unwrap().steps.iter().all(|s| s.done));
    run(
        &mut s,
        vec![enhanced("restart_goal", json!({"goal":goal(id)}))],
    );
    pending_reply(&mut s, conversation, "Confirm", true, 0)
        .unwrap()
        .unwrap();
    assert!(s.goal_plan(id).unwrap().steps.iter().all(|s| !s.done));
}

#[test]
fn reordering_preserves_step_identity_progress_and_current_step() {
    let mut s = store();
    let id = create(&mut s, "Order", vec!["One", "Two", "Three"]);
    let steps = s.goal_plan(id).unwrap().steps;
    run(
        &mut s,
        vec![action(
            "complete_step",
            json!({"goal":goal(id),"step":step(&steps[0].id)}),
        )],
    );
    run(
        &mut s,
        vec![enhanced(
            "set_current_step",
            json!({"goal":goal(id),"step":step(&steps[2].id)}),
        )],
    );
    run(
        &mut s,
        vec![enhanced(
            "reorder_steps",
            json!({"goal":goal(id),"ordered_step_ids":[steps[2].id,steps[0].id,steps[1].id]}),
        )],
    );
    let plan = s.goal_plan(id).unwrap();
    assert_eq!(plan.steps[0].text, "Three");
    assert!(plan.steps[1].done);
    assert_eq!(plan.current_step.as_deref(), Some(steps[2].id.as_str()));
    assert!(fail(
        &mut s,
        vec![enhanced(
            "set_current_step",
            json!({"goal":goal(id),"step":step(&steps[0].id)})
        )]
    )
    .contains("unfinished"));
    assert!(fail(
        &mut s,
        vec![enhanced(
            "reorder_steps",
            json!({"goal":goal(id),"ordered_step_ids":[steps[0].id,steps[0].id,steps[1].id]})
        )]
    )
    .contains("exactly once"));
}

#[test]
fn undo_restores_only_supported_edit_and_rejects_external_changes() {
    let mut s = store();
    let id = create(&mut s, "Original", vec!["One"]);
    run(
        &mut s,
        vec![enhanced(
            "update_goal",
            json!({"goal":goal(id),"title":"Changed","priority":"high"}),
        )],
    );
    run(&mut s, vec![enhanced("undo_last_goal_edit", json!({}))]);
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].title, "Original");
    assert!(s.core_snapshot(None).unwrap().goals[0].priority.is_none());
    assert!(
        fail(&mut s, vec![enhanced("undo_last_goal_edit", json!({}))]).contains("No supported")
    );
    run(
        &mut s,
        vec![enhanced(
            "update_goal",
            json!({"goal":goal(id),"title":"Latest"}),
        )],
    );
    s.core_today(id, false, &chrono::Local::now().date_naive().to_string())
        .unwrap();
    assert!(fail(&mut s, vec![enhanced("undo_last_goal_edit", json!({}))]).contains("changed"));
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].title, "Latest");
}

#[test]
fn scheduling_undo_restores_no_plan_mode_and_day_membership() {
    let mut s = store();
    let id = create(&mut s, "Backlog", vec![]);
    s.core_plan_day("2026-12-19", true).unwrap();
    run(
        &mut s,
        vec![enhanced(
            "schedule_goal",
            json!({"goal":goal(id),"date":"2026-12-19","include":true}),
        )],
    );
    run(&mut s, vec![enhanced("undo_last_goal_edit", json!({}))]);
    assert!(s
        .core_snapshot(Some("2026-12-19"))
        .unwrap()
        .date_goals
        .is_empty());
    let mode: String = s
        .connection
        .query_row(
            "SELECT mode FROM core_days WHERE day='2026-12-19'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(mode, "no_plan");
}

#[test]
fn context_updates_do_not_create_completion_or_change_focus() {
    let mut s = store();
    let id = create(&mut s, "Client", vec!["Review"]);
    let before = s.core_snapshot(None).unwrap().focused_goal_id;
    let out = run(
        &mut s,
        vec![enhanced(
            "update_work_context",
            json!({"goal":goal(id),"waiting_for":"Client feedback","next_action":"Review response","last_result":"Draft sent"}),
        )],
    );
    assert_eq!(
        out.results[0].data["checkpoint"]["waiting_for"],
        "Client feedback"
    );
    assert_eq!(s.core_snapshot(None).unwrap().focused_goal_id, before);
    assert!(s.core_snapshot(None).unwrap().summary.completed.is_empty());
    assert!(!s.goal_plan(id).unwrap().steps[0].done);
    let out = run(&mut s, vec![action("inspect_today", json!({}))]);
    assert!(out.fallback_message().contains("**Waiting for**"));
    assert!(out.fallback_message().contains("Client feedback"));
    run(
        &mut s,
        vec![enhanced(
            "update_work_context",
            json!({"goal":goal(id),"clear_fields":["waiting_for"]}),
        )],
    );
    assert!(s
        .work_context(id)
        .unwrap()
        .unwrap()
        .context
        .waiting_for
        .is_none());
}

#[test]
fn enhanced_inputs_reject_invalid_dates_fields_and_conflicting_clears() {
    let mut s = store();
    let id = create(&mut s, "Keep", vec![]);
    assert!(fail(
        &mut s,
        vec![enhanced(
            "schedule_goal",
            json!({"goal":goal(id),"date":"2026-02-30","include":true})
        )]
    )
    .contains("valid"));
    assert!(fail(
        &mut s,
        vec![enhanced(
            "update_goal",
            json!({"goal":goal(id),"priority":"urgent"})
        )]
    )
    .contains("schema"));
    assert!(fail(
        &mut s,
        vec![enhanced(
            "update_goal",
            json!({"goal":goal(id),"priority":"high","clear_fields":["priority"]})
        )]
    )
    .contains("set and clear"));
    let mut bad = enhanced("update_goal", json!({"goal":goal(id),"title":"Changed"}));
    bad.input["executable"] = json!("arbitrary code");
    assert!(fail(&mut s, vec![bad]).contains("schema"));
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].title, "Keep");
}

#[test]
fn saved_research_is_inspected_and_added_only_to_its_original_goal() {
    let mut s = store();
    let id = create(&mut s, "Research target", vec!["Investigate"]);
    let other = create(&mut s, "Other", vec![]);
    let original_step = s.goal_plan(id).unwrap().steps[0].id.clone();
    let receipt = crate::research::Attachment {
        research_id: 101,
        step_id: Some(original_step.clone()),
        summary: "Validated finding".into(),
        next_action: "Test the finding".into(),
        sources: vec![crate::models::SearchResult {
            title: "Official guide".into(),
            url: "https://example.com/guide".into(),
            content: "Evidence".into(),
        }],
    };
    s.connection.execute("INSERT INTO contextual_research(id,goal_id,step_id,topic,consent_json,status,result_json,expires_at,created_at) VALUES(101,?1,?2,'Question','{}','ready',?3,0,?4)",params![id,original_step,serde_json::to_string(&receipt).unwrap(),chrono::Utc::now().to_rfc3339()]).unwrap();
    let out = run(
        &mut s,
        vec![enhanced(
            "inspect_research",
            json!({"goal":goal(id),"research_id":101}),
        )],
    );
    assert!(out
        .fallback_message()
        .contains("[Official guide](https://example.com/guide)"));
    assert_eq!(s.goal_plan(id).unwrap().steps.len(), 1);
    assert!(fail(
        &mut s,
        vec![enhanced(
            "add_research_step",
            json!({"goal":goal(other),"research_id":101})
        )]
    )
    .contains("no longer exists"));
    run(
        &mut s,
        vec![enhanced(
            "add_research_step",
            json!({"goal":goal(id),"research_id":101}),
        )],
    );
    let plan = s.goal_plan(id).unwrap();
    assert_eq!(plan.steps[1].text, "Test the finding");
    assert!(!plan.steps[1].done);
    assert!(s.core_snapshot(None).unwrap().summary.completed.is_empty());
    assert!(fail(
        &mut s,
        vec![enhanced(
            "add_research_step",
            json!({"goal":goal(id),"research_id":101})
        )]
    )
    .contains("already a step"));
    for (enabled, remember) in [(false, true), (true, false)] {
        let mut controls = s.memory_controls().unwrap();
        controls.enabled = enabled;
        controls.remember_work_context = remember;
        s.set_memory_controls(&controls).unwrap();
        let before = s.goal_plan(id).unwrap();
        for name in ["inspect_research", "add_research_step"] {
            assert!(fail(
                &mut s,
                vec![enhanced(name, json!({"goal":goal(id),"research_id":101}))]
            )
            .contains("Enable Remember work context"));
        }
        assert_eq!(
            serde_json::to_value(s.goal_plan(id).unwrap()).unwrap(),
            serde_json::to_value(before).unwrap()
        );
    }
}

#[test]
fn new_goal_skills_keep_sharing_consent_atomicity_and_strict_result_contracts() {
    let mut s = store();
    let id = create(&mut s, "Protected", vec![]);
    let conversation = s.current_conversation().unwrap();
    let snap = snapshot(&s, conversation).unwrap();
    let update = enhanced(
        "update_goal",
        json!({"goal":goal(id),"title":"Must not change"}),
    );
    let plan = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions: vec![update],
        clarification: None,
    };
    assert!(execute(&mut s, &snap, &plan, "Do this", false, false).is_err());
    let create = enhanced("create_planned_goal", json!({"title":"Private backlog"}));
    let plan = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions: vec![create],
        clarification: None,
    };
    let out = execute(&mut s, &snap, &plan, "Do this", false, false).unwrap();
    assert_eq!(out.status, "executed");
    let registry = registry();
    let skill = registry
        .iter()
        .find(|s| s.name == "create_planned_goal")
        .unwrap();
    assert!(valid_result(
        &skill.result_schema,
        &serde_json::to_value(&out.results[0]).unwrap()
    ));
    let count = s.core_snapshot(None).unwrap().goals.len();
    let actions = vec![
        enhanced(
            "update_goal",
            json!({"goal":goal(id),"title":"Rolled back"}),
        ),
        enhanced(
            "schedule_goal",
            json!({"goal":goal(99999),"date":"2026-12-19","include":true}),
        ),
    ];
    assert!(fail(&mut s, actions).contains("no longer exists"));
    let core = s.core_snapshot(None).unwrap();
    assert_eq!(core.goals.len(), count);
    assert_eq!(
        core.goals.iter().find(|g| g.id == id).unwrap().title,
        "Protected"
    );
}

#[test]
fn enhanced_offers_require_exact_goal_and_background_never_executes_them() {
    let mut s = store();
    let id = create(&mut s, "Offered", vec![]);
    let other = create(&mut s, "Other", vec![]);
    let conversation = s.current_conversation().unwrap();
    let snap = snapshot(&s, conversation).unwrap();
    let offered = enhanced("update_goal", json!({"goal":goal(id),"priority":"high"}));
    validate_offer(&s, &snap, &offered, Some(id)).unwrap();
    assert!(validate_offer(&s, &snap, &offered, Some(other)).is_err());
    let plan = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions: vec![offered],
        clarification: None,
    };
    assert!(execute_for_event(
        &mut s,
        &snap,
        &plan,
        "Do this",
        true,
        false,
        crate::agent_runtime::EventKind::MeaningfulContextChanged
    )
    .is_err());
    assert!(s
        .core_snapshot(None)
        .unwrap()
        .goals
        .iter()
        .find(|g| g.id == id)
        .unwrap()
        .priority
        .is_none());
}

#[test]
fn mixed_confirmation_preview_uses_proposed_tense_and_changes_nothing() {
    let mut s = store();
    let id = create(&mut s, "Original", vec!["One"]);
    let conversation = s.current_conversation().unwrap();
    let snap = snapshot(&s, conversation).unwrap();
    let plan = Plan {
        kind: "actions".into(),
        state_version: snap.version.clone(),
        actions: vec![
            enhanced("update_goal", json!({"goal":goal(id),"title":"Changed"})),
            action("complete_goal", json!({"goal":goal(id)})),
        ],
        clarification: None,
    };
    let out = execute(&mut s, &snap, &plan, "Do this", true, false).unwrap();
    assert_eq!(out.status, "confirmation_required");
    let receipt = out.fallback_message();
    assert!(receipt.contains("Update \"Changed\""));
    assert!(!receipt.contains("Updated \""));
    assert!(receipt.contains("Complete \"Changed\" and all 1 steps"));
    assert_eq!(s.core_snapshot(None).unwrap().goals[0].title, "Original");
    assert!(!s.goal_plan(id).unwrap().steps[0].done);
    let count: i64 = s
        .connection
        .query_row("SELECT COUNT(*) FROM buddy_goal_edit_undo", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn delete_restore_keeps_explicitly_reopened_goal_open_with_completed_steps() {
    let mut s = store();
    let id = create(&mut s, "Preserved progress", vec!["Done"]);
    run(
        &mut s,
        vec![action("complete_goal", json!({"goal":goal(id)}))],
    );
    run(
        &mut s,
        vec![action("reopen_goal", json!({"goal":goal(id)}))],
    );
    let out = run(
        &mut s,
        vec![action("delete_goal", json!({"goal":goal(id)}))],
    );
    let backup = out.results[0].data["backup_id"].as_i64().unwrap();
    let restored = run(
        &mut s,
        vec![action("restore_goal", json!({"backup_id":backup}))],
    )
    .results[0]
        .goal_id
        .unwrap();
    s.core_settle_goals().unwrap();
    let goal = s
        .core_snapshot(None)
        .unwrap()
        .goals
        .into_iter()
        .find(|g| g.id == restored)
        .unwrap();
    assert_eq!(goal.status, "open");
    assert!(goal.plan.steps[0].done);
}
