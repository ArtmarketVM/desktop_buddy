use crate::{models::SearchResult, storage::Storage};
use rusqlite::params;
use serde_json::{json, Value};
use std::collections::HashSet;

/// Identity only: keep the original destination, including functional query parameters.
pub fn resource_key(value: &str) -> Option<String> {
    let mut url = reqwest::Url::parse(value).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    url.set_fragment(None);
    let pairs: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| {
            let key = key.to_ascii_lowercase();
            !key.starts_with("utm_") && !["gclid", "fbclid", "msclkid"].contains(&key.as_str())
        })
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    url.set_query(None);
    if !pairs.is_empty() {
        url.query_pairs_mut().extend_pairs(pairs);
    }
    Some(url.to_string())
}

pub fn fresh_candidates(results: Vec<SearchResult>, seen: HashSet<String>) -> Vec<SearchResult> {
    let mut seen = seen;
    results
        .into_iter()
        .filter(|r| {
            !r.title.trim().is_empty() && resource_key(&r.url).is_some_and(|key| seen.insert(key))
        })
        .take(5)
        .collect()
}

impl Storage {
    /// Query this goal directly: another goal's latest 100 rows must not hide its feedback.
    pub fn recommendation_memory(&self, goal: i64) -> Result<Value, String> {
        let mut q=self.connection.prepare("SELECT title,feedback FROM recommendation_history WHERE goal_id=?1 AND feedback IS NOT NULL ORDER BY id DESC LIMIT 10").map_err(|e|e.to_string())?;
        let ratings=q.query_map([goal],|r|Ok((r.get::<_,String>(0)?,r.get::<_,bool>(1)?))).map_err(|e|e.to_string())?
            .map(|r|r.map(|(title,helpful)|json!({"title":title.chars().take(180).collect::<String>(),"helpful":helpful}))).collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        let mut q=self.connection.prepare("SELECT title FROM recommendation_history WHERE goal_id=?1 ORDER BY id DESC LIMIT 10").map_err(|e|e.to_string())?;
        let offered = q
            .query_map([goal], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .map(|r| r.map(|title| title.chars().take(180).collect::<String>()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(json!({"ratings":ratings,"recently_offered_titles":offered}))
    }
    pub fn seen_resource_keys(&self, goal: i64) -> Result<HashSet<String>, String> {
        let mut q=self.connection.prepare("SELECT url FROM suggestions WHERE goal_id=?1 UNION SELECT url FROM recommendation_history WHERE goal_id=?1").map_err(|e|e.to_string())?;
        let rows = q
            .query_map(params![goal], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut keys = HashSet::new();
        for row in rows {
            if let Some(key) = resource_key(&row.map_err(|e| e.to_string())?) {
                keys.insert(key);
            }
        }
        Ok(keys)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn result(url: &str) -> SearchResult {
        SearchResult {
            title: "Guide".into(),
            url: url.into(),
            content: "Practical steps".into(),
        }
    }
    #[test]
    fn identity_removes_only_known_tracking_and_fragments() {
        assert_eq!(
            resource_key("https://EXAMPLE.com/guide?id=7&utm_source=mail&fbclid=x#intro"),
            resource_key("https://example.com/guide?id=7")
        );
        assert_ne!(
            resource_key("https://example.com/guide?id=7"),
            resource_key("https://example.com/guide?id=8")
        );
        assert_ne!(
            resource_key("https://example.com/guide?lang=en"),
            resource_key("https://example.com/guide?lang=fr")
        );
        for url in [
            "javascript:alert(1)",
            "https://user:secret@example.com",
            "file:///tmp/x",
            "invalid",
        ] {
            assert!(resource_key(url).is_none());
        }
    }
    #[test]
    fn deduplicates_history_and_current_batch_without_rewriting_destinations() {
        let seen = HashSet::from([resource_key("https://example.com/old").unwrap()]);
        let fresh = fresh_candidates(
            vec![
                result("https://example.com/old?utm_medium=email"),
                result("https://example.com/new?utm_source=search"),
                result("https://example.com/new#part"),
                result("https://example.com/new?id=2"),
            ],
            seen,
        );
        assert_eq!(fresh.len(), 2);
        assert_eq!(fresh[0].url, "https://example.com/new?utm_source=search");
    }
    #[test]
    fn feedback_is_goal_scoped_bounded_and_not_hidden_by_other_goals() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let first = s.set_goal("First").unwrap();
        for n in 0..12 {
            let id = s
                .record_recommendation(
                    first.id,
                    &format!("Guide {n}"),
                    &format!("https://example.com/{n}"),
                    "Reason",
                )
                .unwrap();
            s.rate_recommendation(id, Some(n % 2 == 0)).unwrap();
        }
        let other = s.set_goal("Other").unwrap();
        for n in 0..101 {
            s.record_recommendation(
                other.id,
                "Other secret title",
                &format!("https://other.example/{n}"),
                "Reason",
            )
            .unwrap();
        }
        let memory = s.recommendation_memory(first.id).unwrap();
        assert_eq!(memory["ratings"].as_array().unwrap().len(), 10);
        assert_eq!(
            memory["recently_offered_titles"].as_array().unwrap().len(),
            10
        );
        assert_eq!(memory["ratings"][0]["title"], "Guide 11");
        assert_eq!(memory["ratings"][0]["helpful"], false);
        assert!(!memory.to_string().contains("Other secret"));
        assert!(!memory.to_string().contains("https://"));
        assert_eq!(s.seen_resource_keys(first.id).unwrap().len(), 12);
        s.purge_history(None).unwrap();
        assert!(s.seen_resource_keys(first.id).unwrap().is_empty());
    }
    #[test]
    fn legacy_urls_are_matched_without_migrating_or_erasing_history() {
        let mut s = Storage::open(std::path::Path::new(":memory:")).unwrap();
        let g = s.set_goal("Goal").unwrap();
        s.save_suggestion(g.id, "https://example.com/a?utm_source=old#part")
            .unwrap();
        assert!(fresh_candidates(
            vec![result("https://example.com/a")],
            s.seen_resource_keys(g.id).unwrap()
        )
        .is_empty());
    }
}
