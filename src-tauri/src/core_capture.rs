use crate::{commands::AppState, storage::Storage};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize, Deserialize)]
pub struct CapturedDraft {
    pub id: String,
    pub text: String,
}
pub fn capture_text(value: &str) -> Result<String, String> {
    let text = value.trim();
    if text.is_empty() || text.chars().count() > 4000 || text.contains('\0') {
        return Err("Select between 1 and 4,000 characters, or paste your goal into Buddy".into());
    }
    Ok(text.into())
}
pub fn parse_link(value: &str) -> Result<String, String> {
    if value.len() > 48000 {
        return Err("Selected text is too long".into());
    }
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid goal link")?;
    if url.scheme() != "desktopbuddy"
        || url.host_str() != Some("goal")
        || !["", "/"].contains(&url.path())
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
    {
        return Err("Invalid goal link".into());
    }
    let pairs: Vec<_> = url.query_pairs().collect();
    if pairs.len() != 1 || pairs[0].0 != "text" {
        return Err("Invalid goal link".into());
    }
    capture_text(&pairs[0].1)
}
impl Storage {
    pub fn captured_drafts(&self) -> Result<Vec<CapturedDraft>, String> {
        Ok(self
            .read_setting("core_captured_drafts")?
            .unwrap_or_default())
    }
    pub fn capture_goal_draft(&self, text: &str) -> Result<(), String> {
        let text = capture_text(text)?;
        let mut drafts = self.captured_drafts()?;
        if drafts.len() >= 20 {
            return Err("Review your pending goals before adding more".into());
        }
        let id = format!(
            "capture-{}",
            Utc::now()
                .timestamp_nanos_opt()
                .ok_or("Clock unavailable")?
        );
        drafts.push(CapturedDraft { id, text });
        self.write_setting("core_captured_drafts", &drafts)
    }
    pub fn remove_captured_draft(&self, id: &str) -> Result<(), String> {
        let mut drafts = self.captured_drafts()?;
        drafts.retain(|draft| draft.id != id);
        self.write_setting("core_captured_drafts", &drafts)
    }
    pub fn accept_captured_draft(&mut self, id: &str, title: &str) -> Result<(), String> {
        if !self.captured_drafts()?.iter().any(|draft| draft.id == id) {
            return Err("Draft no longer exists".into());
        }
        self.core_create_goal(title, id, &chrono::Local::now().date_naive().to_string())?;
        self.remove_captured_draft(id)
    }
}
pub fn receive(app: &AppHandle, text: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .capture_goal_draft(text)?;
    app.emit("buddy://drafts-updated", ())
        .map_err(|_| "Could not refresh drafts")?;
    app.emit("buddy://navigate", "focus")
        .map_err(|_| "Could not open Today")?;
    crate::buddy::open_workspace(app.clone())
}
pub fn install(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_deep_link::DeepLinkExt;
    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        let urls = event.urls().to_vec();
        let handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            for url in urls {
                if let Ok(text) = parse_link(url.as_str()) {
                    let _ = receive(&handle, &text);
                }
            }
        });
    });
    if let Some(urls) = app.deep_link().get_current()? {
        for url in urls {
            if let Ok(text) = parse_link(url.as_str()) {
                let _ = receive(app, &text);
            }
        }
    }
    Ok(())
}
#[tauri::command(async)]
pub fn get_core_drafts(state: State<AppState>) -> Result<Vec<CapturedDraft>, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .captured_drafts()
}
#[tauri::command(async)]
pub fn resolve_core_draft(
    state: State<AppState>,
    app: AppHandle,
    id: String,
    title: Option<String>,
) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if let Some(title) = title {
        inner.storage.accept_captured_draft(&id, &title)?;
        inner.privacy_revision += 1;
        inner.companion.invalidate();
        inner.buddy.clear();
        crate::buddy::sync(&app, &mut inner)?;
    } else {
        inner.storage.remove_captured_draft(&id)?;
    }
    Ok(())
}
#[tauri::command(async)]
pub fn capture_companion_goal(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let text = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .companion
        .view
        .seed
        .clone();
    receive(&app, &text)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_bounded_goal_links_and_never_executes_content() {
        assert_eq!(
            parse_link("desktopbuddy://goal?text=Ship%20release").unwrap(),
            "Ship release"
        );
        for link in [
            "https://goal?text=Goal",
            "desktopbuddy://other?text=Goal",
            "desktopbuddy://goal?text=Goal&text=Other",
            "desktopbuddy://goal/path?text=Goal",
            "desktopbuddy://goal?text=",
            "desktopbuddy://user@goal?text=Goal",
        ] {
            assert!(parse_link(link).is_err());
        }
        assert!(capture_text(&"x".repeat(4001)).is_err());
    }
    #[test]
    fn drafts_are_reviewed_persisted_and_retry_safe() {
        let mut store = Storage::open(std::path::Path::new(":memory:")).unwrap();
        store.capture_goal_draft("Ship").unwrap();
        assert!(store.core_snapshot(None).unwrap().goals.is_empty());
        let draft = store.captured_drafts().unwrap().remove(0);
        assert!(store.accept_captured_draft(&draft.id, "").is_err());
        assert_eq!(store.captured_drafts().unwrap().len(), 1);
        store
            .accept_captured_draft(&draft.id, "Reviewed title")
            .unwrap();
        assert!(store.captured_drafts().unwrap().is_empty());
        assert!(store.accept_captured_draft(&draft.id, "Duplicate").is_err());
        assert_eq!(store.core_snapshot(None).unwrap().goals.len(), 1);
        store.capture_goal_draft("Discard").unwrap();
        let id = store.captured_drafts().unwrap()[0].id.clone();
        store.remove_captured_draft(&id).unwrap();
        assert_eq!(store.core_snapshot(None).unwrap().goals.len(), 1);
    }
}
