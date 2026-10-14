use super::*;
use crate::dialogue_benchmark::{fixture, Case};
use wiremock::{matchers::method, Mock, MockServer, Request, ResponseTemplate};
fn case() -> Case {
    Case {
        id: "fixture-en".into(),
        language: "en".into(),
        kind: "help".into(),
        request: "Help with that assignment".into(),
        history: vec![json!({"role":"user","text":"Help me with Psychology assignment"})],
    }
}
fn envelope(raw: Value) -> Value {
    json!({"choices":[{"finish_reason":"stop","message":{"content":raw.to_string()}}]})
}
fn answer(context: &Value, message: &str) -> Value {
    json!({"situation":"Answer using stored facts","decision":"stay_silent","proposed_actions":[],"memory_updates":[],"state_version":context["state"]["state_version"],"clarification":null,"intent":{"mode":"answer","operations":[]},"message":message,"web_query":null,"compose_response":false})
}
fn action(context: &Value, name: &str, input: Value, mode: &str, compose: bool) -> Value {
    json!({"situation":"Use the requested skill","decision":"execute_explicit_user_action","proposed_actions":[{"name":name,"input":input,"instruction":context["latest_request"]}],"memory_updates":[],"state_version":context["state"]["state_version"],"clarification":null,"intent":{"mode":mode,"operations":[name]},"message":"","web_query":null,"compose_response":compose})
}
fn body(request: &Request) -> (Value, Value) {
    let b: Value = serde_json::from_slice(&request.body).unwrap();
    let c = serde_json::from_str(b["messages"][1]["content"].as_str().unwrap()).unwrap();
    (b, c)
}
fn response(raw: Value) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_json(envelope(raw))
}

#[test]
fn semantic_validation_rejects_mutation_in_read_intent_and_wrong_operation() {
    let c = json!({"state":{"state_version":"v"},"latest_request":"Read only"});
    let mut raw = action(
        &c,
        "delete_goal",
        json!({"goal":{"goal_id":1,"reference":null}}),
        "read",
        false,
    );
    assert!(parse(&envelope(raw.clone()), "Read only").is_err());
    raw["intent"] = json!({"mode":"change","operations":["rename_goal"]});
    assert!(parse(&envelope(raw), "Rename it").is_err());
    for bad in [
        json!(null),
        json!(true),
        json!([]),
        json!("not an object"),
        json!({"intent":null}),
    ] {
        assert!(parse(&envelope(bad), "Hello").is_err());
    }
}

#[tokio::test]
async fn conversational_answer_sees_queue_and_uses_one_request_for_text_and_voice() {
    for event in ["user_message", "voice_message"] {
        let (state, ids) = fixture(&case()).unwrap();
        let conversation = state
            .inner
            .lock()
            .unwrap()
            .storage
            .current_conversation()
            .unwrap();
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(move |r: &Request| {
                let (b, c) = body(r);
                assert_eq!(
                    b["messages"].as_array().unwrap().last().unwrap()["content"],
                    "It is in Up next"
                );
                assert_eq!(b["messages"][2]["role"], "user");
                assert_eq!(
                    b["messages"][2]["content"],
                    "Help me with Psychology assignment"
                );
                assert!(c.get("conversation").is_none());
                assert_eq!(
                    c["state"]["work_queue"]["in_focus"]["title"],
                    "Client reply"
                );
                assert_eq!(
                    c["state"]["work_queue"]["up_next_goal_id"],
                    ids["Psychology assignment"]
                );
                assert!(c["product_facts"].as_str().unwrap().contains("Up next"));
                assert!(c["state"]["goals"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|g| g["title"] == "Psychology assignment"
                        && g["plan"]["steps"].as_array().unwrap().len() == 3));
                response(answer(
                    &c,
                    "Start by explaining classical conditioning using the saved assignment.",
                ))
            })
            .expect(1)
            .mount(&server)
            .await;
        let service = Service {
            client: &state.client,
            endpoint: server.uri(),
            key: "fixture".into(),
            model: "fixture".into(),
        };
        let reply=agent_runtime::handle_dialogue(&json!({"latest_request":"It is in Up next","conversation":case().history,"event_type":event}),conversation,&state,0,true,&service).await.unwrap();
        assert!(reply.reply.message.contains("classical conditioning"));
        assert!(!reply.committed);
        assert_eq!(reply.revision, 0);
    }
}

#[tokio::test]
async fn read_results_update_reference_then_answer_without_redundant_classifier() {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    let (state, ids) = fixture(&case()).unwrap();
    let psyche = ids["Psychology assignment"];
    let c = state
        .inner
        .lock()
        .unwrap()
        .storage
        .current_conversation()
        .unwrap();
    let server = MockServer::start().await;
    let count = Arc::new(AtomicUsize::new(0));
    Mock::given(method("POST")).respond_with(move |r:&Request|{let (b,ctx)=body(r);assert_eq!(b["response_format"]["json_schema"]["name"],"buddy_skill_plan");
        if count.fetch_add(1,Ordering::SeqCst)==0 {response(action(&ctx,"inspect_goal",json!({"goal":{"goal_id":psyche,"reference":null}}),"read",true))}
        else {assert_eq!(ctx["tool_results"][0]["results"][0]["goal_id"],psyche);
            assert_eq!(ctx["state"]["references"]["last_action"]["skill"],"inspect_goal");
            response(answer(&ctx,"The first step is to explain classical conditioning. Give an example after that."))}
    }).expect(2).mount(&server).await;
    let service = Service {
        client: &state.client,
        endpoint: server.uri(),
        key: "fixture".into(),
        model: "fixture".into(),
    };
    let out = run(
        &json!({"latest_request":"What remains there?","conversation":case().history}),
        c,
        &state,
        0,
        true,
        &service,
    )
    .await
    .unwrap();
    assert!(!out.committed);
    assert!(out.reply.message.contains("classical conditioning"));
    let inner = state.inner.lock().unwrap();
    assert_eq!(
        inner
            .storage
            .action_references(c)
            .unwrap()
            .last_referenced_goal_id,
        Some(psyche)
    );
    assert_eq!(
        inner.storage.core_snapshot(None).unwrap().focused_goal_id,
        Some(ids["Client reply"])
    );
}

#[tokio::test]
async fn mutation_composition_receives_verified_result_only_after_commit() {
    let (state, ids) = fixture(&case()).unwrap();
    let psyche = ids["Psychology assignment"];
    let c = state
        .inner
        .lock()
        .unwrap()
        .storage
        .current_conversation()
        .unwrap();
    let server = MockServer::start().await;
    Mock::given(method("POST")).respond_with(move |r:&Request|{let (b,ctx)=body(r);
        if b["response_format"]["json_schema"]["name"]=="buddy_skill_plan" {response(action(&ctx,"complete_step",json!({"goal":{"goal_id":psyche,"reference":null},"step":{"step_id":null,"ordinal":1,"reference":null}}),"change",true))}
        else {assert_eq!(ctx["verified_execution"]["status"],"executed");assert_eq!(ctx["verified_execution"]["results"][0]["data"]["steps"][0]["done"],true);
            response(json!({"message":"The first step is complete. Next, give an everyday example.","resources":[],"memory_update":null,"verified_result_indices":[0]}))}
    }).expect(2).mount(&server).await;
    let service = Service {
        client: &state.client,
        endpoint: server.uri(),
        key: "fixture".into(),
        model: "fixture".into(),
    };
    let out = run(
        &json!({"latest_request":"Mark the first step done","conversation":case().history}),
        c,
        &state,
        0,
        true,
        &service,
    )
    .await
    .unwrap();
    assert!(out.committed);
    assert_eq!(out.revision, 1);
    assert!(out.reply.message.contains("everyday example"));
    assert!(
        state
            .inner
            .lock()
            .unwrap()
            .storage
            .goal_plan(psyche)
            .unwrap()
            .steps[0]
            .done
    );
}

#[tokio::test]
async fn read_intent_cannot_escalate_to_delete_after_inspection() {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    let (state, ids) = fixture(&case()).unwrap();
    let psyche = ids["Psychology assignment"];
    let c = state
        .inner
        .lock()
        .unwrap()
        .storage
        .current_conversation()
        .unwrap();
    let server = MockServer::start().await;
    let count = Arc::new(AtomicUsize::new(0));
    Mock::given(method("POST"))
        .respond_with(move |r: &Request| {
            let (_, ctx) = body(r);
            response(if count.fetch_add(1, Ordering::SeqCst) == 0 {
                action(
                    &ctx,
                    "inspect_goal",
                    json!({"goal":{"goal_id":psyche,"reference":null}}),
                    "read",
                    true,
                )
            } else {
                action(
                    &ctx,
                    "delete_goal",
                    json!({"goal":{"goal_id":psyche,"reference":null}}),
                    "change",
                    false,
                )
            })
        })
        .expect(2)
        .mount(&server)
        .await;
    let service = Service {
        client: &state.client,
        endpoint: server.uri(),
        key: "fixture".into(),
        model: "fixture".into(),
    };
    assert!(run(
        &json!({"latest_request":"Read the goal"}),
        c,
        &state,
        0,
        true,
        &service
    )
    .await
    .err()
    .unwrap()
    .contains("escalate"));
    assert!(state
        .inner
        .lock()
        .unwrap()
        .storage
        .goal_plan(psyche)
        .is_ok());
}

#[tokio::test]
async fn sharing_off_hides_workspace_and_preferences_before_any_provider_call() {
    let (state, ids) = fixture(&case()).unwrap();
    let c = state
        .inner
        .lock()
        .unwrap()
        .storage
        .current_conversation()
        .unwrap();
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(|r: &Request| {
            let (_, ctx) = body(r);
            let serialized = ctx.to_string();
            assert!(!serialized.contains("Psychology assignment"));
            assert!(!serialized.contains("PRIVATE_MEMORY_SENTINEL"));
            assert_eq!(ctx["state"]["sharing"], false);
            assert!(ctx["state"]["work_queue"].is_null());
            response(answer(
                &ctx,
                "Goal sharing is off, so I cannot read your saved goals.",
            ))
        })
        .expect(1)
        .mount(&server)
        .await;
    let service = Service {
        client: &state.client,
        endpoint: server.uri(),
        key: "fixture".into(),
        model: "fixture".into(),
    };
    let out=run(&json!({"latest_request":"What is next?","selected_goal_id":ids["Psychology assignment"],"personal_memory":{"secret":"PRIVATE_MEMORY_SENTINEL"}}),c,&state,0,false,&service).await.unwrap();
    assert!(!out.committed);
}

#[test]
fn shared_context_limits_details_and_preserves_saved_queue_order() {
    let (state, ids) = fixture(&case()).unwrap();
    let inner = state.inner.lock().unwrap();
    let snap = skills::snapshot(
        &inner.storage,
        inner.storage.current_conversation().unwrap(),
    )
    .unwrap();
    let workspace = dialogue_context::workspace(&snap, true, None);
    assert_eq!(
        workspace["work_queue"]["later_today"][0]["goal_id"],
        ids["Psychology assignment"]
    );
    assert!(workspace["goals"]
        .as_array()
        .unwrap()
        .iter()
        .find(|g| g["title"] == "Physics reading")
        .unwrap()["plan"]["steps"]
        .as_array()
        .unwrap()
        .is_empty());
    assert!(workspace.to_string().len() < 24000);
    assert!(dialogue_context::workspace(&snap, false, None)["goals"]
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn evaluation_contains_sixty_cases_in_three_languages_without_production_data() {
    let cases = crate::dialogue_benchmark::cases().unwrap();
    assert_eq!(cases.len(), 60);
    for language in ["ru", "en", "he"] {
        assert_eq!(cases.iter().filter(|c| c.language == language).count(), 20);
    }
}

#[tokio::test]
async fn semantic_preflight_blocks_guessed_target_without_writes() {
    let mut scenario = case();
    scenario.kind = "ambiguous_pronoun".into();
    scenario.history.clear();
    let (state, ids) = fixture(&scenario).unwrap();
    let c = state
        .inner
        .lock()
        .unwrap()
        .storage
        .current_conversation()
        .unwrap();
    let target = ids["Client reply"];
    let server = MockServer::start().await;
    Mock::given(method("POST")).respond_with(move |r:&Request| {
        let (b,ctx)=body(r);
        if b["response_format"]["json_schema"]["name"]=="buddy_skill_plan" {
            let mut plan=action(&ctx,"delete_goal",json!({"goal":{"goal_id":target,"reference":null}}),"change",false);
            plan.as_object_mut().unwrap().remove("intent"); plan["decision"]=json!("change"); response(plan)
        } else {
            assert_eq!(b["response_format"]["json_schema"]["name"],"buddy_dialogue_authorization");
            assert!(ctx["original_user_context"]["references"]["last_referenced_goal_id"].is_null());
            response(json!({"verdict":"clarify","request_mode":"clarification","message":"Which goal should I delete?"}))
        }
    }).expect(2).mount(&server).await;
    let service = Service {
        client: &state.client,
        endpoint: server.uri(),
        key: "fixture".into(),
        model: "fixture".into(),
    };
    let out = run(
        &json!({"latest_request":"Delete it","natural_reply":true}),
        c,
        &state,
        0,
        true,
        &service,
    )
    .await
    .unwrap();
    assert!(!out.committed);
    assert!(out.reply.message.contains("Which goal"));
    let i = state.inner.lock().unwrap();
    assert_eq!(i.storage.core_snapshot(None).unwrap().goals.len(), 5);
    assert!(i
        .storage
        .action_references(c)
        .unwrap()
        .last_action
        .is_none());
}

#[tokio::test]
async fn unexecuted_mutation_claim_is_repaired_before_display() {
    let (state, _) = fixture(&case()).unwrap();
    let c = state
        .inner
        .lock()
        .unwrap()
        .storage
        .current_conversation()
        .unwrap();
    let server = MockServer::start().await;
    Mock::given(method("POST")).respond_with(|r:&Request| {
        let (b,ctx)=body(r);
        match b["response_format"]["json_schema"]["name"].as_str().unwrap() {
            "buddy_skill_plan"=>response(answer(&ctx,"I switched your focus to Psychology assignment.")),
            "buddy_dialogue_review" if ctx["proposal"]["message"].as_str().unwrap().contains("switched") => {
                assert!(ctx["proposal"]["verified_execution"].is_null());
                response(json!({"verdict":"repair","request_mode":"answer","message":"No focus change occurred. Explain the saved next step instead."}))
            },
            "buddy_dialogue_response"=>{
                assert!(ctx["reply_correction"].as_str().unwrap().contains("No focus change"));
                response(json!({"message":"Psychology assignment is Up next. Start with classical conditioning.","resources":[],"memory_update":null,"verified_result_indices":[]}))
            },
            "buddy_dialogue_review"=>response(json!({"verdict":"approved","request_mode":"answer","message":""})),
            other=>panic!("Unexpected operation {other}"),
        }
    }).expect(4).mount(&server).await;
    let service = Service {
        client: &state.client,
        endpoint: server.uri(),
        key: "fixture".into(),
        model: "fixture".into(),
    };
    let out=run(&json!({"latest_request":"It is in Up next","natural_reply":true,"conversation":case().history}),c,&state,0,true,&service).await.unwrap();
    assert!(!out.committed);
    assert!(!out.reply.message.contains("switched"));
    assert_eq!(
        state
            .inner
            .lock()
            .unwrap()
            .storage
            .core_snapshot(None)
            .unwrap()
            .focused_goal_id,
        Some(1)
    );
}

#[tokio::test]
async fn authorization_outage_fails_closed_before_mutation() {
    let (state, ids) = fixture(&case()).unwrap();
    let target = ids["Psychology assignment"];
    let c = state
        .inner
        .lock()
        .unwrap()
        .storage
        .current_conversation()
        .unwrap();
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(move |r: &Request| {
            let (b, ctx) = body(r);
            if b["response_format"]["json_schema"]["name"] == "buddy_skill_plan" {
                response(action(
                    &ctx,
                    "set_focus_goal",
                    json!({"goal":{"goal_id":target,"reference":null}}),
                    "change",
                    false,
                ))
            } else {
                ResponseTemplate::new(503)
            }
        })
        .mount(&server)
        .await;
    let service = Service {
        client: &state.client,
        endpoint: server.uri(),
        key: "fixture".into(),
        model: "fixture".into(),
    };
    assert!(run(
        &json!({"latest_request":"Focus Psychology assignment","natural_reply":true}),
        c,
        &state,
        0,
        true,
        &service
    )
    .await
    .is_err());
    assert_eq!(
        state
            .inner
            .lock()
            .unwrap()
            .storage
            .core_snapshot(None)
            .unwrap()
            .focused_goal_id,
        Some(ids["Client reply"])
    );
}

#[test]
fn context_budget_omissions_are_explicit_and_latest_request_is_preserved() {
    let (state, _) = fixture(&case()).unwrap();
    let i = state.inner.lock().unwrap();
    let snapshot = skills::snapshot(&i.storage, i.storage.current_conversation().unwrap()).unwrap();
    let history: Vec<_> = (0..12)
        .map(|_| json!({"role":"user","text":"Ж".repeat(2000)}))
        .collect();
    let packet = dialogue_context::packet(
        &json!({"latest_request":"Read this goal","conversation":history,"attachment_text":"a".repeat(50000)}),
        &snapshot,
        true,
        &[],
    );
    assert_eq!(packet["latest_request"], "Read this goal");
    assert!(
        packet["context_budget"]["omitted_older_messages"]
            .as_u64()
            .unwrap()
            > 0
    );
    assert!(packet.to_string().len() <= 96 * 1024);
}

#[tokio::test]
async fn confirmation_in_another_language_executes_only_saved_proposal() {
    let (state, ids) = fixture(&case()).unwrap();
    let target = ids["Psychology assignment"];
    let c = state
        .inner
        .lock()
        .unwrap()
        .storage
        .current_conversation()
        .unwrap();
    {
        let mut i = state.inner.lock().unwrap();
        let mut snap = skills::snapshot(&i.storage, c).unwrap();
        snap.privacy_revision = Some(0);
        let plan:skills::Plan=serde_json::from_value(json!({"kind":"actions","state_version":snap.version,"actions":[{"name":"delete_goal","input":{"goal":{"goal_id":target,"reference":null}},"instruction":"Delete Psychology assignment"}],"clarification":null})).unwrap();
        let execution = skills::execute_for_event(
            &mut i.storage,
            &snap,
            &plan,
            "Delete Psychology assignment",
            true,
            false,
            agent_runtime::EventKind::VoiceMessage,
        )
        .unwrap();
        assert_eq!(execution.status, "confirmation_required");
    }
    let server = MockServer::start().await;
    Mock::given(method("POST")).respond_with(move |r:&Request| {
        let (b,ctx)=body(r);
        match b["response_format"]["json_schema"]["name"].as_str().unwrap() {
            "buddy_dialogue_confirmation"=>{
                assert_eq!(ctx["pending_proposal"]["actions"][0]["input"]["goal"]["goal_id"],target);
                response(json!({"decision":"confirm"}))
            },
            "buddy_dialogue_response"=>response(json!({"message":"היעד נמחק. אפשר לשחזר אותו.","resources":[],"memory_update":null,"verified_result_indices":[0]})),
            "buddy_dialogue_review"=>response(json!({"verdict":"approved","request_mode":"change","message":""})),
            other=>panic!("Unexpected operation {other}"),
        }
    }).expect(3).mount(&server).await;
    let service = Service {
        client: &state.client,
        endpoint: server.uri(),
        key: "fixture".into(),
        model: "fixture".into(),
    };
    let out = run(
        &json!({"latest_request":"כן, אני מאשר למחוק את היעד הזה","natural_reply":true}),
        c,
        &state,
        0,
        true,
        &service,
    )
    .await
    .unwrap();
    assert!(out.committed);
    assert_eq!(
        state
            .inner
            .lock()
            .unwrap()
            .storage
            .core_snapshot(None)
            .unwrap()
            .goals
            .len(),
        4
    );
}

#[tokio::test]
async fn privacy_change_during_authorization_blocks_execution() {
    let (state, ids) = fixture(&case()).unwrap();
    let target = ids["Psychology assignment"];
    let state = std::sync::Arc::new(state);
    let captured = state.clone();
    let c = state
        .inner
        .lock()
        .unwrap()
        .storage
        .current_conversation()
        .unwrap();
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(move |r: &Request| {
            let (b, ctx) = body(r);
            if b["response_format"]["json_schema"]["name"] == "buddy_skill_plan" {
                response(action(
                    &ctx,
                    "set_focus_goal",
                    json!({"goal":{"goal_id":target,"reference":null}}),
                    "change",
                    false,
                ))
            } else {
                captured.inner.lock().unwrap().privacy_revision += 1;
                response(json!({"verdict":"approved","request_mode":"change","message":""}))
            }
        })
        .expect(2)
        .mount(&server)
        .await;
    let service = Service {
        client: &state.client,
        endpoint: server.uri(),
        key: "fixture".into(),
        model: "fixture".into(),
    };
    assert!(run(
        &json!({"latest_request":"Focus Psychology assignment","natural_reply":true}),
        c,
        &state,
        0,
        true,
        &service
    )
    .await
    .is_err());
    assert_eq!(
        state
            .inner
            .lock()
            .unwrap()
            .storage
            .core_snapshot(None)
            .unwrap()
            .focused_goal_id,
        Some(ids["Client reply"])
    );
}

#[test]
fn exclusive_response_schema_removes_conflicting_decisions_and_memory_fields() {
    let (state, _) = fixture(&case()).unwrap();
    let i = state.inner.lock().unwrap();
    let snapshot = skills::snapshot(&i.storage, i.storage.current_conversation().unwrap()).unwrap();
    let context = dialogue_context::packet(
        &json!({"latest_request":"What remains?"}),
        &snapshot,
        true,
        &[],
    );
    let format = schema(&snapshot, true, &context);
    let variants = format["properties"]["response"]["anyOf"]
        .as_array()
        .unwrap();
    assert_eq!(variants.len(), 5);
    let read = &variants[1];
    assert_eq!(read["properties"]["decision"]["const"], "read");
    assert!(read["properties"].get("updates").is_none());
    assert!(!read["properties"]["actions"]["items"]["anyOf"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v["properties"]["name"]["const"] == "delete_goal"));
    let raw = json!({"state_version":snapshot.version,"response":{"decision":"answer","message":"Three saved steps remain.","web_query":null,"compose_response":false}});
    assert_eq!(
        parse(&envelope(raw), "What remains?").unwrap().intent.mode,
        "answer"
    );
    let invalid = json!({"state_version":snapshot.version,"response":{"decision":"answer","message":"Done","web_query":null,"compose_response":false,"actions":[]}});
    assert!(parse(&envelope(invalid), "What remains?").is_err());
    let invalid = json!({"state_version":snapshot.version,"response":{"decision":"read","actions":[],"compose_response":true}});
    assert!(parse(&envelope(invalid), "What remains?").is_err());
}

#[test]
fn punctuation_only_provider_responses_are_not_displayable_answers() {
    let raw = json!({"state_version":"v","response":{"decision":"answer","message":"...","web_query":null,"compose_response":false}});
    assert!(parse(&envelope(raw), "Help me").is_err());
    assert!(crate::ai_chat::parse_chat(
        &envelope(json!({"message":"...","resources":[],"memory_update":null})),
        &[]
    )
    .is_err());
}
