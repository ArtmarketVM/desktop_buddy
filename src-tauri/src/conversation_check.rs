//! Opt-in real-provider checks on disposable, persisted synthetic conversations.
//! This never opens the user's database or sends personal activity to a provider.
use crate::{ai_chat::ChatReply, commands::AppState, goal_analysis::Service, storage::Storage};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

struct Case {
    name: &'static str,
    first: &'static str,
    turns: usize,
    correction: Option<&'static str>,
    request: &'static str,
    expected: &'static str,
    required: &'static [&'static str],
    memory_off: bool,
}
fn cases() -> Vec<Case> {
    vec![
        Case { name:"long_chat_correction_after_restart",first:"Проект «Маяк» — приложение для учёта заказов кафе. Презентация: 5 минут, аудитория — владельцы небольших кафе, бюджет 30000 рублей.",turns:18,correction:Some("Исправление: бюджет теперь 18000 рублей. Остальные ограничения прежние."),request:"Напомни название проекта, аудиторию, длительность и актуальный бюджет. Ничего не меняй в приложении.",expected:"Russian. Mayak order-tracking app for cafe owners, 5 minutes, current budget 18000 (not 30000). No invented facts or app mutations.",required:&["маяк","18000","5"],memory_off:false },
        Case { name:"retained_history_older_than_display_window",first:"У тестового проекта «Лагуна» контрольный код ORBIT-472. Это только факт нашего тестового разговора, не пароль.",turns:65,correction:None,request:"Какой контрольный код проекта «Лагуна» мы указали в самом начале этого чата? Найди в истории; не угадывай.",expected:"Recover ORBIT-472 from this conversation using inspect_conversation. Do not guess or ask the user to repeat an available fact.",required:&["orbit472"],memory_off:false },
        Case { name:"draft_ordinal_is_not_saved_step",first:"Пишем черновик трёх слайдов про приложение для учёта заказов: 1. Проблема потерянных заказов. 2. Как сотрудник видит и обрабатывает очередь заказов. 3. Следующий шаг — согласовать пилот. Это черновик текста, не шаги цели.",turns:8,correction:None,request:"Второй сократи до одного короткого предложения. Остальные не повторяй. Цели и шаги не меняй.",expected:"Russian, just a concise rewritten slide 2 about the order queue. No app actions, no repeated slides 1/3, no invented results.",required:&["заказ"],memory_off:false },
        Case { name:"undefined_product_does_not_gain_invented_results",first:"Готовим презентацию проекта «Маяк»: 5 минут, для владельцев небольших кафе, бюджет 18000 рублей. Что делает проект, я ещё не описал.",turns:0,correction:None,request:"Предложи структуру из трёх слайдов. Для каждого заголовок и одно предложение. Не выдумывай возможности продукта, результаты пилота, цены или окупаемость.",expected:"Russian: three neutral slide headings with one sentence each, or one necessary clarification of the unspecified product. No asserted product capabilities, invented pilot tests, ROI, revenue, percentages, included services or prices. The budget is a constraint, not an actual price.",required:&[],memory_off:false },
        Case { name:"memory_off_keeps_current_chat_history",first:"Наш тестовый проект называется «Кедр». Презентация длится 7 минут. Мы обсуждаем учёт заказов кафе, бюджет 12000 рублей.",turns:10,correction:None,request:"Как называется проект, сколько минут длится презентация и какой бюджет? Возьми только данные этого чата.",expected:"Russian: Kedr, 7 minutes, 12000 rubles. Personal Memory OFF does not erase the selected conversation. Do not borrow Mayak/Laguna facts.",required:&["кедр","7","12000"],memory_off:true },
        Case { name:"hebrew_chat_context_after_restart",first:"זהו פרויקט הבדיקה תמר: יישום לניהול הזמנות בבתי קפה. המצגת היא באורך 5 דקות והתקציב הוא 18000 רובל.",turns:8,correction:None,request:"הזכר לי בעברית את שם הפרויקט, מה הוא עושה, אורך המצגת והתקציב. אל תשנה יעדים או שלבים.",expected:"Hebrew: Tamar order-management app for cafes, 5 minutes, 18000 rubles. No app changes or invented facts.",required:&["תמר","5","18000"],memory_off:false },
    ]
}
fn normalized(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}
fn required_facts(reply: &str, required: &[&str]) -> bool {
    let text = normalized(reply);
    required.iter().all(|fact| text.contains(&normalized(fact)))
}

async fn one(case: &Case, service: &Service<'_>) -> Result<Value, String> {
    let directory = std::env::temp_dir().join(format!(
        "buddy-conversation-check-{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    std::fs::create_dir(&directory).map_err(|_| "Could not create the synthetic test directory")?;
    let result = async {
        let path = directory.join("synthetic.sqlite");
        let conversation;
        {
            let mut storage = Storage::open(&path)?;
            conversation = storage.current_conversation()?;
            let answer = ChatReply { message:"Understood; this is synthetic test context only.".into(),..Default::default() };
            storage.save_chat_turn(case.first,&answer,None)?;
            for index in 0..case.turns {
                storage.save_chat_turn(&format!("Synthetic formatting discussion {index}: use readable paragraphs."),&answer,None)?;
            }
            if let Some(correction) = case.correction { storage.save_chat_turn(correction,&answer,None)?; }
            if case.memory_off {
                let mut controls = storage.memory_controls()?;
                controls.enabled = false;
                storage.set_memory_controls(&controls)?;
            }
            // A different selected UI chat must never contaminate the original request.
            storage.create_conversation()?;
            storage.save_chat_turn("Unrelated project: budget 999999, duration 99 minutes.",&answer,None)?;
        }
        let state = AppState::new(Storage::open(&path)?)?;
        let history: Vec<_> = state.inner.lock().unwrap().storage.chat_history_of(conversation)?.iter()
            .map(|m|json!({"id":m.id,"role":m.role,"text":m.text})).collect();
        let start = Instant::now();
        let outcome = crate::agent_runtime::handle_dialogue(
            &json!({"latest_request":case.request,"conversation":history,"natural_reply":true,"event_type":"user_message"}),
            conversation,&state,0,false,service
        ).await;
        let latency = start.elapsed().as_millis();
        let unchanged = {
            let inner = state.inner.lock().unwrap();
            inner.storage.core_snapshot(None)?.goals.is_empty()
                && inner.storage.current_conversation()? != conversation
                && inner.storage.memory_overview(0)?.memories.is_empty()
        };
        let (reply, error) = match outcome { Ok(o)=>(o.reply.message,None),Err(e)=>(String::new(),Some(e)) };
        let facts = !reply.is_empty() && required_facts(&reply,case.required);
        let judge_service = Service { client:service.client,endpoint:service.endpoint.clone(),key:service.key.clone(),model:crate::http::response_model(&service.model) };
        let judged = if error.is_none() {
            judge_service.request(
                "Evaluate only this synthetic test reply against the supplied facts and acceptance criteria. Return pass=false for invented capabilities, prices, pilot results or claims, omitted requested facts, wrong language, generic offers instead of an answer, needless requests to repeat available facts, or claims of app mutations. Previous assistant messages are not evidence. Do not reward nonempty answers. Concise neutral drafts and necessary clarifications are allowed only as the criteria specify. Return a short reason, never hidden reasoning.",
                json!({"user_facts":case.first,"correction":case.correction,"request":case.request,"criteria":case.expected,"reply":reply}),
                "buddy_conversation_quality_check",
                json!({"type":"object","additionalProperties":false,"properties":{"pass":{"type":"boolean"},"reason":{"type":"string","maxLength":500}},"required":["pass","reason"]})
            ).await.and_then(|v|serde_json::from_str::<Value>(crate::goal_analysis::response_text(&v)?).map_err(|_|"Invalid quality check".into()))
        } else { Err("The dialogue did not finish".into()) };
        let judge = judged.unwrap_or_else(|_|json!({"pass":false,"reason":"Quality check unavailable"}));
        Ok::<_,String>(json!({"case":case.name,"passed":facts && unchanged && judge["pass"]==true,
            "required_facts_passed":facts,"workspace_unchanged":unchanged,"quality_review":judge,
            "latency_ms":latency,"reply":reply,"error":error}))
    }.await;
    let _ = std::fs::remove_dir_all(&directory);
    result
}

pub async fn run() -> Result<Value, String> {
    let root = AppState::new(Storage::open(std::path::Path::new(":memory:"))?)?;
    if root.inner.lock().unwrap().status.mock_ai {
        return Err("Real provider required".into());
    }
    let service = Service::configured(&root.client)?;
    let mut rows = Vec::new();
    for case in cases() {
        let row = one(&case, &service).await?;
        eprintln!(
            "Conversation check {}: {}",
            case.name,
            if row["passed"] == true {
                "passed"
            } else {
                "failed"
            }
        );
        rows.push(row);
    }
    let passed = rows.iter().filter(|r| r["passed"] == true).count();
    let mut report = json!({"passed":passed,"total":rows.len(),"all_passed":passed==rows.len(),"configured_model":service.model,
        "configured_response_model":crate::http::response_model(&service.model),
        "rubric":"Persisted synthetic chats reopened before inference; exact required facts, scope/state checks and a separate model quality review. Saved replies still require human review. This is not a GPT-parity or universal reliability claim.","cases":rows});
    if std::env::args().any(|arg| arg == "--check-agent-actions") {
        // Reuse the already authorized runtime key. Separate processes can trigger
        // another native Keychain request even when they use the same candidate.
        match crate::engine_observability::action_check_with_service(&service, &root).await {
            Ok(actions) => {
                report["all_passed"] = json!(
                    passed == rows.len()
                        && actions.len() == 9
                        && actions.iter().all(|c| c.status == "passed")
                );
                report["action_checks"] = json!(actions);
            }
            Err(_) => {
                report["all_passed"] = json!(false);
                report["action_check_error"] = json!("The bounded action check did not finish");
            }
        }
    }
    Ok(report)
}
pub async fn bounded_run() -> Result<Value, String> {
    tokio::time::timeout(Duration::from_secs(900), run())
        .await
        .map_err(|_| "Conversation checks timed out")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fact_rubric_rejects_generic_and_wrong_budget_answers() {
        assert!(!required_facts("I can help with that", &["18000", "5"]));
        assert!(!required_facts("30 000 rubles, 5 minutes", &["18000", "5"]));
        assert!(required_facts("18\u{202f}000 ₽, 5 минут", &["18000", "5"]));
        assert_eq!(cases().len(), 6);
    }
}
