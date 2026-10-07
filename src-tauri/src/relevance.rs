use crate::{models::ActivitySnapshot, storage::Storage};
use rusqlite::params;
use serde::Serialize;
use std::collections::HashSet;
use tauri::State;

pub const THRESHOLD: f64 = 0.7;
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityMatch {
    pub goal_id: Option<String>,
    pub confidence: f64,
    pub reason: String,
}
fn tokens(text: &str) -> HashSet<String> {
    let stop = [
        "create",
        "finish",
        "complete",
        "review",
        "work",
        "with",
        "this",
        "that",
        "from",
        "have",
        "make",
        "plan",
        "draft",
        "goal",
        "step",
        "write",
        "page",
        "document",
        "browser",
        "chrome",
        "edge",
        "firefox",
        "today",
        "task",
        "edit",
        "update",
        "prepare",
        "check",
        "the",
        "and",
        "for",
        "into",
        "about",
        "сделать",
        "работа",
        "создать",
        "написать",
        "задача",
    ];
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| word.chars().count() >= 4 && !stop.contains(word))
        .map(str::to_string)
        .collect()
}
/// Conservative local evidence; neither app presets nor elapsed time prove relevance.
pub fn classify(candidates: &[(i64, String, bool)], activity: &ActivitySnapshot) -> ActivityMatch {
    let context = format!(
        "{} {}",
        activity.window_title,
        activity
            .browser
            .as_ref()
            .map(|b| format!(
                "{} {}",
                b.page_title,
                b.domain.as_deref().unwrap_or_default()
            ))
            .unwrap_or_default()
    );
    let observed = tokens(&context);
    let mut scores: Vec<_> = candidates
        .iter()
        .filter_map(|(id, title, explicit_work)| {
            let overlap: Vec<_> = tokens(title).intersection(&observed).cloned().collect();
            let score = if overlap.len() >= 2 {
                0.9
            } else if overlap.iter().any(|t| t.chars().count() >= 6) {
                0.75
            } else if *explicit_work {
                0.72
            } else {
                0.0
            };
            (score >= THRESHOLD).then_some((
                *id,
                score,
                if overlap.is_empty() {
                    "App explicitly marked as work for this goal"
                } else {
                    "Goal terms match the visible window or page title"
                },
            ))
        })
        .collect();
    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    if let Some(best) = scores.first() {
        if scores.get(1).is_none_or(|next| best.1 - next.1 >= 0.1) {
            return ActivityMatch {
                goal_id: Some(best.0.to_string()),
                confidence: best.1,
                reason: best.2.into(),
            };
        }
    }
    ActivityMatch {
        goal_id: None,
        confidence: 0.0,
        reason: "Insufficient or ambiguous evidence; observed time is not goal progress".into(),
    }
}
impl Storage {
    pub fn match_activity(&self, activity: &ActivitySnapshot) -> Result<ActivityMatch, String> {
        let day = chrono::Local::now().date_naive().to_string();
        let mut query=self.connection.prepare("SELECT g.id,g.text,COALESCE(m.description,'') FROM goals g JOIN core_goals c ON c.goal_id=g.id JOIN core_day_items d ON d.goal_id=g.id LEFT JOIN core_goal_details m ON m.goal_id=g.id WHERE d.day=?1 AND c.state='open' AND g.status!='completed' ORDER BY d.rowid").map_err(|_| "Today goals unavailable")?;
        let rows = query
            .query_map([day], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(|_| "Today goals unavailable")?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Today goals unavailable")?;
        let mut candidates = vec![];
        for (id, title, description) in rows {
            if self.category(id, &activity.process_name.to_ascii_lowercase())?
                == Some(crate::insights::Category::Distraction)
            {
                continue;
            }
            let explicit = self.app_rules(id)?.iter().any(|r| {
                r.process_name.eq_ignore_ascii_case(&activity.process_name)
                    && r.category == crate::insights::Category::Work
                    && r.preset_source.is_none()
            });
            let plan = self.goal_plan(id)?;
            let context = format!(
                "{} {} {}",
                title,
                description,
                plan.steps
                    .iter()
                    .filter(|s| !s.done)
                    .map(|s| s.text.as_str())
                    .collect::<Vec<_>>()
                    .join(" ")
            );
            candidates.push((id, context, explicit));
        }
        Ok(classify(&candidates, activity))
    }
    pub fn relevant_seconds(&self, id: i64, day: Option<&str>) -> Result<u64, String> {
        self.connection.query_row("SELECT COALESCE(SUM(milliseconds),0)/1000 FROM goal_relevant_daily WHERE goal_id=?1 AND (?2 IS NULL OR day=?2)",params![id,day],|r|r.get(0)).map_err(|_| "Goal progress unavailable".into())
    }
    pub fn goal_progress(&self, id: i64) -> Result<GoalProgress, String> {
        self.goal_plan(id)?;
        let mut query = self.connection.prepare("SELECT process_name,domain,COALESCE(page_title,window_title,''),SUM(milliseconds) FROM usage_intervals WHERE goal_id=?1 AND match_confidence>=0.7 AND state='\"focused\"' GROUP BY process_name,domain,COALESCE(page_title,window_title,'') ORDER BY SUM(milliseconds) DESC").map_err(|_| "Activity history unavailable")?;
        let activities = query
            .query_map([id], |r| {
                let app: String = r.get(0)?;
                let domain: Option<String> = r.get(1)?;
                let title: String = r.get(2)?;
                Ok(ProgressActivity {
                    kind: if domain.is_some() {
                        "browser"
                    } else if !title.is_empty() {
                        "document"
                    } else {
                        "app"
                    }
                    .into(),
                    title: format!(
                        "{}{} · {}",
                        title,
                        domain.map(|d| format!(" ({d})")).unwrap_or_default(),
                        app
                    ),
                    duration_minutes: r.get::<_, u64>(3)? as f64 / 60000.,
                })
            })
            .map_err(|_| "Activity history unavailable")?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Activity history unavailable")?;
        Ok(GoalProgress {
            goal_id: id.to_string(),
            active_minutes: self.relevant_seconds(id, None)? as f64 / 60.,
            activities,
        })
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalProgress {
    pub goal_id: String,
    pub active_minutes: f64,
    pub activities: Vec<ProgressActivity>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressActivity {
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub duration_minutes: f64,
}
#[tauri::command(async)]
pub fn get_goal_progress(
    goal_id: i64,
    state: State<crate::commands::AppState>,
) -> Result<GoalProgress, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .goal_progress(goal_id)
}
#[cfg(test)]
#[path = "relevance_tests.rs"]
mod persistence_tests;
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matching_is_conservative_and_rejects_ties() {
        let activity = ActivitySnapshot {
            window_title: "Buddy onboarding · Visual Studio Code".into(),
            ..Default::default()
        };
        assert_eq!(
            classify(&[(1, "Build Buddy onboarding".into(), false)], &activity)
                .goal_id
                .as_deref(),
            Some("1")
        );
        assert!(classify(
            &[
                (1, "Build Buddy onboarding".into(), false),
                (2, "Review Buddy onboarding".into(), false)
            ],
            &activity
        )
        .goal_id
        .is_none());
        assert!(
            classify(&[(1, "Write a document".into(), false)], &activity)
                .goal_id
                .is_none()
        );
        assert_eq!(
            classify(&[(1, "Offline task".into(), true)], &activity)
                .goal_id
                .as_deref(),
            Some("1")
        );
    }
}
