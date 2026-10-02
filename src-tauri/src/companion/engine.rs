use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Preferences {
    pub paused: bool,
    pub daily_checkins: bool,
    pub screen_task_detection: bool,
    pub hide_fullscreen: bool,
    pub morning_delay_minutes: u32,
    pub cooldown_minutes: u32,
    pub quiet_start_minute: u32,
    pub quiet_end_minute: u32,
    pub movement_reminder: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            paused: false,
            daily_checkins: true,
            screen_task_detection: false,
            hide_fullscreen: true,
            morning_delay_minutes: 10,
            cooldown_minutes: 60,
            quiet_start_minute: 19 * 60,
            quiet_end_minute: 9 * 60,
            movement_reminder: false,
        }
    }
}
impl Preferences {
    pub fn validate(self) -> Result<Self, String> {
        if !(1..=120).contains(&self.morning_delay_minutes)
            || !(60..=240).contains(&self.cooldown_minutes)
            || self.quiet_start_minute >= 1440
            || self.quiet_end_minute >= 1440
        {
            return Err(
                "Choose a 1–120 minute start delay, 60–240 minute cooldown and valid quiet hours"
                    .into(),
            );
        }
        Ok(self)
    }
    pub fn quiet(&self, minute: u32) -> bool {
        let (start, end) = (self.quiet_start_minute, self.quiet_end_minute);
        if start == end {
            false
        } else if start < end {
            (start..end).contains(&minute)
        } else {
            minute >= start || minute < end
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    NewTask,
    Completion,
    NoGoals,
    Midday,
    EndOfDay,
    Movement,
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
pub fn scheduled_slot(
    preferences: &Preferences,
    has_goal: bool,
    minute: u32,
    uptime_seconds: u64,
    no_progress_seconds: i64,
    goal_age_seconds: i64,
) -> Option<(&'static str, Kind, &'static str)> {
    if uptime_seconds < preferences.morning_delay_minutes as u64 * 60 {
        return None;
    }
    if preferences.daily_checkins && !has_goal {
        Some((
            "morning",
            Kind::NoGoals,
            "Want to make a small plan for today?",
        ))
    } else if preferences.daily_checkins && has_goal && (17 * 60..19 * 60).contains(&minute) {
        Some((
            "evening",
            Kind::EndOfDay,
            "Ready for a quick wrap-up? Confirm progress or leave unfinished work for tomorrow.",
        ))
    } else if preferences.daily_checkins
        && has_goal
        && (12 * 60..15 * 60).contains(&minute)
        && no_progress_seconds >= 3 * 3600
        && goal_age_seconds >= 3 * 3600
    {
        Some((
            "midday",
            Kind::Midday,
            "Want to quickly update what moved forward?",
        ))
    } else if preferences.movement_reminder && uptime_seconds >= 2 * 3600 {
        Some((
            "movement",
            Kind::Movement,
            "A little stretch, if it feels like a good moment.",
        ))
    } else {
        None
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Memory {
    pub day: String,
    pub shown: u32,
    pub last_prompt: i64,
    pub last_dismissed: i64,
    pub seen: Vec<String>,
    pub slots: Vec<String>,
    pub last_progress: i64,
    pub progress_key: String,
}
impl Memory {
    pub fn refresh(&mut self, day: &str) {
        if self.day != day {
            self.day = day.into();
            self.shown = 0;
            self.slots.clear();
        }
    }
    pub fn allowed(
        &self,
        now: i64,
        preferences: &Preferences,
        minute: u32,
        suppressed: bool,
    ) -> bool {
        !suppressed
            && !preferences.paused
            && !preferences.quiet(minute)
            && self.shown < 3
            && (self.last_prompt == 0
                || now.saturating_sub(self.last_prompt) >= preferences.cooldown_minutes as i64 * 60)
            && (self.last_dismissed == 0
                || now.saturating_sub(self.last_dismissed)
                    >= preferences.cooldown_minutes as i64 * 60)
    }
    pub fn reserve(&mut self, prompt: &Intervention, now: i64) -> bool {
        if self.seen.contains(&prompt.id) {
            return false;
        }
        self.seen.push(prompt.id.clone());
        if self.seen.len() > 200 {
            self.seen.remove(0);
        }
        self.shown += 1;
        self.last_prompt = now;
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
            _ => return Err("Invalid task detection fields".into()),
        }
        Ok(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quiet_hours_cover_midnight_and_can_be_disabled() {
        let mut p = Preferences::default();
        assert!(p.quiet(23 * 60));
        assert!(p.quiet(8 * 60));
        assert!(!p.quiet(12 * 60));
        p.quiet_start_minute = 12 * 60;
        p.quiet_end_minute = 14 * 60;
        assert!(p.quiet(13 * 60));
        assert!(!p.quiet(23 * 60));
        p.quiet_end_minute = p.quiet_start_minute;
        assert!(!p.quiet(13 * 60));
        p.cooldown_minutes = 5;
        assert!(p.validate().is_err());
    }
    #[test]
    fn cooldown_dismissal_daily_budget_and_dedup_survive_restart() {
        let p = Preferences::default();
        let mut m = Memory::default();
        m.refresh("2026-10-03");
        let prompt = Intervention {
            id: fingerprint(" Send   DECK "),
            kind: Kind::NewTask,
            text: "Send deck".into(),
            confidence: 0.95,
            goal_id: Some(1),
            plan_revision: Some(0),
            step_id: None,
            expires_at: 99999,
        };
        assert!(m.allowed(10_000, &p, 600, false));
        assert!(m.reserve(&prompt, 10_000));
        assert!(!m.allowed(10_020, &p, 600, false));
        assert!(!m.reserve(&prompt, 20_000));
        assert_eq!(prompt.id, fingerprint("send deck"));
        m.last_dismissed = 20_000;
        let mut restored: Memory =
            serde_json::from_str(&serde_json::to_string(&m).unwrap()).unwrap();
        assert!(!restored.allowed(21_000, &p, 600, false));
        assert!(!restored.allowed(30_000, &p, 600, true));
        restored.shown = 3;
        assert!(!restored.allowed(30_000, &p, 600, false));
        restored.refresh("2026-10-04");
        assert!(restored.allowed(30_000, &p, 600, false));
        assert!(restored.seen.contains(&prompt.id));
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
        };
        assert!(detection("one").validate(&plan).is_ok());
        assert!(detection("invented").validate(&plan).is_err());
    }
    #[test]
    fn scheduled_checkins_wait_and_do_not_mistake_a_new_goal_for_no_progress() {
        let p = Preferences::default();
        assert!(scheduled_slot(&p, false, 600, 599, 99999, 0).is_none());
        assert_eq!(
            scheduled_slot(&p, false, 600, 600, 99999, 0).unwrap().1,
            Kind::NoGoals
        );
        assert!(scheduled_slot(&p, true, 13 * 60, 3600, 99999, 300).is_none());
        assert!(scheduled_slot(&p, true, 13 * 60, 3600, 30, 99999).is_none());
        assert_eq!(
            scheduled_slot(&p, true, 13 * 60, 3600, 4 * 3600, 4 * 3600)
                .unwrap()
                .1,
            Kind::Midday
        );
        assert_eq!(
            scheduled_slot(&p, true, 18 * 60, 3600, 30, 99999)
                .unwrap()
                .1,
            Kind::EndOfDay
        );
        let mut p = p;
        p.daily_checkins = false;
        assert!(scheduled_slot(&p, true, 10 * 60, 3 * 3600, 99999, 99999).is_none());
        p.movement_reminder = true;
        assert_eq!(
            scheduled_slot(&p, true, 10 * 60, 3 * 3600, 99999, 99999)
                .unwrap()
                .1,
            Kind::Movement
        );
    }
}
