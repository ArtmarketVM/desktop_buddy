use serde_json::Value;
use std::time::Duration;

pub async fn post_json(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    payload: &Value,
) -> Result<Value, String> {
    let mut last = "Service unavailable".to_string();
    for attempt in 0..3 {
        match client.post(url).bearer_auth(key).json(payload).send().await {
            Ok(response) if response.status().is_success() => {
                return response
                    .json()
                    .await
                    .map_err(|_| "Service returned invalid JSON".into())
            }
            Ok(response) => {
                let status = response.status();
                last = format!("Service returned HTTP {}", status.as_u16());
                if status.as_u16() != 429 && !status.is_server_error() {
                    return Err(last);
                }
            }
            Err(_) => last = "Service could not be reached or timed out".into(),
        }
        if attempt < 2 {
            tokio::time::sleep(Duration::from_millis(500 * (1 << attempt))).await;
        }
    }
    Err(last)
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
            "NEBIUS_MODEL_ID" => Some("nvidia/nemotron-3-super-120b-a12b".into()),
            "TAVILY_API_URL" => Some("https://api.tavily.com/search".into()),
            _ => None,
        })
        .ok_or_else(|| format!("Configure {name} in Settings"))
}
pub fn configured(name: &str) -> bool {
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
    use wiremock::{
        matchers::{method, path},
        Mock, MockServer, ResponseTemplate,
    };
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
            "Service returned HTTP 401"
        );
    }
}
