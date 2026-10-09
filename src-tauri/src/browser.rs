use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BrowserContext {
    pub browser: String,
    pub page_title: String,
    pub domain: Option<String>,
    pub source: String,
}

pub fn browser_name(process: &str) -> Option<&'static str> {
    match process.to_ascii_lowercase().as_str() {
        "chrome.exe" | "google chrome" | "brave browser" | "arc" => Some("chrome"),
        "msedge.exe" | "microsoft edge" => Some("edge"),
        "firefox.exe" | "firefox" => Some("firefox"),
        "safari" => Some("safari"),
        _ => None,
    }
}

/// The domain is the only address metadata retained. Paths, credentials, search
/// text, query strings and fragments never leave the provider.
pub fn sanitize_domain(address: &str) -> Option<String> {
    let address = address.trim();
    if address.len() > 4096 || address.chars().any(char::is_whitespace) {
        return None;
    }
    let candidate = if address.contains("://") {
        address.to_string()
    } else {
        format!("https://{address}")
    };
    let url = reqwest::Url::parse(&candidate).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    let host = url.host_str()?;
    if !host.contains('.') || host == "localhost" || host.parse::<std::net::IpAddr>().is_ok() {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

pub fn context(process: &str, title: &str, domain: Option<String>) -> Option<BrowserContext> {
    Some(BrowserContext {
        browser: browser_name(process)?.into(),
        page_title: minimize_title(title),
        source: if domain.is_some() {
            "address_bar"
        } else {
            "window_title"
        }
        .into(),
        domain,
    })
}

/// Browser titles can themselves contain an address (for example while a page
/// is loading). Replace recognizable address tokens with their hostname too.
pub fn minimize_title(title: &str) -> String {
    title
        .split_whitespace()
        .map(|token| {
            if token.contains("://")
                || (token.contains(['?', '#']) && sanitize_domain(token).is_some())
            {
                sanitize_domain(token).unwrap_or_else(|| "[address omitted]".into())
            } else {
                token.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(160)
        .collect()
}

/// A provider may return only metadata from the foreground browser chrome,
/// never document nodes. Unknown media playback is false, not a guessed video.
pub trait BrowserActivityProvider: Send {
    fn metadata(&mut self, window: usize, process: &str, title: &str) -> (Option<String>, bool);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn minimizes_urls_and_rejects_search_text_credentials_and_internal_pages() {
        assert_eq!(
            minimize_title("https://example.com/private?token=secret#account - Chrome"),
            "example.com - Chrome"
        );
        assert_eq!(
            sanitize_domain("https://EXAMPLE.com/private?token=secret#account"),
            Some("example.com".into())
        );
        assert_eq!(
            sanitize_domain("docs.example.com/path?q=secret"),
            Some("docs.example.com".into())
        );
        for value in [
            "find a password",
            "chrome://settings",
            "file:///private",
            "https://user:secret@example.com",
            "javascript:alert(1)",
            "localhost:3000",
            "127.0.0.1",
        ] {
            assert_eq!(sanitize_domain(value), None, "{value}");
        }
    }
}
