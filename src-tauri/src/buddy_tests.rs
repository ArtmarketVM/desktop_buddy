use super::*;
use crate::storage::Storage;

#[test]
fn passive_companion_stays_visible_while_quiet_but_never_displays_a_notification_card() {
    let state = AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap()).unwrap();
    let mut inner = state.inner.lock().unwrap();
    inner.buddy.view.preferences.suggestions_only = false;
    inner.buddy.view.suggestion = Some(Suggestion {
        id: 1,
        title: "Private".into(),
        url: "https://example.com".into(),
        reason: "Help".into(),
    });
    assert_eq!(mode(&inner.status, &inner.buddy.view), 1);
    assert!(!inner.status.tracking);
    assert!(!inner.status.ai_enabled);
    assert!(
        !inner
            .storage
            .user_settings()
            .unwrap()
            .onboarding
            .tracking_consent
    );
    inner.status.tracking = true;
    inner.status.dnd = true;
    assert_eq!(mode(&inner.status, &inner.buddy.view), 1);
    inner.status.dnd = false;
    inner.buddy.view.quiet_reason = Some("Outside working hours".into());
    assert_eq!(mode(&inner.status, &inner.buddy.view), 1);
    inner.buddy.view.preferences.suggestions_only = true;
    assert_eq!(mode(&inner.status, &inner.buddy.view), 0);
}

#[test]
fn ratings_can_be_replaced_and_cleared_without_duplicates() {
    let mut storage = Storage::open(std::path::Path::new(":memory:")).unwrap();
    let goal = storage.set_goal("Learn Rust").unwrap();
    let id = storage
        .record_recommendation(goal.id, "Guide", "https://example.com", "Useful")
        .unwrap();
    for rating in [Some(true), Some(false), None] {
        storage.rate_recommendation(id, rating).unwrap();
        let history = storage.recommendation_history().unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].feedback, rating);
    }
    assert!(storage.rate_recommendation(id + 1, Some(true)).is_err());
}

#[test]
fn snooze_suppresses_display_and_scheduling_without_pausing_tracking() {
    let state = AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap()).unwrap();
    let mut inner = state.inner.lock().unwrap();
    inner.status.tracking = true;
    crate::tracking::allow_notifications(&mut inner);
    inner.status.mock_ai = false;
    inner.status.nebius_configured = true;
    inner.status.tavily_configured = true;
    inner.buddy.view.preferences.proactive = true;
    inner.buddy.view.preferences.suggestions_only = false;
    inner.buddy.view.snoozed_until = Some(chrono::Utc::now().timestamp() + 3600);
    assert!(!due(&inner));
    assert_eq!(mode(&inner.status, &inner.buddy.view), 0);
    assert!(inner.status.tracking);
    inner.buddy.view.snoozed_until = Some(chrono::Utc::now().timestamp() - 1);
    assert!(due(&inner));
    inner.buddy.last_search = Some(Instant::now() - Duration::from_secs(600));
    inner.buddy.view.preferences.interval_minutes = 5;
    assert!(due(&inner));
    inner.buddy.view.preferences.interval_minutes = 30;
    assert!(!due(&inner));
}

#[test]
fn modes_and_cadence_respect_preferences_pause_and_dnd() {
    let state = AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap()).unwrap();
    let mut inner = state.inner.lock().unwrap();
    inner.status.tracking = true;
    crate::tracking::allow_notifications(&mut inner);
    inner.buddy.view.preferences.suggestions_only = true;
    assert_eq!(mode(&inner.status, &inner.buddy.view), 0);
    inner.buddy.view.preferences.suggestions_only = false;
    assert_eq!(mode(&inner.status, &inner.buddy.view), 1);
    assert!(!due(&inner));
    inner.buddy.view.preferences.proactive = true;
    inner.status.mock_ai = false;
    inner.status.nebius_configured = true;
    inner.status.tavily_configured = true;
    assert!(due(&inner));
    inner.buddy.last_search = Some(Instant::now());
    assert!(!due(&inner));
    inner.buddy.last_search = Some(Instant::now() - Duration::from_secs(901));
    assert!(due(&inner));
    inner.buddy.view.suggestion = Some(Suggestion {
        id: 1,
        title: "Resource".into(),
        url: "https://example.com".into(),
        reason: "Useful topic".into(),
    });
    assert_eq!(mode(&inner.status, &inner.buddy.view), 2);
    inner.buddy.view.avatar.visible = false;
    assert_eq!(mode(&inner.status, &inner.buddy.view), 2);
    assert!(due(&inner));
    inner.buddy.view.avatar.visible = true;
    inner.status.dnd = true;
    assert_eq!(mode(&inner.status, &inner.buddy.view), 1);
    assert!(!due(&inner));
    inner.status.dnd = false;
    inner.status.tracking = false;
    assert!(!due(&inner));
    assert_eq!(mode(&inner.status, &inner.buddy.view), 1);
}
#[test]
fn persists_preferences_and_deduplicates_per_goal() {
    let mut storage = Storage::open(std::path::Path::new(":memory:")).unwrap();
    assert!(!storage.buddy_preferences().unwrap().suggestions_only);
    assert!(!storage.buddy_preferences().unwrap().proactive);
    storage
        .save_buddy_preferences(&BuddyPreferences {
            suggestions_only: false,
            proactive: true,
            ..Default::default()
        })
        .unwrap();
    assert!(!storage.buddy_preferences().unwrap().suggestions_only);
    assert!(storage.buddy_preferences().unwrap().proactive);
    let goal = storage.set_goal("Learn Rust").unwrap();
    storage
        .save_suggestion(goal.id, "https://example.com/")
        .unwrap();
    storage
        .save_suggestion(goal.id, "https://example.com/")
        .unwrap();
    assert!(storage
        .seen_suggestion(goal.id, "https://example.com/")
        .unwrap());
    let next = storage.set_goal("Learn TypeScript").unwrap();
    assert!(!storage
        .seen_suggestion(next.id, "https://example.com/")
        .unwrap());
}

#[test]
fn desktop_companion_respects_fullscreen_without_hiding_explicit_chat() {
    let state = AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap()).unwrap();
    let mut inner = state.inner.lock().unwrap();
    inner.buddy.view.preferences.suggestions_only = false;
    inner.buddy.view.companion.preferences.hide_fullscreen = true;
    assert_eq!(display_mode(&inner.status, &inner.buddy.view, false), 1);
    assert_eq!(display_mode(&inner.status, &inner.buddy.view, true), 0);
    inner.buddy.view.companion.chat_open = true;
    assert_eq!(display_mode(&inner.status, &inner.buddy.view, true), 3);
    inner.buddy.view.companion.chat_open = false;
    inner.buddy.view.companion.preferences.hide_fullscreen = false;
    assert_eq!(display_mode(&inner.status, &inner.buddy.view, true), 1);
    inner.buddy.view.avatar.visible = false;
    assert_eq!(display_mode(&inner.status, &inner.buddy.view, false), 0);
}

#[test]
fn hidden_character_keeps_checkins_but_respects_quiet_and_snooze() {
    let state = AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap()).unwrap();
    let mut inner = state.inner.lock().unwrap();
    let view = &mut inner.buddy.view;
    view.avatar.visible = false;
    view.companion.intervention = Some(crate::companion::engine::Intervention {
        id: "checkin".into(),
        kind: crate::companion::engine::Kind::Midday,
        text: "Next step?".into(),
        confidence: 1.0,
        goal_id: None,
        plan_revision: None,
        step_id: None,
        expires_at: i64::MAX,
    });
    assert_eq!(mode(&inner.status, &inner.buddy.view), 2);
    inner.status.dnd = true;
    assert_eq!(mode(&inner.status, &inner.buddy.view), 0);
    inner.status.dnd = false;
    inner.buddy.view.quiet_reason = Some("Meeting".into());
    assert_eq!(mode(&inner.status, &inner.buddy.view), 0);
    inner.buddy.view.quiet_reason = None;
    inner.buddy.view.snoozed_until = Some(i64::MAX);
    assert_eq!(mode(&inner.status, &inner.buddy.view), 0);
    inner.buddy.view.snoozed_until = None;
    inner.buddy.view.companion.intervention = None;
    assert_eq!(mode(&inner.status, &inner.buddy.view), 0);
}

#[test]
fn mascot_anchor_survives_chat_resize_screen_edges_and_native_drag() {
    for scale in [1.0, 1.25, 2.0] {
        for anchor in [
            BuddyPosition { x: 100, y: 740 },
            BuddyPosition { x: 1440, y: 740 },
            BuddyPosition { x: -1450, y: -100 },
        ] {
            let origin = if anchor.x < 0 { (-1500, -800) } else { (0, 0) };
            for logical in [(160, 152), (440, 660), (380, 440), (160, 152)] {
                let size = (
                    (logical.0 as f64 * scale) as u32,
                    (logical.1 as f64 * scale) as u32,
                );
                let position = clamp_position(&anchor, origin, (1500, 800), size);
                let offset = mascot_offset(&anchor, position, size, scale);
                assert_eq!(window_anchor(position, size, offset, scale), anchor);
                let moved = window_anchor(
                    PhysicalPosition::new(position.x + 30, position.y - 20),
                    size,
                    offset,
                    scale,
                );
                assert_eq!(
                    moved,
                    BuddyPosition {
                        x: anchor.x + 30,
                        y: anchor.y - 20
                    }
                );
            }
        }
    }
}

#[test]
fn deadline_cards_work_without_tracking_but_never_bypass_quiet_reasons() {
    let state = AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap()).unwrap();
    let mut inner = state.inner.lock().unwrap();
    inner.buddy.view.companion.intervention = Some(crate::companion::engine::Intervention {
        id: "deadline".into(),
        kind: crate::companion::engine::Kind::Deadline,
        text: "Task is overdue".into(),
        confidence: 1.0,
        goal_id: Some(1),
        plan_revision: None,
        step_id: None,
        expires_at: i64::MAX,
    });
    inner.status.tracking = false;
    inner.buddy.view.quiet_reason = Some("Waiting for a pause in input".into());
    assert_eq!(mode(&inner.status, &inner.buddy.view), 2);
    for reason in [
        "Quiet hours",
        "Outside working hours",
        "You are away",
        "Meeting or presentation",
    ] {
        inner.buddy.view.quiet_reason = Some(reason.into());
        assert_ne!(mode(&inner.status, &inner.buddy.view), 2);
    }
    inner.buddy.view.quiet_reason = None;
    inner.status.dnd = true;
    assert_ne!(mode(&inner.status, &inner.buddy.view), 2);
}
