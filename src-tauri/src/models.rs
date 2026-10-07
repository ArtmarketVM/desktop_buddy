use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ActivitySnapshot {
    pub timestamp: String,
    pub process_name: String,
    pub window_title: String,
    pub idle_seconds: u64,
    pub active_seconds: u64,
    #[serde(default)]
    pub window_id: Option<u64>,
    #[serde(default)]
    pub browser: Option<crate::browser::BrowserContext>,
    #[serde(default)]
    pub media_playing: bool,
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
    pub tracking_error: Option<String>,
    pub ai_enabled: bool,
    pub dnd: bool,
    pub demo: bool,
    pub mock_ai: bool,
    pub nebius_configured: bool,
    pub tavily_configured: bool,
}
#[derive(Serialize)]
pub struct Dashboard {
    pub goal_matching: crate::goal_matching::MatchView,
    pub user_settings: crate::profile::UserSettings,
    pub app_rules: Vec<crate::insights::AppRule>,
    pub today: crate::insights::Today,
    pub goal_plan: Option<crate::goals::GoalPlan>,
    pub saved_goals: Vec<crate::goals::SavedGoal>,
    pub retention_days: u32,
    pub recommendations: Vec<Recommendation>,
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
    pub local_nudges: bool,
    pub daily_nudge_limit: u32,
    pub nudge_interval_minutes: u32,
    pub suggestions_only: bool,
    pub proactive: bool,
    pub interval_minutes: u32,
    pub suppress_fullscreen: bool,
    pub suppress_meetings: bool,
    pub wait_for_input_pause: bool,
    pub excluded_apps: Vec<String>,
}
impl Default for BuddyPreferences {
    fn default() -> Self {
        Self {
            local_nudges: false,
            daily_nudge_limit: 8,
            nudge_interval_minutes: 15,
            suggestions_only: false,
            proactive: false,
            interval_minutes: 15,
            suppress_fullscreen: true,
            suppress_meetings: true,
            wait_for_input_pause: true,
            excluded_apps: vec![],
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Suggestion {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub reason: String,
}
#[derive(Clone, Serialize)]
pub struct BuddyView {
    pub companion: crate::companion::View,
    pub avatar: crate::profile::AvatarPreferences,
    pub activity_state: crate::tracking::ActivityState,
    pub activity_event: crate::tracking::ActivityEvent,
    pub activity_revision: u64,
    pub preferences: BuddyPreferences,
    pub suggestion: Option<Suggestion>,
    pub decision: Option<Decision>,
    pub snoozed_until: Option<i64>,
    pub quiet_reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BuddyPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Recommendation {
    pub id: i64,
    pub goal_id: i64,
    pub goal: String,
    pub title: String,
    pub url: String,
    pub reason: String,
    pub created_at: String,
    pub feedback: Option<bool>,
}
