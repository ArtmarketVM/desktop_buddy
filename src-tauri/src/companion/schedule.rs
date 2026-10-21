//! Daily launch planning, configurable summaries, and activity-based stretch reminders.
use super::engine::{fingerprint, Intervention, Kind};
use crate::{commands::Inner, core::CorePreferences, storage::Storage};
use chrono::{DateTime, Local, NaiveDate, TimeZone};

// A running app may deliver on the first collector tick shortly after the selected time.
const SUMMARY_GRACE_SECONDS: i64 = 300;
const PLANNING_REMINDER_SECONDS: i64 = 30 * 60;

pub(super) fn respond_planning(memory: &mut super::engine::Memory, action: &str, now: i64) {
    memory.planning_reminder_at =
        (action == "ignore").then(|| now.saturating_add(PLANNING_REMINDER_SECONDS));
}

pub(super) fn preferences(storage: &Storage) -> Result<CorePreferences, String> {
    Ok(storage
        .read_setting("core_preferences")?
        .unwrap_or_default())
}
fn summary_due<T: TimeZone>(prefs: &super::engine::Preferences, now: DateTime<T>) -> Option<i64> {
    let time =
        now.date_naive()
            .and_hms_opt(prefs.summary_minute / 60, prefs.summary_minute % 60, 0)?;
    let due = now.timezone().from_local_datetime(&time).earliest()?;
    // A summary scheduled inside quiet time is skipped, not queued until quiet ends.
    if prefs.quiet_at(due.clone()) {
        return None;
    }
    let due = due.timestamp();
    (due..=due + SUMMARY_GRACE_SECONDS)
        .contains(&now.timestamp())
        .then_some(due)
}
pub(super) fn allowed(inner: &Inner, kind: Kind, now: i64) -> bool {
    if kind != Kind::EndOfDay {
        return true;
    }
    DateTime::from_timestamp(now, 0).is_some_and(|date| {
        summary_due(
            &inner.companion.view.preferences,
            date.with_timezone(&Local),
        )
        .is_some()
    })
}
pub(super) fn skip_quiet_summary(inner: &mut Inner, now: i64) -> Result<(), String> {
    if !inner.companion.view.quiet_mode {
        return Ok(());
    }
    let Some(date) = DateTime::from_timestamp(now, 0).map(|d| d.with_timezone(&Local)) else {
        return Ok(());
    };
    if summary_due(&inner.companion.view.preferences, date).is_some() {
        let id = format!("schedule:{}:summary", date.date_naive());
        if inner.companion.memory.summary_day != date.date_naive().to_string()
            && !inner.companion.memory.seen.contains(&id)
        {
            inner.companion.memory.summary_day = date.date_naive().to_string();
            inner.companion.memory.seen.push(id);
            if inner.companion.memory.seen.len() > 200 {
                inner.companion.memory.seen.remove(0);
            }
            inner
                .storage
                .write_setting("companion_memory", &inner.companion.memory)?;
        }
    }
    Ok(())
}

pub(super) fn include_due_today(
    storage: &mut Storage,
    day: NaiveDate,
) -> Result<Vec<String>, String> {
    storage.adopt_core_goals()?;
    let goals = {
        let mut query = storage.connection.prepare("SELECT g.id,g.text,d.due_at FROM goals g JOIN core_goals c ON c.goal_id=g.id JOIN core_goal_details d ON d.goal_id=g.id WHERE c.state='open' AND g.status!='completed' AND d.due_at IS NOT NULL ORDER BY g.id").map_err(|_| "Could not prepare Today")?;
        let rows = query
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(|_| "Could not prepare Today")?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Could not prepare Today")?
    };
    let mut titles = Vec::new();
    storage
        .connection
        .execute_batch("SAVEPOINT morning_goals")
        .map_err(|_| "Could not prepare Today")?;
    let result = (|| {
        for (id, title, due) in goals {
            if DateTime::parse_from_rfc3339(&due)
                .is_ok_and(|d| d.with_timezone(&Local).date_naive() == day)
            {
                storage.core_today(id, true, &day.to_string())?;
                titles.push(title);
            }
        }
        Ok::<_, String>(())
    })();
    storage
        .connection
        .execute_batch(if result.is_ok() {
            "RELEASE morning_goals"
        } else {
            "ROLLBACK TO morning_goals; RELEASE morning_goals"
        })
        .map_err(|_| "Could not prepare Today")?;
    result?;
    Ok(titles)
}

pub(super) fn summary(storage: &Storage, days: &[NaiveDate]) -> Result<String, String> {
    storage.adopt_core_goals()?;
    let mut completed = Vec::new();
    let mut times = std::collections::BTreeMap::<i64, (String, u64)>::new();
    for day in days {
        let progress = storage.core_progress(&day.to_string())?;
        for title in progress.completed {
            if !completed.contains(&title) {
                completed.push(title);
            }
        }
        for goal in progress.goals {
            let entry = times.entry(goal.goal_id).or_insert((goal.title, 0));
            entry.1 += goal.relevant_seconds;
        }
    }
    let mut sentences = Vec::new();
    for title in completed.iter().take(2) {
        sentences.push(format!(
            "You completed “{}”.",
            title.chars().take(80).collect::<String>()
        ));
    }
    for (title, seconds) in times.values().filter(|(_, seconds)| *seconds > 0).take(2) {
        let minutes = seconds / 60;
        let duration = if minutes == 0 {
            "under a minute".into()
        } else {
            format!(
                "{minutes} {}",
                if minutes == 1 { "minute" } else { "minutes" }
            )
        };
        sentences.push(format!(
            "You spent {duration} on “{}”.",
            title.chars().take(80).collect::<String>()
        ));
    }
    if sentences.is_empty() {
        sentences
            .push("There are no completed steps or timed activities to show for today.".into());
    }
    sentences.push("Review today, or plan tomorrow?".into());
    Ok(sentences.join(" "))
}

pub(super) fn candidates(inner: &mut Inner, now: i64) -> Result<Vec<Intervention>, String> {
    let local = DateTime::from_timestamp(now, 0)
        .ok_or("Invalid notification time")?
        .with_timezone(&Local);
    let core = preferences(&inner.storage)?;
    if !core.movement_reminders || !inner.companion.view.preferences.movement_reminder {
        inner.companion.work_clock.observe(false);
    }
    let date = local.date_naive().to_string();
    // Launch and resume arm planning for the new local day. Staying awake through midnight
    // alone must not produce a new planning bubble while someone is still working.
    if inner
        .companion
        .last_schedule_tick
        .is_none_or(|last| now.saturating_sub(last) > 300)
    {
        inner.companion.planning_date = date.clone();
    }
    inner.companion.last_schedule_tick = Some(now);
    if inner.companion.view.preferences.quiet_at(local) || inner.status.dnd {
        return Ok(vec![]);
    }
    let checkins = inner.companion.view.preferences.daily_checkins;
    let plan_id = format!("schedule:{date}:planning");
    let reminder = inner
        .companion
        .memory
        .planning_reminder_at
        .and_then(|at| {
            let day = DateTime::from_timestamp(at, 0)?
                .with_timezone(&Local)
                .date_naive()
                .to_string();
            (day == date && now >= at).then(|| format!("{plan_id}:{at}"))
        })
        .filter(|id| !inner.companion.memory.seen.contains(id));
    let summary_due_now = checkins
        && inner.companion.memory.summary_day != date
        && summary_due(&inner.companion.view.preferences, local).is_some()
        && !inner
            .companion
            .memory
            .seen
            .contains(&format!("schedule:{date}:summary"));
    let summary_id = format!("schedule:{date}:summary");
    let initial_plan = inner.companion.planning_date == date
        && inner.companion.memory.planning_day != date
        && !inner.companion.memory.seen.contains(&plan_id)
        && inner.companion.memory.planning_reminder_at.is_none();
    let mut messages = Vec::new();
    if checkins && (initial_plan || reminder.is_some()) {
        let due = include_due_today(&mut inner.storage, local.date_naive())?;
        let text = if due.is_empty() {
            "Want to plan today and choose from your previous goals?".into()
        } else {
            format!(
                "{} {} due today, so I’ve added {} to Today. Want to choose what else to work on?",
                if due.len() == 1 {
                    format!("“{}”", due[0].chars().take(100).collect::<String>())
                } else {
                    format!("{} goals", due.len())
                },
                if due.len() == 1 { "is" } else { "are" },
                if due.len() == 1 { "it" } else { "them" }
            )
        };
        messages.push((reminder.unwrap_or(plan_id), Kind::NoGoals, text));
    }
    if summary_due_now {
        messages.push((
            summary_id,
            Kind::EndOfDay,
            summary(&inner.storage, &[local.date_naive()])?,
        ));
    }
    if core.movement_reminders
        && inner.companion.view.preferences.movement_reminder
        && inner.companion.work_clock.seconds()
            >= u64::from(core.movement_interval_minutes.clamp(5, 240)) * 60
    {
        messages.push((
            fingerprint(&format!("stretch:{}:{now}", local.date_naive())),
            Kind::Movement,
            format!(
                "You’ve been working for {} minutes. Want to stand up and stretch for a moment?",
                core.movement_interval_minutes
            ),
        ));
    }
    Ok(messages
        .into_iter()
        .filter(|(id, _, _)| !inner.companion.memory.seen.contains(id))
        .map(|(id, kind, text)| Intervention {
            id,
            kind,
            text,
            confidence: 1.0,
            goal_id: None,
            plan_revision: None,
            step_id: None,
            expires_at: now + 300,
        })
        .collect())
}

#[cfg(test)]
fn next(inner: &mut Inner, now: i64) -> Result<Option<Intervention>, String> {
    Ok(candidates(inner, now)?
        .into_iter()
        .min_by_key(super::queue::priority))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;
    #[test]
    fn daily_routines_do_not_repeat_when_the_general_history_buffer_rolls_over() {
        let state = reminder_state();
        let mut i = state.inner.lock().unwrap();
        let now = reminder_time(9, 0, 0);
        let first = next(&mut i, now).unwrap().unwrap();
        i.companion.memory.reserve(&first, now);
        for n in 0..250 {
            i.companion.memory.reserve(
                &Intervention {
                    id: format!("fixture-{n}"),
                    kind: Kind::Movement,
                    ..first.clone()
                },
                now + 1,
            );
        }
        assert!(next(&mut i, now + 2).unwrap().is_none());
        let summary = next(&mut i, reminder_time(18, 0, 0)).unwrap().unwrap();
        i.companion.memory.reserve(&summary, now + 3);
        for n in 250..500 {
            i.companion.memory.reserve(
                &Intervention {
                    id: format!("fixture-{n}"),
                    kind: Kind::Movement,
                    ..first.clone()
                },
                now + 4,
            );
        }
        assert!(next(&mut i, reminder_time(18, 1, 0)).unwrap().is_none());
    }
    #[test]
    fn activity_messages_and_stretches_continue_on_evenings_and_nonworking_days() {
        use crate::commands::AppState;
        use std::time::{Duration, SystemTime};
        let state =
            AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap()).unwrap();
        let mut inner = state.inner.lock().unwrap();
        let saturday = Local
            .with_ymd_and_hms(2026, 10, 24, 20, 0, 0)
            .unwrap()
            .timestamp();
        for kind in [
            Kind::Deadline,
            Kind::Movement,
            Kind::UnplannedWork,
            Kind::NewTask,
            Kind::Completion,
            Kind::AutomaticCompletion,
        ] {
            assert!(allowed(&inner, kind, saturday), "{kind:?}");
        }
        assert!(allowed(&inner, Kind::NoGoals, saturday));
        inner.companion.view.preferences.daily_checkins = false;
        assert!(!allowed(&inner, Kind::EndOfDay, saturday));
        let start = SystemTime::UNIX_EPOCH + Duration::from_secs(100);
        // An accumulated active interval remains eligible outside the workday schedule.
        for n in 0..=900 {
            inner
                .companion
                .work_clock
                .observe_at(start + Duration::from_secs(n * 3), true);
        }
        let prompt = next(&mut inner, saturday).unwrap().unwrap();
        assert_eq!(prompt.kind, Kind::Movement);
        assert_eq!(inner.companion.work_clock.seconds(), 2700);
        inner.status.dnd = true;
        assert!(next(&mut inner, saturday).unwrap().is_none());
    }
    #[test]
    fn configured_stretch_interval_and_switches_control_the_actual_schedule() {
        use crate::commands::AppState;
        use std::time::{Duration, SystemTime};
        let state =
            AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap()).unwrap();
        let mut inner = state.inner.lock().unwrap();
        inner.companion.view.preferences.daily_checkins = false;
        let now = Local
            .with_ymd_and_hms(2026, 10, 21, 12, 0, 0)
            .unwrap()
            .timestamp();
        let start = SystemTime::UNIX_EPOCH + Duration::from_secs(100);
        for n in 0..=600 {
            inner
                .companion
                .work_clock
                .observe_at(start + Duration::from_secs(n * 3), true);
        }
        let mut prefs = CorePreferences {
            movement_interval_minutes: 45,
            ..Default::default()
        };
        inner
            .storage
            .write_setting("core_preferences", &prefs)
            .unwrap();
        assert!(next(&mut inner, now).unwrap().is_none());
        prefs.movement_interval_minutes = 15;
        inner
            .storage
            .write_setting("core_preferences", &prefs)
            .unwrap();
        let prompt = next(&mut inner, now).unwrap().unwrap();
        assert_eq!(prompt.kind, Kind::Movement);
        assert!(prompt.text.contains("15 minutes"));
        prefs.movement_reminders = false;
        inner
            .storage
            .write_setting("core_preferences", &prefs)
            .unwrap();
        assert!(next(&mut inner, now).unwrap().is_none());
        assert_eq!(inner.companion.work_clock.seconds(), 0);
    }
    fn reminder_state() -> crate::commands::AppState {
        crate::commands::AppState::new(Storage::open(std::path::Path::new(":memory:")).unwrap())
            .unwrap()
    }
    fn reminder_time(h: u32, m: u32, sec: u32) -> i64 {
        Local
            .with_ymd_and_hms(2026, 10, 21, h, m, sec)
            .unwrap()
            .timestamp()
    }
    #[test]
    fn ignored_planning_never_schedules_an_automatic_repeat() {
        let state = reminder_state();
        let mut inner = state.inner.lock().unwrap();
        let now = reminder_time(9, 0, 0);
        let first = next(&mut inner, now).unwrap().unwrap();
        assert!(inner.companion.memory.reserve(&first, now));
        assert!(inner.companion.memory.planning_reminder_at.is_none());
        assert!(next(&mut inner, now + PLANNING_REMINDER_SECONDS)
            .unwrap()
            .is_none());
        assert!(next(&mut inner, now + 3600).unwrap().is_none());
    }
    #[test]
    fn not_now_persists_one_thirty_minute_reminder_and_ignoring_it_ends_the_chain() {
        let state = reminder_state();
        let mut inner = state.inner.lock().unwrap();
        let now = reminder_time(9, 0, 0);
        let first = next(&mut inner, now).unwrap().unwrap();
        inner.companion.memory.reserve(&first, now);
        respond_planning(&mut inner.companion.memory, "ignore", now);
        assert_eq!(
            inner.companion.memory.planning_reminder_at,
            Some(now + 1800)
        );
        inner
            .storage
            .write_setting("companion_memory", &inner.companion.memory)
            .unwrap();
        let reloaded = super::super::Runtime::load(&inner.storage).unwrap();
        inner.companion = reloaded;
        assert!(next(&mut inner, now + 1799).unwrap().is_none());
        let repeat = next(&mut inner, now + 1800).unwrap().unwrap();
        assert_eq!(repeat.kind, Kind::NoGoals);
        assert_ne!(repeat.id, first.id);
        assert!(inner.companion.memory.reserve(&repeat, now + 1800));
        assert!(inner.companion.memory.planning_reminder_at.is_none());
        assert!(next(&mut inner, now + 3600).unwrap().is_none());
        // Another explicit Not now is another request; there is still only one pending timer.
        respond_planning(&mut inner.companion.memory, "ignore", now + 1801);
        assert_eq!(
            inner.companion.memory.planning_reminder_at,
            Some(now + 3601)
        );
        assert!(next(&mut inner, now + 3600).unwrap().is_none());
        assert_eq!(
            next(&mut inner, now + 3601).unwrap().unwrap().kind,
            Kind::NoGoals
        );
        respond_planning(&mut inner.companion.memory, "accept", now + 3601);
        assert!(inner.companion.memory.planning_reminder_at.is_none());
    }
    #[test]
    fn waiting_for_planning_does_not_pause_stretches_deadlines_or_activity_messages() {
        use std::time::{Duration, SystemTime};
        let state = reminder_state();
        let mut inner = state.inner.lock().unwrap();
        let now = reminder_time(9, 0, 0);
        let first = next(&mut inner, now).unwrap().unwrap();
        inner.companion.memory.reserve(&first, now);
        respond_planning(&mut inner.companion.memory, "ignore", now);
        let prefs = CorePreferences {
            movement_interval_minutes: 15,
            ..Default::default()
        };
        inner
            .storage
            .write_setting("core_preferences", &prefs)
            .unwrap();
        let start = SystemTime::UNIX_EPOCH + Duration::from_secs(100);
        for n in 0..=300 {
            inner
                .companion
                .work_clock
                .observe_at(start + Duration::from_secs(n * 3), true);
        }
        let stretch = next(&mut inner, now + 900).unwrap().unwrap();
        assert_eq!(stretch.kind, Kind::Movement);
        let goal = inner.storage.set_goal("Pitch deck").unwrap();
        inner.storage.adopt_core_goals().unwrap();
        inner
            .storage
            .connection
            .execute(
                "INSERT OR REPLACE INTO core_goal_details(goal_id,due_at) VALUES(?1,?2)",
                rusqlite::params![
                    goal.id,
                    DateTime::from_timestamp(now + 900, 0).unwrap().to_rfc3339()
                ],
            )
            .unwrap();
        let deadline = super::super::deadlines::next(
            &inner.storage,
            &inner.companion.memory,
            Some(goal.id),
            "2026-10-21",
            now + 900,
        )
        .unwrap()
        .unwrap();
        assert_eq!(deadline.kind, Kind::Deadline);
        assert!(!super::super::suppressed(&inner));
        let completion = Intervention {
            id: "new-completion".into(),
            kind: Kind::AutomaticCompletion,
            ..stretch
        };
        assert!(inner.companion.memory.reserve_progress(&completion));
        assert_eq!(
            inner.companion.memory.planning_reminder_at,
            Some(now + 1800)
        );
        assert!(!inner.status.dnd);
        assert!(!inner.companion.view.preferences.paused);
    }
    #[test]
    fn planning_reminder_respects_quiet_and_gives_the_daily_summary_priority() {
        let state = reminder_state();
        let mut inner = state.inner.lock().unwrap();
        let now = reminder_time(17, 30, 0);
        let first = next(&mut inner, now).unwrap().unwrap();
        inner.companion.memory.reserve(&first, now);
        respond_planning(&mut inner.companion.memory, "ignore", now);
        inner.status.dnd = true;
        assert!(next(&mut inner, now + 1800).unwrap().is_none());
        inner.status.dnd = false;
        let summary = next(&mut inner, now + 1800).unwrap().unwrap();
        assert_eq!(summary.kind, Kind::EndOfDay);
        inner.companion.memory.reserve(&summary, now + 1800);
        let repeat = next(&mut inner, now + 1803).unwrap().unwrap();
        assert_eq!(repeat.kind, Kind::NoGoals);
    }
    #[test]
    fn an_explicit_snooze_can_cross_midnight_without_a_duplicate_daily_prompt() {
        let state = reminder_state();
        let mut inner = state.inner.lock().unwrap();
        let now = reminder_time(23, 45, 0);
        let first = next(&mut inner, now).unwrap().unwrap();
        inner.companion.memory.reserve(&first, now);
        respond_planning(&mut inner.companion.memory, "ignore", now);
        inner.companion.memory.refresh("2026-10-22");
        assert!(next(&mut inner, now + 1799).unwrap().is_none());
        let repeat = next(&mut inner, now + 1800).unwrap().unwrap();
        assert!(inner.companion.memory.reserve(&repeat, now + 1800));
        inner.companion.last_schedule_tick = None;
        assert!(next(&mut inner, now + 3600).unwrap().is_none());
        respond_planning(&mut inner.companion.memory, "ignore", now + 3600);
        inner.companion.memory.refresh("2026-10-23");
        assert!(inner.companion.memory.planning_reminder_at.is_none());
    }
    #[test]
    fn first_launch_plans_once_and_summary_uses_its_own_saved_time() {
        let state = crate::commands::AppState::new(
            Storage::open(std::path::Path::new(":memory:")).unwrap(),
        )
        .unwrap();
        let mut inner = state.inner.lock().unwrap();
        inner.storage.set_goal("Existing focused goal").unwrap();
        inner.companion.view.preferences.summary_minute = 16 * 60;
        let at = |h, m| {
            Local
                .with_ymd_and_hms(2026, 10, 21, h, m, 0)
                .unwrap()
                .timestamp()
        };
        let p = next(&mut inner, at(6, 0)).unwrap().unwrap();
        assert_eq!(p.kind, Kind::NoGoals);
        inner.companion.memory.reserve(&p, at(6, 0));
        assert!(next(&mut inner, at(10, 1)).unwrap().is_none());
        assert!(!allowed(&inner, Kind::EndOfDay, at(15, 59)));
        let summary = next(&mut inner, at(16, 0)).unwrap().unwrap();
        assert_eq!(summary.kind, Kind::EndOfDay);
        assert!(allowed(&inner, Kind::Deadline, at(16, 0)));
        inner.companion.memory.reserve(&summary, at(16, 0));
        inner.companion.memory =
            serde_json::from_str(&serde_json::to_string(&inner.companion.memory).unwrap()).unwrap();
        assert!(next(&mut inner, at(16, 1)).unwrap().is_none());
        inner.companion.view.preferences.daily_checkins = false;
        assert!(next(&mut inner, at(16, 2)).unwrap().is_none());
    }
    #[test]
    fn default_summary_is_eighteen_and_quiet_time_never_queues_a_summary() {
        let zone = FixedOffset::east_opt(0).unwrap();
        let at = |h, m| zone.with_ymd_and_hms(2026, 10, 21, h, m, 0).unwrap();
        let mut prefs = super::super::engine::Preferences::default();
        assert!(summary_due(&prefs, at(17, 59)).is_none());
        assert_eq!(summary_due(&prefs, at(18, 0)), Some(at(18, 0).timestamp()));
        assert!(summary_due(&prefs, at(18, 6)).is_none());
        prefs.quiet_hours_enabled = true;
        prefs.quiet_start_minute = 18 * 60;
        prefs.quiet_end_minute = 18 * 60 + 2;
        assert!(summary_due(&prefs, at(18, 3)).is_none());
        prefs.quiet_hours_enabled = false;
        prefs.quiet_days = vec![3];
        assert!(summary_due(&prefs, at(18, 0)).is_none());
    }
    #[test]
    fn staying_awake_through_midnight_is_not_another_launch_but_resume_is() {
        let state = crate::commands::AppState::new(
            Storage::open(std::path::Path::new(":memory:")).unwrap(),
        )
        .unwrap();
        let mut inner = state.inner.lock().unwrap();
        let at = |d, h, m, s| {
            Local
                .with_ymd_and_hms(2026, 10, d, h, m, s)
                .unwrap()
                .timestamp()
        };
        let p = next(&mut inner, at(21, 23, 59, 58)).unwrap().unwrap();
        inner.companion.memory.reserve(&p, at(21, 23, 59, 58));
        assert!(next(&mut inner, at(22, 0, 0, 1)).unwrap().is_none());
        let resumed = next(&mut inner, at(22, 7, 0, 0)).unwrap().unwrap();
        assert_eq!(resumed.kind, Kind::NoGoals);
        inner.companion.memory.reserve(&resumed, at(22, 7, 0, 0));
        inner.companion.last_schedule_tick = None;
        assert!(next(&mut inner, at(22, 8, 0, 0)).unwrap().is_none());
    }
    #[test]
    fn manual_quiet_at_summary_time_marks_it_skipped_without_stopping_tracking() {
        let state = crate::commands::AppState::new(
            Storage::open(std::path::Path::new(":memory:")).unwrap(),
        )
        .unwrap();
        let mut inner = state.inner.lock().unwrap();
        let at = |m| {
            Local
                .with_ymd_and_hms(2026, 10, 21, 18, m, 0)
                .unwrap()
                .timestamp()
        };
        inner
            .companion
            .memory
            .seen
            .push("schedule:2026-10-21:planning".into());
        inner.status.dnd = true;
        super::super::enforce_quiet(&mut inner);
        skip_quiet_summary(&mut inner, at(0)).unwrap();
        inner.status.dnd = false;
        super::super::enforce_quiet(&mut inner);
        assert!(next(&mut inner, at(1)).unwrap().is_none());
        assert!(inner
            .companion
            .memory
            .seen
            .contains(&"schedule:2026-10-21:summary".into()));
    }
    #[test]
    fn due_today_is_idempotent_and_does_not_change_focus_or_complete_goals() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let goal = s.set_goal("Pitch deck").unwrap();
        s.core_snapshot(None).unwrap();
        let today = Local::now().date_naive();
        let due = Local
            .from_local_datetime(&today.and_hms_opt(16, 0, 0).unwrap())
            .earliest()
            .unwrap()
            .to_rfc3339();
        s.connection
            .execute(
                "INSERT OR REPLACE INTO core_goal_details(goal_id,due_at) VALUES(?1,?2)",
                rusqlite::params![goal.id, due],
            )
            .unwrap();
        include_due_today(&mut s, today).unwrap();
        include_due_today(&mut s, today).unwrap();
        let snapshot = s.core_snapshot(None).unwrap();
        assert_eq!(
            snapshot.today.iter().filter(|&&id| id == goal.id).count(),
            1
        );
        assert_eq!(s.goal().unwrap().unwrap().id, goal.id);
        assert_eq!(
            snapshot
                .goals
                .iter()
                .find(|g| g.id == goal.id)
                .unwrap()
                .status,
            "open"
        );
    }
    #[test]
    fn summary_uses_active_language_without_inventing_work_when_history_is_empty() {
        let s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let text = summary(&s, &[Local::now().date_naive()]).unwrap();
        assert!(text.contains("no completed steps"));
        assert!(!text.contains("recorded"));
    }
}
