//! An opt-in live test on synthetic, in-memory goals. Never reads the user's goals or chats.
use super::*;
use crate::storage::Storage;
#[derive(Serialize)]
pub struct CheckResult {
    name: &'static str,
    pub status: &'static str,
    latency_ms: u64,
    diagnostics: Value,
}
fn goal(state: &AppState) -> Option<crate::core::CoreGoal> {
    state
        .inner
        .lock()
        .ok()?
        .storage
        .core_snapshot(None)
        .ok()?
        .goals
        .into_iter()
        .next()
}
async fn send(
    state: &AppState,
    service: &Service<'_>,
    text: &str,
) -> Result<Option<(String, u64, bool)>, String> {
    let (conversation, revision) = {
        let inner = state.inner.lock().unwrap();
        (
            inner.storage.current_conversation().unwrap(),
            inner.privacy_revision,
        )
    };
    let result = crate::agent_runtime::handle_explicit_actions(
        &json!({"latest_request":text,"conversation":[],"event_type":"user_message","natural_reply":true}),
        conversation,
        state,
        revision,
        true,
        service,
    )
    .await;
    result
}
pub async fn run(
    service: &Service<'_>,
    real_state: &AppState,
    revision: u64,
) -> Result<Vec<CheckResult>, String> {
    let isolated = AppState::new(Storage::open(std::path::Path::new(":memory:"))?)?;
    let checks=[
        ("create_goal","Создай тестовую цель «AI CHECK Interview». Пока без шагов."),
        ("create_steps","Добавь туда четыре шага: изучить вакансию; написать ответы; отрепетировать ответы; проверить связь."),
        ("delete_step_preview","Второй удали."),
        ("delete_step_confirm","Подтверждаю."),
        ("complete_step","Первый отметь готовым."),
        ("rename_goal","Переименуй цель «AI CHECK Interview» в «AI CHECK Interview ready»."),
        ("park_context","Сохрани, где я остановился, и отложи цель «AI CHECK Interview ready». Следующий шаг — отрепетировать ответы."),
        ("resume_context","Верни меня к цели «AI CHECK Interview ready»."),
        ("inspect_remaining","Что осталось по цели «AI CHECK Interview ready»? Покажи незавершённые шаги. Ничего не меняй."),
    ];
    let mut results = Vec::new();
    for (name, text) in checks {
        crate::goal_analysis::ensure_revision(real_state, revision)?;
        {
            let mut inner = real_state
                .inner
                .lock()
                .map_err(|_| "Engine state unavailable")?;
            super::record(&mut inner, "check", name, "started", None, None);
        }
        let start = Instant::now();
        let received = send(&isolated, service, text).await;
        let g = goal(&isolated);
        let verified = received.as_ref().is_ok_and(|value| value.is_some())
            && match name {
                "create_goal" => g
                    .as_ref()
                    .is_some_and(|g| g.title == "AI CHECK Interview" && g.plan.steps.is_empty()),
                "create_steps" | "delete_step_preview" => {
                    g.as_ref().is_some_and(|g| g.plan.steps.len() == 4)
                }
                "delete_step_confirm" => g.as_ref().is_some_and(|g| {
                    g.plan.steps.len() == 3 && g.plan.steps[1].text != "Написать ответы"
                }),
                "complete_step" => g
                    .as_ref()
                    .is_some_and(|g| g.plan.steps.len() == 3 && g.plan.steps[0].done),
                "rename_goal" => g
                    .as_ref()
                    .is_some_and(|g| g.title == "AI CHECK Interview ready"),
                "park_context" => g.as_ref().is_some_and(|g| {
                    g.status == "deferred"
                        && g.work_context
                            .as_ref()
                            .is_some_and(|c| c.parked_at.is_some())
                }),
                "resume_context" => g.as_ref().is_some_and(|g| {
                    g.status == "open"
                        && g.work_context
                            .as_ref()
                            .is_some_and(|c| c.resumed_at.is_some())
                }),
                "inspect_remaining" => {
                    let inner = isolated.inner.lock().unwrap();
                    inner
                        .storage
                        .action_references(inner.storage.current_conversation().unwrap())
                        .ok()
                        .is_some_and(|r| {
                            r.last_action.is_some_and(|a| {
                                ["inspect_goal", "inspect_continuity"]
                                    .contains(&a["skill"].as_str().unwrap_or_default())
                            })
                        })
                }
                _ => false,
            };
        {
            let mut inner = real_state
                .inner
                .lock()
                .map_err(|_| "Engine state unavailable")?;
            super::record(
                &mut inner,
                "check",
                name,
                if verified { "passed" } else { "failed" },
                Some(elapsed(start)),
                None,
            );
        }
        results.push(CheckResult {
            name,
            status: if verified { "passed" } else { "failed" },
            latency_ms: elapsed(start),
            diagnostics: {
                let inner=isolated.inner.lock().unwrap();
                let refs=inner.storage.action_references(inner.storage.current_conversation().unwrap())?;
                json!({"error":received.as_ref().err().map(|e|super::error_category(e)),"synthetic_receipt":received.as_ref().ok().and_then(|r|r.as_ref()).map(|r|r.0.chars().take(1000).collect::<String>()),"last_inference":inner.engine.last,
                    "last_decision":inner.agent.diagnostics.last_decision,"last_skill":refs.last_action.as_ref().and_then(|r|r["skill"].as_str()),
                    "goal_exists":g.is_some(),"synthetic_title":g.as_ref().map(|g|&g.title),"step_count":g.as_ref().map(|g|g.plan.steps.len())})
            },
        });
        if !verified {
            break;
        }
    }
    Ok(results)
}
