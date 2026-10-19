use serde_json::Value;
use std::time::Duration;

pub const DEFAULT_PRIMARY_MODEL: &str = "nvidia/nemotron-3-super-120b-a12b";
pub const DEFAULT_RESPONSE_MODEL: &str = "moonshotai/Kimi-K3";
fn resolve_response_model(
    primary: &str,
    primary_override: Option<&str>,
    response_override: Option<&str>,
) -> String {
    response_override
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| {
            if primary == DEFAULT_PRIMARY_MODEL && primary_override.is_none() {
                DEFAULT_RESPONSE_MODEL
            } else {
                primary
            }
        })
        .into()
}
pub fn response_model(primary: &str) -> String {
    resolve_response_model(
        primary,
        std::env::var("NEBIUS_MODEL_ID").ok().as_deref(),
        std::env::var("NEBIUS_REASONING_MODEL_ID").ok().as_deref(),
    )
}

pub fn status_error(status: u16) -> String {
    let advice = match status {
        400 => "The provider rejected the request. Check model and endpoint compatibility.",
        401 => "The API key was rejected. Replace it in Settings.",
        403 => "This key does not have permission. Check provider access and account settings.",
        404 => "The endpoint or model was not found. Check provider configuration.",
        402 => "Provider billing or credits are required. Check your provider account.",
        429 => "Provider quota or rate limit reached. Check your limits and try again later.",
        500..=599 => "The provider is temporarily unavailable. Try again later.",
        _ => "The provider could not complete the request.",
    };
    format!("HTTP {status}: {advice}")
}

pub async fn post_json(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    payload: &Value,
) -> Result<Value, String> {
    post_json_with_timeout(client, url, key, payload, Duration::from_secs(20), true).await
}

/// Interactive reasoning can outlast the short background/search timeout. Do not
/// resubmit a timed-out generation: the provider may still be processing it.
pub(crate) async fn post_reasoning_json(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    payload: &Value,
) -> Result<Value, String> {
    post_json_with_timeout(client, url, key, payload, Duration::from_secs(60), false).await
}

async fn post_json_with_timeout(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    payload: &Value,
    timeout: Duration,
    retry_timeouts: bool,
) -> Result<Value, String> {
    let payload = constrained_payload(payload);
    let mut last = "Service unavailable".to_string();
    for attempt in 0..3 {
        match client
            .post(url)
            .bearer_auth(key)
            .json(&payload)
            .timeout(timeout)
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => {
                return response.json().await.map_err(|error| {
                    if error.is_timeout() {
                        "The provider response timed out. Your saved API key has not been removed."
                            .into()
                    } else {
                        "Service returned invalid JSON".into()
                    }
                })
            }
            Ok(response) => {
                let status = response.status();
                last = status_error(status.as_u16());
                if status.as_u16() != 429 && !status.is_server_error() {
                    return Err(last);
                }
            }
            Err(error) if error.is_timeout() && !retry_timeouts => {
                return Err(
                    "The provider response timed out. Your saved API key has not been removed."
                        .into(),
                );
            }
            Err(_) => last = "Service could not be reached or timed out".into(),
        }
        if attempt < 2 {
            tokio::time::sleep(Duration::from_millis(500 * (1 << attempt))).await;
        }
    }
    Err(last)
}
/// Keep interactive output within its budget using verified model-specific controls.
pub(crate) fn constrained_payload(payload: &Value) -> Value {
    let mut result = payload.clone();
    if payload["model"]
        .as_str()
        .is_some_and(|m| m.to_ascii_lowercase().contains("nemotron"))
        && payload["response_format"]["type"] == "json_schema"
        && payload["chat_template_kwargs"]["enable_thinking"].is_null()
    {
        result["chat_template_kwargs"] = serde_json::json!({"enable_thinking":false});
    }
    // Kimi K3 always reasons and defaults to maximum effort. Its supported
    // top-level control is reasoning_effort, not a boolean thinking template flag.
    if payload["model"]
        .as_str()
        .is_some_and(|m| m.eq_ignore_ascii_case("moonshotai/Kimi-K3"))
        && payload["reasoning_effort"].is_null()
    {
        result["reasoning_effort"] = serde_json::json!("low");
    }
    result
}
pub fn endpoint(name: &str) -> Result<String, String> {
    let value = secret(name)?;
    let url = reqwest::Url::parse(&value).map_err(|_| format!("Invalid {name}"))?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err(format!(
            "{name} must be an HTTPS endpoint without credentials"
        ));
    }
    Ok(value)
}
pub fn secret(name: &str) -> Result<String, String> {
    // Test providers use synthetic environment keys, never the user's vault.
    #[cfg(not(test))]
    if matches!(name, "NEBIUS_API_KEY" | "TAVILY_API_KEY") {
        if let Some(key) = crate::credentials::read(name)? {
            return Ok(key);
        }
    }
    std::env::var(name)
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| match name {
            "NEBIUS_API_URL" => {
                Some("https://api.tokenfactory.nebius.com/v1/chat/completions".into())
            }
            "NEBIUS_MODEL_ID" => Some(DEFAULT_PRIMARY_MODEL.into()),
            "TAVILY_API_URL" => Some("https://api.tavily.com/search".into()),
            _ => None,
        })
        .ok_or_else(|| format!("Configure {name} in Settings"))
}
pub fn configured(name: &str) -> bool {
    #[cfg(not(test))]
    if matches!(name, "NEBIUS_API_KEY" | "TAVILY_API_KEY") {
        return std::env::var(name)
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
            || crate::credentials::exists(name).unwrap_or(false);
    }
    secret(name).is_ok()
}
pub fn enabled(name: &str) -> bool {
    std::env::var(name)
        .map(|s| s.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn constrained_nemotron_does_not_spend_action_budget_on_hidden_reasoning() {
        let payload = serde_json::json!({"model":"nvidia/nemotron-3-super-120b-a12b","response_format":{"type":"json_schema"},"max_tokens":1024});
        assert_eq!(
            constrained_payload(&payload)["chat_template_kwargs"]["enable_thinking"],
            false
        );
        let other = serde_json::json!({"model":"other","response_format":{"type":"json_schema"}});
        assert_eq!(constrained_payload(&other), other);
        let search = serde_json::json!({"query":"public docs"});
        assert_eq!(constrained_payload(&search), search);
    }
    #[test]
    fn response_model_defaults_and_explicit_overrides_are_predictable() {
        assert_eq!(
            resolve_response_model(DEFAULT_PRIMARY_MODEL, None, None),
            DEFAULT_RESPONSE_MODEL
        );
        assert_eq!(
            resolve_response_model(DEFAULT_PRIMARY_MODEL, Some(DEFAULT_PRIMARY_MODEL), None),
            DEFAULT_PRIMARY_MODEL
        );
        assert_eq!(
            resolve_response_model("custom", Some("custom"), None),
            "custom"
        );
        assert_eq!(
            resolve_response_model("custom", Some("custom"), Some(DEFAULT_RESPONSE_MODEL)),
            DEFAULT_RESPONSE_MODEL
        );
        assert_eq!(resolve_response_model("custom", None, Some("")), "custom");
        assert!(crate::goal_analysis::response_operation("buddy_skill_plan"));
        assert!(crate::goal_analysis::response_operation(
            "buddy_coaching_interpretation"
        ));
        assert!(crate::goal_analysis::response_operation(
            "buddy_coaching_response"
        ));
        assert!(crate::goal_analysis::response_operation(
            "buddy_chat_research_authorization"
        ));
        assert!(!crate::goal_analysis::response_operation(
            "buddy_agent_reasoning"
        ));
        assert!(!crate::goal_analysis::response_operation(
            "completion_detection"
        ));
        assert!(crate::goal_analysis::response_operation(
            "buddy_dialogue_authorization"
        ));
        assert!(crate::goal_analysis::response_operation(
            "buddy_dialogue_response"
        ));
        assert!(crate::goal_analysis::response_operation(
            "buddy_dialogue_review"
        ));
    }
    use wiremock::{
        matchers::{method, path},
        Mock, MockServer, ResponseTemplate,
    };
    #[tokio::test]
    async fn reasoning_request_can_outlast_the_clients_background_timeout() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_delay(Duration::from_millis(100))
                    .set_body_json(serde_json::json!({"ok":true})),
            )
            .expect(1)
            .mount(&server)
            .await;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(20))
            .build()
            .unwrap();
        let response = post_reasoning_json(
            &client,
            &server.uri(),
            "test",
            &serde_json::json!({"model":"test-model"}),
        )
        .await
        .unwrap();
        assert_eq!(response["ok"], true);
    }
    #[tokio::test]
    async fn kimi_requests_send_supported_low_effort_without_overriding_explicit_effort() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(|request: &wiremock::Request| {
                let payload: Value = serde_json::from_slice(&request.body).unwrap();
                assert_eq!(payload["reasoning_effort"], "low");
                assert!(payload["chat_template_kwargs"].is_null());
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"ok":true}))
            })
            .expect(1)
            .mount(&server)
            .await;
        post_reasoning_json(
            &reqwest::Client::new(),
            &server.uri(),
            "synthetic-key",
            &serde_json::json!({"model":"moonshotai/Kimi-K3","max_tokens":8192}),
        )
        .await
        .unwrap();
        let explicit = serde_json::json!({"model":"moonshotai/Kimi-K3","reasoning_effort":"high"});
        assert_eq!(constrained_payload(&explicit), explicit);
        let other = serde_json::json!({"model":"moonshotai/Kimi-K2.6"});
        assert_eq!(constrained_payload(&other), other);
    }
    #[tokio::test]
    async fn timed_out_reasoning_is_not_resubmitted_or_reported_as_a_bad_key() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_delay(Duration::from_millis(300))
                    .set_body_json(serde_json::json!({"ok":true})),
            )
            .expect(1)
            .mount(&server)
            .await;
        let error = post_json_with_timeout(
            &reqwest::Client::new(),
            &server.uri(),
            "secret-canary",
            &serde_json::json!({"model":"test-model"}),
            Duration::from_millis(100),
            false,
        )
        .await
        .unwrap_err();
        assert!(error.contains("timed out"));
        assert!(error.contains("saved API key has not been removed"));
        assert!(!error.contains("secret-canary"));
    }
    #[tokio::test]
    async fn retries_transient_errors_twice() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(503))
            .expect(3)
            .mount(&server)
            .await;
        assert!(post_json(
            &reqwest::Client::new(),
            &server.uri(),
            "test",
            &serde_json::json!({})
        )
        .await
        .is_err());
    }
    #[tokio::test]
    async fn does_not_retry_authentication_failure() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(401))
            .expect(1)
            .mount(&server)
            .await;
        assert_eq!(
            post_json(
                &reqwest::Client::new(),
                &server.uri(),
                "test",
                &serde_json::json!({})
            )
            .await
            .unwrap_err(),
            status_error(401)
        );
    }
}
