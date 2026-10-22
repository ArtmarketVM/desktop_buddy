//! A fixed mascot and a separately prepared, non-activating card window.
use super::{
    placement::{self, Placement, Rect, Side},
    *,
};
use serde::Serialize;
use tauri::{PhysicalSize, WebviewWindow};

#[derive(Clone, Debug, Serialize)]
pub struct PanelView {
    pub generation: u64,
    pub arrow_offset: f64,
    pub mode: u8,
    pub side: Side,
}
#[derive(Clone, Copy)]
struct Panel {
    placement: Placement,
    mode: u8,
    generation: u64,
}
pub struct WindowState {
    mascot: Option<Rect>,
    panel: Option<Panel>,
    height: u32,
    generation: u64,
    painted: u64,
    ready: bool,
    focus: bool,
}
impl Default for WindowState {
    fn default() -> Self {
        Self {
            mascot: None,
            panel: None,
            height: 240,
            generation: 0,
            painted: 0,
            ready: false,
            focus: false,
        }
    }
}
impl WindowState {
    fn accepts_frame(&self, generation: u64, mode: u8) -> bool {
        self.panel
            .is_some_and(|p| p.generation == generation && p.mode == mode)
    }
    pub(super) fn forget_position(&mut self) {
        self.mascot = None;
        self.panel = None;
    }
}
fn rect(window: &WebviewWindow) -> Result<Rect, String> {
    let p = window
        .outer_position()
        .map_err(|_| "Could not read sumi position")?;
    let s = window
        .outer_size()
        .map_err(|_| "Could not read sumi size")?;
    Ok(Rect {
        x: p.x,
        y: p.y,
        width: s.width,
        height: s.height,
    })
}
fn hide(window: &WebviewWindow) -> Result<(), String> {
    if window
        .is_visible()
        .map_err(|_| "Could not read sumi visibility")?
    {
        #[cfg(windows)]
        {
            let handle = window
                .hwnd()
                .map_err(|_| "Could not read sumi native window")?
                .0 as usize;
            window
                .run_on_main_thread(move || unsafe {
                    use ::windows::Win32::{
                        Foundation::HWND,
                        UI::WindowsAndMessaging::{ShowWindow, SW_HIDE},
                    };
                    let _ = ShowWindow(HWND(handle as *mut _), SW_HIDE);
                })
                .map_err(|_| "Could not hide sumi")?;
        }
        #[cfg(not(windows))]
        window.hide().map_err(|_| "Could not hide sumi")?;
    }
    Ok(())
}
fn show(window: &WebviewWindow) -> Result<(), String> {
    if !window
        .is_visible()
        .map_err(|_| "Could not read sumi visibility")?
    {
        #[cfg(target_os = "macos")]
        crate::macos::show_without_focus(window)?;
        #[cfg(windows)]
        {
            let handle = window
                .hwnd()
                .map_err(|_| "Could not read sumi native window")?
                .0 as usize;
            window
                .run_on_main_thread(move || unsafe {
                    use ::windows::Win32::{
                        Foundation::HWND,
                        UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE},
                    };
                    let _ = ShowWindow(HWND(handle as *mut _), SW_SHOWNOACTIVATE);
                })
                .map_err(|_| "Could not show sumi without activation")?;
        }
        #[cfg(not(any(target_os = "macos", windows)))]
        window.show().map_err(|_| "Could not show sumi")?;
    }
    Ok(())
}
fn focus(window: &WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        let handle = window
            .hwnd()
            .map_err(|_| "Could not read sumi native window")?
            .0 as usize;
        // Native non-activating presentation deliberately bypasses Tao's visible flag.
        window
            .run_on_main_thread(move || unsafe {
                use ::windows::Win32::{
                    Foundation::HWND, UI::WindowsAndMessaging::SetForegroundWindow,
                };
                let _ = SetForegroundWindow(HWND(handle as *mut _));
            })
            .map_err(|_| "Could not focus sumi chat".to_owned())
    }
    #[cfg(not(windows))]
    window
        .set_focus()
        .map_err(|_| "Could not focus sumi chat".into())
}
/// Only the fixed window can update the user's anchor; panel motion never writes it.
pub(super) fn remember(app: &AppHandle, inner: &mut crate::commands::Inner) -> Result<(), String> {
    if !inner.buddy.positioned {
        return Ok(());
    }
    let window = app
        .get_webview_window("mascot")
        .ok_or("sumi mascot unavailable")?;
    let current = rect(&window)?;
    if inner.buddy.windows.mascot == Some(current) {
        return Ok(());
    }
    let anchor = BuddyPosition {
        x: current.x + current.width as i32 / 2,
        y: current.y + current.height as i32,
    };
    if inner.buddy.position.as_ref() != Some(&anchor) {
        inner.storage.write_setting("buddy_position", &anchor)?;
        inner.buddy.position = Some(anchor);
    }
    inner.buddy.windows.mascot = Some(current);
    Ok(())
}
pub(super) fn sync(
    app: &AppHandle,
    inner: &mut crate::commands::Inner,
    mode: u8,
) -> Result<(), String> {
    let mascot = app
        .get_webview_window("mascot")
        .ok_or("sumi mascot unavailable")?;
    let panel = app
        .get_webview_window("buddy")
        .ok_or("sumi card unavailable")?;
    let monitors = mascot
        .available_monitors()
        .map_err(|_| "Could not read displays")?;
    let monitor = monitors
        .into_iter()
        .find(|m| {
            let a = m.work_area();
            inner.buddy.position.as_ref().is_some_and(|p| {
                p.x >= a.position.x
                    && (p.x as i64) < a.position.x as i64 + a.size.width as i64
                    && p.y > a.position.y
                    && (p.y as i64) <= a.position.y as i64 + a.size.height as i64
            })
        })
        .or_else(|| mascot.primary_monitor().ok().flatten())
        .ok_or("No display available")?;
    let area = monitor.work_area();
    let work = Rect {
        x: area.position.x,
        y: area.position.y,
        width: area.size.width,
        height: area.size.height,
    };
    let scale = monitor.scale_factor();
    let size = (
        (160.0 * scale).round() as u32,
        (152.0 * scale).round() as u32,
    );
    let anchor = inner.buddy.position.clone().unwrap_or(BuddyPosition {
        x: (work.right() - 20 - (size.0 / 2) as i64) as i32,
        y: (work.bottom() - 20) as i32,
    });
    let position =
        super::clamp_position(&anchor, (work.x, work.y), (work.width, work.height), size);
    let fixed = Rect {
        x: position.x,
        y: position.y,
        width: size.0,
        height: size.1,
    };
    // No resize, reposition, hide/show or transparency reset on an ordinary card transition.
    if inner.buddy.windows.mascot != Some(fixed) {
        if inner
            .buddy
            .windows
            .mascot
            .is_none_or(|r| r.width != size.0 || r.height != size.1)
        {
            mascot
                .set_size(PhysicalSize::new(size.0, size.1))
                .map_err(|_| "Could not size sumi mascot")?;
        }
        mascot
            .set_position(position)
            .map_err(|_| "Could not place sumi mascot")?;
        inner.buddy.windows.mascot = Some(fixed);
        inner.buddy.positioned = true;
        // A missing/changed display is the only programmatic anchor recovery.
        inner.buddy.position = Some(BuddyPosition {
            x: fixed.x + fixed.width as i32 / 2,
            y: fixed.y + fixed.height as i32,
        });
    }
    if mode != 0 && inner.buddy.view.avatar.visible && inner.buddy.windows.ready {
        show(&mascot)?;
    } else {
        hide(&mascot)?;
    }
    let wants_panel = mode == 2 || mode == 3;
    if !wants_panel {
        hide(&panel)?;
        inner.buddy.windows.panel = None;
        inner.buddy.windows.focus = false;
        inner.buddy.view.panel = None;
    } else {
        let previous = inner.buddy.windows.panel.filter(|p| p.mode == mode);
        let desired = placement::place(
            work,
            fixed,
            scale,
            mode == 3,
            inner.buddy.windows.height,
            previous.map(|p| p.placement.side),
        );
        if let Some(placement) = desired {
            if previous.is_none_or(|p| p.placement != placement) {
                // Prepare native geometry while hidden. The webview acknowledges a painted frame.
                hide(&panel)?;
                panel
                    .set_size(PhysicalSize::new(
                        placement.rect.width,
                        placement.rect.height,
                    ))
                    .map_err(|_| "Could not size sumi card")?;
                panel
                    .set_position(PhysicalPosition::new(placement.rect.x, placement.rect.y))
                    .map_err(|_| "Could not place sumi card")?;
                inner.buddy.windows.generation = inner.buddy.windows.generation.wrapping_add(1);
                let generation = inner.buddy.windows.generation;
                inner.buddy.windows.panel = Some(Panel {
                    placement,
                    mode,
                    generation,
                });
                let obstacle = placement::obstacle(fixed, scale);
                let vertical = matches!(placement.side, Side::Left | Side::Right);
                let (center, start, length) = if vertical {
                    (
                        obstacle.y as f64 + obstacle.height as f64 / 2.0,
                        placement.rect.y,
                        placement.rect.height,
                    )
                } else {
                    (
                        obstacle.x as f64 + obstacle.width as f64 / 2.0,
                        placement.rect.x,
                        placement.rect.width,
                    )
                };
                let arrow_offset = ((center - start as f64) / scale - 8.0)
                    .clamp(16.0, length as f64 / scale - 32.0);
                inner.buddy.view.panel = Some(PanelView {
                    generation,
                    arrow_offset,
                    mode,
                    side: placement.side,
                });
            }
        } else {
            hide(&panel)?;
            inner.buddy.windows.panel = None;
            inner.buddy.view.panel = None;
            // The existing main chat remains the explicit-action fallback; never move the mascot.
        }
    }
    inner.buddy.window_mode = mode;
    inner.buddy.view.desktop_visible = mode != 0;
    inner.buddy.view.visibility_reason = (mode == 0)
        .then(|| super::visibility_reason(&inner.buddy.view, inner.buddy.fullscreen))
        .flatten();
    crate::tray::sync(app, inner);
    Ok(())
}
#[tauri::command(async)]
pub fn mascot_frame_ready(
    window: WebviewWindow,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    if window.label() != "mascot" {
        return Err("Only the mascot can acknowledge its frame".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.buddy.windows.ready = true;
    super::sync(&app, &mut inner)
}
#[tauri::command(async)]
pub fn buddy_panel_ready(
    generation: u64,
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<(), String> {
    if window.label() != "buddy" {
        return Err("Only the card can acknowledge its frame".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let mode = super::display_mode(&inner.status, &inner.buddy.view, inner.buddy.fullscreen);
    if !inner.buddy.windows.accepts_frame(generation, mode) {
        return Ok(());
    }
    let panel = inner
        .buddy
        .windows
        .panel
        .ok_or("Card is no longer available")?;
    show(&window)?;
    inner.buddy.windows.painted = generation;
    if panel.mode == 3 && inner.buddy.windows.focus {
        focus(&window)?;
        inner.buddy.windows.focus = false;
    }
    Ok(())
}
#[tauri::command(async)]
pub fn measure_buddy_panel(
    height: u32,
    window: WebviewWindow,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    if window.label() != "buddy" || !(100..=4000).contains(&height) {
        return Err("Invalid card measurement".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let height = height.clamp(140, 640);
    if inner.buddy.windows.height != height {
        inner.buddy.windows.height = height;
        let mode = super::display_mode(&inner.status, &inner.buddy.view, inner.buddy.fullscreen);
        sync(&app, &mut inner, mode)?;
        crate::frontend_events::changed(
            &app,
            &[crate::frontend_events::Resource::Dashboard],
            false,
        );
    }
    Ok(())
}
pub fn focus_chat(app: &AppHandle) -> Result<(), String> {
    let fallback = {
        let state = app.state::<AppState>();
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        if let Some(panel) = inner.buddy.windows.panel {
            inner.buddy.windows.focus = true;
            if inner.buddy.windows.painted == panel.generation {
                focus(
                    &app.get_webview_window("buddy")
                        .ok_or("sumi card unavailable")?,
                )?;
                inner.buddy.windows.focus = false;
            }
            false
        } else {
            true
        }
    };
    if fallback {
        let _ = app.emit("buddy://navigate", "chats");
        super::open_workspace(app.clone())?;
    }
    Ok(())
}

#[cfg(debug_assertions)]
pub(super) fn audit_ready(inner: &crate::commands::Inner, mode: u8) -> bool {
    if mode == 1 {
        inner.buddy.windows.ready && inner.buddy.windows.panel.is_none()
    } else {
        inner
            .buddy
            .windows
            .panel
            .is_some_and(|p| p.mode == mode && p.generation == inner.buddy.windows.painted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stale_frame_acknowledgements_cannot_resurrect_closed_or_replaced_cards() {
        let mut state = WindowState::default();
        let placement = Placement {
            rect: Rect {
                x: 0,
                y: 0,
                width: 440,
                height: 520,
            },
            side: Side::Above,
        };
        state.panel = Some(Panel {
            placement,
            mode: 3,
            generation: 7,
        });
        assert!(state.accepts_frame(7, 3));
        assert!(!state.accepts_frame(6, 3));
        assert!(!state.accepts_frame(7, 0));
        assert!(!state.accepts_frame(7, 2));
        state.panel = None;
        assert!(!state.accepts_frame(7, 3));
    }
    #[test]
    fn native_notification_plugin_capabilities_and_delivery_stay_removed() {
        assert!(!include_str!("../../Cargo.toml").contains("tauri-plugin-notification"));
        assert!(!include_str!("../../capabilities/default.json").contains("notification:"));
        assert!(!include_str!("../companion/mod.rs").contains(".notification()"));
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        let windows = config["app"]["windows"].as_array().unwrap();
        for label in ["buddy", "mascot"] {
            let window = windows.iter().find(|w| w["label"] == label).unwrap();
            assert_eq!(window["transparent"], true);
            assert_eq!(window["visible"], false);
            assert_eq!(window["backgroundColor"], "#00000000");
        }
    }
}
