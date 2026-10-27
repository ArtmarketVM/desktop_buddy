//! Deterministic first-run milestones. No provider calls or screen observation are needed.
use crate::{
    companion::engine::{Intervention, Kind},
    core::GoalDraft,
    storage::Storage,
};
use chrono::{Local, Timelike, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

const SETTING: &str = "sumi_onboarding_goal";
const CREDIT_SOURCE: &str = "Sumi onboarding credit";

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct Milestones {
    pub goal_id: i64,
    created_at: String,
    goal_created: bool,
    progress_visited: bool,
    dismissed: Vec<String>,
    deferred_until: Option<i64>,
}

fn db(e: rusqlite::Error) -> String {
    e.to_string()
}

/// Called inside the same transaction as an actual goal insertion, never on a retry.
pub(crate) fn goal_created(connection: &Connection) -> Result<(), String> {
    let value: Option<String> = connection
        .query_row(
            "SELECT value FROM preferences WHERE name=?1",
            [SETTING],
            |r| r.get(0),
        )
        .optional()
        .map_err(db)?;
    if let Some(value) = value {
        let mut milestones: Milestones = serde_json::from_str(&value).map_err(|e| e.to_string())?;
        milestones.goal_created = true;
        connection
            .execute(
                "UPDATE preferences SET value=?1 WHERE name=?2",
                params![
                    serde_json::to_string(&milestones).map_err(|e| e.to_string())?,
                    SETTING
                ],
            )
            .map_err(db)?;
    }
    Ok(())
}

pub(crate) fn next_page(step: Option<&str>) -> Option<&'static str> {
    match step {
        Some("step-0") => Some("create-goal"),
        Some("step-1") => Some("activity"),
        Some("step-2") => Some("focus"),
        _ => None,
    }
}

impl Storage {
    pub(crate) fn onboarding_goal_id(&self) -> Result<Option<i64>, String> {
        let milestones: Option<Milestones> = self.read_setting(SETTING)?;
        let Some(milestones) = milestones else {
            return Ok(None);
        };
        let exists = self
            .connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM goals WHERE id=?1 AND created_at=?2)",
                params![milestones.goal_id, milestones.created_at],
                |r| r.get::<_, bool>(0),
            )
            .map_err(db)?;
        Ok(exists.then_some(milestones.goal_id))
    }

    /// Only new profiles call this. The savepoint makes the goal, receipt and credit atomic.
    pub(crate) fn start_onboarding_goal(&mut self) -> Result<(), String> {
        if self.read_setting::<Milestones>(SETTING)?.is_some() {
            return Ok(());
        }
        self.connection
            .execute_batch("SAVEPOINT sumi_setup")
            .map_err(db)?;
        let result = (|| {
            self.core_add_goals(
                vec![GoalDraft {
                    title: "Install and start using Sumi".into(),
                    area: "Getting started".into(),
                    steps: vec![
                        "Find and install the Sumi app".into(),
                        "Create a new goal".into(),
                        "Check out My progress in the menu".into(),
                    ],
                }],
                "sumi-getting-started-v1",
            )?;
            let id: i64 = self
                .connection
                .query_row("SELECT id FROM goals ORDER BY id DESC LIMIT 1", [], |r| {
                    r.get(0)
                })
                .map_err(db)?;
            let created_at: String = self
                .connection
                .query_row("SELECT created_at FROM goals WHERE id=?1", [id], |r| {
                    r.get(0)
                })
                .map_err(db)?;
            self.write_setting(
                SETTING,
                &Milestones {
                    goal_id: id,
                    created_at,
                    ..Milestones::default()
                },
            )?;
            let now = Local::now();
            let date = now.date_naive().to_string();
            self.core_today(id, true, &date)?;
            self.core_plan_day(&date, false)?;
            self.connection.execute(
                "INSERT INTO core_goal_details(goal_id,description) VALUES(?1,?2)",
                params![id, "Your first steps with Sumi. Installing and opening the app earns a fixed 5-minute onboarding credit."],
            ).map_err(db)?;
            self.connection
                .execute(
                    "INSERT INTO core_time(day,goal_id,seconds) VALUES(?1,?2,300)",
                    params![date, id],
                )
                .map_err(db)?;
            self.connection.execute("INSERT INTO goal_relevant_daily(day,goal_id,process_name,milliseconds) VALUES(?1,?2,?3,300000)", params![date,id,CREDIT_SOURCE]).map_err(db)?;
            self.connection.execute("INSERT INTO goal_relevant_step_daily(day,goal_id,step_id,milliseconds) VALUES(?1,?2,'step-0',300000)", params![date,id]).map_err(db)?;
            // Keep a local hour for the Progress chart without inventing an observed interval.
            self.write_setting("sumi_onboarding_credit_hour", &(date, now.hour() as u8))?;
            Ok(())
        })();
        self.connection
            .execute_batch(if result.is_ok() {
                "RELEASE sumi_setup"
            } else {
                "ROLLBACK TO sumi_setup; RELEASE sumi_setup"
            })
            .map_err(db)?;
        result
    }

    pub(crate) fn visit_onboarding_progress(&self) -> Result<(), String> {
        if let Some(mut milestones) = self.read_setting::<Milestones>(SETTING)? {
            if !milestones.progress_visited {
                milestones.progress_visited = true;
                self.write_setting(SETTING, &milestones)?;
            }
        }
        Ok(())
    }

    pub(crate) fn onboarding_prompt(&self, now: i64) -> Result<Option<Intervention>, String> {
        let Some(milestones) = self.read_setting::<Milestones>(SETTING)? else {
            return Ok(None);
        };
        if milestones.deferred_until.is_some_and(|until| until > now) {
            return Ok(None);
        }
        if self.onboarding_goal_id()? != Some(milestones.goal_id) {
            return Ok(None);
        }
        let open = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM core_goals c JOIN goals g ON g.id=c.goal_id WHERE c.goal_id=?1 AND c.state='open' AND g.status!='completed')",
            [milestones.goal_id], |r| r.get::<_, bool>(0),
        ).map_err(db)?;
        if !open {
            return Ok(None);
        }
        let plan = self.goal_plan(milestones.goal_id)?;
        for (step_id, observed) in [
            ("step-0", true),
            ("step-1", milestones.goal_created),
            ("step-2", milestones.progress_visited),
        ] {
            if observed
                && !milestones.dismissed.iter().any(|s| s == step_id)
                && plan.steps.iter().any(|s| s.id == step_id && !s.done)
            {
                return Ok(Some(Intervention {
                        id: format!("sumi-setup:{}:{step_id}", milestones.goal_id),
                        kind: Kind::OnboardingCompletion,
                        text: match step_id {
                            "step-0" => "You’ve installed the app. Let’s cross off your first step.",
                            "step-1" => "Cross off this step, then open My progress to see your time and finished work.",
                            _ => "Your first 5 minutes are in My progress. Cross off this last step to finish setup.",
                        }.into(),
                        confidence: 1.0,
                        goal_id: Some(milestones.goal_id),
                        plan_revision: Some(plan.revision),
                        step_id: Some(step_id.into()),
                        expires_at: now + 86400,
                    }));
            }
        }
        Ok(None)
    }

    pub(crate) fn onboarding_active(&self) -> Result<bool, String> {
        let Some(id) = self.onboarding_goal_id()? else {
            return Ok(false);
        };
        let open: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM core_goals c JOIN goals g ON g.id=c.goal_id WHERE c.goal_id=?1 AND c.state='open' AND g.status!='completed')",
            [id], |r| r.get(0),
        ).map_err(db)?;
        Ok(open && self.goal_plan(id)?.steps.iter().any(|s| !s.done))
    }

    pub(crate) fn valid_onboarding_prompt(&self, prompt: &Intervention, now: i64) -> bool {
        // Candidates are ordered, so a later milestone waits for the first one's response.
        self.onboarding_prompt(now)
            .is_ok_and(|p| p.is_some_and(|p| p.id == prompt.id))
    }

    pub(crate) fn respond_onboarding_prompt(
        &mut self,
        prompt: &Intervention,
        action: &str,
    ) -> Result<(), String> {
        if !["accept", "ignore"].contains(&action)
            || !self.valid_onboarding_prompt(prompt, Utc::now().timestamp())
        {
            return Err("This setup step changed. Check your goal on Today.".into());
        }
        let mut milestones = self
            .read_setting::<Milestones>(SETTING)?
            .ok_or("Setup goal changed")?;
        let step_id = prompt.step_id.as_deref().ok_or("Setup step changed")?;
        self.connection
            .execute_batch("SAVEPOINT sumi_milestone")
            .map_err(db)?;
        let result = (|| {
            if action == "accept" {
                let mut plan = self.goal_plan(milestones.goal_id)?;
                let step = plan
                    .steps
                    .iter_mut()
                    .find(|s| s.id == step_id)
                    .ok_or("Setup step changed")?;
                step.done = true;
                let (title, area): (String, String) = self.connection.query_row(
                    "SELECT g.text,a.title FROM goals g JOIN core_goals c ON c.goal_id=g.id JOIN core_areas a ON a.id=c.area_id WHERE g.id=?1",
                    [milestones.goal_id], |r| Ok((r.get(0)?, r.get(1)?)),
                ).map_err(db)?;
                self.core_save_goal_details(&title, &area, plan, None)?;
            }
            if action == "accept" {
                milestones.dismissed.push(step_id.into());
                milestones.deferred_until = None;
            } else {
                milestones.deferred_until = Some(Utc::now().timestamp() + 600);
            }
            self.write_setting(SETTING, &milestones)
        })();
        self.connection
            .execute_batch(if result.is_ok() {
                "RELEASE sumi_milestone"
            } else {
                "ROLLBACK TO sumi_milestone; RELEASE sumi_milestone"
            })
            .map_err(db)?;
        result
    }

    pub(crate) fn onboarding_hour(&self, date: &str) -> Result<Option<(u8, i64)>, String> {
        let Some(id) = self.onboarding_goal_id()? else {
            return Ok(None);
        };
        let hour: Option<(String, u8)> = self.read_setting("sumi_onboarding_credit_hour")?;
        let credited: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM goal_relevant_daily WHERE goal_id=?1 AND day=?2 AND process_name=?3 AND milliseconds=300000)",
            params![id,date,CREDIT_SOURCE], |r| r.get(0),
        ).map_err(db)?;
        Ok(hour
            .filter(|(day, _)| day == date && credited)
            .map(|(_, hour)| (hour, id)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> Storage {
        Storage::open(std::path::Path::new(":memory:")).unwrap()
    }
    fn accept(s: &mut Storage) -> Intervention {
        let p = s
            .onboarding_prompt(Utc::now().timestamp())
            .unwrap()
            .unwrap();
        s.respond_onboarding_prompt(&p, "accept").unwrap();
        p
    }
    fn installed() -> Storage {
        let mut s = store();
        s.start_onboarding_goal().unwrap();
        assert_eq!(accept(&mut s).step_id.as_deref(), Some("step-0"));
        s
    }
    #[test]
    fn installation_is_confirmed_from_welcome_and_five_minutes_are_credited_once() {
        let mut s = store();
        s.start_onboarding_goal().unwrap();
        s.start_onboarding_goal().unwrap();
        let before = s.core_snapshot(None).unwrap();
        let g = &before.goals[0];
        let id = g.id;
        assert_eq!(before.goals.len(), 1);
        assert_eq!(before.today, vec![id]);
        assert_eq!(g.plan.steps.len(), 3);
        assert!(g.plan.steps.iter().all(|s| !s.done));
        assert_eq!(g.focused_seconds, 300);
        assert_eq!(g.relevant_seconds, 300);
        assert_eq!(before.summary.goals[0].steps[0].seconds, 300);
        assert_eq!(before.hourly.iter().map(|h| h.seconds).sum::<u64>(), 300);
        assert!(before.summary.completed.is_empty());
        let prompt = accept(&mut s);
        assert!(prompt.text.contains("You’ve installed the app"));
        assert_eq!(next_page(prompt.step_id.as_deref()), Some("create-goal"));
        assert!(s.respond_onboarding_prompt(&prompt, "accept").is_err());
        let after = s.core_snapshot(None).unwrap();
        assert!(after.goals[0].plan.steps[0].done);
        assert_eq!(
            after.summary.completed,
            vec!["Find and install the Sumi app"]
        );
        assert_eq!(s.relevant_seconds(id, None).unwrap(), 300);
        assert_eq!(
            after
                .week
                .iter()
                .flat_map(|d| &d.goals)
                .map(|g| g.relevant_seconds)
                .sum::<u64>(),
            300
        );
    }
    #[test]
    fn all_three_receipts_confirm_current_plan_preserve_edits_and_finish_setup() {
        let mut s = installed();
        let date = Local::now().date_naive().to_string();
        s.core_create_goal("My first goal", "first", &date).unwrap();
        s.core_create_goal("My first goal", "first", &date).unwrap();
        let p = s
            .onboarding_prompt(Utc::now().timestamp())
            .unwrap()
            .unwrap();
        let id = p.goal_id.unwrap();
        assert_eq!(p.step_id.as_deref(), Some("step-1"));
        assert!(!s.goal_plan(id).unwrap().steps[1].done);
        let mut plan = s.goal_plan(id).unwrap();
        plan.steps[2].text = "View my progress".into();
        s.core_save_goal_details("Start Sumi", "Personal", plan, None)
            .unwrap();
        s.respond_onboarding_prompt(&p, "accept").unwrap();
        assert_eq!(next_page(p.step_id.as_deref()), Some("activity"));
        assert!(s
            .onboarding_prompt(Utc::now().timestamp())
            .unwrap()
            .is_none());
        s.visit_onboarding_progress().unwrap();
        let p = accept(&mut s);
        assert_eq!(p.step_id.as_deref(), Some("step-2"));
        assert_eq!(next_page(p.step_id.as_deref()), Some("focus"));
        assert_eq!(s.goal_plan(id).unwrap().steps[2].text, "View my progress");
        assert!(s.goal_plan(id).unwrap().steps.iter().all(|s| s.done));
        assert!(!s.onboarding_active().unwrap());
        assert_eq!(
            s.core_snapshot(None)
                .unwrap()
                .goals
                .iter()
                .find(|g| g.id == id)
                .unwrap()
                .status,
            "completed"
        );
    }
    #[test]
    fn later_snoozes_welcome_without_crossing_off_a_step() {
        let mut s = store();
        s.start_onboarding_goal().unwrap();
        let now = Utc::now().timestamp();
        let p = s.onboarding_prompt(now).unwrap().unwrap();
        s.respond_onboarding_prompt(&p, "ignore").unwrap();
        assert!(s.onboarding_prompt(now + 10).unwrap().is_none());
        assert_eq!(
            s.onboarding_prompt(now + 601)
                .unwrap()
                .unwrap()
                .step_id
                .as_deref(),
            Some("step-0")
        );
        assert!(!s.goal_plan(p.goal_id.unwrap()).unwrap().steps[0].done);
    }
    #[test]
    fn failed_creations_do_not_count_but_imports_do() {
        let mut s = installed();
        assert!(s.core_create_goal("", "invalid", "2026-10-27").is_err());
        assert!(s
            .onboarding_prompt(Utc::now().timestamp())
            .unwrap()
            .is_none());
        s.core_add_goals(
            vec![GoalDraft {
                title: "Imported goal".into(),
                area: "Work".into(),
                steps: vec![],
            }],
            "import",
        )
        .unwrap();
        assert_eq!(
            s.onboarding_prompt(Utc::now().timestamp())
                .unwrap()
                .unwrap()
                .step_id
                .as_deref(),
            Some("step-1")
        );
    }
    #[test]
    fn progress_can_be_visited_before_goal_creation_and_visits_are_idempotent() {
        let mut s = installed();
        s.visit_onboarding_progress().unwrap();
        s.visit_onboarding_progress().unwrap();
        let p = s
            .onboarding_prompt(Utc::now().timestamp())
            .unwrap()
            .unwrap();
        assert_eq!(p.step_id.as_deref(), Some("step-2"));
        s.respond_onboarding_prompt(&p, "accept").unwrap();
        assert!(s
            .onboarding_prompt(Utc::now().timestamp())
            .unwrap()
            .is_none());
        assert!(s.onboarding_active().unwrap());
    }
    #[test]
    fn manual_completion_and_deletion_invalidate_stale_prompts_without_recreating_setup() {
        let mut s = installed();
        s.visit_onboarding_progress().unwrap();
        let p = s
            .onboarding_prompt(Utc::now().timestamp())
            .unwrap()
            .unwrap();
        let id = p.goal_id.unwrap();
        let mut plan = s.goal_plan(id).unwrap();
        plan.steps[2].done = true;
        s.core_save_observed_plan(plan).unwrap();
        assert!(!s.valid_onboarding_prompt(&p, Utc::now().timestamp()));
        assert!(s.respond_onboarding_prompt(&p, "accept").is_err());
        s.core_transition(id, "delete").unwrap();
        s.start_onboarding_goal().unwrap();
        assert!(s.onboarding_goal_id().unwrap().is_none());
        assert!(!s.onboarding_active().unwrap());
        assert!(s.core_snapshot(None).unwrap().goals.is_empty());
    }
    #[test]
    fn older_profiles_are_not_seeded_and_clearing_time_removes_chart_credit() {
        let mut s = store();
        s.core_create_goal("Existing goal", "existing", "2026-10-27")
            .unwrap();
        s.visit_onboarding_progress().unwrap();
        assert!(s.onboarding_goal_id().unwrap().is_none());
        assert!(s
            .onboarding_prompt(Utc::now().timestamp())
            .unwrap()
            .is_none());
        s.start_onboarding_goal().unwrap();
        let date = Local::now().date_naive().to_string();
        s.connection
            .execute("DELETE FROM goal_relevant_daily", [])
            .unwrap();
        assert!(s.onboarding_hour(&date).unwrap().is_none());
    }
    #[test]
    fn receipts_and_snooze_survive_restart_without_duplicate_credit() {
        let path = std::env::temp_dir().join(format!(
            "sumi-onboarding-{}-{}.db",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap()
        ));
        let id = {
            let mut s = Storage::open(&path).unwrap();
            s.start_onboarding_goal().unwrap();
            accept(&mut s);
            s.core_create_goal(
                "First goal",
                "restart",
                &Local::now().date_naive().to_string(),
            )
            .unwrap();
            s.onboarding_goal_id().unwrap().unwrap()
        };
        {
            let mut s = Storage::open(&path).unwrap();
            s.start_onboarding_goal().unwrap();
            assert_eq!(s.core_snapshot(None).unwrap().goals.len(), 2);
            assert_eq!(s.relevant_seconds(id, None).unwrap(), 300);
            let p = s
                .onboarding_prompt(Utc::now().timestamp())
                .unwrap()
                .unwrap();
            s.respond_onboarding_prompt(&p, "ignore").unwrap();
        }
        {
            let s = Storage::open(&path).unwrap();
            assert!(s
                .onboarding_prompt(Utc::now().timestamp())
                .unwrap()
                .is_none());
            assert!(s
                .onboarding_prompt(Utc::now().timestamp() + 601)
                .unwrap()
                .is_some());
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn failed_seed_is_atomic_and_can_be_retried() {
        let mut s = store();
        s.connection.execute_batch("CREATE TRIGGER fail_credit BEFORE INSERT ON core_time BEGIN SELECT RAISE(ABORT,'disk write failed'); END;").unwrap();
        assert!(s.start_onboarding_goal().is_err());
        assert!(s.onboarding_goal_id().unwrap().is_none());
        assert!(s.core_snapshot(None).unwrap().goals.is_empty());
        s.connection
            .execute_batch("DROP TRIGGER fail_credit")
            .unwrap();
        s.start_onboarding_goal().unwrap();
        assert_eq!(s.core_snapshot(None).unwrap().goals.len(), 1);
    }
    #[test]
    fn a_reused_sqlite_id_cannot_receive_setup_receipts() {
        let mut s = installed();
        let id = s.onboarding_goal_id().unwrap().unwrap();
        s.core_transition(id, "delete").unwrap();
        s.core_create_goal(
            "Another goal",
            "after-delete",
            &Local::now().date_naive().to_string(),
        )
        .unwrap();
        s.visit_onboarding_progress().unwrap();
        assert!(s.onboarding_goal_id().unwrap().is_none());
        assert!(s
            .onboarding_prompt(Utc::now().timestamp())
            .unwrap()
            .is_none());
    }
}
