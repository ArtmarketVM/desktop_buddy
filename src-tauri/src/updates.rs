use serde::Serialize;
use std::time::Duration;
use tauri::{ipc::Channel, Manager, State, WebviewWindow};
use tauri_plugin_updater::{Update, UpdaterExt};

const ENDPOINT: &str =
    "https://github.com/ArtmarketVM/desktop_buddy/releases/latest/download/latest.json";

#[derive(Default)]
pub struct UpdateState(pub tokio::sync::Mutex<Option<Update>>);

#[derive(Clone, Serialize)]
pub struct UpdateInfo {
    pub status: &'static str,
    pub current_version: String,
    pub version: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct UpdateProgress {
    pub phase: &'static str,
    pub downloaded: u64,
    pub total: Option<u64>,
}

fn workspace_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Open the workspace to manage updates".into())
    }
}

fn validate_download(url: &reqwest::Url) -> Result<(), String> {
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port_or_known_default() != Some(443)
        || !url
            .path()
            .starts_with("/ArtmarketVM/desktop_buddy/releases/download/")
        || !url.path().ends_with(".exe")
    {
        return Err("The update is not a Windows release from Desktop Buddy's repository".into());
    }
    Ok(())
}

#[tauri::command(async)]
pub async fn check_app_update(
    window: WebviewWindow,
    state: State<'_, UpdateState>,
) -> Result<UpdateInfo, String> {
    workspace_only(&window)?;
    let mut pending = state
        .0
        .try_lock()
        .map_err(|_| "Another update action is running")?;
    *pending = None;
    let app = window.app_handle();
    let mut info = UpdateInfo {
        status: "current",
        current_version: app.package_info().version.to_string(),
        version: None,
        notes: None,
    };
    // A new repository has no updater manifest yet. This is distinct from an
    // unreachable server, invalid manifest, or a signed newer release.
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "Could not start the update check")?
        .get(ENDPOINT)
        .header("User-Agent", "DesktopBuddy-Updater")
        .send()
        .await
        .map_err(|_| "Could not reach GitHub. Check your connection and try again.")?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        info.status = "unpublished";
        return Ok(info);
    }
    if !response.status().is_success() {
        return Err("GitHub update service is unavailable. Try again later.".into());
    }
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "Update configuration is unavailable")?;
    if let Some(mut update) = updater
        .check()
        .await
        .map_err(|_| "Could not validate the published update. Try again later.")?
    {
        validate_download(&update.download_url)?;
        update.timeout = Some(Duration::from_secs(180));
        info.status = "available";
        info.version = Some(update.version.clone());
        info.notes = update.body.as_ref().map(|s| s.chars().take(8000).collect());
        *pending = Some(update);
    }
    Ok(info)
}

#[tauri::command(async)]
pub async fn install_app_update(
    version: String,
    progress: Channel<UpdateProgress>,
    window: WebviewWindow,
    state: State<'_, UpdateState>,
) -> Result<(), String> {
    workspace_only(&window)?;
    if cfg!(debug_assertions) {
        return Err("Install updates from the installed Windows app".into());
    }
    let mut pending = state
        .0
        .try_lock()
        .map_err(|_| "Another update action is running")?;
    let update = pending
        .as_ref()
        .ok_or("Check for updates before installing")?;
    if update.version != version {
        return Err("The available version changed. Check for updates again.".into());
    }
    validate_download(&update.download_url)?;
    let mut downloaded = 0u64;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded = downloaded.saturating_add(chunk as u64);
                let _ = progress.send(UpdateProgress {
                    phase: "downloading",
                    downloaded,
                    total,
                });
            },
            || {},
        )
        .await
        .map_err(|_| {
            "Update download or signature verification failed. Your installed version is unchanged."
        })?;
    // Download verifies the artifact before stopping the session or launching it.
    {
        let app_state = window.state::<crate::commands::AppState>();
        let mut inner = app_state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        crate::buddy::remember_position(window.app_handle(), &mut inner)?;
    }
    let _ = progress.send(UpdateProgress {
        phase: "installing",
        downloaded,
        total: Some(bytes.len() as u64),
    });
    update
        .install(bytes)
        .map_err(|_| "Could not start the Windows installer. Please try again.")?;
    *pending = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_https_installers_from_the_pinned_repository() {
        let valid = "https://github.com/ArtmarketVM/desktop_buddy/releases/download/v0.11.0/Desktop.Buddy_0.11.0_x64-setup.exe";
        assert!(validate_download(&valid.parse().unwrap()).is_ok());
        for invalid in [
            valid.replace("https:", "http:"),
            valid.replace("ArtmarketVM", "other"),
            valid.replace("github.com", "github.com.evil.example"),
            valid.replace(".exe", ".zip"),
            valid.replace("github.com", "user:password@github.com"),
        ] {
            assert!(validate_download(&invalid.parse().unwrap()).is_err());
        }
    }
}
