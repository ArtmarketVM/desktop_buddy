use super::*;
use std::collections::BTreeMap;
#[derive(Clone, PartialEq)]
struct GoalState {
    title: String,
    state: String,
    revision: u64,
    completed: Vec<String>,
    parked: Option<String>,
    resumed: Option<String>,
}
#[derive(Default)]
pub(super) struct Observation {
    initialized: bool,
    goals: BTreeMap<i64, GoalState>,
    focus: Option<i64>,
    tracking: bool,
    day: String,
    candidate: Option<(String, i64)>,
    stable_context: String,
    pub(super) drift: bool,
    pub(super) stuck: bool,
}
pub(super) fn observe(inner: &mut Inner, now: i64) -> Result<(), String> {
    let snapshot = inner.storage.core_work_snapshot()?;
    let states: BTreeMap<_, _> = snapshot
        .goals
        .iter()
        .map(|g| {
            (
                g.id,
                GoalState {
                    title: g.title.clone(),
                    state: g.status.clone(),
                    revision: g.plan.revision,
                    completed: g
                        .plan
                        .steps
                        .iter()
                        .filter(|s| s.done)
                        .map(|s| s.id.clone())
                        .collect(),
                    parked: g.work_context.as_ref().and_then(|c| c.parked_at.clone()),
                    resumed: g.work_context.as_ref().and_then(|c| c.resumed_at.clone()),
                },
            )
        })
        .collect();
    let mut events = vec![];
    let goal = snapshot.focused_goal_id;
    let drift = inner.status.tracking
        && inner.buddy.foreground.is_some()
        && (inner.activity_state.state == crate::tracking::ActivityState::Drifting
            || crate::insights::explicit_category(inner)?
                == Some(crate::insights::Category::Distraction));
    let stuck = goal
        .map(|id| crate::companion::stuck_due(&inner.storage, id, now))
        .transpose()?
        .unwrap_or(false);
    let mut observed = std::mem::take(&mut inner.agent.observation);
    if !observed.initialized || observed.day != snapshot.date {
        inner.storage.maintain_personal_memory(Utc::now())?;
    }
    if !observed.initialized {
        events.push(Event::new(EventKind::SessionStarted, goal, now));
        events.push(Event::new(EventKind::DayStarted, goal, now));
        observed.initialized = true;
    } else {
        if observed.day != snapshot.date {
            events.push(Event::new(EventKind::DayEnded, observed.focus, now));
            events.push(Event::new(EventKind::DayStarted, goal, now));
        }
        if observed.tracking != inner.status.tracking {
            events.push(Event::new(
                if inner.status.tracking {
                    EventKind::SessionStarted
                } else {
                    EventKind::SessionEnded
                },
                goal,
                now,
            ));
        }
        if observed.focus != goal {
            events.push(Event::new(EventKind::GoalChanged, goal, now));
        }
        for (id, current) in &states {
            if let Some(old) = observed.goals.get(id) {
                if old.title != current.title || old.state != current.state {
                    events.push(Event::new(EventKind::GoalChanged, Some(*id), now));
                }
                if old.revision != current.revision {
                    events.push(Event::new(EventKind::StepChanged, Some(*id), now));
                }
                for step in current
                    .completed
                    .iter()
                    .filter(|step| !old.completed.contains(step))
                {
                    let mut event = Event::new(EventKind::CompletionConfirmed, Some(*id), now);
                    event.step_id = Some(step.clone());
                    events.push(event);
                }
                if old.state != "completed" && current.state == "completed" {
                    events.push(Event::new(EventKind::CompletionConfirmed, Some(*id), now));
                }
                if current.parked.is_some() && old.parked != current.parked {
                    events.push(Event::new(EventKind::WorkContextParked, Some(*id), now));
                }
                if current.resumed.is_some() && old.resumed != current.resumed {
                    events.push(Event::new(EventKind::WorkContextResumed, Some(*id), now));
                }
            } else {
                events.push(Event::new(EventKind::GoalChanged, Some(*id), now));
            }
        }
        for _id in observed.goals.keys().filter(|id| !states.contains_key(id)) {
            events.push(Event::new(EventKind::GoalChanged, None, now));
        }
    }
    // A window fingerprint is local/transient only; raw window text is never queued or persisted.
    let context = inner
        .buddy
        .foreground
        .as_ref()
        .filter(|a| {
            inner.status.tracking
                && a.engaged(inner.tracking_settings.idle_seconds)
                && !crate::companion::sensitive_window(a)
                && !crate::attention::excluded(&inner.buddy.view.preferences, &a.process_name)
        })
        .map(|a| {
            crate::companion::engine::fingerprint(&format!(
                "{goal:?}:{}:{}",
                a.process_name, a.window_title
            ))
        });
    if let Some(context) = context {
        if observed
            .candidate
            .as_ref()
            .is_none_or(|(old, _)| old != &context)
        {
            observed.candidate = Some((context.clone(), now));
        }
        if observed.stable_context != context
            && observed
                .candidate
                .as_ref()
                .is_some_and(|(_, since)| now.saturating_sub(*since) >= 30)
        {
            observed.stable_context = context;
            let mut event = Event::new(EventKind::MeaningfulContextChanged, goal, now);
            event.origin = Origin::Collector;
            events.push(event);
        }
    } else {
        observed.candidate = None;
        observed.stable_context.clear();
    }
    if drift && !observed.drift {
        events.push(Event::new(EventKind::PossibleDrift, goal, now));
    }
    if stuck && !observed.stuck {
        events.push(Event::new(EventKind::PossibleStuck, goal, now));
    }
    observed.drift = drift;
    observed.stuck = stuck;
    observed.goals = states;
    observed.focus = goal;
    observed.tracking = inner.status.tracking;
    observed.day = snapshot.date;
    inner.agent.observation = observed;
    for event in events {
        crate::engine_observability::record(
            inner,
            "event",
            serde_json::to_value(event.kind).unwrap().as_str().unwrap(),
            "queued",
            None,
            event.goal_id,
        );
        inner.agent.enqueue(event);
    }
    Ok(())
}
