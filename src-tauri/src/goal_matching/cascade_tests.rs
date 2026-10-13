use super::*;
use crate::{
    commands::Inner,
    core::GoalDraft,
    storage::Storage,
    work_state::{self, State},
};
fn setup(names: &[&str]) -> (AppState, Vec<i64>) {
    let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
    for (i, name) in names.iter().enumerate() {
        s.core_add_goals(
            vec![GoalDraft {
                title: (*name).into(),
                area: "Work".into(),
                steps: vec![format!("Deliver {name}")],
            }],
            &format!("lane-{i}"),
        )
        .unwrap();
    }
    let snap = s.core_snapshot(None).unwrap();
    let ids = names
        .iter()
        .map(|name| snap.goals.iter().find(|g| &g.title == name).unwrap().id)
        .collect::<Vec<_>>();
    for id in &ids {
        s.core_today(*id, true, &snap.date).unwrap();
    }
    s.transition_goal(ids[0], "resume").unwrap();
    s.write_setting(
        "ai_assistance_preferences",
        &crate::goal_analysis::AiPreferences {
            automatic_goal_matching: true,
            ..Default::default()
        },
    )
    .unwrap();
    let state = AppState::new(s).unwrap();
    {
        let mut i = state.inner.lock().unwrap();
        i.status.tracking = true;
        i.status.nebius_configured = true;
        i.status.mock_ai = false;
        i.companion.view.preferences.quiet_start_minute = 0;
        i.companion.view.preferences.quiet_end_minute = 0;
    }
    (state, ids)
}
fn sample(title: &str) -> ActivitySnapshot {
    ActivitySnapshot {
        process_name: "Editor".into(),
        window_title: title.into(),
        idle_seconds: 1,
        ..Default::default()
    }
}
fn feed(inner: &mut Inner, a: &ActivitySnapshot, base: Instant, start: u64, end: u64) {
    for t in (start..=end).step_by(3) {
        observe_inner_at(inner, a, true, base + Duration::from_secs(t)).unwrap();
    }
}
fn checkpoint(inner: &mut Inner, id: i64, app: &str, waiting: Option<&str>) {
    inner
        .storage
        .park_work_context(
            id,
            crate::work_context::CheckpointDraft {
                summary: "Requirements identified".into(),
                next_action: "Write proposal".into(),
                waiting_for: waiting.map(str::to_string),
            },
            Some(app.into()),
        )
        .unwrap();
    inner.storage.resume_work_context(id, false).unwrap();
}
#[test]
fn explicit_focus_wins_without_inflating_other_goal_activity() {
    let (state, ids) = setup(&["Orion launch", "Vega budget"]);
    let mut i = state.inner.lock().unwrap();
    i.storage.mark_explicit_focus(ids[0]).unwrap();
    let a = sample("Vega budget workbook");
    observe_inner_at(&mut i, &a, true, Instant::now()).unwrap();
    assert_eq!(i.goal_matching.view.goal_id, Some(ids[0]));
    assert!(!due_inner(&i, Instant::now() + AI_STABLE));
    assert_eq!(attribution(&i, &a).unwrap().confidence, 0.);
    let view = work_state::compute(&i).unwrap();
    assert_eq!(view.active_goal_id, Some(ids[0]));
    assert_eq!(view.state, State::Drifting);
}
#[test]
fn explicit_focus_counts_activity_that_names_no_other_goal() {
    let (state, ids) = setup(&["Orion launch", "Vega budget"]);
    let mut i = state.inner.lock().unwrap();
    i.storage.mark_explicit_focus(ids[0]).unwrap();
    // A meeting, an inbox or a generic document never contain goal keywords.
    for title in [
        "Meet - Weekly sync",
        "Inbox (3) - Mail",
        "Untitled document",
    ] {
        let a = sample(title);
        observe_inner_at(&mut i, &a, true, Instant::now()).unwrap();
        assert_eq!(i.goal_matching.view.goal_id, Some(ids[0]));
        let matched = attribution(&i, &a).unwrap();
        assert_eq!(
            matched.goal_id.as_deref(),
            Some(ids[0].to_string().as_str())
        );
        assert_eq!(matched.confidence, 1., "{title}");
        assert_eq!(work_state::compute(&i).unwrap().state, State::Working);
    }
    // Several goals matching at once is ambiguous and stays out of the selected goal's time.
    let (state, ids) = setup(&["Atlas launch alpha", "Atlas launch beta"]);
    let mut i = state.inner.lock().unwrap();
    i.storage.mark_explicit_focus(ids[0]).unwrap();
    let a = sample("Atlas launch");
    observe_inner_at(&mut i, &a, true, Instant::now()).unwrap();
    assert_eq!(attribution(&i, &a).unwrap().confidence, 0.);
}
#[test]
fn unique_user_app_rule_precedes_keywords_and_presets_do_not() {
    let (state, ids) = setup(&["Orion launch", "Vega budget"]);
    let mut i = state.inner.lock().unwrap();
    i.storage.transition_goal(ids[1], "resume").unwrap();
    i.storage
        .save_app_rule(ids[1], "editor", Some(crate::insights::Category::Work))
        .unwrap();
    let a = sample("Orion launch");
    feed(&mut i, &a, Instant::now(), 0, 30);
    assert_eq!(i.goal_matching.view.goal_id, Some(ids[1]));
    assert_eq!(i.goal_matching.view.source.as_deref(), Some("user_rule"));
    i.storage
        .connection
        .execute(
            "UPDATE app_rules SET preset_source='fixture-role' WHERE goal_id=?1",
            [ids[1]],
        )
        .unwrap();
    feed(&mut i, &a, Instant::now(), 0, 30);
    assert_eq!(i.goal_matching.view.goal_id, Some(ids[0]));
    assert_eq!(
        i.goal_matching.view.source.as_deref(),
        Some("local_keywords")
    );
}
#[test]
fn six_lanes_strong_local_match_is_ready_at_thirty_seconds() {
    let (state, ids) = setup(&[
        "Orion launch",
        "Vega budget",
        "Cobalt audit",
        "Amber hiring",
        "Quartz research",
        "Nimbus design",
    ]);
    let mut i = state.inner.lock().unwrap();
    let base = Instant::now();
    let a = sample("Quartz research findings");
    feed(&mut i, &a, base, 0, 27);
    assert!(i.goal_matching.view.goal_id.is_none());
    observe_inner_at(&mut i, &a, true, base + LOCAL_STABLE).unwrap();
    assert_eq!(i.goal_matching.view.goal_id, Some(ids[4]));
    assert_eq!(
        i.goal_matching.view.source.as_deref(),
        Some("local_keywords")
    );
    assert!(!due_inner(&i, base + AI_STABLE));
    assert_eq!(i.goal_matching.metrics.nemotron_calls, 0);
}
#[tokio::test]
async fn ambiguity_calls_nemotron_once_then_keeps_the_result_for_stable_context() {
    use wiremock::{matchers::method, Mock, MockServer, ResponseTemplate};
    let (state, ids) = setup(&["Atlas launch alpha", "Atlas launch beta", "Vega budget"]);
    let base = Instant::now();
    let a = sample("Atlas launch beta");
    let job = {
        let mut i = state.inner.lock().unwrap();
        feed(&mut i, &a, base, 0, 57);
        assert!(!due_inner(&i, base + Duration::from_secs(57)));
        observe_inner_at(&mut i, &a, true, base + AI_STABLE).unwrap();
        claim(&mut i, base + AI_STABLE).unwrap().unwrap()
    };
    let server = MockServer::start().await;
    Mock::given(method("POST")).respond_with(ResponseTemplate::new(200).set_body_json(json!({"choices":[{"finish_reason":"stop","message":{"content":json!({"goal_id":ids[1],"confidence":0.93,"reason":"The exact beta deliverable matches"}).to_string()}}]}))).expect(1).mount(&server).await;
    let result = request_at(
        &state.client,
        &server.uri(),
        "fixture",
        "fixture",
        &job.goals,
        &job.sample,
    )
    .await;
    let mut i = state.inner.lock().unwrap();
    finish(&mut i, &job, result, base + AI_STABLE).unwrap();
    feed(&mut i, &a, base, 63, 1200);
    assert_eq!(i.goal_matching.view.goal_id, Some(ids[1]));
    assert!(!due_inner(&i, base + Duration::from_secs(1200)));
    assert_eq!(i.goal_matching.metrics.nemotron_calls, 1);
}
#[test]
fn work_context_disambiguates_similar_goals_and_respects_memory_off() {
    let (state, ids) = setup(&["Atlas launch alpha", "Atlas launch beta", "Vega budget"]);
    let mut i = state.inner.lock().unwrap();
    checkpoint(&mut i, ids[1], "Editor", None);
    let base = Instant::now();
    let a = sample("Atlas launch");
    feed(&mut i, &a, base, 0, 30);
    assert_eq!(i.goal_matching.view.goal_id, Some(ids[1]));
    assert_eq!(i.goal_matching.view.source.as_deref(), Some("work_context"));
    assert_eq!(attribution(&i, &a).unwrap().confidence, 0.);
    let mut controls = i.storage.memory_controls().unwrap();
    controls.enabled = false;
    i.storage.set_memory_controls(&controls).unwrap();
    feed(&mut i, &a, base, 33, 96);
    assert!(i.goal_matching.view.goal_id.is_none());
    assert!(work_state::compute(&i)
        .unwrap()
        .current_work_context
        .is_none());
}
#[test]
fn short_switches_do_not_change_lane_but_sustained_switch_does() {
    let (state, ids) = setup(&["Orion launch", "Vega budget"]);
    let mut i = state.inner.lock().unwrap();
    let base = Instant::now();
    feed(&mut i, &sample("Orion launch"), base, 0, 30);
    for t in (33..93).step_by(3) {
        let a = if (t / 6) % 2 == 0 {
            sample("Vega budget")
        } else {
            sample("Orion launch")
        };
        observe_inner_at(&mut i, &a, true, base + Duration::from_secs(t)).unwrap();
        assert_eq!(i.storage.goal().unwrap().unwrap().id, ids[0]);
    }
    let a = sample("Vega budget");
    feed(&mut i, &a, base, 96, 126);
    assert_eq!(i.storage.goal().unwrap().unwrap().id, ids[1]);
    assert_eq!(
        work_state::compute(&i).unwrap().active_goal_id,
        Some(ids[1])
    );
}
#[test]
fn similar_goals_and_unknown_context_are_never_guessed() {
    let (state, _) = setup(&[
        "Atlas launch alpha",
        "Atlas launch beta",
        "Atlas launch gamma",
    ]);
    let mut i = state.inner.lock().unwrap();
    let base = Instant::now();
    feed(&mut i, &sample("Atlas launch"), base, 0, 60);
    assert!(i.goal_matching.view.goal_id.is_none());
    assert!(due_inner(&i, base + AI_STABLE));
    feed(&mut i, &sample("Untitled document"), base, 63, 153);
    assert!(i.goal_matching.view.goal_id.is_none());
    assert!(!due_inner(&i, base + Duration::from_secs(153)));
    assert_eq!(work_state::compute(&i).unwrap().confidence, 0.);
}
#[test]
fn excluded_private_idle_and_tracking_off_clear_evidence_and_suppress_ai() {
    for gate in 0..4 {
        let (state, _) = setup(&["Atlas launch alpha", "Atlas launch beta"]);
        let mut i = state.inner.lock().unwrap();
        let base = Instant::now();
        let mut a = sample("Atlas launch");
        feed(&mut i, &a, base, 0, 60);
        match gate {
            0 => i.buddy.view.preferences.excluded_apps.push("Editor".into()),
            1 => a.window_title = "Password vault".into(),
            2 => a.idle_seconds = 1000,
            _ => i.status.tracking = false,
        }
        observe_inner_at(&mut i, &a, true, base + Duration::from_secs(63)).unwrap();
        assert!(i.goal_matching.current_sample().is_none());
        assert!(!due_inner(&i, base + Duration::from_secs(200)));
        assert_eq!(work_state::compute(&i).unwrap().state, State::Away);
    }
}
#[test]
fn waiting_context_and_live_step_survive_a_lane_switch_without_tick_memories() {
    let (state, ids) = setup(&["Orion launch", "Quartz research"]);
    let mut i = state.inner.lock().unwrap();
    checkpoint(&mut i, ids[1], "Research", Some("Reviewer feedback"));
    let mut a = sample("Workspace");
    a.process_name = "Research".into();
    let base = Instant::now();
    feed(&mut i, &a, base, 0, 30);
    let before: i64 = i
        .storage
        .connection
        .query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0))
        .unwrap();
    for _ in 0..100 {
        let view = work_state::compute(&i).unwrap();
        assert_eq!(view.active_goal_id, Some(ids[1]));
        assert_eq!(view.state, State::Waiting);
        assert_eq!(view.waiting_for.as_deref(), Some("Reviewer feedback"));
        assert!(view.active_step_id.is_some());
        assert!(!serde_json::to_string(&view)
            .unwrap()
            .contains("last_window"));
    }
    let after: i64 = i
        .storage
        .connection
        .query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0))
        .unwrap();
    assert_eq!(before, after);
}
#[test]
fn cloud_null_or_failure_is_cached_and_new_privacy_invalidates_it() {
    for fail in [false, true] {
        let (state, _) = setup(&["Atlas launch alpha", "Atlas launch beta"]);
        let mut i = state.inner.lock().unwrap();
        let base = Instant::now();
        let a = sample("Atlas launch");
        feed(&mut i, &a, base, 0, 60);
        let job = claim(&mut i, base + AI_STABLE).unwrap().unwrap();
        let result = if fail {
            Err("Provider failed".into())
        } else {
            Ok(MatchResult {
                goal_id: None,
                confidence: 0.,
                reason: "Still ambiguous".into(),
            })
        };
        finish(&mut i, &job, result, base + AI_STABLE).unwrap();
        feed(&mut i, &a, base, 63, 600);
        assert!(!due_inner(&i, base + Duration::from_secs(600)));
        assert_eq!(i.goal_matching.metrics.nemotron_calls, 1);
        i.privacy_revision += 1;
        feed(&mut i, &a, base, 603, 696);
        assert!(due_inner(&i, base + Duration::from_secs(696)));
    }
}
#[test]
fn a_new_explicit_focus_invalidates_an_old_cloud_response() {
    let (state, ids) = setup(&["Atlas launch alpha", "Atlas launch beta"]);
    let mut i = state.inner.lock().unwrap();
    let base = Instant::now();
    let a = sample("Atlas launch");
    feed(&mut i, &a, base, 0, 60);
    let job = claim(&mut i, base + AI_STABLE).unwrap().unwrap();
    i.storage.mark_explicit_focus(ids[0]).unwrap();
    finish(
        &mut i,
        &job,
        Ok(MatchResult {
            goal_id: Some(ids[1]),
            confidence: 0.95,
            reason: "Stale".into(),
        }),
        base + Duration::from_secs(61),
    )
    .unwrap();
    assert_eq!(i.storage.goal().unwrap().unwrap().id, ids[0]);
    assert!(!i.goal_matching.in_flight);
}
#[test]
fn explicit_focus_persists_reopen_and_is_cleared_after_parking() {
    let path = std::env::temp_dir().join(format!(
        "buddy-lane-{}.db",
        chrono::Utc::now().timestamp_nanos_opt().unwrap()
    ));
    let id;
    {
        let mut s = Storage::open(&path).unwrap();
        s.core_add_goals(
            vec![GoalDraft {
                title: "Orion launch".into(),
                area: "Work".into(),
                steps: vec![],
            }],
            "persist-focus",
        )
        .unwrap();
        id = s.core_snapshot(None).unwrap().goals[0].id;
        s.transition_goal(id, "resume").unwrap();
        s.mark_explicit_focus(id).unwrap();
    }
    {
        let mut s = Storage::open(&path).unwrap();
        assert_eq!(s.explicit_focus().unwrap(), Some(id));
        s.core_transition(id, "defer").unwrap();
        assert!(s.explicit_focus().unwrap().is_none());
        s.core_transition(id, "resume").unwrap();
        assert!(s.explicit_focus().unwrap().is_none());
    }
    std::fs::remove_file(path).unwrap();
}

#[test]
fn dnd_sharing_and_cooldown_block_calls_even_for_sustained_ambiguity() {
    let (state, _) = setup(&["Atlas launch alpha", "Atlas launch beta"]);
    let mut i = state.inner.lock().unwrap();
    let base = Instant::now();
    let a = sample("Atlas launch");
    feed(&mut i, &a, base, 0, 60);
    assert!(due_inner(&i, base + AI_STABLE));
    i.status.dnd = true;
    assert!(!due_inner(&i, base + AI_STABLE));
    i.status.dnd = false;
    let mut prefs = i.storage.ai_preferences().unwrap();
    prefs.share_goal_context = false;
    i.storage
        .write_setting("ai_assistance_preferences", &prefs)
        .unwrap();
    assert!(!due_inner(&i, base + AI_STABLE));
    prefs.share_goal_context = true;
    i.storage
        .write_setting("ai_assistance_preferences", &prefs)
        .unwrap();
    i.goal_matching.last_attempt = Some(base + Duration::from_secs(59));
    assert!(!due_inner(&i, base + Duration::from_secs(148)));
    assert!(due_inner(&i, base + Duration::from_secs(149)));
}
#[test]
fn work_state_reports_stuck_and_distraction_without_mutating_memory() {
    let (state, ids) = setup(&["Orion launch", "Vega budget"]);
    let mut i = state.inner.lock().unwrap();
    i.storage
        .connection
        .execute(
            "UPDATE goals SET created_at=?1 WHERE id=?2",
            rusqlite::params![
                (chrono::Utc::now() - chrono::Duration::hours(4)).to_rfc3339(),
                ids[0]
            ],
        )
        .unwrap();
    let base = Instant::now();
    let a = sample("Orion launch");
    feed(&mut i, &a, base, 0, 30);
    assert_eq!(work_state::compute(&i).unwrap().state, State::Stuck);
    i.storage
        .save_app_rule(
            ids[0],
            "Editor",
            Some(crate::insights::Category::Distraction),
        )
        .unwrap();
    i.storage.mark_explicit_focus(ids[0]).unwrap();
    observe_inner_at(&mut i, &a, true, base + Duration::from_secs(33)).unwrap();
    assert_eq!(work_state::compute(&i).unwrap().state, State::Drifting);
}
#[tokio::test]
async fn synthetic_switching_benchmark() {
    use wiremock::{matchers::method, Mock, MockServer, ResponseTemplate};
    let (state, ids) = setup(&[
        "Orion launch",
        "Vega budget",
        "Cobalt audit",
        "Quartz research",
        "Atlas launch alpha",
        "Atlas launch beta",
    ]);
    {
        let mut i = state.inner.lock().unwrap();
        checkpoint(&mut i, ids[3], "Research", None);
    }
    let server = MockServer::start().await;
    Mock::given(method("POST")).respond_with(ResponseTemplate::new(200).set_body_json(json!({"choices":[{"finish_reason":"stop","message":{"content":json!({"goal_id":ids[5],"confidence":0.93,"reason":"The beta deliverable is visible"}).to_string()}}]}))).expect(1).mount(&server).await;
    let base = Instant::now();
    let mut rows = Vec::new();
    let mut previous_key = String::new();
    let mut old_since = 0;
    let mut old_last: Option<u64> = None;
    let mut old_calls = 0;
    let mut old_resolutions = 0;
    // Six 90-second work segments, separated once by four six-second accidental switches.
    let segments = [
        (0, 90, "Editor", "Orion launch", ids[0]),
        (114, 90, "Editor", "Vega budget", ids[1]),
        (204, 90, "Editor", "Atlas launch beta", ids[5]),
        (294, 90, "Research", "Workspace", ids[3]),
        (384, 90, "Editor", "Cobalt audit", ids[2]),
        (474, 90, "Editor", "Orion launch", ids[0]),
    ];
    for t in (0..564).step_by(3) {
        let segment = segments
            .iter()
            .find(|(start, len, _, _, _)| t >= *start && t < start + len);
        let (app, title) = segment.map(|s| (s.2, s.3)).unwrap_or_else(|| {
            if (t / 6) % 2 == 0 {
                ("Editor", "Cobalt audit")
            } else {
                ("Editor", "Vega budget")
            }
        });
        let mut a = sample(title);
        a.process_name = app.into();
        let key = fingerprint(&a);
        if previous_key != key {
            previous_key = key;
            old_since = t;
        }
        if t - old_since >= 600 && old_last.is_none_or(|last| t - last >= 600) {
            old_calls += 1;
            old_resolutions += 1;
            old_last = Some(t);
        }
        let job = {
            let mut i = state.inner.lock().unwrap();
            observe_inner_at(&mut i, &a, true, base + Duration::from_secs(t)).unwrap();
            claim(&mut i, base + Duration::from_secs(t)).unwrap()
        };
        if let Some(job) = job {
            let response = request_at(
                &state.client,
                &server.uri(),
                "fixture",
                "fixture",
                &job.goals,
                &job.sample,
            )
            .await;
            finish(
                &mut state.inner.lock().unwrap(),
                &job,
                response,
                base + Duration::from_secs(t),
            )
            .unwrap();
        }
        if let Some((start, _, _, _, expected)) = segment {
            let i = state.inner.lock().unwrap();
            if i.goal_matching.view.goal_id == Some(*expected)
                && !rows.iter().any(|r: &Value| r["start"] == *start)
            {
                rows.push(json!({"start":start,"latency_seconds":t-start,"source":i.goal_matching.view.source}));
            }
        }
    }
    let i = state.inner.lock().unwrap();
    assert_eq!(rows.len(), 6);
    assert_eq!(i.goal_matching.metrics.nemotron_calls, 1);
    assert_eq!(i.goal_matching.metrics.local_resolutions, 5);
    assert_eq!(old_resolutions, 0);
    assert_eq!(old_calls, 0);
    assert!(rows
        .iter()
        .all(|r| r["latency_seconds"].as_u64().unwrap() <= 60));
    // Separate stationary reference: old policy first becomes eligible at 600s; new at 60s.
    let report = json!({"scenario_seconds":564,"active_goals":6,"old":{"stable_threshold_seconds":600,"recognized_segments":old_resolutions,"nemotron_calls":old_calls,"local_only_resolutions":0},"new":{"segments":rows,"nemotron_calls":i.goal_matching.metrics.nemotron_calls,"local_only_resolutions":i.goal_matching.metrics.local_resolutions},"stationary_ambiguous_first_eligibility_seconds":{"old":600,"new":AI_STABLE.as_secs()},"note":"Simulated 3-second collection; actual local HTTP fixture; provider latency excluded; counts cover goal matching only"});
    println!("SWITCHING_BENCHMARK {}", report);
}
#[test]
fn returning_to_a_resolved_lane_reuses_the_scoped_ai_result_after_debounce() {
    let (state, ids) = setup(&["Atlas launch alpha", "Atlas launch beta", "Vega budget"]);
    let mut i = state.inner.lock().unwrap();
    let base = Instant::now();
    let ambiguous = sample("Atlas launch beta");
    feed(&mut i, &ambiguous, base, 0, 60);
    let job = claim(&mut i, base + AI_STABLE).unwrap().unwrap();
    finish(
        &mut i,
        &job,
        Ok(MatchResult {
            goal_id: Some(ids[1]),
            confidence: 0.95,
            reason: "Beta deliverable".into(),
        }),
        base + AI_STABLE,
    )
    .unwrap();
    feed(&mut i, &sample("Vega budget"), base, 63, 93);
    assert_eq!(i.goal_matching.view.goal_id, Some(ids[2]));
    feed(&mut i, &ambiguous, base, 96, 126);
    assert_eq!(i.goal_matching.view.goal_id, Some(ids[1]));
    assert_eq!(i.goal_matching.view.source.as_deref(), Some("nebius"));
    assert_eq!(i.goal_matching.metrics.nemotron_calls, 1);
    assert!(!due_inner(&i, base + Duration::from_secs(200)));
}
