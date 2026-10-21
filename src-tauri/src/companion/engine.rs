use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Preferences {
    pub paused: bool,
    pub daily_checkins: bool,
    pub summary_minute: u32,
    pub quiet_hours_enabled: bool,
    pub quiet_days: Vec<u8>,
    pub screen_task_detection: bool,
    pub use_screenshots: bool,
    pub automatic_completion: bool,
    pub hide_fullscreen: bool,
    pub morning_delay_minutes: u32,
    pub cooldown_minutes: u32,
    pub quiet_start_minute: u32,
    pub quiet_end_minute: u32,
    pub movement_reminder: bool,
    pub deadline_reminders: bool,
    #[serde(skip_serializing)]
    pub system_deadline_notifications: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            paused: false,
            daily_checkins: true,
            summary_minute: 18 * 60,
            quiet_hours_enabled: false,
            quiet_days: vec![],
            screen_task_detection: true,
            use_screenshots: false,
            automatic_completion: false,
            hide_fullscreen: true,
            morning_delay_minutes: 10,
            cooldown_minutes: 60,
            quiet_start_minute: 19 * 60,
            quiet_end_minute: 9 * 60,
            movement_reminder: true,
            deadline_reminders: true,
            system_deadline_notifications: false,
        }
    }
}
impl Preferences {
    pub fn validate(mut self) -> Result<Self, String> {
        // Read old saved preferences without preserving the removed OS delivery path.
        self.system_deadline_notifications = false;
        self.quiet_days.sort_unstable();
        self.quiet_days.dedup();
        if self.summary_minute >= 1440
            || self.quiet_days.iter().any(|d| *d > 6)
            || (self.quiet_hours_enabled
                && (self.quiet_start_minute >= 1440
                    || self.quiet_end_minute >= 1440
                    || self.quiet_start_minute == self.quiet_end_minute))
        {
            return Err("Choose a valid summary time and quiet schedule".into());
        }
        Ok(self)
    }
    pub fn quiet(&self, minute: u32) -> bool {
        self.quiet_hours_enabled
            && if self.quiet_start_minute < self.quiet_end_minute {
                minute >= self.quiet_start_minute && minute < self.quiet_end_minute
            } else {
                minute >= self.quiet_start_minute || minute < self.quiet_end_minute
            }
    }
    pub fn quiet_at<T: chrono::TimeZone>(&self, now: chrono::DateTime<T>) -> bool {
        use chrono::{Datelike, Timelike};
        self.quiet_days
            .contains(&(now.weekday().num_days_from_sunday() as u8))
            || self.quiet(now.hour() * 60 + now.minute())
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    AutomaticCompletion,
    UnplannedWork,
    UnplannedCompleted,
    NewTask,
    Completion,
    GoalCompletion,
    GoalMatch,
    NoGoals,
    Midday,
    Research,
    EndOfDay,
    Movement,
    Deadline,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Intervention {
    pub id: String,
    pub kind: Kind,
    pub text: String,
    pub confidence: f64,
    pub goal_id: Option<i64>,
    pub plan_revision: Option<u64>,
    pub step_id: Option<String>,
    pub expires_at: i64,
}
pub fn fingerprint(value: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
        .hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}
/// Counts only adjacent active samples; long gaps, idle and explicit pauses reset the stretch clock.
#[derive(Default)]
pub struct ActiveWorkClock {
    last: Option<std::time::SystemTime>,
    active: std::time::Duration,
}
impl ActiveWorkClock {
    pub fn observe(&mut self, working: bool) {
        self.observe_at(std::time::SystemTime::now(), working);
    }
    pub fn observe_at(&mut self, now: std::time::SystemTime, working: bool) {
        // Wall time includes sleep on macOS; reject clock jumps instead of charging them as work.
        let backwards = self.last.is_some_and(|last| now < last);
        let gap = self.last.and_then(|last| now.duration_since(last).ok());
        if !working || backwards || gap.is_some_and(|gap| gap > std::time::Duration::from_secs(15))
        {
            self.active = std::time::Duration::ZERO;
        } else if let Some(gap) = gap {
            self.active += gap;
        }
        self.last = working.then_some(now);
    }
    pub fn seconds(&self) -> u64 {
        self.active.as_secs()
    }
    pub fn restart(&mut self) {
        self.active = std::time::Duration::ZERO;
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Memory {
    pub day: String,
    pub shown: u32,
    pub progress_shown: u32,
    pub last_prompt: i64,
    pub last_dismissed: i64,
    pub planning_reminder_at: Option<i64>,
    pub planning_day: String,
    pub summary_day: String,
    pub seen: Vec<String>,
    pub slots: Vec<String>,
    pub last_progress: i64,
    pub progress_key: String,
    pub accepted: u32,
    pub rejected: u32,
    pub completion_samples: u32,
    pub completion_rate: f64,
    pub average_completion_seconds: u64,
}
impl Memory {
    pub fn refresh(&mut self, day: &str) {
        if self.planning_reminder_at.is_some_and(|at| {
            chrono::DateTime::from_timestamp(at, 0).is_none_or(|at| {
                at.with_timezone(&chrono::Local)
                    .date_naive()
                    .to_string()
                    .as_str()
                    < day
            })
        }) {
            self.planning_reminder_at = None;
        }
        if self.day != day {
            self.day = day.into();
            self.shown = 0;
            self.progress_shown = 0;
            self.slots.clear();
        }
    }
    pub fn allowed(
        &self,
        _now: i64,
        preferences: &Preferences,
        _minute: u32,
        suppressed: bool,
    ) -> bool {
        !suppressed && !preferences.paused
    }
    pub fn reserve(&mut self, prompt: &Intervention, now: i64) -> bool {
        if self.seen.contains(&prompt.id) {
            return false;
        }
        if matches!(prompt.kind, Kind::NoGoals | Kind::EndOfDay) {
            if let Some(date) = prompt
                .id
                .strip_prefix("schedule:")
                .and_then(|s| s.split(':').next())
            {
                if prompt.kind == Kind::NoGoals {
                    self.planning_day = date.into();
                } else {
                    self.summary_day = date.into();
                }
            }
        }
        if prompt.kind == Kind::NoGoals {
            // Reserve on delivery, not on dismissal: an ignored bubble never starts a timer.
            self.planning_reminder_at = None;
            let base = prompt.id.split(':').take(3).collect::<Vec<_>>().join(":");
            if base != prompt.id && !self.seen.contains(&base) {
                self.seen.push(base);
            }
        }
        self.seen.push(prompt.id.clone());
        while self.seen.len() > 200 {
            self.seen.remove(0);
        }
        self.shown += 1;
        self.last_prompt = now;
        true
    }
    pub fn reserve_progress(&mut self, prompt: &Intervention) -> bool {
        if self.seen.contains(&prompt.id) {
            return false;
        }
        self.seen.push(prompt.id.clone());
        if self.seen.len() > 200 {
            self.seen.remove(0);
        }
        self.progress_shown += 1;
        true
    }
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Detection {
    pub kind: String,
    pub text: Option<String>,
    pub step_id: Option<String>,
    pub confidence: f64,
    #[serde(default)]
    pub evidence: Option<String>,
}
impl Detection {
    pub fn validate(self, plan: &crate::goals::GoalPlan) -> Result<Self, String> {
        if !self.confidence.is_finite() || !(0.0..=1.0).contains(&self.confidence) {
            return Err("Invalid detection confidence".into());
        }
        match self.kind.as_str() {
            "none" if self.text.is_none() && self.step_id.is_none() => {}
            "new_task"
                if self.step_id.is_none()
                    && self.text.as_ref().is_some_and(|t| {
                        !t.trim().is_empty()
                            && t.chars().count() <= 200
                            && !t.chars().any(char::is_control)
                    }) => {}
            "completion"
                if self.text.is_none()
                    && self
                        .step_id
                        .as_ref()
                        .is_some_and(|id| plan.steps.iter().any(|s| &s.id == id && !s.done)) => {}
            "goal_completion"
                if self.text.is_none()
                    && self.step_id.is_none()
                    && plan.steps.iter().all(|s| s.done) => {}
            _ => return Err("Invalid task detection fields".into()),
        }
        Ok(self)
    }
    pub fn validate_evidence(self, visible: &str) -> Result<Self, String> {
        let visible = visible.split("\n[Visual context").next().unwrap_or(visible);
        if matches!(self.kind.as_str(), "completion" | "goal_completion") {
            let evidence = self
                .evidence
                .as_deref()
                .map(str::trim)
                .filter(|text| {
                    text.chars().count() >= 10
                        && text.chars().count() <= 500
                        && !text.chars().any(char::is_control)
                })
                .ok_or("Completion needs an explicit visible receipt")?;
            if !visible.contains(evidence) {
                return Err("Completion evidence was not present in the sampled text".into());
            }
        }
        Ok(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quiet_hours_cross_midnight_quiet_days_cover_whole_days_and_legacy_profiles_stay_enabled() {
        use chrono::TimeZone;
        let zone = chrono::FixedOffset::east_opt(0).unwrap();
        let at = |d, h, m| zone.with_ymd_and_hms(2026, 10, d, h, m, 0).unwrap();
        let prefs = Preferences {
            quiet_hours_enabled: true,
            quiet_start_minute: 22 * 60,
            quiet_end_minute: 8 * 60,
            quiet_days: vec![0, 6],
            ..Default::default()
        };
        assert!(!prefs.quiet_at(at(21, 21, 59)));
        assert!(prefs.quiet_at(at(21, 22, 0)));
        assert!(prefs.quiet_at(at(22, 7, 59)));
        assert!(!prefs.quiet_at(at(22, 8, 0)));
        assert!(prefs.quiet_at(at(24, 12, 0)));
        let old: Preferences =
            serde_json::from_str(r#"{"quiet_start_minute":1140,"quiet_end_minute":540}"#).unwrap();
        assert!(!old.quiet_at(at(21, 22, 0)));
        assert_eq!(old.summary_minute, 1080);
        assert!(old.quiet_days.is_empty());
        assert!(Preferences {
            summary_minute: 1440,
            ..Default::default()
        }
        .validate()
        .is_err());
        assert!(Preferences {
            quiet_days: vec![7],
            ..Default::default()
        }
        .validate()
        .is_err());
        assert!(Preferences {
            quiet_hours_enabled: true,
            quiet_start_minute: 0,
            quiet_end_minute: 0,
            ..Default::default()
        }
        .validate()
        .is_err());
    }
    #[test]
    fn legacy_schedule_fields_do_not_reintroduce_gaps_or_os_delivery() {
        let p = Preferences {
            system_deadline_notifications: true,
            cooldown_minutes: 240,
            quiet_start_minute: 0,
            quiet_end_minute: 1439,
            ..Default::default()
        };
        assert!(!p.quiet(600));
        assert!(!p.validate().unwrap().system_deadline_notifications);
    }
    #[test]
    fn prompts_deduplicate_across_restart_without_spacing_or_daily_quotas() {
        let p = Preferences::default();
        let mut m = Memory {
            shown: 500,
            last_prompt: 10000,
            last_dismissed: 10000,
            ..Default::default()
        };
        assert!(m.allowed(10001, &p, 600, false));
        assert!(!m.allowed(10001, &p, 600, true));
        let prompt = Intervention {
            id: fingerprint("Send deck"),
            kind: Kind::NewTask,
            text: "Send deck".into(),
            confidence: 0.95,
            goal_id: Some(1),
            plan_revision: Some(0),
            step_id: None,
            expires_at: 999999,
        };
        assert!(m.reserve(&prompt, 10001));
        let mut restored: Memory =
            serde_json::from_str(&serde_json::to_string(&m).unwrap()).unwrap();
        assert!(!restored.reserve(&prompt, 10002));
        assert!(restored.allowed(10002, &p, 600, false));
    }
    #[test]
    fn completion_must_reference_a_real_unfinished_step() {
        let plan = crate::goals::GoalPlan {
            goal_id: 1,
            revision: 0,
            done_when: String::new(),
            steps: vec![crate::goals::Step {
                id: "one".into(),
                text: "Send deck".into(),
                done: false,
            }],
            current_step: None,
        };
        let detection = |id: &str| Detection {
            kind: "completion".into(),
            text: None,
            step_id: Some(id.into()),
            confidence: 0.95,
            evidence: Some("Your deck was sent successfully".into()),
        };
        assert!(detection("one").validate(&plan).is_ok());
        assert!(detection("invented").validate(&plan).is_err());
    }
    #[test]
    fn completion_receipts_must_be_visible_and_goals_cannot_skip_unfinished_steps() {
        let mut plan = crate::goals::GoalPlan {
            goal_id: 1,
            revision: 0,
            done_when: "Dashboard published".into(),
            steps: vec![],
            current_step: None,
        };
        let detection = |evidence: Option<&str>| Detection {
            kind: "goal_completion".into(),
            text: None,
            step_id: None,
            confidence: 0.98,
            evidence: evidence.map(str::to_string),
        };
        assert!(detection(Some("Your dashboard was published successfully"))
            .validate(&plan)
            .unwrap()
            .validate_evidence("Receipt: Your dashboard was published successfully")
            .is_ok());
        assert!(detection(Some("Your dashboard was published successfully"))
            .validate(&plan)
            .unwrap()
            .validate_evidence("Editing draft dashboard")
            .is_err());
        assert!(detection(None)
            .validate(&plan)
            .unwrap()
            .validate_evidence("Done")
            .is_err());
        plan.steps.push(crate::goals::Step {
            id: "one".into(),
            text: "Publish".into(),
            done: false,
        });
        assert!(detection(Some("Your dashboard was published successfully"))
            .validate(&plan)
            .is_err());
        plan.steps[0].done = true;
        assert!(detection(Some("Your dashboard was published successfully"))
            .validate(&plan)
            .is_ok());
    }
    #[test]
    fn completion_reviews_have_their_own_bounded_budget_and_deduplicate() {
        let mut memory = Memory {
            shown: 3,
            ..Memory::default()
        };
        let prompt = Intervention {
            id: "receipt".into(),
            kind: Kind::Completion,
            text: "Deck sent".into(),
            confidence: 0.98,
            goal_id: Some(1),
            plan_revision: Some(1),
            step_id: Some("one".into()),
            expires_at: 99999999,
        };
        assert!(memory.reserve_progress(&prompt));
        assert!(!memory.reserve_progress(&prompt));
        assert_eq!(memory.shown, 3);
        assert_eq!(memory.progress_shown, 1);
        memory.progress_shown = 64;
        let mut other = prompt;
        other.id = "other".into();
        assert!(memory.reserve_progress(&other));
        memory.refresh("2026-10-09");
        assert_eq!(memory.progress_shown, 0);
    }
    #[test]
    fn dismissed_prompts_do_not_delay_distinct_new_evidence() {
        let p = Preferences::default();
        let m = Memory {
            last_dismissed: 10000,
            ..Default::default()
        };
        assert!(m.allowed(10001, &p, 600, false));
        assert!(!m.allowed(10001, &Preferences { paused: true, ..p }, 600, false));
    }
    #[test]
    fn feedback_does_not_create_a_hidden_frequency_cap() {
        let p = Preferences::default();
        let m = Memory {
            rejected: 100,
            completion_samples: 10,
            completion_rate: 0.1,
            average_completion_seconds: 20000,
            shown: 100,
            last_prompt: 9999,
            ..Default::default()
        };
        assert!(m.allowed(10000, &p, 600, false));
    }
}

#[cfg(test)]
mod active_work_regressions {
    use super::*;
    use std::time::{Duration, SystemTime};
    #[test]
    fn a_delivered_stretch_can_restart_the_active_clock() {
        let start = SystemTime::UNIX_EPOCH + Duration::from_secs(100);
        let mut clock = ActiveWorkClock::default();
        for n in 0..=300 {
            clock.observe_at(start + Duration::from_secs(n * 3), true);
        }
        assert_eq!(clock.seconds(), 900);
        clock.restart();
        assert_eq!(clock.seconds(), 0);
        clock.observe_at(start + Duration::from_secs(903), true);
        assert_eq!(clock.seconds(), 3);
    }
    #[test]
    fn idle_sleep_and_pauses_reset_work_without_charging_the_gap() {
        let start = SystemTime::UNIX_EPOCH + Duration::from_secs(100);
        let mut clock = ActiveWorkClock::default();
        for n in 0..=2400 {
            clock.observe_at(start + Duration::from_secs(n * 3), true);
        }
        assert_eq!(clock.seconds(), 7200);
        clock.observe_at(start + Duration::from_secs(7203), false);
        assert_eq!(clock.seconds(), 0);
        clock.observe_at(start + Duration::from_secs(10000), true);
        assert_eq!(clock.seconds(), 0);
        clock.observe_at(start + Duration::from_secs(10003), true);
        assert_eq!(clock.seconds(), 3);
        clock.observe_at(start + Duration::from_secs(20000), true);
        assert_eq!(clock.seconds(), 0);
        clock.observe_at(start + Duration::from_secs(20003), true);
        assert_eq!(clock.seconds(), 3);
        clock.observe_at(start, true);
        assert_eq!(clock.seconds(), 0);
    }
}
