//! Versioned strategy contracts. Workflows own their payload, not the session manager.
use super::Session;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Strategies validate their own payload; the manager owns persistence and controls.
pub(super) trait Workflow: std::fmt::Debug + Sync {
    fn initial_data(&self) -> Value;
    fn reply(
        &self,
        session: &mut Session,
        input: &Value,
        strategy: &Strategy,
    ) -> Result<Option<String>, String>;
    fn propose(
        &self,
        session: &mut Session,
        proposal: &Value,
        strategy: &Strategy,
    ) -> Result<(), String>;
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StrategyKind {
    Workflow,
    Intervention,
    Modifier,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    ActionCompleted,
    Deferred,
    Declined,
    Blocked,
}

#[derive(Debug, Serialize)]
pub struct Limits {
    pub max_revisions: u8,
    pub max_attempts: u8,
    pub max_transitions: u16,
}

#[derive(Debug, Serialize)]
pub struct Transition {
    pub from: &'static str,
    pub input: &'static str,
    pub to: &'static [&'static str],
}

#[derive(Debug, Serialize)]
pub struct Strategy {
    #[serde(skip)]
    pub(super) handler: &'static dyn Workflow,
    pub id: &'static str,
    pub version: u32,
    pub kind: StrategyKind,
    pub purpose: &'static str,
    pub required_context: &'static [&'static str],
    pub eligible_states: &'static [&'static str],
    pub contraindications: &'static [&'static str],
    pub initial_step: &'static str,
    pub transitions: &'static [Transition],
    pub controls: &'static [&'static str],
    pub outcomes: &'static [Outcome],
    pub memory_writes: &'static [&'static str],
    pub communication_principles: &'static [&'static str],
    pub limits: Limits,
}

pub static TINY_HABITS: Strategy = Strategy {
    handler: &super::tiny::TinyHabits,
    id: "tiny_habits",
    version: 1,
    kind: StrategyKind::Workflow,
    purpose: "help_user_start",
    required_context: &[
        "goal_id",
        "goal_title",
        "target_revision",
        "conversation_id",
    ],
    eligible_states: &["difficulty_starting", "task_overwhelming", "low_confidence"],
    contraindications: &["user_declined", "external_dependency", "completed_target"],
    initial_step: "readiness",
    transitions: &[
        Transition {
            from: "readiness",
            input: "ready",
            to: &["barrier", "paused"],
        },
        Transition {
            from: "barrier",
            input: "barrier",
            to: &["tiny_action", "blocked"],
        },
        Transition {
            from: "tiny_action",
            input: "propose_action",
            to: &["feasibility"],
        },
        Transition {
            from: "feasibility",
            input: "ease",
            to: &["tiny_action", "anchor", "paused"],
        },
        Transition {
            from: "anchor",
            input: "anchor",
            to: &["commitment"],
        },
        Transition {
            from: "commitment",
            input: "commit",
            to: &["execution", "declined"],
        },
        Transition {
            from: "execution",
            input: "report",
            to: &["completed", "barrier", "paused"],
        },
    ],
    controls: &["pause", "resume", "stop"],
    outcomes: &[
        Outcome::ActionCompleted,
        Outcome::Deferred,
        Outcome::Declined,
        Outcome::Blocked,
    ],
    memory_writes: &["user_confirmed_micro_action_with_explicit_remember_choice"],
    communication_principles: &[
        "autonomy_supportive",
        "one_question_at_a_time",
        "no_diagnosis",
    ],
    limits: Limits {
        max_revisions: 2,
        max_attempts: 2,
        max_transitions: 64,
    },
};

static REGISTRY: [&Strategy; 1] = [&TINY_HABITS];
pub fn registry() -> &'static [&'static Strategy] {
    &REGISTRY
}

pub fn find(id: &str, version: u32) -> Result<&'static Strategy, String> {
    registry()
        .iter()
        .copied()
        .find(|s| s.id == id && s.version == version)
        .ok_or_else(|| "Unsupported coaching strategy or version".into())
}
