//! Local, factual deadline reminders. No inference or screen content is needed.
use super::engine::{fingerprint, Intervention, Kind, Memory};
use crate::storage::Storage;
use chrono::{DateTime, Local, NaiveDate, TimeZone, Utc};
use rusqlite::OptionalExtension;

struct DueGoal {
    id: i64,
    title: String,
    due: i64,
}
impl DueGoal {
    fn key(&self, day: &str) -> String {
        format!("deadline:{}:{}:{day}", self.id, self.due)
    }
    fn text(&self) -> String {
        // Keep unusually long imported goal titles from overwhelming the bubble.
        let mut title: String = self.title.chars().take(100).collect();
        if self.title.chars().count() > 100 {
            title.push('…');
        }
        format!("“{title}” is past its deadline. Finished, or do it today?")
    }
}
fn row(id: i64, title: String, due: String, now: i64) -> Option<DueGoal> {
    let due = DateTime::parse_from_rfc3339(&due).ok()?.timestamp();
    (due <= now).then_some(DueGoal { id, title, due })
}

pub(super) fn next(
    storage: &Storage,
    memory: &Memory,
    focus: Option<i64>,
    day: &str,
    now: i64,
) -> Result<Option<Intervention>, String> {
    let mut query = storage.connection.prepare(
        "SELECT g.id,g.text,d.due_at FROM goals g JOIN core_goals c ON c.goal_id=g.id JOIN core_goal_details d ON d.goal_id=g.id WHERE c.state='open' AND g.status!='completed' AND d.due_at IS NOT NULL",
    ).map_err(|_| "Deadline reminders unavailable")?;
    let rows = query
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|_| "Deadline reminders unavailable")?;
    let mut goals = Vec::new();
    for result in rows {
        let (id, title, due) = result.map_err(|_| "Deadline reminders unavailable")?;
        if let Some(goal) = row(id, title, due, now) {
            if !memory.seen.contains(&goal.key(day)) {
                goals.push(goal);
            }
        }
    }
    // Current work first, then the oldest overdue item. Never replace the user's focus.
    goals.sort_by_key(|g| (Some(g.id) != focus, g.due, g.id));
    goals
        .first()
        .map(|goal| {
            Ok(Intervention {
                id: goal.key(day),
                kind: Kind::Deadline,
                text: goal.text(),
                confidence: 1.0,
                goal_id: Some(goal.id),
                plan_revision: Some(storage.goal_plan(goal.id)?.revision),
                step_id: None,
                expires_at: now + 120,
            })
        })
        .transpose()
}

pub(super) fn validate(
    storage: &Storage,
    prompt: &Intervention,
    day: &str,
    now: i64,
) -> Result<i64, String> {
    let changed = "This goal or deadline changed. Review it before continuing.";
    let id = prompt.goal_id.ok_or(changed)?;
    let value: Option<(String, String)> = storage.connection.query_row(
        "SELECT g.text,d.due_at FROM goals g JOIN core_goals c ON c.goal_id=g.id JOIN core_goal_details d ON d.goal_id=g.id WHERE g.id=?1 AND c.state='open' AND g.status!='completed' AND d.due_at IS NOT NULL",
        [id], |r| Ok((r.get(0)?,r.get(1)?)),
    ).optional().map_err(|_| changed)?;
    let (title, due) = value.ok_or(changed)?;
    let goal = row(id, title, due, now).ok_or(changed)?;
    if prompt.kind != Kind::Deadline
        || prompt.expires_at <= now
        || prompt.id != goal.key(day)
        || fingerprint(&prompt.text) != fingerprint(&goal.text())
        || prompt.step_id.is_some()
        || prompt.plan_revision != Some(storage.goal_plan(id)?.revision)
    {
        return Err(changed.into());
    }
    Ok(id)
}

pub(super) fn respond(
    storage: &mut Storage,
    prompt: &Intervention,
    action: &str,
    day: &str,
    now: i64,
) -> Result<i64, String> {
    let id = validate(storage, prompt, day, now)?;
    match action {
        // This button is the user's explicit confirmation, not inferred completion.
        "accept" => storage.core_transition(id, "complete")?,
        "today" => {
            let date: NaiveDate = day.parse().map_err(|_| "Choose a valid day")?;
            let end = Local
                .from_local_datetime(&date.and_hms_opt(23, 59, 59).ok_or("Choose a valid day")?)
                .latest()
                .ok_or("Today's deadline is unavailable in this time zone")?
                .with_timezone(&Utc)
                .to_rfc3339();
            storage
                .connection
                .execute_batch("SAVEPOINT deadline_today")
                .map_err(|_| "Could not reschedule goal")?;
            let result = (|| {
                storage.core_today(id, true, day)?;
                storage
                    .connection
                    .execute(
                        "UPDATE core_goal_details SET due_at=?1 WHERE goal_id=?2",
                        rusqlite::params![end, id],
                    )
                    .map_err(|_| "Could not reschedule goal")?;
                Ok::<(), String>(())
            })();
            storage
                .connection
                .execute_batch(if result.is_ok() {
                    "RELEASE deadline_today"
                } else {
                    "ROLLBACK TO deadline_today; RELEASE deadline_today"
                })
                .map_err(|_| "Could not reschedule goal")?;
            result?;
        }
        _ => return Err("Unknown deadline response".into()),
    }
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::GoalDraft;
    const DAY: &str = "2026-10-20";
    fn now() -> i64 {
        DateTime::parse_from_rfc3339("2026-10-20T12:00:00Z")
            .unwrap()
            .timestamp()
    }
    fn add(storage: &mut Storage, title: &str, due: &str) -> i64 {
        storage
            .core_add_goals(
                vec![GoalDraft {
                    title: title.into(),
                    area: "Work".into(),
                    steps: vec!["Review result".into()],
                }],
                title,
            )
            .unwrap();
        let id = storage
            .core_snapshot(None)
            .unwrap()
            .goals
            .into_iter()
            .find(|g| g.title == title)
            .unwrap()
            .id;
        storage
            .connection
            .execute(
                "INSERT INTO core_goal_details(goal_id,due_at) VALUES(?1,?2)",
                rusqlite::params![id, due],
            )
            .unwrap();
        id
    }
    fn includes(s: &Storage, id: i64, day: &str) -> bool {
        s.connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM core_day_items WHERE goal_id=?1 AND day=?2)",
                rusqlite::params![id, day],
                |r| r.get(0),
            )
            .unwrap()
    }
    fn prompt(storage: &Storage) -> Intervention {
        next(storage, &Memory::default(), None, DAY, now())
            .unwrap()
            .unwrap()
    }
    #[test]
    fn deadline_boundary_uses_absolute_time_and_ignores_missing_or_invalid_dates() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        add(&mut s, "Future", "2026-10-20T15:00:01+03:00");
        add(&mut s, "Invalid", "not-a-date");
        s.core_create_goal("No deadline", "undated", DAY).unwrap();
        assert!(next(&s, &Memory::default(), None, DAY, now())
            .unwrap()
            .is_none());
        let id = add(&mut s, "Due", "2026-10-20T15:00:00+03:00");
        assert_eq!(prompt(&s).goal_id, Some(id));
        assert!(prompt(&s).text.contains("Finished, or do it today?"));
    }
    #[test]
    fn overdue_carryover_is_reminded_without_today_membership_and_focus_wins() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let older = add(&mut s, "Older", "2026-10-18T10:00:00Z");
        let focus = add(&mut s, "Focus", "2026-10-19T10:00:00Z");
        s.core_today(older, true, "2026-10-19").unwrap();
        assert!(!includes(&s, older, DAY));
        assert_eq!(prompt(&s).goal_id, Some(older));
        assert_eq!(
            next(&s, &Memory::default(), Some(focus), DAY, now())
                .unwrap()
                .unwrap()
                .goal_id,
            Some(focus)
        );
        s.core_transition(focus, "defer").unwrap();
        s.core_transition(older, "complete").unwrap();
        assert!(next(&s, &Memory::default(), Some(focus), DAY, now())
            .unwrap()
            .is_none());
    }
    #[test]
    fn reminder_deduplication_survives_reopen_and_rearms_on_new_day() {
        let path = std::env::temp_dir().join(format!(
            "buddy-deadline-{}.db",
            Utc::now().timestamp_nanos_opt().unwrap()
        ));
        {
            let mut s = Storage::open(&path).unwrap();
            add(&mut s, "Persist", "2026-10-19T10:00:00Z");
            let mut memory = Memory::default();
            memory.refresh(DAY);
            assert!(memory.reserve(&prompt(&s), now()));
            s.write_setting("companion_memory", &memory).unwrap();
        }
        {
            let s = Storage::open(&path).unwrap();
            let mut memory: Memory = s.read_setting("companion_memory").unwrap().unwrap();
            assert!(next(&s, &memory, None, DAY, now()).unwrap().is_none());
            memory.refresh("2026-10-21");
            assert!(next(&s, &memory, None, "2026-10-21", now() + 86400)
                .unwrap()
                .is_some());
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn do_today_reschedules_deadline_and_membership_without_changing_focus_or_completion() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let id = add(&mut s, "Overdue", "2026-10-19T10:00:00Z");
        let focus = s.set_goal("Current work").unwrap().id;
        let p = prompt(&s);
        respond(&mut s, &p, "today", DAY, now()).unwrap();
        let snap = s.core_snapshot(Some(DAY)).unwrap();
        assert!(includes(&s, id, DAY));
        assert_eq!(s.goal().unwrap().unwrap().id, focus);
        let goal = snap.goals.iter().find(|g| g.id == id).unwrap();
        assert_eq!(goal.status, "open");
        assert!(!goal.plan.steps[0].done);
        let due = DateTime::parse_from_rfc3339(goal.due_at.as_ref().unwrap())
            .unwrap()
            .with_timezone(&Local);
        assert_eq!(due.date_naive().to_string(), DAY);
        assert_eq!(due.time().to_string(), "23:59:59");
        assert!(next(&s, &Memory::default(), None, DAY, now())
            .unwrap()
            .is_none());
    }
    #[test]
    fn rescheduling_is_atomic_if_deadline_update_fails() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let id = add(&mut s, "Atomic", "2026-10-19T10:00:00Z");
        let p = prompt(&s);
        s.connection.execute_batch("CREATE TRIGGER refuse_deadline BEFORE UPDATE ON core_goal_details BEGIN SELECT RAISE(ABORT,'fixture'); END;").unwrap();
        assert!(respond(&mut s, &p, "today", DAY, now()).is_err());
        assert!(!includes(&s, id, DAY));
        assert!(validate(&s, &p, DAY, now()).is_ok());
    }
    #[test]
    fn completion_requires_explicit_action_and_affects_only_the_selected_goal() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let id = add(&mut s, "Selected", "2026-10-19T10:00:00Z");
        let other = add(&mut s, "Other", "2026-10-19T11:00:00Z");
        let focus = s.set_goal("Focus elsewhere").unwrap().id;
        let p = prompt(&s);
        assert!(respond(&mut s, &p, "unknown", DAY, now()).is_err());
        assert!(!s.goal_plan(id).unwrap().steps[0].done);
        respond(&mut s, &p, "accept", DAY, now()).unwrap();
        assert!(s.goal_plan(id).unwrap().steps[0].done);
        assert!(!s.goal_plan(other).unwrap().steps[0].done);
        assert_eq!(s.goal().unwrap().unwrap().id, focus);
        assert_eq!(
            s.connection
                .query_row(
                    "SELECT completion_source FROM core_events WHERE goal_id=?1 AND step_id='goal'",
                    [id],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "manual"
        );
        assert!(respond(&mut s, &p, "accept", DAY, now()).is_err());
    }
    #[test]
    fn stale_deadline_plan_title_day_or_deleted_goal_cannot_be_mutated() {
        for change in [
            "deadline",
            "plan",
            "title",
            "day",
            "expired",
            "deleted",
            "completed",
            "deferred",
        ] {
            let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
            let id = add(&mut s, "Stale", "2026-10-19T10:00:00Z");
            let p = prompt(&s);
            match change {
                "deadline" => {
                    s.connection
                        .execute(
                            "UPDATE core_goal_details SET due_at='2026-10-19T11:00:00Z'",
                            [],
                        )
                        .unwrap();
                }
                "plan" => {
                    s.connection
                        .execute("UPDATE goal_plans SET revision=revision+1", [])
                        .unwrap();
                }
                "title" => {
                    s.connection
                        .execute("UPDATE goals SET text='Renamed'", [])
                        .unwrap();
                }
                "deleted" => s.core_transition(id, "delete").unwrap(),
                "completed" => s.core_transition(id, "complete").unwrap(),
                "deferred" => s.core_transition(id, "defer").unwrap(),
                _ => {}
            }
            assert!(
                respond(
                    &mut s,
                    &p,
                    "today",
                    if change == "day" { "2026-10-21" } else { DAY },
                    if change == "expired" {
                        now() + 120
                    } else {
                        now()
                    }
                )
                .is_err(),
                "{change}"
            );
            assert!(!includes(&s, id, DAY), "{change}");
        }
    }
}
