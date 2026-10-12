//! Computed personal work state. Sampling never writes permanent memory.
use crate::{commands::Inner, memory::ContextStatus};
use serde::Serialize;
use serde_json::Value;
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum State {
    Working,
    Waiting,
    Stuck,
    Drifting,
    Away,
}
#[derive(Serialize)]
pub struct PersonalWorkState {
    pub active_goal_id: Option<i64>,
    pub active_step_id: Option<String>,
    pub state: State,
    pub confidence: f64,
    pub last_meaningful_event: Option<crate::agent_runtime::EventKind>,
    pub current_work_context: Option<Value>,
    pub waiting_for: Option<String>,
    pub relevant_evidence: Vec<String>,
}
pub fn compute(inner: &Inner) -> Result<PersonalWorkState, String> {
    let mut result = PersonalWorkState {
        active_goal_id: None,
        active_step_id: None,
        state: State::Away,
        confidence: 1.,
        last_meaningful_event: inner.agent.diagnostics.last_event,
        current_work_context: None,
        waiting_for: None,
        relevant_evidence: vec![],
    };
    let sample = inner
        .goal_matching
        .current_sample()
        .or(inner.buddy.foreground.as_ref());
    let Some(sample) = sample.filter(|a| {
        inner.status.tracking
            && inner.status.tracking_error.is_none()
            && a.idle_seconds < inner.tracking_settings.idle_seconds
            && !crate::attention::excluded(&inner.buddy.view.preferences, &a.process_name)
            && !crate::companion::sensitive_window(a)
    }) else {
        result
            .relevant_evidence
            .push("tracking_paused_idle_or_private".into());
        return Ok(result);
    };
    let explicit = inner.storage.explicit_focus()?;
    let selected = explicit.or(inner.goal_matching.view.goal_id).or_else(|| {
        (inner.goal_matching.view.source.as_deref() == Some("debouncing"))
            .then(|| inner.storage.goal().ok().flatten().map(|g| g.id))
            .flatten()
    });
    let snapshot = inner.storage.core_snapshot(None)?;
    let goal = selected.and_then(|id| {
        snapshot
            .goals
            .iter()
            .find(|g| g.id == id && g.status == "open")
    });
    if let Some(g) = goal {
        result.active_goal_id = Some(g.id);
        result.active_step_id = g
            .plan
            .current_step
            .clone()
            .or_else(|| g.plan.steps.iter().find(|s| !s.done).map(|s| s.id.clone()));
        result.confidence = if explicit.is_some() {
            1.
        } else {
            inner.goal_matching.view.confidence.unwrap_or(0.3)
        };
        let controls = inner.storage.memory_controls()?;
        if controls.enabled && controls.remember_work_context {
            if let Some(context) = inner.storage.work_context(g.id)? {
                if context.context.status == ContextStatus::Waiting {
                    result.waiting_for = context.context.waiting_for.clone();
                }
                result.current_work_context =
                    Some(crate::work_context::public_checkpoint(&context));
            }
        }
    } else {
        result.confidence = 0.;
    }
    result.relevant_evidence.push(if explicit.is_some() {
        "explicit_focus".into()
    } else {
        inner
            .goal_matching
            .view
            .source
            .clone()
            .unwrap_or_else(|| "unknown".into())
    });
    let distraction = goal
        .map(|g| inner.storage.category(g.id, &sample.process_name))
        .transpose()?
        .flatten()
        == Some(crate::insights::Category::Distraction);
    let contrary = goal.is_some_and(|g| {
        inner
            .storage
            .match_activity(sample)
            .is_ok_and(|matched| matched.goal_id.is_some_and(|id| id != g.id.to_string()))
    });
    if contrary {
        result
            .relevant_evidence
            .push("conflicting_local_context".into());
    }
    result.state = if result.waiting_for.is_some() {
        State::Waiting
    } else if distraction
        || contrary
        || inner.activity_state.state == crate::tracking::ActivityState::Drifting
        || goal.is_none()
    {
        State::Drifting
    } else if goal.is_some_and(|g| {
        crate::companion::stuck_due(&inner.storage, g.id, chrono::Utc::now().timestamp())
            .unwrap_or(false)
    }) {
        State::Stuck
    } else {
        State::Working
    };
    Ok(result)
}
