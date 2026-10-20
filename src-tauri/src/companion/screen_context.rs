//! One transient, redacted Accessibility sample shared by completion and matching.
use super::{progress_suppressed, redact_sample, sensitive_window};
use crate::{
    commands::{AppState, Inner},
    models::ActivitySnapshot,
};
use std::{
    future::Future,
    time::{Duration, Instant},
};

pub(crate) struct CachedText {
    activity: ActivitySnapshot,
    consent: (u64, u64),
    at: Instant,
    text: Result<String, String>,
}
fn same_window(a: &ActivitySnapshot, b: &ActivitySnapshot) -> bool {
    a.window_id.is_some()
        && a.window_id == b.window_id
        && a.process_name == b.process_name
        && a.window_title == b.window_title
        && a.browser == b.browser
}
fn allowed(inner: &Inner, activity: &ActivitySnapshot) -> bool {
    inner.status.tracking
        && !inner.status.demo
        && !inner.status.mock_ai
        && inner.companion.view.preferences.screen_task_detection
        && inner.storage.ai_preferences().is_ok_and(|p| p.enabled)
        && !progress_suppressed(inner)
        && !sensitive_window(activity)
        && !crate::attention::excluded(&inner.buddy.view.preferences, &activity.process_name)
        && inner
            .buddy
            .foreground
            .as_ref()
            .is_some_and(|a| same_window(a, activity))
}
/// Redact complete lines before truncating, including a secret that crosses the cutoff.
pub(crate) fn matching_excerpt(
    activity: &ActivitySnapshot,
    enabled: bool,
    text: Option<&str>,
) -> Option<String> {
    if !enabled || sensitive_window(activity) {
        return None;
    }
    text.map(redact_sample)
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.chars().take(400).collect())
}
pub(crate) async fn read(
    state: &AppState,
    activity: &ActivitySnapshot,
) -> Result<Option<String>, String> {
    read_at(state, activity, Instant::now(), super::sample).await
}
async fn read_at<F: Future<Output = Result<String, String>>>(
    state: &AppState,
    activity: &ActivitySnapshot,
    now: Instant,
    sample: impl FnOnce(usize) -> F,
) -> Result<Option<String>, String> {
    // Neither caller holds Inner across an await. Concurrent consumers share one read,
    // including unavailable samples; the cache is never serialized or persisted.
    let waiting = Instant::now();
    let _read = state.screen_context_read.lock().await;
    let now = now + waiting.elapsed();
    let consent = {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        if !allowed(&inner, activity) {
            inner.companion.screen_context = None;
            return Ok(None);
        }
        if let Some(cached) = &inner.companion.screen_context {
            if cached.consent
                == (
                    inner.last_consent_change,
                    inner.companion.screen_context_epoch,
                )
                && same_window(&cached.activity, activity)
                && now.saturating_duration_since(cached.at) < Duration::from_secs(60)
            {
                return cached.text.clone().map(Some);
            }
        }
        (
            inner.last_consent_change,
            inner.companion.screen_context_epoch,
        )
    };
    let text = sample(activity.window_id.ok_or("No foreground window")? as usize)
        .await
        .map(|raw| redact_sample(&raw));
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    if !allowed(&inner, activity)
        || (
            inner.last_consent_change,
            inner.companion.screen_context_epoch,
        ) != consent
    {
        inner.companion.screen_context = None;
        return Ok(None);
    }
    inner.companion.screen_context = Some(CachedText {
        activity: activity.clone(),
        consent,
        at: now,
        text: text.clone(),
    });
    text.map(Some)
}

#[cfg(test)]
mod tests;
