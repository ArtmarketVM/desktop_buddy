//! Recognition timing is separate from page evidence. Gaps never preserve an assignment.
use super::*;

// Provisional two-cycle bound, measured from the first missing sample; not a measured optimum.
const METADATA_GAP_LIMIT: Duration = Duration::from_secs(6);

pub(super) struct MetadataGap {
    key: String,
    foreground: String,
    elapsed: Duration,
    first_missing: Instant,
}

pub(super) fn metadata_unavailable(sample: &ActivitySnapshot) -> bool {
    (sample.browser.is_some() || crate::browser::browser_name(&sample.process_name).is_some())
        && sample
            .browser
            .as_ref()
            .and_then(|b| b.domain.as_deref())
            .is_none_or(|domain| domain.trim().is_empty())
}

// A title alone cannot identify a browser window. Store only hashes, never a prior address.
fn foreground(sample: &ActivitySnapshot) -> Option<String> {
    let window = sample.window_id.filter(|id| *id != 0)?;
    let browser = sample.browser.as_ref()?;
    Some(crate::companion::engine::fingerprint(
        &json!([
            sample.process_name.to_lowercase(),
            window,
            sample.window_title,
            browser.browser,
            browser.page_title,
        ])
        .to_string(),
    ))
}

impl Runtime {
    /// Returns whether page text must be invalidated, including any read still in flight.
    pub(super) fn observe_at(
        &mut self,
        sample: &ActivitySnapshot,
        allowed: bool,
        now: Instant,
    ) -> bool {
        if !allowed {
            self.clear();
            self.view.enabled = true;
            return true;
        }
        let stale = self
            .last_seen
            .is_some_and(|at| now.saturating_duration_since(at) > Duration::from_secs(15));
        let changed = stale
            || self
                .sample
                .as_ref()
                .is_none_or(|old| fingerprint(old) != fingerprint(sample));
        let missing = metadata_unavailable(sample);
        let page_changed = changed
            && (sample.browser.is_some()
                || self
                    .sample
                    .as_ref()
                    .is_some_and(|old| old.browser.is_some()));
        let frame = foreground(sample);
        let mut gap = self.metadata_gap.take();
        if missing {
            if !stale {
                if let (Some(old), Some(last), Some(since), Some(frame)) =
                    (&self.sample, self.last_seen, self.stable_since, &frame)
                {
                    if !metadata_unavailable(old) && foreground(old).as_ref() == Some(frame) {
                        gap = Some(MetadataGap {
                            key: fingerprint(old),
                            foreground: frame.clone(),
                            // Exclude the uncertain transition into the missing sample as well.
                            elapsed: last.saturating_duration_since(since),
                            first_missing: now,
                        });
                    }
                }
            }
            self.metadata_gap = gap.filter(|g| {
                !stale
                    && frame.as_ref() == Some(&g.foreground)
                    && now.saturating_duration_since(g.first_missing) <= METADATA_GAP_LIMIT
            });
            self.stable_since = None;
            self.cache.clear();
            self.pending_suggestion = None;
            self.text_fingerprint = None;
            self.view = MatchView {
                enabled: true,
                ..Default::default()
            };
        } else if changed {
            // Only timing can resume after fresh, exact metadata confirmation. Matches,
            // page text and request revisions always belong to the new observation.
            self.stable_since = Some(
                gap.filter(|g| {
                    !stale
                        && g.key == fingerprint(sample)
                        && now.saturating_duration_since(g.first_missing) <= METADATA_GAP_LIMIT
                })
                .map(|g| now - g.elapsed)
                .unwrap_or(now),
            );
        }
        if changed {
            self.context_revision = self.context_revision.wrapping_add(1);
            self.view = MatchView {
                enabled: true,
                ..Default::default()
            };
            self.pending_suggestion = None;
            self.text_fingerprint = None;
        }
        self.view.enabled = true;
        self.sample = Some(sample.clone());
        self.last_seen = Some(now);
        page_changed
    }
}
