use crate::{commands::AppState, storage::Storage};
use tauri::State;
use tauri_plugin_opener::OpenerExt;

fn validate_endpoint(value: &str) -> Result<(), String> {
    if value.len() > 2048 {
        return Err("The contact-service URL is too long".into());
    }
    let url = reqwest::Url::parse(value).map_err(|_| "Enter an HTTPS contact-service URL")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Use an HTTPS service URL without credentials or query parameters".into());
    }
    Ok(())
}
fn endpoint(storage: &Storage) -> Result<Option<String>, String> {
    let url: Option<String> = storage.read_setting("contact_endpoint")?;
    let url = url.or_else(|| {
        std::env::var("CONTACT_API_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
    });
    if let Some(ref value) = url {
        validate_endpoint(value)?;
    }
    Ok(url)
}
#[tauri::command(async)]
pub fn get_contact_endpoint(state: State<AppState>) -> Result<Option<String>, String> {
    endpoint(
        &state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?
            .storage,
    )
}
#[tauri::command(async)]
pub fn set_contact_endpoint(url: String, state: State<AppState>) -> Result<(), String> {
    let value = url.trim();
    if !value.is_empty() {
        validate_endpoint(value)?;
    }
    let inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    inner.storage.write_setting(
        "contact_endpoint",
        &if value.is_empty() { None } else { Some(value) },
    )
}

async fn submit(url: &str, payload: &serde_json::Value, expected: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Contact service unavailable")?;
    // One attempt, no credentials or activity context, no automatic retry of email delivery.
    let response = client
        .post(url)
        .json(payload)
        .send()
        .await
        .map_err(|_| "Could not reach the contact service. Try the email draft instead.")?;
    if !response.status().is_success() {
        return Err(
            "The contact service did not accept the request. Please try again later.".into(),
        );
    }
    if response.content_length().is_some_and(|size| size > 4096) {
        return Err("Unexpected contact response".into());
    }
    let response: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "Unexpected contact response")?;
    if response.get("status").and_then(|value| value.as_str()) != Some(expected) {
        return Err("The contact service did not confirm this request".into());
    }
    Ok(())
}

#[tauri::command(async)]
pub async fn send_contact_feedback(
    message: String,
    reply_email: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    feedback_url(&message, &reply_email)?;
    let url = {
        let inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        endpoint(&inner.storage)?.ok_or("No private contact service is connected")?
    };
    submit(
        &url,
        &serde_json::json!({"kind":"feedback", "message":message, "reply_email":reply_email}),
        "accepted",
    )
    .await
}

#[tauri::command(async)]
pub async fn subscribe_contact_email(
    consent: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !consent {
        return Err("Email updates need your separate consent".into());
    }
    let (url, email) = {
        let inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        let settings = inner.storage.user_settings()?;
        if !settings.onboarding.completed {
            return Err("Finish your local profile first".into());
        }
        (
            endpoint(&inner.storage)?.ok_or("No private contact service is connected")?,
            settings.profile.email,
        )
    };
    submit(
        &url,
        &serde_json::json!({"kind":"subscribe", "email":email, "consent":true}),
        "confirmation_required",
    )
    .await
}

fn role_payload(
    mut profile: crate::profile::UserProfile,
    consent: bool,
) -> Result<serde_json::Value, String> {
    if !consent {
        return Err("Role research needs your separate consent".into());
    }
    crate::profile::validate_profile(&mut profile, true)?;
    Ok(serde_json::json!({
        "kind": "role_research", "consent": true,
        "email": profile.email,
        "role": profile.role,
        "custom_role": if profile.role == "other" { profile.custom_role } else { String::new() },
        "applications": profile.applications
    }))
}

#[tauri::command(async)]
pub async fn share_role_profile(
    profile: crate::profile::UserProfile,
    consent: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let payload = role_payload(profile, consent)?;
    let url = {
        let inner = state
            .inner
            .lock()
            .map_err(|_| "Application state unavailable")?;
        endpoint(&inner.storage)?.ok_or("No private research service is connected")?
    };
    submit(&url, &payload, "confirmation_required").await
}

fn feedback_url(message: &str, reply_email: &str) -> Result<String, String> {
    if message.chars().count() > 2000
        || reply_email.len() > 254
        || reply_email.contains(['\r', '\n'])
    {
        return Err("Use up to 2,000 characters and a valid reply email".into());
    }
    // Encode every byte except unreserved URI characters. No caller-controlled recipient or headers.
    fn encode(value: &str) -> String {
        value
            .bytes()
            .map(|b| {
                if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
                    (b as char).to_string()
                } else {
                    format!("%{b:02X}")
                }
            })
            .collect()
    }
    let body = if reply_email.trim().is_empty() {
        message.to_owned()
    } else {
        format!("{message}\n\nReply email: {}", reply_email.trim())
    };
    Ok(format!(
        "mailto:artmarket.vm@gmail.com?subject=Desktop%20Buddy%20feedback&body={}",
        encode(&body)
    ))
}

#[tauri::command(async)]
pub fn open_feedback_draft(
    message: String,
    reply_email: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    app.opener()
        .open_url(feedback_url(&message, &reply_email)?, None::<&str>)
        .map_err(|_| {
            "No email app is configured. Copy your message and send it to artmarket.vm@gmail.com"
                .into()
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn research_requires_opt_in_and_never_exports_name_avatar_or_activity() {
        let profile = crate::profile::UserProfile {
            name: "Private name".into(),
            email: "person@example.com".into(),
            role: "other".into(),
            custom_role: "Parent".into(),
            applications: vec!["Canva".into()],
            privacy_accepted: true,
            ..Default::default()
        };
        assert!(role_payload(profile.clone(), false).is_err());
        let payload = role_payload(profile, true).unwrap();
        assert_eq!(payload["custom_role"], "Parent");
        assert_eq!(payload["applications"][0], "Canva");
        for field in [
            "name",
            "avatar",
            "goal",
            "activity",
            "privacy_notice_version",
        ] {
            assert!(payload.get(field).is_none());
        }
    }
    #[test]
    fn recipient_is_fixed_and_user_content_cannot_inject_mail_headers() {
        let url = feedback_url("Hi &bcc=other@example.com\nПривет", "me@example.com").unwrap();
        assert!(url.starts_with("mailto:artmarket.vm@gmail.com?subject="));
        assert!(!url.contains("&bcc="));
        assert!(url.contains("%26bcc%3D"));
        assert!(!url.contains('\n'));
        assert!(feedback_url("", "bad\r\nbcc:evil").is_err());
        assert!(feedback_url(&"x".repeat(2001), "").is_err());
    }
    #[test]
    fn endpoint_requires_tls_and_cannot_contain_provider_credentials() {
        for url in [
            "http://example.com",
            "https://key@example.com",
            "https://example.com?key=secret",
            "https://example.com#token",
        ] {
            assert!(validate_endpoint(url).is_err());
        }
        assert!(validate_endpoint("https://example.com/contact").is_ok());
    }
    #[tokio::test]
    async fn contact_posts_only_explicit_feedback_once_and_never_echoes_server_errors() {
        use wiremock::{
            matchers::{body_json, method},
            Mock, MockServer, ResponseTemplate,
        };
        let server = MockServer::start().await;
        let payload = serde_json::json!({"kind":"feedback", "message":"A wish", "reply_email":""});
        Mock::given(method("POST"))
            .and(body_json(payload.clone()))
            .respond_with(ResponseTemplate::new(503).set_body_string("private server error"))
            .expect(1)
            .mount(&server)
            .await;
        let error = submit(&server.uri(), &payload, "accepted")
            .await
            .unwrap_err();
        assert!(!error.contains("private server error"));
    }
}
