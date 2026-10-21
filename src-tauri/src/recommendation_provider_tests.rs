use super::*;
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
