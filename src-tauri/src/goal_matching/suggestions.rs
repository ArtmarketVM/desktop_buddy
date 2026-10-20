use super::*;
use crate::{commands::Inner, storage::Storage};
use rusqlite::params;
use tauri::State;

#[derive(Clone, Debug, Serialize)]
pub struct Suggestion {
    pub goal_id: i64,
    pub confidence: f64,
    pub reason: String,
}
pub(super) struct Pending {
    suggestion: Suggestion,
    sample: ActivitySnapshot,
    goals: Value,
    revision: u64,
    context_revision: u64,
    at: Instant,
}

// Store only a tuple fingerprint, never the title or screen excerpt.
fn tuple_key(sample: &ActivitySnapshot) -> String {
    crate::companion::engine::fingerprint(
        &json!([
            sample.process_name.trim().to_lowercase(),
            sample
                .browser
                .as_ref()
                .and_then(|b| b.domain.as_deref())
                .map(|d| d.trim().to_lowercase())
        ])
        .to_string(),
    )
}
impl Storage {
    pub(crate) fn initialize_goal_matching(&self) -> Result<(), String> {
        self.connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS goal_match_negatives(
                goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
                context_key TEXT NOT NULL, created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL, PRIMARY KEY(goal_id,context_key));
             DELETE FROM goal_match_negatives WHERE expires_at<=unixepoch();",
            )
            .map_err(|e| e.to_string())
    }
    fn reject_match(&self, id: i64, sample: &ActivitySnapshot, now: i64) -> Result<(), String> {
        self.connection.execute(
            "INSERT OR REPLACE INTO goal_match_negatives(goal_id,context_key,created_at,expires_at) VALUES(?1,?2,?3,?4)",
            params![id, tuple_key(sample), now, now + NEGATIVE_MATCH_TTL.as_secs() as i64],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }
    fn match_rejected(&self, id: i64, sample: &ActivitySnapshot, now: i64) -> Result<bool, String> {
        self.connection
            .execute(
                "DELETE FROM goal_match_negatives WHERE expires_at<=?1",
                [now],
            )
            .map_err(|e| e.to_string())?;
        self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM goal_match_negatives WHERE goal_id=?1 AND context_key=?2 AND created_at<=?3 AND expires_at>?3)",
            params![id, tuple_key(sample), now], |r| r.get(0),
        ).map_err(|e| e.to_string())
    }
}

pub(super) fn offer(
    inner: &mut Inner,
    job: &Job,
    result: &MatchResult,
    now: Instant,
) -> Result<Option<Suggestion>, String> {
    let Some(id) = result.goal_id else {
        return Ok(None);
    };
    if inner
        .goal_matching
        .suggestion_snoozed_until
        .is_some_and(|until| now < until)
        || inner
            .storage
            .match_rejected(id, &job.sample, chrono::Utc::now().timestamp())?
    {
        return Ok(None);
    }
    let suggestion = Suggestion {
        goal_id: id,
        confidence: result.confidence,
        reason: result.reason.clone(),
    };
    inner.goal_matching.pending_suggestion = Some(Pending {
        suggestion: suggestion.clone(),
        sample: job.sample.clone(),
        goals: job.goals.clone(),
        revision: job.revision,
        context_revision: job.context_revision,
        at: now,
    });
    Ok(Some(suggestion))
}
fn current(inner: &Inner, pending: &Pending, now: Instant) -> bool {
    now.saturating_duration_since(pending.at) < SUGGESTION_SNOOZE
        && context_current(
            inner,
            pending.revision,
            pending.context_revision,
            &pending.goals,
            &pending.sample,
        )
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Response {
    Yes,
    No,
    NotNow,
}

fn respond(inner: &mut Inner, goal_id: i64, action: Response, now: Instant) -> Result<(), String> {
    let pending = inner
        .goal_matching
        .pending_suggestion
        .as_ref()
        .filter(|p| p.suggestion.goal_id == goal_id && current(inner, p, now))
        .ok_or("This goal suggestion has expired. Continue with your current focus.")?;
    match action {
        Response::Yes => {
            // The shared explicit-focus path requires Today membership. Acceptance is
            // the user's choice to work on this open goal, including a saved goal.
            let date = inner.storage.core_snapshot(None)?.date;
            inner.storage.core_today(goal_id, true, &date)?;
            crate::automatic_goals::focus_goal_inner(inner, goal_id)?;
            inner.goal_matching.clear();
        }
        Response::No => {
            inner
                .storage
                .reject_match(goal_id, &pending.sample, chrono::Utc::now().timestamp())?;
        }
        Response::NotNow => {
            inner.goal_matching.suggestion_snoozed_until = Some(now + SUGGESTION_SNOOZE);
        }
    }
    inner.goal_matching.pending_suggestion = None;
    Ok(())
}
#[tauri::command(async)]
pub fn get_goal_match_suggestion(state: State<AppState>) -> Result<Option<Suggestion>, String> {
    let inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    Ok(inner
        .goal_matching
        .pending_suggestion
        .as_ref()
        .filter(|p| current(&inner, p, Instant::now()))
        .map(|p| p.suggestion.clone()))
}
#[tauri::command(async)]
pub fn respond_goal_match_suggestion(
    goal_id: i64,
    action: Response,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    respond(&mut inner, goal_id, action, Instant::now())?;
    crate::buddy::sync(&app, &mut inner)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::goal_matching::cascade_tests::{feed, sample, setup};

    fn offer_at(inner: &mut Inner, id: i64, now: Instant) -> Option<Suggestion> {
        let job = Job {
            sample: inner.goal_matching.sample.clone().unwrap(),
            goals: candidates(inner).unwrap(),
            revision: inner.privacy_revision,
            context_revision: inner.goal_matching.context_revision,
            mock: false,
        };
        finish(
            inner,
            &job,
            Ok(MatchResult {
                goal_id: Some(id),
                confidence: 0.7,
                reason: "Related work".into(),
            }),
            now,
        )
        .unwrap()
    }
    #[test]
    fn confidence_bands_keep_medium_matches_unassigned_and_low_matches_silent() {
        for confidence in [0.0, 0.599, 0.6, 0.799, 0.8, 1.0] {
            let (state, ids) = setup(&["Atlas launch alpha", "Atlas launch beta"]);
            let mut inner = state.inner.lock().unwrap();
            let base = Instant::now();
            feed(&mut inner, &sample("Atlas launch"), base, 0, 60);
            let job = claim(&mut inner, base + AI_STABLE).unwrap().unwrap();
            let result = parse(
                &crate::accuracy_check::envelope(
                    json!({"goal_id":ids[1],"confidence":confidence,"reason":"Related work"}),
                ),
                &job.goals,
            )
            .unwrap();
            let suggestion = finish(&mut inner, &job, Ok(result), base + AI_STABLE).unwrap();
            assert_eq!(suggestion.is_some(), (0.6..0.8).contains(&confidence));
            assert_eq!(
                inner.goal_matching.view.goal_id,
                (confidence >= 0.8).then_some(ids[1])
            );
            assert_eq!(
                inner.storage.goal().unwrap().unwrap().id,
                if confidence >= 0.8 { ids[1] } else { ids[0] }
            );
        }
    }
    #[test]
    fn negative_tuple_survives_restart_expires_at_24_hours_and_follows_privacy_deletion() {
        let dir = std::env::temp_dir().join(format!(
            "sumi-matching-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("matching.sqlite");
        let mut store = Storage::open(&path).unwrap();
        let id = store.set_goal("A goal").unwrap().id;
        let a = sample("A title");
        let now = chrono::Utc::now().timestamp();
        store.reject_match(id, &a, now).unwrap();
        drop(store);
        let mut store = Storage::open(&path).unwrap();
        let mut other = a.clone();
        other.window_title = "Another title".into();
        assert!(store.match_rejected(id, &other, now + 86399).unwrap());
        other.process_name = "Another app".into();
        assert!(!store.match_rejected(id, &other, now).unwrap());
        other = a.clone();
        other.browser = Some(crate::browser::BrowserContext {
            browser: "chrome".into(),
            domain: Some("example.com".into()),
            page_title: "Title".into(),
            source: "fixture".into(),
        });
        assert!(!store.match_rejected(id, &other, now).unwrap());
        assert!(!store.match_rejected(id + 1, &a, now).unwrap());
        assert!(!store.match_rejected(id, &a, now + 86400).unwrap());
        store.reject_match(id, &a, now).unwrap();
        store
            .purge_history(Some(
                &(chrono::Utc::now() - chrono::Duration::days(7)).to_rfc3339(),
            ))
            .unwrap();
        assert!(store.match_rejected(id, &a, now).unwrap());
        store.purge_history(None).unwrap();
        assert!(!store.match_rejected(id, &a, now).unwrap());
        store.reject_match(id, &a, now).unwrap();
        store.clear_personal_memory().unwrap();
        assert!(!store.match_rejected(id, &a, now).unwrap());
        store.reject_match(id, &a, now).unwrap();
        store
            .connection
            .execute(
                "UPDATE goal_match_negatives SET created_at=?1",
                [now - 8 * 86400],
            )
            .unwrap();
        store
            .purge_history(Some(
                &(chrono::Utc::now() - chrono::Duration::days(7)).to_rfc3339(),
            ))
            .unwrap();
        assert!(!store.match_rejected(id, &a, now).unwrap());
        store.reject_match(id, &a, now).unwrap();
        store
            .connection
            .execute("DELETE FROM goals WHERE id=?1", [id])
            .unwrap();
        assert!(!store.match_rejected(id, &a, now).unwrap());
        drop(store);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn responses_use_explicit_focus_reject_the_tuple_and_snooze_only_suggestions() {
        for action in [Response::Yes, Response::No, Response::NotNow] {
            let (state, ids) = setup(&["Atlas launch alpha", "Atlas launch beta"]);
            let mut inner = state.inner.lock().unwrap();
            if matches!(action, Response::Yes) {
                let date = inner.storage.core_snapshot(None).unwrap().date;
                inner.storage.core_today(ids[1], false, &date).unwrap();
            }
            let base = Instant::now();
            feed(&mut inner, &sample("Atlas launch"), base, 0, 60);
            let now = base + AI_STABLE;
            assert!(offer_at(&mut inner, ids[1], now).is_some());
            respond(&mut inner, ids[1], action, now).unwrap();
            assert!(inner.goal_matching.pending_suggestion.is_none());
            match action {
                Response::Yes => {
                    assert_eq!(inner.storage.explicit_focus().unwrap(), Some(ids[1]));
                    assert!(inner
                        .storage
                        .core_snapshot(None)
                        .unwrap()
                        .today
                        .contains(&ids[1]));
                }
                Response::No => assert!(offer_at(&mut inner, ids[1], now + AI_COOLDOWN).is_none()),
                Response::NotNow => {
                    assert!(offer_at(&mut inner, ids[1], now + Duration::from_secs(599)).is_none());
                    assert!(offer_at(&mut inner, ids[1], now + SUGGESTION_SNOOZE).is_some());
                }
            }
        }
    }
    #[test]
    fn stale_suggestion_cannot_override_a_new_explicit_focus() {
        let (state, ids) = setup(&["Atlas launch alpha", "Atlas launch beta"]);
        let mut inner = state.inner.lock().unwrap();
        let base = Instant::now();
        feed(&mut inner, &sample("Atlas launch"), base, 0, 60);
        assert!(offer_at(&mut inner, ids[1], base + AI_STABLE).is_some());
        inner.storage.mark_explicit_focus(ids[0]).unwrap();
        assert!(respond(&mut inner, ids[1], Response::Yes, base + AI_STABLE).is_err());
        assert_eq!(inner.storage.explicit_focus().unwrap(), Some(ids[0]));
    }
}
