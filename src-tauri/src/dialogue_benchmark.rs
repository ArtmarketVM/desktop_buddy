//! Explicit, opt-in live dialogue evaluation on synthetic in-memory workspaces.
use crate::{
    commands::AppState, core::GoalDraft, goal_analysis::Service, skills, storage::Storage,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

#[derive(Clone, Deserialize)]
pub struct Case {
    pub id: String,
    pub language: String,
    pub kind: String,
    pub request: String,
    pub history: Vec<Value>,
}
pub fn cases() -> Result<Vec<Case>, String> {
    serde_json::from_str(include_str!("../test-data/dialogue-cases.json"))
        .map_err(|e| e.to_string())
}
pub fn voice_cases() -> Result<Vec<Case>, String> {
    serde_json::from_str(include_str!("../test-data/voice-dialogue-cases.json"))
        .map_err(|e| e.to_string())
}
fn voice_fixture(case: &Case) -> Result<(AppState, HashMap<String, i64>), String> {
    let mut storage = Storage::open(std::path::Path::new(":memory:"))?;
    let mut titles = vec!["Client reply", "Fix saved AI keys disconnecting"];
    if case.kind == "voice_ambiguous" {
        titles.push("Fix saved AI keys disconnecting on Windows");
    }
    storage.core_add_goals(
        titles
            .into_iter()
            .map(|title| GoalDraft {
                title: title.into(),
                area: "General".into(),
                steps: vec![],
            })
            .collect(),
        "voice-interpretation-fixture",
    )?;
    let ids: HashMap<_, _> = storage
        .core_snapshot(None)?
        .goals
        .into_iter()
        .map(|g| (g.title, g.id))
        .collect();
    let day = chrono::Local::now().date_naive().to_string();
    for id in ids.values() {
        storage.core_today(*id, true, &day)?;
    }
    storage.transition_goal(ids["Client reply"], "resume")?;
    storage.mark_explicit_focus(ids["Client reply"])?;
    storage.write_setting(
        "ai_assistance_preferences",
        &crate::goal_analysis::AiPreferences {
            web_research: false,
            ..Default::default()
        },
    )?;
    Ok((AppState::new(storage)?, ids))
}
pub fn fixture(case: &Case) -> Result<(AppState, HashMap<String, i64>), String> {
    if case.kind.starts_with("voice_") {
        return voice_fixture(case);
    }
    let mut storage = Storage::open(std::path::Path::new(":memory:"))?;
    let drafts = vec![
        GoalDraft {
            title: "Client reply".into(),
            area: "General".into(),
            steps: vec!["Write a short reply".into()],
        },
        GoalDraft {
            title: "Psychology assignment".into(),
            area: "Study".into(),
            steps: vec![
                "Explain classical conditioning".into(),
                "Give an everyday example".into(),
                "Check the conclusion".into(),
            ],
        },
        GoalDraft {
            title: "Hackathon application".into(),
            area: "Work".into(),
            steps: vec!["Finish the technical section".into()],
        },
        GoalDraft {
            title: "Interview preparation".into(),
            area: "Work".into(),
            steps: vec!["Practice answers".into()],
        },
        GoalDraft {
            title: "Physics reading".into(),
            area: "Study".into(),
            steps: vec!["Read chapter two".into()],
        },
    ];
    storage.core_add_goals(drafts, "dialogue-fixture")?;
    let ids: HashMap<_, _> = storage
        .core_snapshot(None)?
        .goals
        .into_iter()
        .map(|g| (g.title, g.id))
        .collect();
    let day = chrono::Local::now().date_naive().to_string();
    for id in ids.values() {
        storage.core_today(*id, true, &day)?;
    }
    storage.connection.execute("INSERT INTO core_goal_details(goal_id,description) VALUES(?1,'Explain classical conditioning in one short paragraph and give an everyday example.') ON CONFLICT(goal_id) DO UPDATE SET description=excluded.description",[ids["Psychology assignment"]]).map_err(|e|e.to_string())?;
    storage.core_reorder(vec![
        ids["Client reply"],
        ids["Psychology assignment"],
        ids["Hackathon application"],
        ids["Interview preparation"],
        ids["Physics reading"],
    ])?;
    storage.transition_goal(ids["Client reply"], "resume")?;
    storage.mark_explicit_focus(ids["Client reply"])?;
    let conversation = storage.current_conversation()?;
    if !["ambiguous_pronoun", "queue", "ambiguous_goal"].contains(&case.kind.as_str()) {
        let id = ids["Psychology assignment"];
        let created: String = storage
            .connection
            .query_row("SELECT created_at FROM goals WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        storage.save_references(
            conversation,
            &skills::References {
                last_referenced_goal_id: Some(id),
                last_referenced_goal_created_at: Some(created),
                ..Default::default()
            },
        )?;
    }
    if case.kind == "ambiguous_goal" {
        storage.core_add_goals(
            vec![GoalDraft {
                title: "Psychology assignment".into(),
                area: "Study".into(),
                steps: vec!["Prepare presentation slides".into()],
            }],
            "duplicate-fixture",
        )?;
    }
    storage.write_setting(
        "ai_assistance_preferences",
        &crate::goal_analysis::AiPreferences {
            web_research: false,
            ..Default::default()
        },
    )?;
    Ok((AppState::new(storage)?, ids))
}

#[derive(Serialize)]
pub struct ResultRow {
    pub id: String,
    pub language: String,
    pub kind: String,
    pub mechanical_pass: bool,
    pub language_matched: bool,
    pub latency_ms: u64,
    pub actual_model: Option<String>,
    pub last_skill: Option<String>,
    pub reply: String,
    pub error: Option<String>,
}
pub async fn one(case: &Case, service: &Service<'_>) -> Result<ResultRow, String> {
    let (state, ids) = fixture(case)?;
    let (conversation, before) = {
        let i = state.inner.lock().unwrap();
        (
            i.storage.current_conversation()?,
            json!(i.storage.core_snapshot(None)?.goals),
        )
    };
    let start = Instant::now();
    let outcome=crate::agent_runtime::handle_dialogue(&json!({"latest_request":case.request,"conversation":case.history,
        "natural_reply":true,"event_type":if case.kind.starts_with("voice_") || case.id.ends_with("he"){"voice_message"}else{"user_message"}}),conversation,&state,0,true,service).await;
    let inner = state.inner.lock().unwrap();
    let snapshot = inner.storage.core_snapshot(None)?;
    let refs = inner.storage.action_references(conversation)?;
    let last = refs
        .last_action
        .as_ref()
        .and_then(|a| a["skill"].as_str())
        .map(str::to_string);
    let psyche = snapshot
        .goals
        .iter()
        .find(|g| ids.get("Psychology assignment") == Some(&g.id));
    let unchanged =
        json!(snapshot.goals) == before && snapshot.focused_goal_id == Some(ids["Client reply"]);
    let nonempty = outcome
        .as_ref()
        .is_ok_and(|o| !o.reply.message.trim().is_empty());
    let pass = nonempty
        && match case.kind.as_str() {
            "voice_rename" | "voice_rename_alt" => {
                let expected = if case.kind == "voice_rename" {
                    "fix the microphone issue in sumi app"
                } else {
                    "investigate microphone capture in sumi app"
                };
                snapshot.goals.iter().any(|g| {
                    g.id == ids["Fix saved AI keys disconnecting"]
                        && g.title.to_lowercase() == expected
                }) && snapshot.focused_goal_id == Some(ids["Client reply"])
                    && last.as_deref() == Some("rename_goal")
            }
            "voice_literal" => {
                snapshot.goals.iter().any(|g| g.title == "Safety Eye Keys")
                    && snapshot.goals.iter().any(|g| {
                        g.id == ids["Fix saved AI keys disconnecting"]
                            && g.title == "Fix saved AI keys disconnecting"
                    })
            }
            "voice_ambiguous" => {
                unchanged
                    && refs.last_action.is_none()
                    && inner.agent.diagnostics.last_decision
                        == Some(crate::agent_runtime::Decision::RequestClarification)
            }
            "voice_negative" | "voice_theme" => unchanged && refs.last_action.is_none(),
            "focus" | "read_then_focus" => {
                snapshot.focused_goal_id == Some(ids["Psychology assignment"])
            }
            "complete_step" => {
                psyche.is_some_and(|g| g.plan.steps[0].done && !g.plan.steps[1].done)
            }
            "add_step" => psyche.is_some_and(|g| g.plan.steps.len() == 4),
            "rename" => psyche.is_some_and(|g| g.title == "Psychology draft"),
            "create" => snapshot.goals.iter().any(|g| g.title == "New audit goal"),
            "multi_action" => snapshot
                .goals
                .iter()
                .any(|g| g.title == "New audit goal" && g.plan.steps.len() == 2),
            "ambiguous_goal" | "ambiguous_pronoun" => {
                unchanged
                    && refs.last_action.is_none()
                    && inner.agent.diagnostics.last_decision
                        == Some(crate::agent_runtime::Decision::RequestClarification)
            }
            _ => unchanged,
        };
    let message = outcome
        .as_ref()
        .ok()
        .map(|o| o.reply.message.clone())
        .unwrap_or_default();
    let cyrillic = message
        .chars()
        .filter(|c| ('\u{0400}'..='\u{04ff}').contains(c))
        .count();
    let hebrew = message
        .chars()
        .filter(|c| ('\u{0590}'..='\u{05ff}').contains(c))
        .count();
    let latin = message.chars().filter(|c| c.is_ascii_alphabetic()).count();
    let language_matched = match case.language.as_str() {
        "ru" => cyrillic > 2,
        "he" => hebrew > 2,
        _ => latin > 2 && cyrillic == 0 && hebrew == 0,
    };
    // This is a mechanical action/target rubric, not a semantic score of the prose.
    // Preserve synthetic replies for independent blind review rather than claiming GPT parity.
    let view = crate::engine_observability::view(&inner)?;
    Ok(ResultRow {
        id: case.id.clone(),
        language: case.language.clone(),
        kind: case.kind.clone(),
        mechanical_pass: pass,
        language_matched,
        latency_ms: start.elapsed().as_millis() as u64,
        actual_model: view["last_inference"]["provider_reported_model"]
            .as_str()
            .map(str::to_string),
        last_skill: last,
        reply: message,
        error: outcome.err(),
    })
}
pub async fn run() -> Result<Value, String> {
    let root = AppState::new(Storage::open(std::path::Path::new(":memory:"))?)?;
    if root.inner.lock().unwrap().status.mock_ai {
        return Err("Live dialogue checks require real providers".into());
    }
    let service = Service::configured(&root.client)?;
    let mut rows = Vec::new();
    let filter = std::env::var("BUDDY_DIALOGUE_CASE_FILTER").ok();
    for case in cases()?
        .into_iter()
        .chain(voice_cases()?)
        .filter(|c| filter.as_ref().is_none_or(|f| c.id.contains(f)))
    {
        let row = one(&case, &service).await?;
        eprintln!(
            "Dialogue check {}: {}",
            row.id,
            if row.mechanical_pass {
                "passed"
            } else {
                "failed"
            }
        );
        eprintln!(
            "Dialogue result {}",
            serde_json::to_string(&row).map_err(|e| e.to_string())?
        );
        rows.push(row);
    }
    let passed = rows.iter().filter(|r| r.mechanical_pass).count();
    if rows.is_empty() {
        return Err("No dialogue cases matched the filter".into());
    }
    let language_passed = rows.iter().filter(|r| r.language_matched).count();
    Ok(
        json!({"configured_model":service.model,"configured_response_model":crate::http::response_model(&service.model),"passed":passed,"language_matched":language_passed,"total":rows.len(),"mechanical_accuracy":passed as f64/rows.len() as f64,
        "rubric":"Mechanical state/target correctness only. Natural-response usefulness and factuality require blind review of the saved synthetic replies.","cases":rows}),
    )
}
pub async fn bounded_run() -> Result<Value, String> {
    tokio::time::timeout(Duration::from_secs(1200), run())
        .await
        .map_err(|_| "Dialogue evaluation timed out")?
}
