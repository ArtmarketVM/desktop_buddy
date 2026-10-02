use crate::{buddy, commands};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

struct Controls {
    visibility: MenuItem<tauri::Wry>,
    tracking: MenuItem<tauri::Wry>,
}
pub fn sync(app: &tauri::AppHandle, inner: &commands::Inner) {
    if let Some(controls) = app.try_state::<Controls>() {
        let _ = controls
            .visibility
            .set_text(if inner.buddy.view.avatar.visible {
                "Hide companion"
            } else {
                "Show companion"
            });
        let _ = controls.tracking.set_text(if inner.status.tracking {
            "Pause tracking"
        } else {
            "Resume tracking"
        });
    }
}
pub fn install(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Buddy", true, None::<&str>)?;
    let visibility = MenuItem::with_id(app, "visibility", "Show companion", true, None::<&str>)?;
    let tracking = MenuItem::with_id(app, "tracking", "Resume tracking", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &visibility, &tracking, &settings, &quit])?;
    app.manage(Controls {
        visibility,
        tracking,
    });
    let mut builder = TrayIconBuilder::with_id("desktop-buddy-tray")
        .menu(&menu)
        .tooltip("Buddy — your desktop companion")
        .show_menu_on_left_click(true);
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .on_menu_event(|app, event| {
            let app = app.clone();
            let id = event.id().as_ref().to_string();
            // Stateful native callbacks always run off the Windows event thread.
            tauri::async_runtime::spawn(async move {
                let state = app.state::<commands::AppState>();
                let result = match id.as_str() {
                    "open" => buddy::open_workspace(app.clone()),
                    "visibility" => {
                        let visible = state
                            .inner
                            .lock()
                            .map(|i| {
                                i.storage
                                    .user_settings()
                                    .is_ok_and(|s| s.profile.avatar.visible)
                            })
                            .unwrap_or(false);
                        buddy::show_desktop_buddy(!visible, app.clone(), state.clone())
                    }
                    "tracking" => {
                        let tracking = state
                            .inner
                            .lock()
                            .map(|i| i.status.tracking)
                            .unwrap_or(false);
                        commands::set_tracking(!tracking, app.clone(), state.clone())
                    }
                    "settings" => {
                        let _ = app.emit("buddy://navigate", "settings");
                        buddy::open_workspace(app.clone())
                    }
                    "quit" => buddy::quit_app(app.clone(), state.clone()),
                    _ => Ok(()),
                };
                if let Err(error) = result {
                    if let Ok(mut inner) = state.inner.lock() {
                        inner.last_error = Some(error);
                    }
                    let _ = buddy::open_workspace(app.clone());
                }
            });
        })
        .build(app)?;
    Ok(())
}
