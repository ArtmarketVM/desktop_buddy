use super::*;
use crate::storage::Storage;

#[test]
fn modes_and_cadence_respect_preferences_pause_and_dnd() {
    let state = AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap()).unwrap();
    let mut inner = state.inner.lock().unwrap();
    inner.status.tracking = true;
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
    inner.status.dnd = true;
    assert_eq!(mode(&inner.status, &inner.buddy.view), 0);
    assert!(!due(&inner));
    inner.status.dnd = false;
    inner.status.tracking = false;
    assert!(!due(&inner));
    assert_eq!(mode(&inner.status, &inner.buddy.view), 0);
}
#[test]
fn persists_preferences_and_deduplicates_per_goal() {
    let mut storage = Storage::open(std::path::Path::new(":memory:")).unwrap();
    assert!(storage.buddy_preferences().unwrap().suggestions_only);
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
fn discards_results_after_goal_or_consent_changes() {
    let state = AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap()).unwrap();
    let mut inner = state.inner.lock().unwrap();
    let goal = inner.storage.set_goal("Learn Rust").unwrap();
    inner.status.tracking = true;
    inner.buddy.view.preferences.proactive = true;
    assert!(valid(&inner, goal.id, 0).unwrap());
    inner.buddy.clear();
    assert!(!valid(&inner, goal.id, 0).unwrap());
    assert!(!valid(&inner, goal.id + 1, 1).unwrap());
    inner.buddy.view.preferences.proactive = false;
    assert!(!valid(&inner, goal.id, 1).unwrap());
}
