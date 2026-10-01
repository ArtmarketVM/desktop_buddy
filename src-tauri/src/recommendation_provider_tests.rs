use super::*;
use wiremock::{
    matchers::{header, method, path},
    Mock, MockServer, ResponseTemplate,
};
fn response(content: Value) -> Value {
    json!({"choices":[{"finish_reason":"stop","message":{"content":content.to_string()}}]})
}
fn memory() -> Value {
    json!({"ratings":[{"title":"Theory only","helpful":false},{"title":"Worked example","helpful":true}],"recently_offered_titles":["Theory only"]})
}
fn goal() -> String {
    json!({"goal":"Ship a report","done_when":"Reviewed PDF","current_step":"Compare two sources"})
        .to_string()
}

#[test]
fn structured_context_prioritizes_saved_step_and_matches_preview_builder() {
    let activity: Vec<_> = (0..8)
        .map(|n| ActivitySnapshot {
            timestamp: String::new(),
            process_name: "browser".into(),
            window_title: format!("Window {n} {}", "x".repeat(200)),
            idle_seconds: 5,
            active_seconds: 120,
            ..Default::default()
        })
        .collect();
    let context = recommendation_search_context(&goal(), &activity, &memory());
    assert_eq!(context["goal"]["current_step"], "Compare two sources");
    assert_eq!(context["goal"]["done_when"], "Reviewed PDF");
    assert_eq!(context["recommendation_memory"], memory());
    assert_eq!(context["recent_window_titles"].as_array().unwrap().len(), 5);
    assert_eq!(
        context["recent_window_titles"][0]
            .as_str()
            .unwrap()
            .chars()
            .count(),
        160
    );
    assert!(
        recommendation_search_context("Legacy goal", &[], &memory())["goal"]["current_step"]
            .is_null()
    );
}

#[test]
fn accepts_abstention_and_requires_concrete_action_for_a_selection() {
    assert!(parse_search_plan(&response(
        json!({"query":null,"reason":"No specific help needed"})
    ))
    .unwrap()
    .query
    .is_none());
    assert!(parse_selection(
        &response(json!({"index":null,"reason":"Nothing supports this step","next_action":null})),
        2
    )
    .unwrap()
    .index
    .is_none());
    for bad in [
        json!({"index":0,"reason":"Useful","next_action":null}),
        json!({"index":0,"reason":"Useful","next_action":" "}),
        json!({"index":2,"reason":"Useful","next_action":"Read"}),
        json!({"index":null,"reason":"Skip","next_action":"Read"}),
        json!({"index":0,"reason":"Useful","next_action":"x".repeat(141)}),
        json!({"index":0,"reason":"Useful","next_action":"Read","url":"https://invented.example"}),
    ] {
        assert!(parse_selection(&response(bad), 2).is_err());
    }
}

#[test]
fn rejects_refused_truncated_and_unfinished_provider_output() {
    for finish in ["length", "content_filter", "tool_calls"] {
        let mut value = response(json!({"query":"Compare sources","reason":"Useful"}));
        value["choices"][0]["finish_reason"] = json!(finish);
        assert!(parse_search_plan(&value).is_err());
        assert!(parse_selection(&value, 1).is_err());
    }
    let mut value = response(json!({"query":"Compare sources","reason":"Useful"}));
    value["choices"][0]["message"]["refusal"] = json!("Private refusal");
    assert!(parse_search_plan(&value).is_err());
    assert!(parse_selection(&value, 1).is_err());
    value["choices"][0]
        .as_object_mut()
        .unwrap()
        .remove("finish_reason");
    assert!(parse_search_plan(&value).is_err());
}

#[tokio::test]
async fn both_http_stages_receive_same_step_and_feedback_and_return_next_action() {
    let server = MockServer::start().await;
    Mock::given(method("POST")).and(path("/plan")).and(header("authorization","Bearer test-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response(json!({"query":"source comparison evidence checklist","reason":"Supports source comparison"})))).expect(1).mount(&server).await;
    Mock::given(method("POST")).and(path("/select")).and(header("authorization","Bearer test-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response(json!({"index":0,"reason":"A comparison checklist for your current step.","next_action":"Use its criteria to compare your two sources."})))).expect(1).mount(&server).await;
    let client = reqwest::Client::new();
    let plan = search_plan_call(
        &client,
        &format!("{}/plan", server.uri()),
        "test-key",
        "model",
        &goal(),
        &[],
        &memory(),
    )
    .await
    .unwrap();
    assert_eq!(
        plan.query.as_deref(),
        Some("source comparison evidence checklist")
    );
    let selected = select_resource_call(
        &client,
        &format!("{}/select", server.uri()),
        "test-key",
        "model",
        &goal(),
        &[SearchResult {
            title: "Source checklist".into(),
            url: "https://example.com/guide".into(),
            content: "A practical comparison checklist".into(),
        }],
        &memory(),
    )
    .await
    .unwrap();
    assert_eq!(selected.index, Some(0));
    assert!(selected.next_action.unwrap().contains("two sources"));
    for request in server.received_requests().await.unwrap() {
        let body: Value = serde_json::from_slice(&request.body).unwrap();
        let context: Value =
            serde_json::from_str(body["messages"][1]["content"].as_str().unwrap()).unwrap();
        assert_eq!(context["goal"]["current_step"], "Compare two sources");
        assert_eq!(context["recommendation_memory"], memory());
        assert!(body["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("untrusted data"));
    }
}
