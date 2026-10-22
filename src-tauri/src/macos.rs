//! Public macOS APIs behind a small, owned-string native boundary.
use serde::de::DeserializeOwned;
use serde::Deserialize;
use std::ffi::{c_char, c_void, CStr, CString};
use std::sync::OnceLock;
use tauri::{Manager, WebviewWindow};

#[allow(
    clippy::duplicated_attributes,
    reason = "each #[link] names a different library; the shared kind is not a duplicate"
)]
#[link(name = "buddy_macos", kind = "static")]
#[link(name = "AppKit", kind = "framework")]
#[link(name = "ApplicationServices", kind = "framework")]
#[link(name = "Security", kind = "framework")]
#[link(name = "Carbon", kind = "framework")]
#[link(name = "Speech", kind = "framework")]
#[link(name = "CoreAudio", kind = "framework")]
#[link(name = "ScreenCaptureKit", kind = "framework")]
extern "C" {
    fn buddy_free(value: *mut c_char);
    fn buddy_accessibility(prompt: bool) -> bool;
    fn buddy_session_active() -> bool;
    fn buddy_idle() -> f64;
    fn buddy_foreground(metadata: bool) -> *mut c_char;
    fn buddy_fullscreen() -> bool;
    fn buddy_pin_window(window: *mut c_void);
    fn buddy_show_without_focus(window: *mut c_void);
    fn buddy_context(window: u64, selected: bool) -> *mut c_char;
    fn buddy_screen_permission(request: bool) -> bool;
    fn buddy_capture_window(window: u64) -> *mut c_char;
    fn buddy_review_key(secret: *const c_char) -> *mut c_char;
    fn buddy_apps() -> *mut c_char;
    fn buddy_keychain(account: *const c_char, secret: *const c_char, operation: i32)
        -> *mut c_char;
    fn buddy_shortcuts(callback: extern "C" fn(u32)) -> u32;
    // Only installed release builds register a login item; see `autostart::sync`.
    #[cfg(not(debug_assertions))]
    fn buddy_autostart(executable: *const c_char, enabled: bool) -> *mut c_char;
}
fn decode<T: DeserializeOwned>(pointer: *mut c_char) -> Result<T, String> {
    if pointer.is_null() {
        return Err("macOS integration is unavailable".into());
    }
    // Copy before freeing the native allocation. This data is never logged.
    let bytes = unsafe { CStr::from_ptr(pointer).to_bytes().to_vec() };
    unsafe { buddy_free(pointer) };
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid macOS integration response")?;
    if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
        return Err(error.into());
    }
    serde_json::from_value(value).map_err(|_| "Invalid macOS integration response".into())
}
fn string(value: &str) -> Result<CString, String> {
    CString::new(value).map_err(|_| "Invalid macOS integration input".into())
}
/// Independent local evidence key. Provider credentials continue to use the
/// immutable signed helper and its unchanged allowlist.
pub(crate) fn review_key(secret: Option<&str>) -> Result<Option<String>, String> {
    let secret = secret.map(string).transpose()?;
    decode(unsafe { buddy_review_key(secret.as_ref().map_or(std::ptr::null(), |s| s.as_ptr())) })
}
#[derive(Deserialize)]
pub struct Foreground {
    pub process: String,
    pub title: String,
    pub window: u64,
    pub idle: f64,
    pub media: bool,
    pub address: Option<String>,
}
/// Registers or removes the macOS login item. Called only from release builds
/// (`autostart::sync`), so debug Clippy and tests never compile a caller.
#[cfg(not(debug_assertions))]
pub fn autostart(enabled: bool) -> Result<(), String> {
    let path = std::env::current_exe().map_err(|_| "Could not locate the installed application")?;
    let path = string(path.to_str().ok_or("Invalid application path")?)?;
    decode(unsafe { buddy_autostart(path.as_ptr(), enabled) })
}
pub fn foreground(metadata: bool) -> Result<Foreground, String> {
    decode(unsafe { buddy_foreground(metadata) })
}
pub fn fullscreen() -> bool {
    unsafe { buddy_fullscreen() }
}
pub fn idle_seconds() -> Option<u64> {
    let idle = unsafe { buddy_idle() };
    (idle.is_finite() && idle >= 0.0).then_some(idle as u64)
}
pub fn context(window: usize, selected: bool) -> Result<String, String> {
    decode(unsafe { buddy_context(window as u64, selected) })
}
pub fn installed_apps() -> Result<Vec<crate::installed_apps::InstalledApp>, String> {
    decode(unsafe { buddy_apps() })
}
pub fn read_key(name: &str) -> Result<Option<String>, String> {
    let name = string(name)?;
    decode(unsafe { buddy_keychain(name.as_ptr(), std::ptr::null(), 0) })
}
pub fn has_key(name: &str) -> Result<bool, String> {
    let name = string(name)?;
    decode(unsafe { buddy_keychain(name.as_ptr(), std::ptr::null(), 3) })
}
pub fn write_key(name: &str, key: Option<&str>) -> Result<(), String> {
    let name = string(name)?;
    let key = key.map(string).transpose()?;
    decode(unsafe {
        buddy_keychain(
            name.as_ptr(),
            key.as_ref().map_or(std::ptr::null(), |k| k.as_ptr()),
            if key.is_some() { 1 } else { 2 },
        )
    })
}
pub fn request_accessibility_permission(window: WebviewWindow) -> Result<bool, String> {
    if window.label() != "main" {
        return Err("Open Settings in the workspace to manage permissions".into());
    }
    Ok(unsafe { buddy_accessibility(true) })
}
/// Legacy ad-hoc builds identify an exact binary hash, so their grants may become stale after an
/// update or signing-identity transition. This explicit repair removes only sumi's old grant.
/// Normal updates signed with the same stable identity must not invoke this reset.
pub fn reset_accessibility_permission(
    app: &tauri::AppHandle,
    window: WebviewWindow,
) -> Result<bool, String> {
    if window.label() != "main" {
        return Err("Open Settings in the workspace to manage permissions".into());
    }
    let identifier = app.config().identifier.clone();
    let status = std::process::Command::new("/usr/bin/tccutil")
        .args(["reset", "Accessibility", &identifier])
        .status()
        .map_err(|_| "Could not reset the Accessibility permission")?;
    if !status.success() {
        return Err("macOS did not reset the Accessibility permission".into());
    }
    Ok(unsafe { buddy_accessibility(true) })
}
pub fn pin_window(window: &WebviewWindow) {
    if let Ok(handle) = window.ns_window() {
        unsafe { buddy_pin_window(handle) };
    }
}
pub fn show_without_focus(window: &WebviewWindow) -> Result<(), String> {
    let handle = window
        .ns_window()
        .map_err(|_| "Could not read sumi native window")?;
    unsafe { buddy_show_without_focus(handle) };
    Ok(())
}
pub fn get_accessibility_permission() -> bool {
    unsafe { buddy_accessibility(false) }
}
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
extern "C" fn selected_shortcut(kind: u32) {
    let Some(app) = APP.get().cloned() else {
        return;
    };
    // Never hold application state on the native event thread.
    tauri::async_runtime::spawn(async move {
        let allowed = app
            .state::<crate::commands::AppState>()
            .inner
            .lock()
            .is_ok_and(|inner| {
                inner
                    .storage
                    .user_settings()
                    .is_ok_and(|s| s.onboarding.completed)
            });
        if !allowed || fullscreen() {
            return;
        }
        let result = tauri::async_runtime::spawn_blocking(|| {
            let active = foreground(false)?;
            context(active.window as usize, true)
        })
        .await;
        let (text, mut notice) = match result {
            Ok(Ok(text)) if !text.trim().is_empty() => (text, None),
            _ => (String::new(), Some("Selected text is unavailable. Allow Accessibility access or paste it into sumi.".to_string())),
        };
        if kind == 2 && !text.is_empty() {
            match crate::core_capture::receive(&app, &text) {
                Ok(()) => return,
                Err(error) => notice = Some(error),
            }
        }
        if let Ok(mut inner) = app.state::<crate::commands::AppState>().inner.lock() {
            inner.companion.view.notice = notice;
            inner.companion.view.seed = text;
            inner.companion.view.intent = "selection".into();
            inner.companion.view.chat_open = true;
            let _ = crate::buddy::sync(&app, &mut inner);
        }
        let _ = crate::buddy::windows::focus_chat(&app);
    });
}
pub fn install_shortcuts(app: &tauri::AppHandle) {
    let _ = APP.set(app.clone());
    let available = unsafe { buddy_shortcuts(selected_shortcut) };
    if let Ok(mut inner) = app.state::<crate::commands::AppState>().inner.lock() {
        inner.companion.view.shortcut_available = available & 1 != 0;
    }
}

#[derive(Default)]
pub struct MacCollector {
    tracker: crate::collector::DurationTracker,
    previous_window: u64,
    settings: crate::tracking::TrackingSettings,
    excluded: Vec<String>,
}
impl crate::collector::ActivityCollector for MacCollector {
    fn configure(&mut self, settings: &crate::tracking::TrackingSettings, excluded: &[String]) {
        self.settings = settings.clone();
        self.excluded = excluded.to_vec();
    }
    fn collect(&mut self) -> Result<crate::models::ActivitySnapshot, String> {
        if !session_active() {
            self.tracker = Default::default();
            return Err("Desktop session is inactive or locked".into());
        }
        let active = foreground(false)?;
        if self.previous_window != active.window {
            self.tracker = Default::default();
            self.previous_window = active.window;
        }
        let excluded = self
            .excluded
            .iter()
            .any(|p| p.eq_ignore_ascii_case(&active.process));
        // Exclusions are checked before reading any browser address metadata.
        let active = if self.settings.browser_metadata && !excluded {
            let metadata = foreground(true)?;
            if active.window != metadata.window || active.title != metadata.title {
                self.tracker = Default::default();
                return Err(crate::collector::CONTEXT_CHANGED.into());
            }
            metadata
        } else {
            active
        };
        let domain = active
            .address
            .as_deref()
            .and_then(crate::browser::sanitize_domain);
        let browser = crate::browser::context(&active.process, &active.title, domain);
        let idle = if active.idle.is_finite() && active.idle >= 0.0 {
            active.idle as u64
        } else {
            return Err("Could not read idle time".into());
        };
        let context = format!(
            "{}|{}",
            active.title,
            browser
                .as_ref()
                .and_then(|b| b.domain.as_deref())
                .unwrap_or("")
        );
        let duration =
            self.tracker
                .update(&active.process, &context, idle, self.settings.idle_seconds);
        Ok(crate::models::ActivitySnapshot {
            timestamp: chrono::Utc::now().to_rfc3339(),
            process_name: active.process,
            window_title: browser
                .as_ref()
                .map_or(active.title, |b| b.page_title.clone()),
            idle_seconds: idle,
            active_seconds: duration,
            window_id: Some(active.window),
            browser,
            media_playing: active.media,
        })
    }
}

pub(crate) fn session_active() -> bool {
    unsafe { buddy_session_active() }
}
pub(crate) fn screen_permission(request: bool) -> bool {
    unsafe { buddy_screen_permission(request) }
}
pub(crate) fn capture_window(window: u64) -> Result<String, String> {
    if foreground(false)?.window != window {
        return Err("Capture foreground changed".into());
    }
    let image = decode(unsafe { buddy_capture_window(window) })?;
    if foreground(false)?.window != window {
        return Err("Capture foreground changed".into());
    }
    Ok(image)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_inventory_does_not_return_paths() {
        for app in installed_apps().unwrap() {
            assert!(!app.process_name.contains('/'));
            assert!(!app.name.contains("/Applications/"));
        }
    }
    #[test]
    fn idle_is_a_valid_duration() {
        assert!(idle_seconds().is_some());
    }
    #[test]
    #[ignore = "Uses the reviewed local signing identity for an isolated cross-build Keychain test"]
    fn keychain_round_trip() {
        let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../scripts/test-credential-helper.sh");
        assert!(std::process::Command::new("bash")
            .arg(script)
            .status()
            .unwrap()
            .success());
    }
}
