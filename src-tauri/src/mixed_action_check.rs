//! Opt-in live regression for a long, mixed request and its confirmation.
//! Uses synthetic goals in memory; never opens the installed database.
use crate::{commands::AppState, goal_analysis::Service, storage::Storage};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

const REQUEST: &str = "Add a goal called TEST-Partner outreach with these five steps: Set up CRM and Slack; Identify seven partners; Publish one partner post; Have a 45-minute partner call; Contact the seven partners. Mark the first four steps complete because I already did them today. I have spent about 30 minutes on this work. Also create TEST-Recruiter interview as a completed goal because I finished that interview today. Keep TEST-Partner outreach open, with Contact the seven partners still unfinished. Save a checkpoint for outreach: CRM and Slack ready, partners identified, one post and one call done; next action is Contact the seven partners. I am working on TEST-Focus project now; keep that goal in focus. Do not delete anything or complete the focus goal.";

fn verify(state: &AppState, focus: i64) -> Result<Value, String> {
    let inner = state.inner.lock().map_err(|_| "Check state unavailable")?;
    let goals = inner.storage.core_snapshot(None)?.goals;
    let outreach = goals.iter().find(|g| g.title == "TEST-Partner outreach");
    let interview = goals.iter().find(|g| g.title == "TEST-Recruiter interview");
    let steps_match = outreach.is_some_and(|g| {
        g.status == "open"
            && g.plan.steps.len() == 5
            && g.plan.steps[..4].iter().all(|s| s.done)
            && !g.plan.steps[4].done
            && g.plan.steps[4].text == "Contact the seven partners"
    });
    let interview_completed = interview.is_some_and(|g| g.status == "completed");
    let checkpoint_saved = outreach.is_some_and(|g| {
        g.work_context.as_ref().is_some_and(|c| {
            c.context
                .next_action
                .as_deref()
                .is_some_and(|next| next.to_lowercase().contains("contact"))
        })
    });
    let focus_preserved = inner.storage.goal()?.is_some_and(|g| g.id == focus);
    Ok(
        json!({"all_passed":goals.len()==3 && steps_match && interview_completed && checkpoint_saved && focus_preserved,
        "goal_count":goals.len(),"steps_match":steps_match,"interview_completed":interview_completed,
        "checkpoint_saved":checkpoint_saved,"focus_preserved":focus_preserved}),
    )
}

async fn run() -> Result<Value, String> {
    let mut storage = Storage::open(std::path::Path::new(":memory:"))?;
    let focus = storage.set_goal("TEST-Focus project")?.id;
    let conversation = storage.current_conversation()?;
    let state = AppState::new(storage)?;
    if state.inner.lock().unwrap().status.mock_ai {
        return Err("Live mixed-action check requires real provider responses".into());
    }
    let service = Service::configured(&state.client)?;
    // Failed attempts remain in the real transcript. Include duplicate unanswered
    // requests so this does not only test an unrealistically empty conversation.
    let mut history = vec![
        json!({"role":"user","text":REQUEST}),
        json!({"role":"user","text":REQUEST}),
    ];
    let start = Instant::now();
    let mut turns = Vec::new();
    for latest in [REQUEST, "Yes, confirm all proposed changes."] {
        let revision = state.inner.lock().unwrap().privacy_revision;
        let turn = Instant::now();
        let outcome = crate::agent_runtime::handle_dialogue(
            &json!({"latest_request":latest,"conversation":history,"event_type":"user_message","natural_reply":true}),
            conversation, &state, revision, true, &service,
        ).await;
        let outcome = match outcome {
            Ok(outcome) => outcome,
            Err(error) => {
                return Ok(
                    json!({"all_passed":false,"error":crate::engine_observability::error_category(&error),"latency_ms":start.elapsed().as_millis(),"turns":turns}),
                )
            }
        };
        history.push(json!({"role":"user","text":latest}));
        history.push(json!({"role":"assistant","text":outcome.reply.message}));
        turns.push(json!({"latency_ms":turn.elapsed().as_millis(),"reply_present":!outcome.reply.message.trim().is_empty()}));
        if crate::skills::pending_confirmation(&state.inner.lock().unwrap().storage, conversation)?
            .is_none()
        {
            break;
        }
    }
    let mut report = verify(&state, focus)?;
    report["turns"] = json!(turns);
    report["latency_ms"] = json!(start.elapsed().as_millis());
    Ok(report)
}

pub(crate) async fn bounded_run() -> Result<Value, String> {
    tokio::time::timeout(Duration::from_secs(180), run())
        .await
        .map_err(|_| "Mixed-action check timed out".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn incomplete_work_is_not_a_passing_live_check() {
        let mut storage = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let focus = storage.set_goal("TEST-Focus project").unwrap().id;
        let state = AppState::new(storage).unwrap();
        let report = verify(&state, focus).unwrap();
        assert_eq!(report["all_passed"], false);
        assert_eq!(report["focus_preserved"], true);
        assert_eq!(report["steps_match"], false);
    }
}
