use super::*;
use crate::{commands::Inner, insights::Category, storage::Storage};
#[derive(Serialize, Deserialize)]
struct ExplicitFocus {
    goal_id: i64,
    created_at: String,
}
impl Storage {
    pub fn mark_explicit_focus(&self, id: i64) -> Result<(), String> {
        let goal = self
            .core_snapshot(None)?
            .goals
            .into_iter()
            .find(|g| g.id == id && g.status == "open")
            .ok_or("Choose an open goal")?;
        self.write_setting(
            "explicit_focus_goal",
            &Some(ExplicitFocus {
                goal_id: id,
                created_at: goal.created_at,
            }),
        )
    }
    pub fn explicit_focus(&self) -> Result<Option<i64>, String> {
        let saved: Option<ExplicitFocus> = self.read_setting("explicit_focus_goal")?.flatten();
        let Some(saved) = saved else { return Ok(None) };
        let current = self.goal()?;
        let valid = current.as_ref().is_some_and(|g| g.id == saved.goal_id)
            && self.core_snapshot(None)?.goals.iter().any(|g| {
                g.id == saved.goal_id && g.created_at == saved.created_at && g.status == "open"
            });
        if valid {
            Ok(Some(saved.goal_id))
        } else {
            self.write_setting("explicit_focus_goal", &Option::<ExplicitFocus>::None)?;
            Ok(None)
        }
    }
}
pub(super) struct Resolution {
    pub view: MatchView,
    pub signature: String,
}
fn view(id: Option<i64>, confidence: f64, source: &str, reason: &str) -> MatchView {
    MatchView {
        goal_id: id,
        confidence: Some(confidence),
        source: Some(source.into()),
        reason: Some(reason.into()),
        enabled: true,
    }
}
fn usable_context(c: &crate::memory::WorkContext, sample: &ActivitySnapshot) -> bool {
    let fresh = chrono::DateTime::parse_from_rfc3339(&c.updated_at).is_ok_and(|at| {
        let age = chrono::Utc::now().signed_duration_since(at).num_seconds();
        (0..=7200).contains(&age)
    });
    fresh
        && c.resumed_at.is_some()
        && matches!(
            c.context.status,
            crate::memory::ContextStatus::Active | crate::memory::ContextStatus::Waiting
        )
        && c.context
            .last_app
            .as_ref()
            .is_some_and(|app| app.eq_ignore_ascii_case(&sample.process_name))
}
pub(super) fn resolve(inner: &Inner, sample: &ActivitySnapshot) -> Result<Resolution, String> {
    let snapshot = inner.storage.core_snapshot(None)?;
    let explicit = inner.storage.explicit_focus()?;
    let remember = inner.storage.memory_controls()?.remember_work_context
        && inner.storage.memory_controls()?.enabled;
    let mut local = Vec::new();
    let mut rules = Vec::new();
    let mut contexts = Vec::new();
    let mut metadata = Vec::new();
    for goal in snapshot.goals.iter().filter(|g| g.status == "open") {
        let category = inner.storage.category(goal.id, &sample.process_name)?;
        let user_work = inner.storage.app_rules(goal.id)?.iter().any(|r| {
            r.process_name.eq_ignore_ascii_case(&sample.process_name)
                && r.category == Category::Work
                && r.preset_source.is_none()
        });
        let context = if remember {
            inner.storage.work_context(goal.id)?
        } else {
            None
        };
        metadata.push(json!({"id":goal.id,"created_at":goal.created_at,"title":goal.title,"description":goal.description,"plan":goal.plan,"category":category,"user_work":user_work,"context":context.as_ref().filter(|c|usable_context(c,sample)).map(|c|json!({"updated_at":c.updated_at,"status":c.context.status,"last_app":c.context.last_app,"summary":c.context.summary,"next_action":c.context.next_action,"resumed_at":c.resumed_at}))}));
        if category == Some(Category::Distraction) {
            continue;
        }
        if user_work {
            rules.push(goal.id)
        }
        local.push((
            goal.id,
            format!(
                "{} {} {}",
                goal.title,
                goal.description,
                goal.plan
                    .steps
                    .iter()
                    .filter(|s| !s.done)
                    .map(|s| s.text.as_str())
                    .collect::<Vec<_>>()
                    .join(" ")
            ),
            false,
        ));
        if let Some(c) = context {
            if usable_context(&c, sample) {
                contexts.push((
                    goal.id,
                    format!(
                        "{} {}",
                        c.context.summary,
                        c.context.next_action.as_deref().unwrap_or_default()
                    ),
                    true,
                ));
            }
        }
    }
    let signature = crate::companion::engine::fingerprint(
        &json!({"goals":metadata,"explicit":explicit,"remember":remember,"privacy_revision":inner.privacy_revision}).to_string(),
    );
    let selected = if let Some(id) = explicit {
        view(
            Some(id),
            1.,
            "explicit_focus",
            "User explicitly selected this goal; focus alone is not completion evidence",
        )
    } else if rules.len() == 1 {
        view(
            Some(rules[0]),
            0.95,
            "user_rule",
            "A unique user app rule selects this goal",
        )
    } else {
        let matched = crate::relevance::classify(&local, sample);
        if let Some(id) = matched.goal_id.and_then(|id| id.parse().ok()) {
            view(
                Some(id),
                matched.confidence,
                "local_keywords",
                &matched.reason,
            )
        } else {
            // Checkpoints disambiguate only plausible keyword candidates, or a unique recent app lane.
            let plausible: Vec<_> = local
                .iter()
                .filter(|candidate| {
                    crate::relevance::classify(&[(*candidate).clone()], sample)
                        .goal_id
                        .is_some()
                })
                .map(|c| c.0)
                .collect();
            contexts.retain(|c| plausible.is_empty() || plausible.contains(&c.0));
            let remembered = crate::relevance::classify(&contexts, sample);
            if let Some(id) = remembered.goal_id.and_then(|id| id.parse().ok()) {
                view(
                    Some(id),
                    remembered.confidence,
                    "work_context",
                    "A recent resumed checkpoint supports this app/context",
                )
            } else if plausible.len() > 1 || rules.len() > 1 || contexts.len() > 1 {
                view(
                    None,
                    0.,
                    "ambiguous",
                    "Several active lanes are plausible; waiting for stable context",
                )
            } else {
                view(
                    None,
                    0.,
                    "unknown",
                    "No direct evidence identifies an active lane",
                )
            }
        }
    };
    Ok(Resolution {
        view: selected,
        signature,
    })
}
