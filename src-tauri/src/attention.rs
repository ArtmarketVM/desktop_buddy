use crate::models::{ActivitySnapshot, BuddyPreferences};

pub fn excluded(preferences: &BuddyPreferences, process: &str) -> bool {
    preferences
        .excluded_apps
        .iter()
        .any(|p| p.eq_ignore_ascii_case(process))
}

/// Conservative foreground evidence, not proof of call membership or calendar presence.
pub fn meeting(activity: &ActivitySnapshot) -> bool {
    let process = activity.process_name.to_ascii_lowercase();
    let title = activity.window_title.to_lowercase();
    let call_marker = [
        "zoom meeting",
        "microsoft teams meeting",
        "in a meeting",
        "meeting in progress",
        "call in progress",
        "встреча в процессе",
        "звонок в процессе",
    ]
    .iter()
    .any(|marker| title.contains(marker));
    let meeting_app = [
        "zoom.exe",
        "zoom.us",
        "zoom",
        "microsoft teams",
        "webex",
        "teams.exe",
        "ms-teams.exe",
        "webex.exe",
        "webexmta.exe",
    ]
    .contains(&process.as_str());
    let meet = title.contains("meet")
        || activity
            .browser
            .as_ref()
            .and_then(|b| b.domain.as_deref())
            .is_some_and(|d| d.eq_ignore_ascii_case("meet.google.com"));
    let meet_code = title
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '-')
        .any(|word| {
            let parts: Vec<_> = word.split('-').collect();
            parts.len() == 3
                && parts[0].len() == 3
                && parts[1].len() == 4
                && parts[2].len() == 3
                && parts
                    .iter()
                    .all(|part| part.bytes().all(|b| b.is_ascii_lowercase()))
        });
    // Merely opening the meeting app, its home page or calendar is not a meeting.
    (meet && meet_code)
        || call_marker
        || (meeting_app
            && [
                "in call",
                "video call",
                "audio call",
                "видеозвонок",
                "аудиозвонок",
            ]
            .iter()
            .any(|marker| title.contains(marker)))
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
        a.window_title = "Design — Microsoft Teams meeting".into();
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
        let mut p = BuddyPreferences {
            excluded_apps: vec![" Editor.EXE ".into(), "editor.exe".into()],
            ..BuddyPreferences::default()
        };
        assert_eq!(
            validate_preferences(p.clone()).unwrap().excluded_apps,
            vec!["editor.exe"]
        );
        p.interval_minutes = 1;
        assert!(validate_preferences(p).is_err());
    }
}

#[cfg(test)]
mod meeting_regressions {
    use super::*;
    #[test]
    fn app_homes_and_chat_windows_are_not_calls_on_either_platform() {
        for (app, title) in [
            ("Google Chrome", "Google Meet - Home"),
            ("chrome.exe", "Google Meet"),
            ("zoom.us", "Zoom Workplace"),
            ("Zoom.exe", "Zoom Home"),
            ("Microsoft Teams", "Chat | Microsoft Teams"),
            ("ms-teams.exe", "Calendar | Microsoft Teams"),
            ("webex.exe", "Webex"),
        ] {
            assert!(
                !meeting(&ActivitySnapshot {
                    process_name: app.into(),
                    window_title: title.into(),
                    ..Default::default()
                }),
                "{app}: {title}"
            );
        }
    }
    #[test]
    fn explicit_call_contexts_remain_quiet_on_both_platforms() {
        for (app, title) in [
            ("Google Chrome", "Meet - abc-defg-hij"),
            ("chrome.exe", "Google Meet abc-defg-hij"),
            ("zoom.us", "Zoom Meeting"),
            ("Zoom.exe", "Zoom Meeting"),
            ("Microsoft Teams", "Team — Microsoft Teams meeting"),
            ("ms-teams.exe", "Video call — Client"),
        ] {
            assert!(
                meeting(&ActivitySnapshot {
                    process_name: app.into(),
                    window_title: title.into(),
                    ..Default::default()
                }),
                "{app}: {title}"
            );
        }
    }
}
