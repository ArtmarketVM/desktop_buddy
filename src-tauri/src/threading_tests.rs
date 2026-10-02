//! Source-level regression guard for the IPC dispatch boundary, not a native UI test.

fn assert_worker_dispatch(source: &str) {
    let mut count = 0;
    for line in source.lines().map(str::trim) {
        if line.starts_with("#[tauri::command") {
            assert_eq!(
                line, "#[tauri::command(async)]",
                "IPC must not wait for application state on the native event thread"
            );
            count += 1;
        }
    }
    assert!(count > 0, "Expected command definitions");
}

#[test]
fn all_registered_command_modules_dispatch_on_workers() {
    let modules = [
        ("updates", include_str!("updates.rs")),
        ("commands", include_str!("commands.rs")),
        ("buddy", include_str!("buddy.rs")),
        ("privacy", include_str!("privacy.rs")),
        ("goals", include_str!("goals.rs")),
        ("insights", include_str!("insights.rs")),
        ("tracking", include_str!("tracking.rs")),
        ("history", include_str!("history.rs")),
        ("profile", include_str!("profile.rs")),
        ("product_feedback", include_str!("product_feedback.rs")),
    ];
    for (_, source) in modules {
        assert_worker_dispatch(source);
    }
    // A new command module must be included in this guard too.
    let registered = include_str!("lib.rs")
        .split(".invoke_handler(tauri::generate_handler![")
        .nth(1)
        .expect("Command registry")
        .split("])")
        .next()
        .unwrap();
    for command in registered
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let module = command.split("::").next().unwrap();
        assert!(
            modules.iter().any(|(name, _)| *name == module),
            "Unchecked module: {module}"
        );
    }
}

#[test]
#[should_panic(expected = "IPC must not wait")]
fn guard_rejects_default_synchronous_dispatch() {
    assert_worker_dispatch("#[tauri::command]\npub fn get_dashboard() {}");
}
