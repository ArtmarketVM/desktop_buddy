use super::*;
use crate::product_feedback::{FeedbackRepository, ProductFeedback};

fn profile(role: &str) -> UserProfile {
    UserProfile {
        name: " Developer ".into(),
        email: "dev@example.com".into(),
        role: role.into(),
        privacy_accepted: true,
        ..Default::default()
    }
}
fn store() -> Storage {
    Storage::open(std::path::Path::new(":memory:")).unwrap()
}

#[test]
fn all_presets_resolve_unique_apps_and_figma_is_design() {
    let config = presets().unwrap();
    assert_eq!(config.roles.len(), 8);
    for role in &config.roles {
        assert!(!role.name.is_empty());
        let unique: std::collections::BTreeSet<_> = role.applications.iter().collect();
        assert_eq!(unique.len(), role.applications.len());
        for process in &role.applications {
            assert!(config.applications.iter().any(|a| &a.process == process));
        }
    }
    let figma = config
        .applications
        .iter()
        .find(|a| a.process == "figma.exe")
        .unwrap();
    assert_eq!(figma.name, "Figma");
    assert_eq!(figma.group, "Design");
    assert_eq!(figma.category, Category::Work);
}
#[test]
fn identity_requires_email_notice_role_and_supported_avatar() {
    let mut p = profile("designer");
    validate_profile(&mut p, true).unwrap();
    assert_eq!(p.name, "Developer");
    assert_eq!(p.privacy_notice_version.as_deref(), Some("draft-v1"));
    for email in [
        "",
        "missing",
        "a@b",
        "a@@b.com",
        "a@.com",
        "a@b.",
        "a b@c.com",
    ] {
        let mut p = profile("designer");
        p.email = email.into();
        assert!(validate_profile(&mut p, true).is_err());
    }
    let mut p = profile("unknown");
    assert!(validate_profile(&mut p, true).is_err());
    p.role = "designer".into();
    p.privacy_accepted = false;
    assert!(validate_profile(&mut p, true).is_err());
    p.privacy_accepted = true;
    p.avatar.character = "unknown".into();
    assert!(validate_profile(&mut p, true).is_err());
    p.avatar.character = "dog".into();
    p.avatar.color = "red".into();
    assert!(validate_profile(&mut p, true).is_err());
}
#[test]
fn onboarding_cannot_skip_profile_or_create_duplicate_goals_and_restores_progress() {
    let mut s = store();
    assert!(s.user_settings().unwrap().autostart);
    assert!(s.create_onboarding_goal("Goal").is_err());
    let mut draft = OnboardingState {
        step: 2,
        ..Default::default()
    };
    assert!(s
        .save_onboarding(profile("designer"), draft.clone())
        .is_err());
    draft.step = 1;
    s.save_onboarding(profile("designer"), draft.clone())
        .unwrap();
    draft.step = 2;
    draft.goal_text = "Saved goal draft".into();
    s.save_onboarding(profile("designer"), draft).unwrap();
    assert_eq!(
        s.user_settings().unwrap().onboarding.goal_text,
        "Saved goal draft"
    );
    let g = s.create_onboarding_goal("Design prototype").unwrap();
    let again = s.create_onboarding_goal("Retry").unwrap();
    assert_eq!(g.id, again.id);
    let state = s.user_settings().unwrap();
    assert_eq!(state.onboarding.step, 3);
    assert!(!state.onboarding.completed);
    assert!(!state.onboarding.tracking_consent);
    assert_eq!(s.category(g.id, "figma.exe").unwrap(), Some(Category::Work));
    assert_eq!(
        s.connection
            .query_row("SELECT COUNT(*) FROM goals", [], |r| r.get::<_, u64>(0))
            .unwrap(),
        1
    );
}
#[test]
fn role_defaults_apply_to_new_goals_without_overwriting_manual_rules() {
    let mut s = store();
    let mut settings = UserSettings {
        profile: profile("designer"),
        ..Default::default()
    };
    s.write_setting("user_settings", &settings).unwrap();
    let first = s.set_goal("Design").unwrap();
    assert_eq!(
        s.category(first.id, "figma.exe").unwrap(),
        Some(Category::Work)
    );
    s.save_app_rule(first.id, "figma.exe", Some(Category::Neutral))
        .unwrap();
    s.save_app_rule(first.id, "chrome.exe", None).unwrap();
    settings.profile.role = "software_engineer".into();
    s.write_setting("user_settings", &settings).unwrap();
    s.apply_role(first.id).unwrap();
    assert_eq!(
        s.category(first.id, "figma.exe").unwrap(),
        Some(Category::Neutral)
    );
    assert_eq!(
        s.category(first.id, "code.exe").unwrap(),
        Some(Category::Work)
    );
    assert!(s.category(first.id, "photoshop.exe").unwrap().is_none());
    assert!(s.category(first.id, "chrome.exe").unwrap().is_none());
    let second = s.set_goal("Code").unwrap();
    assert_eq!(
        s.category(second.id, "code.exe").unwrap(),
        Some(Category::Work)
    );
    assert!(s.category(second.id, "figma.exe").unwrap().is_none());
}
#[test]
fn settings_and_onboarding_survive_database_reopening_without_affecting_goals() {
    let path = std::env::temp_dir().join(format!(
        "buddy-profile-{}-{}.db",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap()
    ));
    let id;
    {
        let mut s = Storage::open(&path).unwrap();
        let old = s.set_goal("Existing").unwrap();
        let mut p = profile("operations");
        p.avatar.character = "seal".into();
        p.avatar.visible = false;
        let draft = OnboardingState {
            step: 1,
            ..Default::default()
        };
        s.save_onboarding(p.clone(), draft.clone()).unwrap();
        let draft = OnboardingState {
            step: 2,
            goal_text: "New goal".into(),
            ..draft
        };
        s.save_onboarding(p, draft).unwrap();
        let goal = s.create_onboarding_goal("New goal").unwrap();
        id = goal.id;
        assert_eq!(s.saved_goals().unwrap()[0].id, old.id);
    }
    {
        let s = Storage::open(&path).unwrap();
        let state = s.user_settings().unwrap();
        assert_eq!(state.onboarding.goal_id, Some(id));
        assert_eq!(state.profile.avatar.character, "seal");
        assert!(!state.profile.avatar.visible);
        assert_eq!(s.goal().unwrap().unwrap().id, id);
        s.initialize_profile().unwrap();
    }
    let _ = std::fs::remove_file(path);
}
#[test]
fn feedback_validates_goal_and_stays_local_with_retention_support() {
    let mut s = store();
    let goal = s.set_goal("Goal").unwrap();
    let feedback = ProductFeedback {
        goal_id: Some(goal.id),
        rating: 5,
        text: " Helpful ".into(),
        source: "goal_completed".into(),
    };
    assert!(s.save_product_feedback(feedback.clone()).is_err());
    s.transition_goal(goal.id, "complete").unwrap();
    s.save_product_feedback(feedback.clone()).unwrap();
    let mut bad = feedback;
    bad.rating = 0;
    assert!(s.save_product_feedback(bad).is_err());
    s.save_product_feedback(ProductFeedback {
        goal_id: None,
        rating: 4,
        text: String::new(),
        source: "settings".into(),
    })
    .unwrap();
    assert_eq!(
        s.connection
            .query_row("SELECT COUNT(*) FROM product_feedback", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        2
    );
    s.purge_history(None).unwrap();
    assert_eq!(
        s.connection
            .query_row("SELECT COUNT(*) FROM product_feedback", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        0
    );
}
