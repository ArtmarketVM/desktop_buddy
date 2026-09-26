use crate::{http, models::SearchResult};
use serde::Deserialize;
use serde_json::{json, Value};
#[derive(Deserialize)]
struct Response {
    results: Vec<SearchResult>,
}
pub fn parse_results(value: Value) -> Result<Vec<SearchResult>, String> {
    let result: Response =
        serde_json::from_value(value).map_err(|_| "Tavily returned invalid search results")?;
    Ok(result
        .results
        .into_iter()
        .filter(|r| {
            reqwest::Url::parse(&r.url)
                .map(|u| matches!(u.scheme(), "https" | "http"))
                .unwrap_or(false)
        })
        .take(5)
        .collect())
}
pub async fn tavily_search(
    client: &reqwest::Client,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
    let url = http::endpoint("TAVILY_API_URL")?;
    let key = http::secret("TAVILY_API_KEY")?;
    call(client, &url, &key, query).await
}
async fn call(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
    parse_results(
        http::post_json(
            client,
            url,
            key,
            &json!({"query":query,"search_depth":"basic","max_results":5}),
        )
        .await?,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{
        matchers::{body_partial_json, method},
        Mock, MockServer, ResponseTemplate,
    };
    #[test]
    fn excludes_unsafe_links() {
        assert!(parse_results(
            json!({"results":[{"title":"Bad","url":"javascript:alert(1)","content":"x"}]})
        )
        .unwrap()
        .is_empty());
    }
    #[test]
    fn rejects_missing_results() {
        assert!(parse_results(json!({})).is_err());
    }
    #[tokio::test]
    async fn searches_and_normalizes_results() {
        let server = MockServer::start().await;
        Mock::given(method("POST")).and(body_partial_json(json!({"query":"focus"}))).respond_with(ResponseTemplate::new(200).set_body_json(json!({"results":[{"title":"Focus","url":"https://example.com","content":"Useful","score":0.9}]}))).expect(1).mount(&server).await;
        assert_eq!(
            call(&reqwest::Client::new(), &server.uri(), "test", "focus")
                .await
                .unwrap()[0]
                .title,
            "Focus"
        );
    }
}
