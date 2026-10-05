use super::*;
use wiremock::{
    matchers::{body_partial_json, header, method},
    Mock, MockServer, ResponseTemplate,
};
fn input() -> AnalysisInput {
    AnalysisInput {
        goal_id: "1".into(),
        title: "Renew passport".into(),
        description: None,
        due_at: None,
        priority: None,
        existing_steps: vec![],
        user_context_ref: None,
    }
}
fn response(content: Value) -> Value {
    json!({"choices":[{"finish_reason":"stop","message":{"content":content.to_string()}}]})
}
fn sources() -> Vec<SearchResult> {
    vec![SearchResult {
        title: "Official workflow".into(),
        url: "https://example.gov/workflow".into(),
        content: "Allow at least six weeks for this application.".into(),
    }]
}
fn answer() -> Value {
    json!({"result":{"improvedTitle":"Renew my passport after confirming jurisdiction","estimatedDuration":"six weeks","difficulty":"medium","suggestedSteps":[{"title":"Check required documents","sourceUrl":"https://example.gov/workflow"}],"warnings":[{"title":"Prepare documents","detail":"Check the official workflow before applying.","sourceUrl":"https://example.gov/workflow"}],"resources":[{"title":"Official workflow","url":"https://example.gov/workflow","whyRelevant":"Check the required documents and order of application steps."}]},"durationEvidence":"Allow at least six weeks","difficultyEvidence":null})
}
#[test]
fn validates_context_and_does_not_invent_sources_or_precise_estimates() {
    let result = parse_analysis(&response(answer()), &input(), &sources(), "procedural").unwrap();
    assert_eq!(result.estimated_duration.as_deref(), Some("six weeks"));
    assert_eq!(result.difficulty.as_deref(), Some("unknown"));
    let mut invalid = answer();
    invalid["durationEvidence"] = json!("Based on similar tasks");
    invalid["result"]["resources"][0]["url"] = json!("https://invented.example/requirements");
    invalid["result"]["warnings"][0]["sourceUrl"] = json!("https://invented.example/requirements");
    let result = parse_analysis(&response(invalid), &input(), &sources(), "procedural").unwrap();
    assert!(result.estimated_duration.is_none());
    assert!(result.resources.is_empty());
    assert!(result.warnings.is_empty());
    let mut bad = input();
    bad.title = "x".repeat(501);
    assert!(bad.validate().is_err());
    assert!(!safe_source("https://name:secret@example.com"));
    assert!(!safe_source("javascript:alert(1)"));
}
#[test]
fn incomplete_refused_and_malformed_provider_responses_are_rejected_without_echoing_them() {
    for value in [
        json!({"choices":[{"finish_reason":"length","message":{"content":"secret"}}]}),
        json!({"choices":[{"finish_reason":"stop","message":{"content":"secret","refusal":"no"}}]}),
        response(json!({"password":"secret"})),
    ] {
        let error = parse_analysis(&value, &input(), &[], "personal").unwrap_err();
        assert!(!error.contains("secret"));
    }
}
#[tokio::test]
async fn local_and_ambiguous_requests_do_not_call_tavily_even_if_provider_suggests_query() {
    let plan = parse_plan(&response(
        json!({"kind":"personal","query":"unneeded search"}),
    ))
    .unwrap();
    assert!(plan.query.is_none());
    let (results, notice) = research(&reqwest::Client::new(), &plan, true).await;
    assert!(results.is_empty());
    assert!(notice.is_none());
    let plan = parse_plan(&response(
        json!({"kind":"procedural","query":"passport workflow required documents"}),
    ))
    .unwrap();
    let (_, notice) = research(&reqwest::Client::new(), &plan, false).await;
    assert!(notice.unwrap().contains("off"));
}
#[tokio::test]
async fn classification_and_suggestions_use_real_http_and_only_explicit_context() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(header("authorization", "Bearer test-key"))
        .and(body_partial_json(
            json!({"response_format":{"json_schema":{"name":"buddy_research_plan"}}}),
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(response(
            json!({"kind":"procedural","query":"passport official application workflow"}),
        )))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(body_partial_json(
            json!({"response_format":{"json_schema":{"name":"goal_analysis"}}}),
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(response(answer())))
        .expect(1)
        .mount(&server)
        .await;
    let client = reqwest::Client::new();
    let service = Service {
        client: &client,
        endpoint: server.uri(),
        key: "test-key".into(),
        model: "test-model".into(),
    };
    let plan = service.plan(json!({"goal":input()})).await.unwrap();
    assert_eq!(plan.kind, "procedural");
    let value = service
        .request(
            "Analyze supplied sources",
            json!({"goal":input(),"sources":sources()}),
            "goal_analysis",
            analysis_schema(),
        )
        .await
        .unwrap();
    assert_eq!(
        parse_analysis(&value, &input(), &sources(), &plan.kind)
            .unwrap()
            .resources
            .len(),
        1
    );
    for request in server.received_requests().await.unwrap() {
        let body: Value = serde_json::from_slice(&request.body).unwrap();
        assert!(!body.to_string().contains("test-key"));
        let shared: Value =
            serde_json::from_str(body["messages"][1]["content"].as_str().unwrap()).unwrap();
        assert!(shared.get("profile").is_none());
        assert!(shared.get("activity").is_none());
    }
}
#[test]
fn revoked_consent_or_context_change_discards_results() {
    let storage = Storage::open(std::path::Path::new(":memory:")).unwrap();
    storage
        .write_setting(
            "ai_assistance_preferences",
            &AiPreferences {
                enabled: true,
                ..Default::default()
            },
        )
        .unwrap();
    let state = AppState::new(storage).unwrap();
    assert!(ensure_revision(&state, 0).is_ok());
    state.inner.lock().unwrap().privacy_revision = 1;
    assert!(ensure_revision(&state, 0).is_err());
    let inner = state.inner.lock().unwrap();
    inner
        .storage
        .write_setting("ai_assistance_preferences", &AiPreferences::default())
        .unwrap();
    drop(inner);
    assert!(ensure_revision(&state, 1).is_err());
}
