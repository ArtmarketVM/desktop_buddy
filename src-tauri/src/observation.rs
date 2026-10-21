//! Shared budget and capability diagnostics for foreground-only observation.
use crate::commands::Inner;
use std::time::{Duration, Instant};
pub(crate) fn reserve(inner: &mut Inner) -> bool {
    let now = Instant::now();
    inner
        .companion
        .observation_calls
        .retain(|at| now.saturating_duration_since(*at) < Duration::from_secs(3600));
    if inner.companion.observation_calls.len() >= 24 {
        crate::engine_observability::record(
            inner,
            "suppress",
            "observation_budget",
            "hourly_limit",
            None,
            None,
        );
        return false;
    }
    inner.companion.observation_calls.push_back(now);
    true
}

pub(crate) fn personal_context(
    inner: &Inner,
    request: &str,
    goal: Option<i64>,
) -> serde_json::Value {
    let share = inner
        .storage
        .ai_preferences()
        .is_ok_and(|p| p.enabled && p.share_goal_context);
    inner
        .storage
        .retrieve_contextual_memory(
            &crate::memory::retriever::RetrievalInput {
                user_request: request.chars().take(1000).collect(),
                active_goal_id: goal,
                ..Default::default()
            },
            &crate::memory::retriever::MemoryBudget {
                maximum_memories: 4,
                maximum_context_size: 1800,
                ..Default::default()
            },
            share,
        )
        .map(|m| m.context)
        .unwrap_or(serde_json::Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hourly_budget_caps_disclosures_but_expired_entries_do_not_block_work() {
        let state = crate::commands::AppState::new(
            crate::storage::Storage::open(std::path::Path::new(":memory:")).unwrap(),
        )
        .unwrap();
        let mut i = state.inner.lock().unwrap();
        for _ in 0..24 {
            assert!(reserve(&mut i));
        }
        assert!(!reserve(&mut i));
        assert_eq!(i.companion.observation_calls.len(), 24);
        i.companion.observation_calls.clear();
        i.companion
            .observation_calls
            .push_back(Instant::now() - Duration::from_secs(3601));
        assert!(reserve(&mut i));
        assert_eq!(i.companion.observation_calls.len(), 1);
    }
}
