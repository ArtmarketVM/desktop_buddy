//! Content-free invalidations shared by both webviews; never include screen or provider data.
use crate::commands::Inner;
use serde::Serialize;
use std::{
    hash::{DefaultHasher, Hash, Hasher},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Runtime};

pub const EVENT: &str = "buddy://data-changed";
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Resource {
    Dashboard,
    Workspace,
    Activity,
    Preferences,
    Services,
    Coaching,
    Noticed,
    Engine,
    Chats,
    CurrentChat,
    Drafts,
}
pub const ALL: &[Resource] = &[
    Resource::Dashboard,
    Resource::Workspace,
    Resource::Activity,
    Resource::Preferences,
    Resource::Services,
    Resource::Coaching,
    Resource::Noticed,
    Resource::Engine,
    Resource::Chats,
    Resource::CurrentChat,
    Resource::Drafts,
];
#[derive(Clone, Serialize)]
struct Change<'a> {
    resources: &'a [Resource],
    reset: bool,
}
pub fn changed<R: Runtime>(app: &impl Emitter<R>, resources: &[Resource], reset: bool) {
    // AppHandle broadcast, not emit_to: main and buddy keep independent stores.
    let _ = app.emit(EVENT, Change { resources, reset });
}
#[derive(Default)]
pub struct State {
    dashboard: Option<u64>,
    database: u64,
    activity_at: Option<Instant>,
}
impl State {
    fn observe(&mut self, dashboard: u64, database: u64, now: Instant) -> Vec<Resource> {
        let mut resources = Vec::new();
        if self.dashboard != Some(dashboard) {
            self.dashboard = Some(dashboard);
            resources.push(Resource::Dashboard);
        }
        // Progress and window journals change every collector tick. Coalesce those
        // writes; explicit user mutations bypass this gate in core::mutate.
        if database != self.database
            && self
                .activity_at
                .is_none_or(|at| now.saturating_duration_since(at) >= Duration::from_secs(15))
        {
            self.database = database;
            self.activity_at = Some(now);
            resources.extend([
                Resource::Workspace,
                Resource::Activity,
                Resource::Noticed,
                Resource::Engine,
            ]);
        }
        resources
    }
}
fn dashboard_fingerprint(mut metadata: serde_json::Value) -> u64 {
    // Pure clock fields must not turn a periodic sample into an immediate
    // invalidation of every dashboard consumer.
    metadata["status"]["last_collected_at"] = serde_json::Value::Null;
    for path in ["/buddy/companion/activity", "/companion/activity"] {
        if let Some(activity) = metadata.pointer_mut(path).and_then(|v| v.as_object_mut()) {
            activity.remove("timestamp");
        }
    }
    let mut hash = DefaultHasher::new();
    metadata.to_string().hash(&mut hash);
    hash.finish()
}
pub fn sync(app: &AppHandle, inner: &mut Inner) -> Result<(), String> {
    let metadata = serde_json::json!({"status":inner.status,"buddy":inner.buddy.view,"companion":inner.companion.view,"settings":inner.storage.user_settings()?,"revision":inner.privacy_revision,"error":inner.last_error});
    let resources = inner.frontend_events.observe(
        dashboard_fingerprint(metadata),
        inner.storage.connection.total_changes(),
        Instant::now(),
    );
    if !resources.is_empty() {
        changed(app, &resources, false);
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn state_changes_are_immediate_but_activity_writes_are_coalesced() {
        let mut state = State::default();
        let now = Instant::now();
        assert_eq!(state.observe(1, 0, now), vec![Resource::Dashboard]);
        assert!(state.observe(1, 0, now).is_empty());
        assert!(state.observe(1, 1, now).contains(&Resource::Activity));
        assert!(state.observe(1, 2, now + Duration::from_secs(3)).is_empty());
        assert_eq!(
            state.observe(2, 2, now + Duration::from_secs(4)),
            vec![Resource::Dashboard]
        );
        assert!(state
            .observe(2, 2, now + Duration::from_secs(15))
            .contains(&Resource::Workspace));
    }
    #[test]
    fn sample_clocks_do_not_invalidate_the_dashboard_but_window_changes_do() {
        let first = serde_json::json!({"status":{"last_collected_at":"first"},"buddy":{"companion":{"activity":{"timestamp":"first","app":"Editor"}}},"companion":{"activity":{"timestamp":"first","app":"Editor"}}});
        let mut later = first.clone();
        later["status"]["last_collected_at"] = serde_json::json!("later");
        later["buddy"]["companion"]["activity"]["timestamp"] = serde_json::json!("later");
        later["companion"]["activity"]["timestamp"] = serde_json::json!("later");
        assert_eq!(
            dashboard_fingerprint(first.clone()),
            dashboard_fingerprint(later.clone())
        );
        later["companion"]["activity"]["app"] = serde_json::json!("Browser");
        assert_ne!(dashboard_fingerprint(first), dashboard_fingerprint(later));
    }
    #[test]
    fn broadcast_payload_is_content_free_and_reaches_both_windows() {
        use std::sync::{Arc, Mutex};
        use tauri::Listener;
        let app = tauri::test::mock_app();
        let main = tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::default())
            .build()
            .unwrap();
        let buddy = tauri::WebviewWindowBuilder::new(&app, "buddy", tauri::WebviewUrl::default())
            .build()
            .unwrap();
        let seen = Arc::new(Mutex::new(Vec::new()));
        for window in [main, buddy] {
            let seen = seen.clone();
            window.listen_any(EVENT, move |event| {
                seen.lock().unwrap().push(event.payload().to_string())
            });
        }
        changed(&app, ALL, true);
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 2);
        for packet in seen.iter() {
            let value: serde_json::Value = serde_json::from_str(packet).unwrap();
            assert_eq!(value.as_object().unwrap().len(), 2);
            assert_eq!(value["reset"], true);
            assert!(value["resources"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("current-chat")));
        }
    }
}
