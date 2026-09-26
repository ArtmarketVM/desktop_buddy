use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivitySnapshot {
    pub timestamp: String,
    pub process_name: String,
    pub window_title: String,
    pub idle_seconds: u64,
    pub active_seconds: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goal {
    pub id: i64,
    pub text: String,
    pub created_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FocusState {
    Focused,
    Drifting,
    Stuck,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Intervene,
    Wait,
    OfferHelp,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Decision {
    #[serde(default)]
    pub id: Option<i64>,
    pub state: FocusState,
    pub confidence: f64,
    pub reason: String,
    pub action: Action,
}
impl Decision {
    pub fn validate(self) -> Result<Self, String> {
        if !self.confidence.is_finite()
            || !(0.0..=1.0).contains(&self.confidence)
            || self.reason.trim().is_empty()
            || self.reason.len() > 2000
        {
            return Err("Invalid focus decision fields".into());
        }
        Ok(Self { id: None, ..self })
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
}
#[derive(Clone, Serialize)]
pub struct Status {
    pub tracking: bool,
    pub ai_enabled: bool,
    pub dnd: bool,
    pub demo: bool,
    pub mock_ai: bool,
    pub nebius_configured: bool,
    pub tavily_configured: bool,
}
#[derive(Serialize)]
pub struct Dashboard {
    pub version: &'static str,
    pub buddy: BuddyView,
    pub goal: Option<Goal>,
    pub activity: Vec<ActivitySnapshot>,
    pub decision: Option<Decision>,
    pub status: Status,
    pub last_error: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BuddyPreferences {
    pub suggestions_only: bool,
    pub proactive: bool,
}
impl Default for BuddyPreferences {
    fn default() -> Self {
        Self {
            suggestions_only: true,
            proactive: false,
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Suggestion {
    pub title: String,
    pub url: String,
    pub reason: String,
}
#[derive(Clone, Serialize)]
pub struct BuddyView {
    pub preferences: BuddyPreferences,
    pub suggestion: Option<Suggestion>,
    pub decision: Option<Decision>,
}
