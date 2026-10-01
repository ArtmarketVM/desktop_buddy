use crate::{commands::AppState, storage::Storage};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Clone, Serialize, Deserialize)]
pub struct ProductFeedback {
    pub goal_id: Option<i64>,
    pub rating: u8,
    pub text: String,
    pub source: String,
}
/// Local repository today; a future consented service or voice payload can
/// implement a separate repository without changing the UI entry points.
pub trait FeedbackRepository {
    fn save_product_feedback(&self, feedback: ProductFeedback) -> Result<(), String>;
}
impl FeedbackRepository for Storage {
    fn save_product_feedback(&self, mut feedback: ProductFeedback) -> Result<(), String> {
        feedback.text = feedback.text.trim().into();
        if !(1..=5).contains(&feedback.rating)
            || feedback.text.chars().count() > 2000
            || !["settings", "goal_completed"].contains(&feedback.source.as_str())
        {
            return Err("Choose 1–5 stars and use at most 2000 text characters".into());
        }
        if feedback.source == "goal_completed" {
            let Some(goal) = feedback.goal_id else {
                return Err("Choose a completed goal".into());
            };
            let status: Option<String> = self
                .connection
                .query_row("SELECT status FROM goals WHERE id=?1", [goal], |r| r.get(0))
                .optional()
                .map_err(|e| e.to_string())?;
            if status.as_deref() != Some("completed") {
                return Err("Feedback requires a completed goal".into());
            }
        } else {
            feedback.goal_id = None;
        }
        self.connection.execute("INSERT INTO product_feedback(goal_id,rating,text,source,input_kind,created_at) VALUES(?1,?2,?3,?4,'text',?5)",params![feedback.goal_id,feedback.rating,feedback.text,feedback.source,chrono::Utc::now().to_rfc3339()]).map_err(|e|e.to_string())?;
        Ok(())
    }
}
#[tauri::command(async)]
pub fn save_product_feedback(
    feedback: ProductFeedback,
    state: State<AppState>,
) -> Result<(), String> {
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .save_product_feedback(feedback)
}
