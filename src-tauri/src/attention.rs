use crate::models::{ActivitySnapshot, BuddyPreferences};

pub fn excluded(preferences: &BuddyPreferences, process: &str) -> bool {
    preferences
        .excluded_apps
        .iter()
        .any(|p| p.eq_ignore_ascii_case(process))
}

/// Heuristic only: no microphone, camera, calendar, or meeting contents are inspected.
pub fn meeting(activity: &ActivitySnapshot) -> bool {
    let process = activity.process_name.to_ascii_lowercase();
    let title = activity.window_title.to_ascii_lowercase();
    [
        "zoom.exe",
        "teams.exe",
        "ms-teams.exe",
        "webex.exe",
        "webexmta.exe",
    ]
    .contains(&process.as_str())
        || ["google meet", "zoom meeting", "microsoft teams meeting"]
            .iter()
            .any(|s| title.contains(s))
}

pub fn quiet_reason(
    preferences: &BuddyPreferences,
    activity: Option<&ActivitySnapshot>,
    fullscreen: bool,
    card_visible: bool,
) -> Option<String> {
    if preferences.suppress_fullscreen && fullscreen {
        return Some("Fullscreen application".into());
    }
    let activity = activity?;
    if excluded(preferences, &activity.process_name) {
        Some("Excluded application".into())
    } else if preferences.suppress_fullscreen && fullscreen {
        Some("Fullscreen application".into())
    } else if preferences.suppress_meetings && meeting(activity) {
        Some("Meeting application".into())
    } else if preferences.wait_for_input_pause && activity.idle_seconds < 5 && !card_visible {
        Some("Waiting for a pause in input".into())
    } else {
        None
    }
}

pub fn validate_preferences(mut preferences: BuddyPreferences) -> Result<BuddyPreferences, String> {
    if preferences.daily_nudge_limit > 50
        || ![5, 15, 30, 60].contains(&preferences.nudge_interval_minutes)
    {
        return Err("Choose 0–50 daily nudges and a 5, 15, 30, or 60 minute interval".into());
    }
    if ![5, 15, 30, 60].contains(&preferences.interval_minutes) {
        return Err("Choose a suggestion interval of 5, 15, 30, or 60 minutes".into());
    }
    if preferences.excluded_apps.len() > 50 {
        return Err("Use at most 50 excluded applications".into());
    }
    for process in &mut preferences.excluded_apps {
        *process = process.trim().to_ascii_lowercase();
        if process.is_empty()
            || process.len() > 100
            || process.contains(['/', '\\'])
            || process.chars().any(char::is_control)
        {
            return Err("Enter process names such as chrome.exe, not paths".into());
        }
    }
    preferences.excluded_apps.sort();
    preferences.excluded_apps.dedup();
    Ok(preferences)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn activity() -> ActivitySnapshot {
        ActivitySnapshot {
            timestamp: String::new(),
            process_name: "editor.exe".into(),
            window_title: "Project".into(),
            idle_seconds: 10,
            active_seconds: 100,
            ..Default::default()
        }
    }
    #[test]
    fn suppresses_fullscreen_meetings_exclusions_and_recent_input() {
        let mut prefs = BuddyPreferences::default();
        let mut a = activity();
        assert!(quiet_reason(&prefs, Some(&a), false, false).is_none());
        assert_eq!(
            quiet_reason(&prefs, Some(&a), true, false).as_deref(),
            Some("Fullscreen application")
        );
        prefs.excluded_apps = vec!["EDITOR.EXE".into()];
        assert!(excluded(&prefs, &a.process_name));
        prefs.excluded_apps.clear();
        a.process_name = "ms-teams.exe".into();
        assert!(meeting(&a));
        assert_eq!(
            quiet_reason(&prefs, Some(&a), false, false).as_deref(),
            Some("Meeting application")
        );
        a = activity();
        a.idle_seconds = 0;
        assert!(quiet_reason(&prefs, Some(&a), false, false).is_some());
        assert!(quiet_reason(&prefs, Some(&a), false, true).is_none());
        a.idle_seconds = 90;
        assert!(quiet_reason(&prefs, Some(&a), false, true).is_none());
    }
    #[test]
    fn normalizes_preferences_and_rejects_invalid_limits() {
        let mut p = BuddyPreferences::default();
        p.excluded_apps = vec![" Editor.EXE ".into(), "editor.exe".into()];
        assert_eq!(
            validate_preferences(p.clone()).unwrap().excluded_apps,
            vec!["editor.exe"]
        );
        p.interval_minutes = 1;
        assert!(validate_preferences(p).is_err());
    }
}
