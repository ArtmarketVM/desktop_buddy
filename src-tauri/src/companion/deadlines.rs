//! Three factual mascot reminders per goal/deadline: before, due now, and after.
use super::engine::{Intervention, Kind, Memory};
use crate::storage::Storage;
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const DELIVERIES: &str = "deadline_deliveries";
#[derive(Default, Serialize, Deserialize)]
struct Delivery {
    due: i64,
    phases: u8,
}
fn phase_bit(phase: &str) -> u8 {
    match phase {
        "before" => 1,
        "now" => 2,
        "after" => 4,
        _ => 0,
    }
}

struct DueGoal {
    id: i64,
    title: String,
    due: i64,
}
impl DueGoal {
    fn phase(&self, now: i64) -> Option<&'static str> {
        if now < self.due - 3600 {
            None
        } else if now < self.due {
            Some("before")
        } else if now < self.due + 3600 {
            Some("now")
        } else {
            Some("after")
        }
    }
    fn key(&self, phase: &str) -> String {
        format!("deadline:{}:{}:{phase}", self.id, self.due)
    }
    fn text(&self, phase: &str, now: i64) -> String {
        let title = self.title.chars().take(100).collect::<String>();
        let clock = DateTime::from_timestamp(self.due, 0)
            .unwrap()
            .with_timezone(&Local)
            .format("%H:%M")
            .to_string();
        let timing = match phase {
            "before" => format!("is due at {clock}"),
            "now" if now.saturating_sub(self.due) < 60 => "is due now".into(),
            "now" => format!("was due at {clock} and is still open"),
            _ => format!("was due at {clock} and is still open"),
        };
        format!("“{title}” {timing}. Are you on it, or do you need to reschedule?")
    }
}
fn goals(storage: &Storage) -> Result<Vec<DueGoal>, String> {
    storage.adopt_core_goals()?;
    let mut q=storage.connection.prepare("SELECT g.id,g.text,d.due_at FROM goals g JOIN core_goals c ON c.goal_id=g.id JOIN core_goal_details d ON d.goal_id=g.id WHERE c.state='open' AND g.status!='completed' AND d.due_at IS NOT NULL").map_err(|_|"Deadline reminders unavailable")?;
    let rows = q
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|_| "Deadline reminders unavailable")?;
    let mut goals = Vec::new();
    for row in rows {
        let (id, title, due) = row.map_err(|_| "Deadline reminders unavailable")?;
        if let Ok(date) = DateTime::parse_from_rfc3339(&due) {
            goals.push(DueGoal {
                id,
                title,
                due: date.timestamp(),
            });
        }
    }
    Ok(goals)
}
pub(super) fn next(
    storage: &Storage,
    memory: &Memory,
    focus: Option<i64>,
    _day: &str,
    now: i64,
) -> Result<Option<Intervention>, String> {
    let deliveries: BTreeMap<i64, Delivery> = storage.read_setting(DELIVERIES)?.unwrap_or_default();
    let mut candidates = goals(storage)?
        .into_iter()
        .filter_map(|g| {
            let phase = g.phase(now)?;
            let delivered = deliveries
                .get(&g.id)
                .is_some_and(|d| d.due == g.due && d.phases & phase_bit(phase) != 0);
            (!delivered && !memory.seen.contains(&g.key(phase))).then_some((g, phase))
        })
        .collect::<Vec<_>>();
    // Only the current phase can be delivered after a missed event; never replay a burst.
    candidates.sort_by_key(|(g, p)| {
        (
            match *p {
                "now" => 0,
                "after" => 1,
                _ => 2,
            },
            Some(g.id) != focus,
            g.due,
            g.id,
        )
    });
    candidates
        .first()
        .map(|(g, p)| {
            Ok(Intervention {
                id: g.key(p),
                kind: Kind::Deadline,
                text: g.text(p, now),
                confidence: 1.0,
                goal_id: Some(g.id),
                plan_revision: Some(storage.goal_plan(g.id)?.revision),
                step_id: None,
                expires_at: now + 300,
            })
        })
        .transpose()
}
pub(super) fn reserve(
    storage: &Storage,
    memory: &mut Memory,
    prompt: &Intervention,
    _day: &str,
    now: i64,
) -> Result<bool, String> {
    let id = validate(storage, prompt, _day, now)?;
    let active = goals(storage)?;
    let goal = active
        .iter()
        .find(|g| g.id == id)
        .ok_or("Deadline changed")?;
    let phase = goal.phase(now).ok_or("Deadline changed")?;
    let mut deliveries: BTreeMap<i64, Delivery> =
        storage.read_setting(DELIVERIES)?.unwrap_or_default();
    // One compact record per current deadline; old versions and deleted goals are discarded.
    deliveries.retain(|id, d| active.iter().any(|g| g.id == *id && g.due == d.due));
    let delivery = deliveries.entry(id).or_default();
    if delivery.due != goal.due {
        *delivery = Delivery {
            due: goal.due,
            phases: 0,
        };
    }
    if delivery.phases & phase_bit(phase) != 0 || memory.seen.contains(&prompt.id) {
        return Ok(false);
    }
    delivery.phases |= phase_bit(phase);
    storage.write_setting(DELIVERIES, &deliveries)?;
    Ok(memory.reserve(prompt, now))
}
pub(super) fn refresh(
    storage: &Storage,
    prompt: &Intervention,
    now: i64,
) -> Result<String, String> {
    let goal = goals(storage)?
        .into_iter()
        .find(|g| Some(g.id) == prompt.goal_id)
        .ok_or("Deadline changed")?;
    Ok(goal.text(goal.phase(now).ok_or("Deadline changed")?, now))
}
pub(super) fn validate(
    storage: &Storage,
    prompt: &Intervention,
    _day: &str,
    now: i64,
) -> Result<i64, String> {
    let changed = "This goal or deadline changed. Review it before continuing.";
    let goal = goals(storage)?
        .into_iter()
        .find(|g| Some(g.id) == prompt.goal_id)
        .ok_or(changed)?;
    let phase = goal.phase(now).ok_or(changed)?;
    if prompt.kind != Kind::Deadline
        || prompt.expires_at <= now
        || prompt.id != goal.key(phase)
        || (prompt.text != goal.text(phase, now)
            && !(phase == "now" && prompt.text == goal.text(phase, goal.due)))
        || prompt.step_id.is_some()
        || prompt.plan_revision != Some(storage.goal_plan(goal.id)?.revision)
    {
        return Err(changed.into());
    }
    Ok(goal.id)
}
pub(super) fn respond(
    storage: &mut Storage,
    prompt: &Intervention,
    action: &str,
    deadline: Option<&str>,
    day: &str,
    now: i64,
) -> Result<i64, String> {
    let id = validate(storage, prompt, day, now)?;
    match action {
        "on_it" | "ignore" | "chat" => {}
        "reschedule" => {
            let due = DateTime::parse_from_rfc3339(deadline.ok_or("Choose a new date and time")?)
                .map_err(|_| "Choose a valid deadline")?;
            if due.timestamp() <= now {
                return Err("Choose a future deadline".into());
            }
            let updated = storage
                .connection
                .execute(
                    "UPDATE core_goal_details SET due_at=?1 WHERE goal_id=?2",
                    rusqlite::params![due.to_rfc3339(), id],
                )
                .map_err(|_| "Could not reschedule goal")?;
            if updated != 1 {
                return Err("This goal changed".into());
            }
        }
        _ => return Err("Unknown deadline response".into()),
    }
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Storage, i64, i64) {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let goal = s.set_goal("Pitch deck").unwrap();
        s.core_snapshot(None).unwrap();
        let due = 1_792_598_400;
        s.connection
            .execute(
                "INSERT OR REPLACE INTO core_goal_details(goal_id,due_at) VALUES(?1,?2)",
                rusqlite::params![
                    goal.id,
                    DateTime::from_timestamp(due, 0).unwrap().to_rfc3339()
                ],
            )
            .unwrap();
        (s, goal.id, due)
    }
    #[test]
    fn late_delivery_names_the_actual_deadline_instead_of_saying_due_now() {
        let (s, goal, due) = fixture();
        let p = next(&s, &Memory::default(), Some(goal), "", due + 20 * 60)
            .unwrap()
            .unwrap();
        assert!(p.id.ends_with(":now"));
        assert!(!p.text.contains("due now"));
        assert!(p.text.contains("was due at"));
        assert!(p.text.contains("still open"));
        assert!(validate(&s, &p, "", due + 21 * 60).is_ok());
    }
    #[test]
    fn three_bands_deduplicate_without_daily_budgets_and_survive_restart() {
        let (s, _, due) = fixture();
        let mut memory = Memory {
            shown: 500,
            last_prompt: due,
            ..Default::default()
        };
        assert!(next(&s, &memory, None, "day", due - 3601)
            .unwrap()
            .is_none());
        for (at, phase) in [(due - 3600, "before"), (due, "now"), (due + 3600, "after")] {
            let p = next(&s, &memory, None, "day", at).unwrap().unwrap();
            assert!(p.id.ends_with(phase));
            assert!(reserve(&s, &mut memory, &p, "day", at).unwrap());
            memory = serde_json::from_str(&serde_json::to_string(&memory).unwrap()).unwrap();
            assert!(next(&s, &memory, None, "another day", at + 1)
                .unwrap()
                .is_none());
        }
        // General card history is bounded; deadline delivery must outlive that buffer.
        assert!(next(&s, &Memory::default(), None, "later", due + 86_400)
            .unwrap()
            .is_none());
    }
    #[test]
    fn missed_phases_do_not_burst_and_completed_or_changed_goals_cancel_old_prompts() {
        let (mut s, id, due) = fixture();
        let memory = Memory::default();
        let p = next(&s, &memory, None, "day", due + 4000).unwrap().unwrap();
        assert!(p.id.ends_with("after"));
        s.core_transition(id, "complete").unwrap();
        assert!(next(&s, &memory, None, "day", due + 4001)
            .unwrap()
            .is_none());
        assert!(validate(&s, &p, "day", due + 4001).is_err());
    }
    #[test]
    fn renamed_replanned_and_deleted_goals_reject_stale_deadline_actions() {
        for change in 0..3 {
            let (mut s, id, due) = fixture();
            let p = next(&s, &Memory::default(), None, "day", due)
                .unwrap()
                .unwrap();
            match change {
                0 => {
                    s.connection
                        .execute("UPDATE goals SET text='New title' WHERE id=?1", [id])
                        .unwrap();
                }
                1 => {
                    let plan = s.goal_plan(id).unwrap();
                    s.save_goal_plan("Pitch deck", plan).unwrap();
                }
                _ => {
                    s.core_transition(id, "delete").unwrap();
                }
            }
            assert!(respond(&mut s, &p, "on_it", None, "day", due).is_err());
        }
    }
    #[test]
    fn acknowledgement_and_chat_never_change_focus_or_completion_and_reschedule_requires_input() {
        let (mut s, id, due) = fixture();
        let p = next(&s, &Memory::default(), None, "day", due)
            .unwrap()
            .unwrap();
        for action in ["on_it", "chat"] {
            respond(&mut s, &p, action, None, "day", due).unwrap();
        }
        assert_eq!(s.goal().unwrap().unwrap().id, id);
        assert_eq!(
            s.core_snapshot(None)
                .unwrap()
                .goals
                .iter()
                .find(|g| g.id == id)
                .unwrap()
                .status,
            "open"
        );
        assert!(respond(&mut s, &p, "reschedule", None, "day", due).is_err());
        let past = DateTime::from_timestamp(due - 1, 0).unwrap().to_rfc3339();
        assert!(respond(&mut s, &p, "reschedule", Some(&past), "day", due).is_err());
        let new = DateTime::from_timestamp(due + 7200, 0)
            .unwrap()
            .to_rfc3339();
        respond(&mut s, &p, "reschedule", Some(&new), "day", due).unwrap();
        assert!(validate(&s, &p, "day", due).is_err());
        let latest = next(&s, &Memory::default(), None, "day", due + 3600)
            .unwrap()
            .unwrap();
        assert!(latest.id.ends_with("before"));
    }
}
