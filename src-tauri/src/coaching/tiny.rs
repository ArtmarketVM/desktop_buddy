use super::*;

#[derive(Debug)]
pub(super) struct TinyHabits;

impl strategy::Workflow for TinyHabits {
    fn initial_data(&self) -> Value {
        json!(TinyState::default())
    }

    fn reply(
        &self,
        session: &mut Session,
        input: &Value,
        strategy: &Strategy,
    ) -> Result<Option<String>, String> {
        let reply: Reply =
            serde_json::from_value(input.clone()).map_err(|_| "Invalid Tiny Habits response")?;
        reduce(session, &reply, strategy)?;
        if matches!(
            reply,
            Reply::Report {
                completed: true,
                remember: true
            }
        ) {
            let data: TinyState = serde_json::from_value(session.data.clone())
                .map_err(|_| "Invalid coaching state")?;
            let action = data
                .action
                .ok_or("No confirmed coaching action to remember")?;
            return Ok(Some(format!("User reported completing a coaching micro-action: {}. This does not confirm goal or checklist completion.", action.title)));
        }
        Ok(None)
    }

    fn propose(
        &self,
        session: &mut Session,
        proposal: &Value,
        strategy: &Strategy,
    ) -> Result<(), String> {
        let action: MicroAction =
            serde_json::from_value(proposal.clone()).map_err(|_| "Invalid Tiny Habits proposal")?;
        action.validate()?;
        if !strategy.transitions.iter().any(|t| {
            t.from == session.step && t.input == "propose_action" && t.to.contains(&"feasibility")
        }) {
            return Err("A coaching action cannot be proposed at this step".into());
        }
        let mut data: TinyState =
            serde_json::from_value(session.data.clone()).map_err(|_| "Invalid coaching state")?;
        data.action = Some(action);
        session.data = json!(data);
        session.step = "feasibility".into();
        Ok(())
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TinyState {
    pub barrier: Option<Barrier>,
    pub action: Option<MicroAction>,
    pub ease_score: Option<u8>,
    pub anchor: Option<String>,
    pub revision_count: u8,
    pub attempt_count: u8,
    pub micro_action_completed: bool,
    pub completion_source: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Barrier {
    Overwhelm,
    UnclearFirstStep,
    Perfectionism,
    LowConfidence,
    ExternalDependency,
    Other,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MicroAction {
    pub title: String,
    pub estimated_seconds: u8,
}

impl MicroAction {
    pub fn validate(&self) -> Result<(), String> {
        memory::safe_text(&self.title, 300)?;
        if !(10..=60).contains(&self.estimated_seconds) {
            return Err("Choose a micro-action of approximately 10–60 seconds".into());
        }
        Ok(())
    }
}

/// Explicit structured user responses; no free-text psychological classification.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Reply {
    Ready { ready: bool },
    Barrier { barrier: Barrier },
    Ease { score: u8 },
    Anchor { anchor: Option<String> },
    Commit { accepted: bool },
    Report { completed: bool, remember: bool },
}

impl From<Reply> for Value {
    fn from(reply: Reply) -> Self {
        json!(reply)
    }
}

impl Reply {
    pub(super) fn name(&self) -> &'static str {
        match self {
            Self::Ready { .. } => "ready",
            Self::Barrier { .. } => "barrier",
            Self::Ease { .. } => "ease",
            Self::Anchor { .. } => "anchor",
            Self::Commit { .. } => "commit",
            Self::Report { .. } => "report",
        }
    }
}

pub(super) fn reduce(
    session: &mut Session,
    reply: &Reply,
    strategy: &Strategy,
) -> Result<(), String> {
    let previous_step = session.step.clone();
    let mut data: TinyState = serde_json::from_value(session.data.clone())
        .map_err(|_| "Invalid saved coaching workflow")?;
    let next = match (session.step.as_str(), reply) {
        ("readiness", Reply::Ready { ready: true }) => "barrier",
        ("readiness", Reply::Ready { ready: false }) => {
            session.pause();
            "paused"
        }
        ("barrier", Reply::Barrier { barrier }) => {
            data.barrier = Some(barrier.clone());
            if *barrier == Barrier::ExternalDependency {
                session.status = Status::Blocked;
                session.outcome = Some(Outcome::Blocked);
                "blocked"
            } else {
                "tiny_action"
            }
        }
        ("feasibility", Reply::Ease { score }) if (1..=10).contains(score) => {
            data.ease_score = Some(*score);
            // An MVP heuristic, not a validated constant of the methodology.
            if *score >= 8 {
                "anchor"
            } else if data.revision_count < strategy.limits.max_revisions {
                data.revision_count += 1;
                data.action = None;
                data.ease_score = None;
                "tiny_action"
            } else {
                session.pause();
                "paused"
            }
        }
        ("anchor", Reply::Anchor { anchor }) => {
            data.anchor = anchor
                .as_deref()
                .map(|s| memory::safe_text(s, 300))
                .transpose()?;
            "commitment"
        }
        ("commitment", Reply::Commit { accepted: true }) => {
            if data.action.is_none() || data.attempt_count >= strategy.limits.max_attempts {
                return Err("No feasible coaching action is available".into());
            }
            data.attempt_count += 1;
            "execution"
        }
        ("commitment", Reply::Commit { accepted: false }) => {
            session.status = Status::Declined;
            session.outcome = Some(Outcome::Declined);
            "declined"
        }
        (
            "execution",
            Reply::Report {
                completed: true, ..
            },
        ) => {
            data.micro_action_completed = true;
            data.completion_source = Some("user_report".into());
            session.status = Status::Completed;
            session.outcome = Some(Outcome::ActionCompleted);
            "completed"
        }
        (
            "execution",
            Reply::Report {
                completed: false,
                remember: false,
            },
        ) => {
            if data.attempt_count >= strategy.limits.max_attempts {
                session.pause();
                "paused"
            } else {
                data.action = None;
                data.ease_score = None;
                data.anchor = None;
                "barrier"
            }
        }
        _ => return Err("This response is not allowed at the current coaching step".into()),
    };
    if !strategy
        .transitions
        .iter()
        .any(|t| t.from == previous_step && t.input == reply.name() && t.to.contains(&next))
    {
        return Err("Transition is not registered for this strategy version".into());
    }
    session.step = next.into();
    session.data = serde_json::to_value(data).map_err(|_| "Invalid coaching state")?;
    Ok(())
}
