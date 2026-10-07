use crate::{commands::AppState, storage::Storage, updates::UpdateState};
use tauri::{App, Manager, Runtime, WebviewWindowBuilder};

pub fn initialize<R: Runtime>(
    app: &App<R>,
    storage: Storage,
) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(AppState::new(storage).map_err(std::io::Error::other)?);
    app.manage(UpdateState::default());

    // Configured windows have create=false: their first IPC must see initialized state.
    for config in &app.config().app.windows {
        WebviewWindowBuilder::from_config(app.handle(), config)?.build()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};

    #[test]
    fn first_dashboard_request_has_state_before_either_window_opens() {
        let mut context = mock_context(noop_assets());
        *context.config_mut() = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let mut app = mock_builder()
            .invoke_handler(tauri::generate_handler![crate::commands::get_dashboard])
            .setup(|app| {
                assert!(
                    app.webview_windows().is_empty(),
                    "Webviews must not load before database and command state are ready"
                );
                let storage = Storage::open(std::path::Path::new(":memory:"))
                    .map_err(std::io::Error::other)?;
                initialize(app, storage)?;
                Ok(())
            })
            .build(context)
            .unwrap();
        // Drive the same Tauri startup lifecycle without opening native windows.
        #[allow(deprecated)]
        app.run_iteration(|_, _| {});
        assert!(app.try_state::<UpdateState>().is_some());
        assert!(app.get_webview_window("buddy").is_some());
        let window = app.get_webview_window("main").unwrap();
        let dashboard = get_ipc_response(
            &window,
            tauri::webview::InvokeRequest {
                cmd: "get_dashboard".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: if cfg!(target_os = "macos") {
                    "tauri://localhost"
                } else {
                    "http://tauri.localhost"
                }
                .parse()
                .unwrap(),
                body: tauri::ipc::InvokeBody::default(),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.into(),
            },
        )
        .expect("The first dashboard IPC must not report unmanaged state")
        .deserialize::<serde_json::Value>()
        .unwrap();
        assert_eq!(dashboard["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(dashboard["saved_goals"], serde_json::json!([]));
    }
}
