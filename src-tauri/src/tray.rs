use crate::{buddy, commands};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

pub fn install(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open workspace", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show companion on desktop", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide desktop companion", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause tracking", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", "Resume tracking", true, None::<&str>)?;
    let snooze = MenuItem::with_id(app, "snooze", "Snooze Buddy for 1 hour", true, None::<&str>)?;
    let wake = MenuItem::with_id(
        app,
        "wake",
        "Resume Buddy (clear snooze and DND)",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit Desktop Buddy", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &show, &hide, &pause, &resume, &snooze, &wake, &quit],
    )?;
    let mut builder = TrayIconBuilder::with_id("desktop-buddy-tray")
        .menu(&menu)
        .tooltip("Desktop Buddy — open workspace or quit from this menu")
        .show_menu_on_left_click(true);
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .on_menu_event(|app, event| {
            let app = app.clone();
            let id = event.id().as_ref().to_string();
            // Never wait for the state lock on the Windows event thread: a worker may be updating a window.
            tauri::async_runtime::spawn(async move {
                let state = app.state::<commands::AppState>();
                let result = match id.as_str() {
                    "open" => buddy::open_workspace(app.clone()),
                    "show" => buddy::show_desktop_buddy(true, app.clone(), state.clone()),
                    "hide" => buddy::show_desktop_buddy(false, app.clone(), state.clone()),
                    "pause" => commands::set_tracking(false, app.clone(), state.clone()),
                    "resume" => commands::set_tracking(true, app.clone(), state.clone()),
                    "snooze" => buddy::snooze_buddy(true, app.clone(), state.clone()),
                    "wake" => buddy::snooze_buddy(false, app.clone(), state.clone())
                        .and_then(|_| commands::set_dnd(false, app.clone(), state.clone())),
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
