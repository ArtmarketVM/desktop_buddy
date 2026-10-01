use crate::{commands::AppState, insights::Category, models::Goal, storage::Storage};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct AvatarPreferences {
    pub character: String,
    pub color: String,
    pub visible: bool,
}
impl Default for AvatarPreferences {
    fn default() -> Self {
        Self {
            character: "cat".into(),
            color: "#9BB784".into(),
            visible: true,
        }
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct UserProfile {
    pub name: String,
    pub email: String,
    pub role: String,
    pub privacy_accepted: bool,
    pub privacy_notice_version: Option<String>,
    pub avatar: AvatarPreferences,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct OnboardingState {
    pub step: u8,
    pub goal_text: String,
    pub goal_id: Option<i64>,
    pub completed: bool,
    pub tracking_consent: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct UserSettings {
    pub profile: UserProfile,
    pub onboarding: OnboardingState,
    pub autostart: bool,
}
impl Default for UserSettings {
    fn default() -> Self {
        Self {
            profile: Default::default(),
            onboarding: Default::default(),
            autostart: true,
        }
    }
}
#[derive(Deserialize)]
pub struct ApplicationPreset {
    pub process: String,
    pub name: String,
    pub group: String,
    pub category: Category,
}
#[derive(Deserialize)]
pub struct RolePreset {
    pub id: String,
    pub name: String,
    pub applications: Vec<String>,
}
#[derive(Deserialize)]
pub struct PresetConfig {
    pub version: u32,
    pub applications: Vec<ApplicationPreset>,
    pub roles: Vec<RolePreset>,
}
pub fn presets() -> Result<PresetConfig, String> {
    let config: PresetConfig =
        serde_json::from_str(include_str!("../../src/data/rolePresets.json"))
            .map_err(|_| "Invalid role presets")?;
    if config.version != 1
        || config.roles.iter().any(|r| r.name.is_empty())
        || config
            .applications
            .iter()
            .any(|a| a.name.is_empty() || a.group.is_empty())
    {
        return Err("Invalid role preset metadata".into());
    }
    Ok(config)
}
pub fn validate_profile(profile: &mut UserProfile, require_identity: bool) -> Result<(), String> {
    profile.name = profile.name.trim().into();
    profile.email = profile.email.trim().into();
    if !["cat", "dog", "seal", "bird"].contains(&profile.avatar.character.as_str())
        || profile.avatar.color.len() != 7
        || !profile.avatar.color.starts_with('#')
        || !profile.avatar.color[1..]
            .bytes()
            .all(|b| b.is_ascii_hexdigit())
    {
        return Err("Choose a supported character and a hex color".into());
    }
    if profile.name.chars().count() > 120 || profile.name.chars().any(char::is_control) {
        return Err("Use at most 120 characters for your name".into());
    }
    if require_identity {
        let parts: Vec<_> = profile.email.split('@').collect();
        if profile.name.is_empty()
            || profile.email.len() > 254
            || parts.len() != 2
            || parts[0].is_empty()
            || !parts[1].contains('.')
            || parts[1].starts_with('.')
            || parts[1].ends_with('.')
            || profile
                .email
                .chars()
                .any(|c| c.is_whitespace() || c.is_control())
        {
            return Err("Enter your name and a valid email address".into());
        }
        if !profile.privacy_accepted {
            return Err(
                "Read and acknowledge the draft privacy notice before saving your profile".into(),
            );
        }
        if !presets()?.roles.iter().any(|r| r.id == profile.role) {
            return Err("Choose a professional role".into());
        }
        profile.privacy_notice_version = Some("draft-v1".into());
    } else if !profile.email.is_empty() && !profile.privacy_accepted {
        return Err("Acknowledge the draft privacy notice before saving an email".into());
    }
    Ok(())
}

impl Storage {
    pub(crate) fn initialize_profile(&self) -> Result<(), String> {
        let mut q = self
            .connection
            .prepare("PRAGMA table_info(app_rules)")
            .map_err(|e| e.to_string())?;
        let columns = q
            .query_map([], |r| r.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        if !columns.iter().any(|c| c == "preset_source") {
            self.connection
                .execute("ALTER TABLE app_rules ADD COLUMN preset_source TEXT", [])
                .map_err(|e| e.to_string())?;
        }
        self.connection.execute_batch("CREATE TABLE IF NOT EXISTS product_feedback(id INTEGER PRIMARY KEY,goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),text TEXT NOT NULL,source TEXT NOT NULL,input_kind TEXT NOT NULL DEFAULT 'text',created_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS preset_exclusions(goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,process_name TEXT NOT NULL,PRIMARY KEY(goal_id,process_name));").map_err(|e|e.to_string())
    }
    pub fn user_settings(&self) -> Result<UserSettings, String> {
        Ok(self.read_setting("user_settings")?.unwrap_or_default())
    }
    pub fn apply_role(&self, goal: i64) -> Result<(), String> {
        let role = self.user_settings()?.profile.role;
        let config = presets()?;
        let Some(preset) = config.roles.iter().find(|r| r.id == role) else {
            return Ok(());
        };
        let tx = self
            .connection
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM app_rules WHERE goal_id=?1 AND preset_source='role'",
            [goal],
        )
        .map_err(|e| e.to_string())?;
        for process in &preset.applications {
            let app = config
                .applications
                .iter()
                .find(|a| &a.process == process)
                .ok_or("Role references an unknown application")?;
            tx.execute("INSERT OR IGNORE INTO app_rules(goal_id,process_name,category,preset_source) SELECT ?1,?2,?3,'role' WHERE NOT EXISTS(SELECT 1 FROM preset_exclusions WHERE goal_id=?1 AND process_name=?2)",params![goal,process,serde_json::to_string(&app.category).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn save_onboarding(
        &mut self,
        mut profile: UserProfile,
        mut draft: OnboardingState,
    ) -> Result<UserSettings, String> {
        let mut saved = self.user_settings()?;
        if saved.onboarding.completed {
            return Err("Onboarding is already complete; use Settings".into());
        }
        if draft.step > 2
            || draft.step > saved.onboarding.step.saturating_add(1)
            || draft.goal_text.chars().count() > 500
        {
            return Err("Invalid onboarding progress".into());
        }
        validate_profile(&mut profile, draft.step >= 2)?;
        draft.goal_id = saved.onboarding.goal_id;
        draft.completed = false;
        draft.tracking_consent = false;
        saved.profile = profile;
        saved.onboarding = draft;
        self.write_setting("user_settings", &saved)?;
        Ok(saved)
    }
    pub fn create_onboarding_goal(&mut self, text: &str) -> Result<Goal, String> {
        let mut settings = self.user_settings()?;
        if settings.onboarding.step == 3 && !settings.onboarding.completed {
            return self
                .goal()?
                .ok_or("The onboarding goal is unavailable".into());
        }
        if settings.onboarding.step != 2 || settings.onboarding.completed {
            return Err("Finish the profile step first".into());
        }
        validate_profile(&mut settings.profile, true)?;
        let text = text.trim();
        if text.is_empty() || text.chars().count() > 500 {
            return Err("Enter a goal between 1 and 500 characters".into());
        }
        settings.onboarding.step = 3;
        settings.onboarding.goal_text = text.into();
        let tx = self.connection.transaction().map_err(|e| e.to_string())?;
        let goal = crate::storage::insert_goal(&tx, text)?;
        settings.onboarding.goal_id = Some(goal.id);
        tx.execute(
            "INSERT OR REPLACE INTO preferences(name,value) VALUES('user_settings',?1)",
            [serde_json::to_string(&settings).map_err(|e| e.to_string())?],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        self.apply_role(goal.id)?;
        Ok(goal)
    }
}

#[tauri::command(async)]
pub fn save_onboarding(
    profile: UserProfile,
    draft: OnboardingState,
    state: State<AppState>,
) -> Result<UserSettings, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?
        .storage
        .save_onboarding(profile, draft)
}
#[tauri::command(async)]
pub fn create_onboarding_goal(
    text: String,
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<Goal, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let goal = inner.storage.create_onboarding_goal(&text)?;
    inner.status.tracking = false;
    inner.usage = Default::default();
    inner.activity_state.stop(false);
    inner.buddy.foreground = None;
    inner.buddy.clear();
    inner.privacy_revision += 1;
    crate::buddy::sync(&app, &mut inner)?;
    Ok(goal)
}
#[tauri::command(async)]
pub fn finish_onboarding(
    allow_tracking: bool,
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let mut settings = inner.storage.user_settings()?;
    if settings.onboarding.step != 3 {
        return Err("Finish the goal step first".into());
    }
    settings.onboarding.completed = true;
    settings.onboarding.tracking_consent = allow_tracking;
    crate::autostart::sync(settings.autostart)?;
    inner.storage.write_setting("user_settings", &settings)?;
    inner.status.tracking = allow_tracking && inner.storage.goal()?.is_some();
    inner.collector = crate::collector::create(inner.status.demo);
    inner.usage = Default::default();
    inner.activity_state.stop(false);
    crate::buddy::sync(&app, &mut inner)
}
#[tauri::command(async)]
pub fn save_user_profile(
    mut profile: UserProfile,
    autostart: bool,
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    validate_profile(&mut profile, true)?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Application state unavailable")?;
    let mut settings = inner.storage.user_settings()?;
    if !settings.onboarding.completed {
        return Err("Finish onboarding first".into());
    }
    crate::autostart::sync(autostart)?;
    settings.profile = profile;
    settings.autostart = autostart;
    inner.storage.write_setting("user_settings", &settings)?;
    if let Some(goal) = inner.storage.goal()? {
        inner.storage.apply_role(goal.id)?;
    }
    inner.privacy_revision += 1;
    inner.buddy.clear();
    crate::buddy::sync(&app, &mut inner)
}

#[cfg(test)]
#[path = "profile_tests.rs"]
mod tests;
