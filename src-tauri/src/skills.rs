//! Structured, backend-owned chat actions. No provider output is executable code.
use crate::{ai_chat, core::GoalDraft, goals::Step, storage::Storage};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Safety {
    ReadOnly,
    Reversible,
    Confirmation,
}

pub struct Skill {
    pub name: &'static str,
    pub description: &'static str,
    pub safety: Safety,
    pub input_schema: Value,
    pub result_schema: Value,
    pub validator: fn(&Skill, &Value) -> Result<Input, String>,
    pub executor: fn(&Skill, &mut Storage, Input, &mut References) -> Result<SkillResult, String>,
}

#[derive(Clone, Default, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct References {
    pub last_referenced_goal_id: Option<i64>,
    pub last_referenced_step_id: Option<String>,
    pub last_created_goal_id: Option<i64>,
    pub last_created_step_id: Option<String>,
    pub last_created_step_goal_id: Option<i64>,
    pub last_action: Option<Value>,
    pub last_referenced_goal_created_at: Option<String>,
    pub last_created_goal_created_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GoalTarget {
    pub goal_id: Option<i64>,
    pub reference: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StepTarget {
    pub step_id: Option<String>,
    pub ordinal: Option<usize>,
    pub reference: Option<String>,
}
#[derive(Clone, Default, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Input {
    pub goal: Option<GoalTarget>,
    pub step: Option<StepTarget>,
    pub title: Option<String>,
    pub text: Option<String>,
    pub steps: Option<Vec<String>>,
    pub backup_id: Option<i64>,
    pub checkpoint: Option<crate::work_context::CheckpointDraft>,
    pub current_app: Option<String>,
    pub set_focus: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Action {
    pub name: String,
    pub input: Value,
    pub instruction: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Plan {
    pub kind: String,
    pub state_version: String,
    pub actions: Vec<Action>,
    pub clarification: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SkillResult {
    pub skill: String,
    pub goal_id: Option<i64>,
    pub step_id: Option<String>,
    pub data: Value,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub version: String,
    pub data: Value,
    pub references: References,
    pub conversation: i64,
    pub privacy_revision: Option<u64>,
}
#[derive(Serialize, Deserialize)]
struct Pending {
    plan: Plan,
    snapshot: Snapshot,
    expires_at: i64,
}
#[derive(Serialize)]
pub struct Execution {
    pub status: &'static str,
    pub results: Vec<SkillResult>,
    pub message: Option<String>,
}
impl Execution {
    pub fn committed_changes(&self) -> bool {
        self.status == "executed"
            && self.results.iter().any(|r| {
                registry()
                    .iter()
                    .any(|s| s.name == r.skill && s.safety != Safety::ReadOnly)
            })
    }
    pub fn fallback_message(&self) -> String {
        let mut lines = Vec::new();
        if self.status == "confirmation_required" {
            lines.push("Proposed changes only. Nothing has changed yet.".into());
        }
        for r in &self.results {
            let title = r.data["title"].as_str().unwrap_or("goal");
            let text = r.data["removed_step"]["text"]
                .as_str()
                .or_else(|| {
                    r.data["steps"]
                        .as_array()
                        .and_then(|steps| {
                            steps
                                .iter()
                                .find(|s| s["id"].as_str() == r.step_id.as_deref())
                        })
                        .and_then(|s| s["text"].as_str())
                })
                .unwrap_or("step");
            let line=match r.skill.as_str() {
                "create_goal"=>format!("Created \"{title}\" and added it to Today."),
                "rename_goal"=>format!("Renamed the goal to \"{title}\"."),
                "delete_goal"=>format!("Deleted \"{title}\". You can ask to restore it within 30 days, subject to your history retention settings."),
                "restore_goal"=>format!("Restored \"{title}\"."),
                "create_step"=>format!("Added \"{text}\" to \"{title}\"."),
                "rename_step"=>format!("Renamed the step to \"{text}\" in \"{title}\"."),
                "complete_step"=>format!("Marked \"{text}\" complete in \"{title}\"."),
                "reopen_step"=>format!("Reopened \"{text}\" in \"{title}\"."),
                "delete_step"=>format!("{} \"{text}\" from \"{title}\".",if self.status=="executed" {"Deleted"} else {"Delete"}),
                "complete_goal"=>format!("Completed \"{title}\" and its steps."),
                "reopen_goal"=>format!("Reopened \"{title}\"."),
                "add_goal_to_today"=>format!("Added \"{title}\" to Today."),
                "remove_goal_from_today"=>format!("Removed \"{title}\" from Today."),
                "set_focus_goal"=>format!("Selected \"{title}\" for activity tracking."),
                "park_context" | "resume_context" | "inspect_work_context" => crate::work_context::receipt(&r.skill,title,&r.data["checkpoint"]),
                "inspect_goal"=>format!("{title}\n{}",r.data["steps"].as_array().unwrap().iter().enumerate().map(|(i,s)|format!("{}. {}{}",i+1,s["text"].as_str().unwrap_or_default(),if s["done"]==true {" (complete)"} else {""})).collect::<Vec<_>>().join("\n")),
                "list_goals"=>r.data["goals"].as_array().unwrap().iter().map(|g|g["title"].as_str().unwrap_or_default()).collect::<Vec<_>>().join("\n"),
                _=>"Completed the requested action.".into(),
            };
            let line = if self.status == "confirmation_required" {
                let mut proposed = line.clone();
                for (past, future) in [
                    ("Created ", "Create "),
                    ("Renamed ", "Rename "),
                    ("Deleted ", "Delete "),
                    ("Restored ", "Restore "),
                    ("Added ", "Add "),
                    ("Marked ", "Mark "),
                    ("Reopened ", "Reopen "),
                    ("Completed ", "Complete "),
                    ("Removed ", "Remove "),
                    ("Selected ", "Select "),
                ] {
                    if let Some(rest) = line.strip_prefix(past) {
                        proposed = format!("{future}{rest}");
                        break;
                    }
                }
                proposed
            } else {
                line
            };
            lines.push(line);
        }
        if let Some(message) = &self.message {
            lines.push(message.clone());
        }
        if lines.iter().all(String::is_empty) {
            "No goals found.".into()
        } else {
            lines.join("\n")
        }
    }
}

fn result_schema(name: &str) -> Value {
    let step =
        shape(json!({"id":{"type":"string"},"text":{"type":"string"},"done":{"type":"boolean"}}));
    let data = match name {
        "park_context" | "resume_context" | "inspect_work_context" => shape(
            json!({"title":{"type":"string"},"status":{"type":"string"},"created_at":{"type":"string"},"checkpoint":{"anyOf":[crate::work_context::public_checkpoint_schema(),{"type":"null"}]}}),
        ),
        "list_goals" => shape(
            json!({"goals":{"type":"array","items":shape(json!({"goal_id":{"type":"integer"},"title":{"type":"string"},"status":{"type":"string"}}))}}),
        ),
        "delete_goal" => shape(
            json!({"title":{"type":"string"},"backup_id":{"type":"integer"},"undo":{"type":"string","const":"restore_goal"},"undo_days":{"type":"integer","const":30}}),
        ),
        _ => shape(
            json!({"title":{"type":"string"},"status":{"type":"string"},"revision":{"type":"integer"},"created_at":{"type":"string"},"steps":{"type":"array","items":step},"on_today":{"type":"boolean"},"focused":{"type":"boolean"},"removed_step":{"anyOf":[step,{"type":"null"}]}}),
        ),
    };
    shape(
        json!({"skill":{"type":"string","const":name},"goal_id":{"type":["integer","null"]},"step_id":{"type":["string","null"]},"data":data}),
    )
}

/// Validate the small JSON Schema subset used by backend result contracts.
fn valid_result(schema: &Value, value: &Value) -> bool {
    if let Some(alternatives) = schema["anyOf"].as_array() {
        return alternatives.iter().any(|s| valid_result(s, value));
    }
    if schema.get("const").is_some_and(|c| c != value) {
        return false;
    }
    let matches = |kind: &str| match kind {
        "null" => value.is_null(),
        "string" => value.is_string(),
        "integer" => value.is_i64() || value.is_u64(),
        "boolean" => value.is_boolean(),
        "array" => value.is_array(),
        "object" => value.is_object(),
        _ => false,
    };
    let correct_type = if let Some(kind) = schema["type"].as_str() {
        matches(kind)
    } else {
        schema["type"]
            .as_array()
            .is_some_and(|a| a.iter().any(|v| v.as_str().is_some_and(matches)))
    };
    if !correct_type {
        return false;
    }
    if let Some(fields) = value.as_object() {
        let properties = schema["properties"].as_object().unwrap();
        if fields.len() != properties.len() {
            return false;
        }
        return fields
            .iter()
            .all(|(key, value)| properties.get(key).is_some_and(|s| valid_result(s, value)));
    }
    if let Some(items) = value.as_array() {
        return items.iter().all(|v| valid_result(&schema["items"], v));
    }
    true
}

fn object(properties: Value, required: Vec<String>) -> Value {
    json!({"type":"object","additionalProperties":false,"properties":properties,"required":required})
}
fn shape(properties: Value) -> Value {
    let keys = properties.as_object().unwrap().keys().cloned().collect();
    object(properties, keys)
}
fn goal_schema() -> Value {
    shape(
        json!({"goal_id":{"type":["integer","null"],"minimum":1},"reference":{"type":["string","null"],"enum":[null,"last_referenced","last_created","previous_action","only_goal","active_goal","only_parked"]}}),
    )
}
fn step_schema() -> Value {
    shape(
        json!({"step_id":{"type":["string","null"],"minLength":1,"maxLength":80},"ordinal":{"type":["integer","null"],"minimum":1,"maximum":20},"reference":{"type":["string","null"],"enum":[null,"last_referenced","last_created","previous_action"]}}),
    )
}
pub fn registry() -> Vec<Skill> {
    let text = json!({"type":"string","minLength":1,"maxLength":500});
    let goal = goal_schema();
    let step = step_schema();
    [
        ("park_context","Save a short checkpoint and park this goal before switching work",Safety::Reversible,json!({"goal":goal,"checkpoint":{"anyOf":[crate::work_context::checkpoint_schema(),{"type":"null"}]},"current_app":{"type":["string","null"],"maxLength":120}})),
        ("resume_context","Resume this saved work context; optionally focus the goal without starting a timer",Safety::Reversible,json!({"goal":goal,"set_focus":{"type":"boolean"}})),
        ("inspect_work_context","Read where work stopped, the last meaningful result, next action and waiting state",Safety::ReadOnly,json!({"goal":goal})),
        (
            "list_goals",
            "List actual goals and stable IDs",
            Safety::ReadOnly,
            json!({}),
        ),
        (
            "inspect_goal",
            "Inspect a specific goal and ordered steps with IDs",
            Safety::ReadOnly,
            json!({"goal":goal}),
        ),
        (
            "create_goal",
            "Create a goal with optional steps and add it to Today",
            Safety::Reversible,
            json!({"title":text,"steps":{"type":"array","maxItems":20,"items":text}}),
        ),
        (
            "rename_goal",
            "Rename one goal by ID",
            Safety::Reversible,
            json!({"goal":goal,"title":text}),
        ),
        (
            "delete_goal",
            "Delete a goal with a 30 day local undo backup",
            Safety::Reversible,
            json!({"goal":goal}),
        ),
        (
            "restore_goal",
            "Restore the exact deleted goal backup by backup_id",
            Safety::Reversible,
            json!({"backup_id":{"type":"integer","minimum":1}}),
        ),
        (
            "add_goal_to_today",
            "Add an open goal to Today",
            Safety::Reversible,
            json!({"goal":goal}),
        ),
        (
            "remove_goal_from_today",
            "Remove a goal from Today",
            Safety::Reversible,
            json!({"goal":goal}),
        ),
        (
            "set_focus_goal",
            "Choose an open Today goal for activity tracking without starting a timer",
            Safety::Reversible,
            json!({"goal":goal}),
        ),
        (
            "complete_goal",
            "Complete a goal and its steps",
            Safety::Reversible,
            json!({"goal":goal}),
        ),
        (
            "reopen_goal",
            "Reopen a completed goal using the existing goal rules",
            Safety::Reversible,
            json!({"goal":goal}),
        ),
        (
            "create_step",
            "Append one step to a goal",
            Safety::Reversible,
            json!({"goal":goal,"text":text}),
        ),
        (
            "rename_step",
            "Rename a step belonging to the supplied goal",
            Safety::Reversible,
            json!({"goal":goal,"step":step,"text":text}),
        ),
        (
            "delete_step",
            "Delete a step only after explicit confirmation of the exact batch",
            Safety::Confirmation,
            json!({"goal":goal,"step":step}),
        ),
        (
            "complete_step",
            "Complete a step belonging to the supplied goal",
            Safety::Reversible,
            json!({"goal":goal,"step":step}),
        ),
        (
            "reopen_step",
            "Reopen a step belonging to the supplied goal",
            Safety::Reversible,
            json!({"goal":goal,"step":step}),
        ),
    ]
    .into_iter()
    .map(|(name, description, safety, properties)| Skill {
        name,
        description,
        safety,
        input_schema: shape(properties),
        result_schema: result_schema(name),
        validator: validate_input,
        executor: execute_one,
    })
    .collect()
}
pub fn catalog() -> Value {
    json!(registry().into_iter().map(|s|json!({"name":s.name,"description":s.description,"input_schema":s.input_schema,"permission":s.safety,"result_schema":s.result_schema})).collect::<Vec<_>>())
}
pub fn plan_schema() -> Value {
    let alternatives: Vec<_> = registry().into_iter().map(|s|shape(json!({"name":{"type":"string","const":s.name},"input":s.input_schema,"instruction":{"type":["string","null"],"maxLength":4000}}))).collect();
    shape(
        json!({"kind":{"type":"string","enum":["chat","actions","clarification"]},"state_version":{"type":"string"},"actions":{"type":"array","maxItems":20,"items":{"anyOf":alternatives}},"clarification":{"type":["string","null"],"maxLength":500}}),
    )
}
pub fn parse_plan(response: &Value) -> Result<Plan, String> {
    let plan: Plan = serde_json::from_str(crate::goal_analysis::response_text(response)?)
        .map_err(|_| "Buddy returned an invalid action plan; nothing was changed")?;
    if !["chat", "actions", "clarification"].contains(&plan.kind.as_str())
        || plan.state_version.is_empty()
        || plan.actions.len() > 20
        || (plan.kind == "actions") != !plan.actions.is_empty()
        || (plan.kind == "clarification") != plan.clarification.is_some()
        || plan
            .clarification
            .as_ref()
            .is_some_and(|q| q.trim().is_empty() || q.chars().count() > 500)
    {
        return Err("Invalid action plan fields; nothing was changed".into());
    }
    for action in &plan.actions {
        let skill = registry()
            .into_iter()
            .find(|s| s.name == action.name)
            .ok_or("Unknown Buddy skill")?;
        (skill.validator)(&skill, &action.input)?;
    }
    Ok(plan)
}
fn validate_input(skill: &Skill, value: &Value) -> Result<Input, String> {
    let fields = value.as_object().ok_or("Skill input must be an object")?;
    let properties = skill.input_schema["properties"].as_object().unwrap();
    if fields.len() != properties.len()
        || fields.keys().any(|k| !properties.contains_key(k))
        || fields.iter().any(|(key, value)| {
            value.is_null()
                && !(skill.name == "park_context"
                    && ["checkpoint", "current_app"].contains(&key.as_str()))
        })
    {
        return Err("Skill input does not match its schema".into());
    }
    let input: Input =
        serde_json::from_value(value.clone()).map_err(|_| "Invalid skill arguments")?;
    for value in [&input.title, &input.text].into_iter().flatten() {
        crate::goals::text(value, true)?;
    }
    if let Some(steps) = &input.steps {
        if steps.len() > 20 {
            return Err("Use at most 20 steps".into());
        }
        for step in steps {
            crate::goals::text(step, true)?;
        }
    }
    if let Some(goal) = &input.goal {
        if value["goal"].as_object().is_none_or(|o| o.len() != 2) {
            return Err("Invalid goal reference schema".into());
        }
        if goal.goal_id.is_some_and(|id| id <= 0)
            || (goal.goal_id.is_some() == goal.reference.is_some())
            || goal.reference.as_ref().is_some_and(|r| {
                ![
                    "last_referenced",
                    "last_created",
                    "previous_action",
                    "only_goal",
                    "active_goal",
                    "only_parked",
                ]
                .contains(&r.as_str())
            })
        {
            return Err("Supply one unambiguous goal reference".into());
        }
    }
    if let Some(step) = &input.step {
        if value["step"].as_object().is_none_or(|o| o.len() != 3) {
            return Err("Invalid step reference schema".into());
        }
        if usize::from(step.step_id.is_some())
            + usize::from(step.ordinal.is_some())
            + usize::from(step.reference.is_some())
            != 1
            || step.ordinal.is_some_and(|n| !(1..=20).contains(&n))
            || step
                .step_id
                .as_ref()
                .is_some_and(|id| id.is_empty() || id.len() > 80)
            || step.reference.as_ref().is_some_and(|r| {
                !["last_referenced", "last_created", "previous_action"].contains(&r.as_str())
            })
        {
            return Err("Supply one unambiguous step reference".into());
        }
    }
    if input
        .goal
        .as_ref()
        .and_then(|g| g.reference.as_deref())
        .is_some_and(|r| ["active_goal", "only_parked"].contains(&r))
        && !["park_context", "resume_context", "inspect_work_context"].contains(&skill.name)
    {
        return Err("Work-context references are only available to workflow skills".into());
    }
    if let Some(checkpoint) = &input.checkpoint {
        checkpoint.clone().validate()?;
    }
    if let Some(app) = &input.current_app {
        crate::memory::safe_text(app, 120)?;
    }
    if input.backup_id.is_some_and(|id| id <= 0) {
        return Err("Invalid backup ID".into());
    }
    Ok(input)
}

impl Storage {
    pub fn initialize_skills(&self) -> Result<(), String> {
        self.connection.execute_batch("CREATE TABLE IF NOT EXISTS buddy_action_state(conversation_id INTEGER PRIMARY KEY REFERENCES buddy_conversations(id) ON DELETE CASCADE,references_json TEXT NOT NULL,pending_json TEXT);
            CREATE TABLE IF NOT EXISTS buddy_action_version(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
            INSERT OR IGNORE INTO buddy_action_version(id,revision) VALUES(1,0);").map_err(|e|e.to_string())?;
        // Changes through existing UI/IPC operations must invalidate plans too. Time ticks do not.
        for table in [
            "goals",
            "goal_plans",
            "core_goals",
            "core_day_items",
            "core_goal_details",
            "deleted_goal_backups",
        ] {
            for event in ["INSERT", "UPDATE", "DELETE"] {
                self.connection.execute_batch(&format!("CREATE TRIGGER IF NOT EXISTS buddy_version_{table}_{event} AFTER {event} ON {table} BEGIN UPDATE buddy_action_version SET revision=revision+1 WHERE id=1; END;")).map_err(|e|e.to_string())?;
            }
        }
        Ok(())
    }
    pub fn action_references(&self, conversation: i64) -> Result<References, String> {
        let row: Option<String> = self
            .connection
            .query_row(
                "SELECT references_json FROM buddy_action_state WHERE conversation_id=?1",
                [conversation],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        row.map(|s| serde_json::from_str(&s).map_err(|_| "Invalid conversation references".into()))
            .unwrap_or(Ok(References::default()))
    }
    fn save_references(&self, conversation: i64, refs: &References) -> Result<(), String> {
        self.connection.execute("INSERT INTO buddy_action_state(conversation_id,references_json) VALUES(?1,?2) ON CONFLICT(conversation_id) DO UPDATE SET references_json=excluded.references_json",params![conversation,serde_json::to_string(refs).map_err(|e|e.to_string())?]).map(|_|()).map_err(|e|e.to_string())
    }
}
pub fn snapshot(storage: &Storage, conversation: i64) -> Result<Snapshot, String> {
    if !storage.conversation_exists(conversation) {
        return Err("That chat no longer exists".into());
    }
    let core = storage.core_snapshot(None)?;
    let refs = storage.action_references(conversation)?;
    let goals: Vec<_> = core.goals.iter().map(|g|json!({"goal_id":g.id,"created_at":g.created_at,"title":g.title,"status":g.status,"area_id":g.area_id,"plan":g.plan,"description":g.description,"due_at":g.due_at,"priority":g.priority,"has_work_context":g.work_context.is_some(),"parked":g.status=="deferred" && g.work_context.as_ref().is_some_and(|c|c.parked_at.is_some())})).collect();
    let mut q = storage
        .connection
        .prepare("SELECT id,payload FROM deleted_goal_backups WHERE deleted_at>=?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let backups = q.query_map([chrono::Utc::now().timestamp()-ai_chat::KEEP_DELETED_SECONDS],|r| {
        let payload:String=r.get(1)?;
        let backup:ai_chat::GoalBackup=serde_json::from_str(&payload).map_err(|e|rusqlite::Error::FromSqlConversionFailure(1,rusqlite::types::Type::Text,Box::new(e)))?;
        Ok(json!({"backup_id":r.get::<_,i64>(0)?,"original_goal_id":backup.plan.goal_id,"title":backup.title}))
    }).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    let database_revision: i64 = storage
        .connection
        .query_row(
            "SELECT revision FROM buddy_action_version WHERE id=1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(Snapshot {
        version: format!(
            "{}-{}",
            conversation,
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ),
        data: json!({"goals":goals,"today":core.today,"focused_goal_id":core.focused_goal_id,"date":core.date,"backups":backups,"references":refs,"database_revision":database_revision}),
        references: refs,
        conversation,
        privacy_revision: None,
    })
}
pub fn planning_context(snap: &Snapshot, share: bool) -> Value {
    if !share {
        return json!({"state_version":snap.version,"sharing":false,"goals":[],"references":References::default(),"deleted_goals":[]});
    }
    let mut goals = snap.data["goals"].as_array().cloned().unwrap_or_default();
    goals.sort_by_key(|g| {
        Some(g["goal_id"].as_i64().unwrap_or_default()) != snap.references.last_referenced_goal_id
    });
    goals.truncate(40);
    let deleted = &snap.data["backups"];
    json!({"state_version":snap.version,"sharing":true,"goals":goals,"today":snap.data["today"],"references":snap.references,"deleted_goals":deleted,"focused_goal_id":snap.data["focused_goal_id"],"total_goals":snap.data["goals"].as_array().unwrap().len()})
}

fn resolve_goal(storage: &Storage, target: &GoalTarget, refs: &References) -> Result<i64, String> {
    let id = match target.reference.as_deref() {
        Some("last_referenced") => refs.last_referenced_goal_id,
        Some("last_created") => refs.last_created_goal_id,
        Some("previous_action") => refs
            .last_action
            .as_ref()
            .and_then(|a| a["goal_id"].as_i64()),
        Some("active_goal") => storage.goal()?.map(|g| g.id),
        Some("only_parked") => {
            let parked: Vec<i64> = storage
                .core_snapshot(None)?
                .goals
                .iter()
                .filter(|g| {
                    g.status == "deferred"
                        && g.work_context
                            .as_ref()
                            .is_some_and(|c| c.parked_at.is_some())
                })
                .map(|g| g.id)
                .collect();
            if parked.len() != 1 {
                return Err(
                    "Which parked goal do you mean? Please select or name one goal.".into(),
                );
            }
            parked.first().copied()
        }
        Some("only_goal") => {
            let goals: Vec<_> = storage
                .core_snapshot(None)?
                .goals
                .into_iter()
                .filter(|g| g.status != "deleted")
                .collect();
            if goals.len() != 1 {
                return Err("Which goal do you mean? Please select or name one goal.".into());
            }
            Some(goals[0].id)
        }
        _ => target.goal_id,
    }
    .ok_or("Which goal do you mean? There is no unambiguous goal in this chat.")?;
    let core = storage.core_snapshot(None)?;
    let goal = core
        .goals
        .iter()
        .find(|g| g.id == id && g.status != "deleted")
        .ok_or("That goal no longer exists. Which goal do you mean?")?;
    let identity = match target.reference.as_deref() {
        Some("last_referenced") => refs.last_referenced_goal_created_at.as_deref(),
        Some("last_created") => refs.last_created_goal_created_at.as_deref(),
        Some("previous_action") => refs
            .last_action
            .as_ref()
            .and_then(|a| a["data"]["created_at"].as_str()),
        _ => None,
    };
    if matches!(
        target.reference.as_deref(),
        Some("last_referenced" | "last_created" | "previous_action")
    ) && identity != Some(goal.created_at.as_str())
    {
        return Err("The referenced goal changed or was deleted. Which goal do you mean?".into());
    }
    Ok(id)
}
fn resolve_step(
    plan: &crate::goals::GoalPlan,
    target: &StepTarget,
    refs: &References,
) -> Result<String, String> {
    let id = if let Some(n) = target.ordinal {
        plan.steps.get(n - 1).map(|s| s.id.clone())
    } else {
        match target.reference.as_deref() {
            Some("last_referenced") => (refs.last_referenced_goal_id == Some(plan.goal_id))
                .then(|| refs.last_referenced_step_id.clone())
                .flatten(),
            Some("last_created") => (refs.last_created_step_goal_id == Some(plan.goal_id))
                .then(|| refs.last_created_step_id.clone())
                .flatten(),
            Some("previous_action") => refs
                .last_action
                .as_ref()
                .filter(|a| a["goal_id"].as_i64() == Some(plan.goal_id))
                .and_then(|a| a["step_id"].as_str().map(str::to_string)),
            _ => target.step_id.clone(),
        }
    }
    .ok_or("Which step do you mean? Please specify its position or ID.")?;
    if !plan.steps.iter().any(|s| s.id == id) {
        return Err("That step does not belong to the selected goal or no longer exists.".into());
    }
    Ok(id)
}
fn execute_one(
    skill: &Skill,
    storage: &mut Storage,
    input: Input,
    refs: &mut References,
) -> Result<SkillResult, String> {
    let mut result = SkillResult {
        skill: skill.name.into(),
        goal_id: None,
        step_id: None,
        data: json!({}),
    };
    if skill.name == "list_goals" {
        result.data = json!({"goals":storage.core_snapshot(None)?.goals.into_iter().filter(|g|g.status!="deleted").map(|g|json!({"goal_id":g.id,"title":g.title,"status":g.status})).collect::<Vec<_>>()});
        return Ok(result);
    }
    if skill.name == "create_goal" {
        let title = input.title.ok_or("Goal title is required")?;
        let batch = format!(
            "skill-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        storage.core_add_goals(
            vec![GoalDraft {
                title,
                area: "General".into(),
                steps: input.steps.unwrap_or_default(),
            }],
            &batch,
        )?;
        let id: i64 = storage
            .connection
            .query_row("SELECT MAX(id) FROM goals", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        storage.core_today(id, true, &chrono::Local::now().date_naive().to_string())?;
        result.goal_id = Some(id);
        refs.last_created_goal_id = Some(id);
        refs.last_created_step_id = None;
        refs.last_created_step_goal_id = None;
    } else if skill.name == "restore_goal" {
        let id = restore(
            storage,
            input.backup_id.ok_or("Choose a deleted goal backup")?,
        )?;
        result.goal_id = Some(id);
        refs.last_created_goal_id = Some(id);
        refs.last_created_step_id = None;
        refs.last_created_step_goal_id = None;
    } else {
        let id = resolve_goal(storage, input.goal.as_ref().ok_or("Choose a goal")?, refs)?;
        let snapshot = storage.core_snapshot(None)?;
        let goal = snapshot
            .goals
            .iter()
            .find(|g| g.id == id)
            .ok_or("Goal no longer exists")?;
        result.goal_id = Some(id);
        match skill.name {
            "inspect_goal" => {}
            "park_context" => {
                let context = storage.park_work_context(
                    id,
                    input
                        .checkpoint
                        .ok_or("Generate a checkpoint before parking work")?,
                    input.current_app,
                )?;
                result.step_id = context.context.step_id.clone();
            }
            "resume_context" => {
                let context = storage.resume_work_context(
                    id,
                    input
                        .set_focus
                        .ok_or("Choose whether to focus the resumed goal")?,
                )?;
                result.step_id = context.context.step_id.clone();
            }
            "inspect_work_context" => {
                storage.inspect_work_context(id)?;
            }
            "delete_goal" => {
                let backup = delete(storage, id)?;
                result.data = json!({"title":goal.title,"backup_id":backup,"undo":"restore_goal","undo_days":30});
                if refs.last_created_goal_id == Some(id) {
                    refs.last_created_goal_id = None;
                    refs.last_created_goal_created_at = None;
                }
                if refs.last_created_step_goal_id == Some(id) {
                    refs.last_created_step_id = None;
                    refs.last_created_step_goal_id = None;
                }
                refs.last_referenced_goal_id = None;
                refs.last_referenced_goal_created_at = None;
                refs.last_referenced_step_id = None;
                refs.last_action = Some(serde_json::to_value(&result).map_err(|e| e.to_string())?);
                return Ok(result);
            }
            "add_goal_to_today" | "remove_goal_from_today" => {
                storage.core_today(id, skill.name == "add_goal_to_today", &snapshot.date)?
            }
            "complete_goal" | "reopen_goal" => storage.core_transition(
                id,
                if skill.name == "complete_goal" {
                    "complete"
                } else {
                    "resume"
                },
            )?,
            "set_focus_goal" => {
                if goal.status != "open" || !snapshot.today.contains(&id) {
                    return Err("Choose an open goal from Today".into());
                }
                if snapshot.focused_goal_id != Some(id) {
                    storage.transition_goal(id, "resume")?;
                }
            }
            kind => {
                let mut plan = goal.plan.clone();
                let mut title = goal.title.clone();
                if kind == "rename_goal" {
                    title = input.title.ok_or("Supply a new title")?;
                } else if kind == "create_step" {
                    let step_id = format!(
                        "skill-{}",
                        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
                    );
                    plan.steps.push(Step {
                        id: step_id.clone(),
                        text: input.text.ok_or("Supply step text")?,
                        done: false,
                    });
                    result.step_id = Some(step_id.clone());
                    refs.last_created_step_id = Some(step_id);
                    refs.last_created_step_goal_id = Some(id);
                } else {
                    let step_id =
                        resolve_step(&plan, input.step.as_ref().ok_or("Choose a step")?, refs)?;
                    let i = plan.steps.iter().position(|s| s.id == step_id).unwrap();
                    match kind {
                        "rename_step" => {
                            plan.steps[i].text = input.text.ok_or("Supply step text")?
                        }
                        "complete_step" => plan.steps[i].done = true,
                        "reopen_step" => plan.steps[i].done = false,
                        "delete_step" => {
                            result.data["removed_step"] = json!(plan.steps[i]);
                            plan.steps.remove(i);
                            if refs.last_created_step_goal_id == Some(id)
                                && refs.last_created_step_id.as_ref() == Some(&step_id)
                            {
                                refs.last_created_step_id = None;
                                refs.last_created_step_goal_id = None;
                            }
                        }
                        _ => return Err("Unknown skill executor".into()),
                    }
                    if plan.current_step.as_ref() == Some(&step_id)
                        && (kind == "delete_step" || kind == "complete_step")
                    {
                        plan.current_step = None;
                    }
                    result.step_id = Some(step_id);
                }
                let area = snapshot
                    .areas
                    .iter()
                    .find(|a| a.id == goal.area_id)
                    .ok_or("Goal area unavailable")?;
                storage.core_save_goal_details(&title, &area.title, plan, None)?;
            }
        }
    }
    let id = result.goal_id.unwrap();
    let core = storage.core_snapshot(None)?;
    let goal = core
        .goals
        .iter()
        .find(|g| g.id == id)
        .ok_or("Goal no longer exists")?;
    let removed = result.data["removed_step"].clone();
    result.data = json!({"title":goal.title,"status":goal.status,"revision":goal.plan.revision,"created_at":goal.created_at,"steps":goal.plan.steps,"on_today":core.today.contains(&id),"focused":core.focused_goal_id==Some(id),"removed_step":removed});
    if ["park_context", "resume_context", "inspect_work_context"].contains(&skill.name) {
        result.data = json!({"title":goal.title,"status":goal.status,"created_at":goal.created_at,"checkpoint":storage.inspect_work_context(id)?.map(|c|crate::work_context::public_checkpoint(&c))});
    }
    if refs.last_referenced_goal_id != Some(id) {
        refs.last_referenced_step_id = None;
    }
    refs.last_referenced_goal_id = Some(id);
    refs.last_referenced_goal_created_at = Some(goal.created_at.clone());
    if matches!(skill.name, "create_goal" | "restore_goal") {
        refs.last_created_goal_created_at = Some(goal.created_at.clone());
    }
    if result.step_id.is_some() {
        refs.last_referenced_step_id = if skill.name == "delete_step" {
            None
        } else {
            result.step_id.clone()
        };
    }
    refs.last_action = Some(serde_json::to_value(&result).map_err(|e| e.to_string())?);
    Ok(result)
}

fn delete(storage: &mut Storage, id: i64) -> Result<i64, String> {
    let snapshot = storage.core_snapshot(None)?;
    let goal = snapshot
        .goals
        .iter()
        .find(|g| g.id == id)
        .ok_or("Goal no longer exists")?;
    let mut rows = std::collections::BTreeMap::new();
    for table in ai_chat::BACKUP_TABLES
        .into_iter()
        .chain(["core_goal_details", "app_rules"])
    {
        rows.insert(table.into(), ai_chat::dump_rows(storage, table, id)?);
    }
    let backup = ai_chat::GoalBackup {
        title: goal.title.clone(),
        area: snapshot
            .areas
            .iter()
            .find(|a| a.id == goal.area_id)
            .ok_or("Goal area unavailable")?
            .title
            .clone(),
        status: goal.status.clone(),
        on_today: snapshot.today.contains(&id),
        plan: goal.plan.clone(),
        rows,
    };
    storage
        .connection
        .execute(
            "INSERT INTO deleted_goal_backups(title,deleted_at,payload) VALUES(?1,?2,?3)",
            params![
                backup.title,
                chrono::Utc::now().timestamp(),
                serde_json::to_string(&backup).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
    let backup_id = storage.connection.last_insert_rowid();
    storage.core_transition(id, "delete")?;
    storage.ensure_today_focus()?;
    Ok(backup_id)
}
fn restore(storage: &mut Storage, backup_id: i64) -> Result<i64, String> {
    let payload: String = storage
        .connection
        .query_row(
            "SELECT payload FROM deleted_goal_backups WHERE id=?1 AND deleted_at>=?2",
            params![
                backup_id,
                chrono::Utc::now().timestamp() - ai_chat::KEEP_DELETED_SECONDS
            ],
            |r| r.get(0),
        )
        .map_err(|_| "That undo backup is unavailable or expired")?;
    let backup: ai_chat::GoalBackup =
        serde_json::from_str(&payload).map_err(|_| "Invalid undo backup")?;
    storage.core_add_goals(
        vec![GoalDraft {
            title: backup.title.clone(),
            area: backup.area.clone(),
            steps: vec![],
        }],
        &format!("skill-restore-{backup_id}"),
    )?;
    let id: i64 = storage
        .connection
        .query_row("SELECT MAX(id) FROM goals", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let mut plan = backup.plan;
    plan.goal_id = id;
    plan.revision = storage.goal_plan(id)?.revision;
    storage.core_save_goal_details(&backup.title, &backup.area, plan, None)?;
    if backup.status == "completed" {
        storage.core_transition(id, "complete")?;
    } else if backup.status == "deferred" {
        storage.core_transition(id, "defer")?;
    }
    storage
        .connection
        .execute("DELETE FROM core_events WHERE goal_id=?1", [id])
        .map_err(|e| e.to_string())?;
    for table in ai_chat::BACKUP_TABLES
        .into_iter()
        .chain(["core_goal_details", "app_rules"])
    {
        if let Some(rows) = backup.rows.get(table) {
            ai_chat::load_rows(storage, table, id, rows)?;
        }
    }
    if backup.on_today && backup.status == "open" {
        storage.core_today(id, true, &chrono::Local::now().date_naive().to_string())?;
    }
    storage
        .connection
        .execute("DELETE FROM deleted_goal_backups WHERE id=?1", [backup_id])
        .map_err(|e| e.to_string())?;
    Ok(id)
}

/// All actions, references and undo records commit together or roll back together.
fn batch(
    storage: &mut Storage,
    snap: &Snapshot,
    plan: &Plan,
    commit: bool,
) -> Result<Vec<SkillResult>, String> {
    storage
        .connection
        .execute_batch("SAVEPOINT buddy_skill_batch")
        .map_err(|e| e.to_string())?;
    let outcome = (|| {
        // Re-check inside the SQLite snapshot as well as under the application mutex.
        if snapshot(storage, snap.conversation)?.data != snap.data {
            return Err("The goals changed. Please retry with the current state.".into());
        }
        let mut refs = snap.references.clone();
        let mut results = Vec::new();
        for action in &plan.actions {
            let skill = registry()
                .into_iter()
                .find(|s| s.name == action.name)
                .ok_or("Unknown skill")?;
            let input = (skill.validator)(&skill, &action.input)?;
            let result = (skill.executor)(&skill, storage, input, &mut refs)?;
            if !valid_result(
                &skill.result_schema,
                &serde_json::to_value(&result).map_err(|e| e.to_string())?,
            ) {
                return Err("The skill result failed validation; nothing was changed".into());
            }
            results.push(result);
        }
        storage.save_references(snap.conversation, &refs)?;
        Ok(results)
    })();
    if outcome.is_err() || !commit {
        storage
            .connection
            .execute_batch("ROLLBACK TO buddy_skill_batch; RELEASE buddy_skill_batch")
            .map_err(|e| e.to_string())?;
    } else {
        storage
            .connection
            .execute_batch("RELEASE buddy_skill_batch")
            .map_err(|e| e.to_string())?;
    }
    outcome
}
pub fn execute(
    storage: &mut Storage,
    snap: &Snapshot,
    plan: &Plan,
    latest: &str,
    share: bool,
    confirmed: bool,
) -> Result<Execution, String> {
    if plan.state_version != snap.version || snapshot(storage, snap.conversation)?.data != snap.data
    {
        return Err(
            "The goals or conversation changed. Please retry with the current state.".into(),
        );
    }
    if plan.kind != "actions"
        || plan.actions.is_empty()
        || plan.actions.len() > 20
        || plan.clarification.is_some()
    {
        return Err("No skill actions to execute".into());
    }
    for action in &plan.actions {
        let skill = registry()
            .into_iter()
            .find(|s| s.name == action.name)
            .ok_or("Unknown skill")?;
        (skill.validator)(&skill, &action.input)?;
        if !share && skill.name != "create_goal" {
            return Err("Enable goal context sharing before acting on existing goals.".into());
        }
        if skill.safety != Safety::ReadOnly && !confirmed {
            let answer = latest.trim().trim_end_matches(['.', '!']).to_lowercase();
            if ["confirm", "yes", "подтверждаю", "да"].contains(&answer.as_str()) {
                return Err(
                    "There is no pending action to confirm. Please give an explicit instruction."
                        .into(),
                );
            }

            let quote = action
                .instruction
                .as_deref()
                .filter(|q| q.trim().chars().count() >= 3 && latest.contains(*q));
            if quote.is_none() {
                return Err(
                    "Please give an explicit instruction before changing goals or steps.".into(),
                );
            }
        }
    }
    let mut parked = std::collections::HashSet::new();
    for action in plan.actions.iter().filter(|a| a.name == "park_context") {
        let id = resolve_workflow_goal(storage, &action.input, snap)?;
        if !parked.insert(id) {
            return Err("Park each goal once per request".into());
        }
        for other in plan.actions.iter().filter(|a| a.name != "park_context") {
            if registry()
                .iter()
                .any(|s| s.name == other.name && s.safety != Safety::ReadOnly)
            {
                if let Some(target) = other.input.get("goal") {
                    let target: GoalTarget = serde_json::from_value(target.clone())
                        .map_err(|_| "Invalid goal reference")?;
                    if resolve_goal(storage, &target, &snap.references)
                        .is_ok_and(|other_id| other_id == id)
                    {
                        return Err("Park separately from other changes to the same goal so the checkpoint uses current work".into());
                    }
                }
            }
        }
    }
    if plan.actions.iter().any(|a| {
        registry()
            .iter()
            .any(|s| s.name == a.name && s.safety == Safety::Confirmation)
    }) && !confirmed
    {
        let preview = batch(storage, snap, plan, false)?;
        let pending = Pending {
            plan: plan.clone(),
            snapshot: snap.clone(),
            expires_at: chrono::Utc::now().timestamp() + 300,
        };
        storage.save_references(snap.conversation, &snap.references)?;
        storage
            .connection
            .execute(
                "UPDATE buddy_action_state SET pending_json=?1 WHERE conversation_id=?2",
                params![
                    serde_json::to_string(&pending).map_err(|e| e.to_string())?,
                    snap.conversation
                ],
            )
            .map_err(|e| e.to_string())?;
        return Ok(Execution{status:"confirmation_required",results:preview,message:Some("Confirm this batch of changes? It includes deleting a step. Reply Confirm or Cancel. Nothing has changed yet.".into())});
    }
    Ok(Execution {
        status: "executed",
        results: batch(storage, snap, plan, true)?,
        message: None,
    })
}
pub fn pending_reply(
    storage: &mut Storage,
    conversation: i64,
    text: &str,
    share: bool,
    privacy_revision: u64,
) -> Result<Option<Execution>, String> {
    let pending: Option<String> = storage
        .connection
        .query_row(
            "SELECT pending_json FROM buddy_action_state WHERE conversation_id=?1",
            [conversation],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    let Some(pending) = pending else {
        return Ok(None);
    };
    storage
        .connection
        .execute(
            "UPDATE buddy_action_state SET pending_json=NULL WHERE conversation_id=?1",
            [conversation],
        )
        .map_err(|e| e.to_string())?;
    let answer = text.trim().trim_end_matches(['.', '!']).to_lowercase();
    if ["cancel", "no", "отмена", "нет"].contains(&answer.as_str()) {
        return Ok(Some(Execution {
            status: "cancelled",
            results: vec![],
            message: Some("Cancelled. Nothing was changed.".into()),
        }));
    }
    if !["confirm", "yes", "подтверждаю", "да"].contains(&answer.as_str()) {
        return Ok(None);
    }
    let pending: Pending =
        serde_json::from_str(&pending).map_err(|_| "Invalid pending confirmation")?;
    if pending
        .snapshot
        .privacy_revision
        .is_some_and(|r| r != privacy_revision)
    {
        return Err("Sharing settings changed. Please repeat your request.".into());
    }
    if pending.expires_at < chrono::Utc::now().timestamp() {
        return Err("That confirmation expired. Please repeat your request.".into());
    }
    execute(storage, &pending.snapshot, &pending.plan, text, share, true).map(Some)
}

#[cfg(test)]
mod tests;

pub fn resolve_workflow_goal(
    storage: &Storage,
    input: &Value,
    snapshot: &Snapshot,
) -> Result<i64, String> {
    let skill = registry()
        .into_iter()
        .find(|s| s.name == "park_context")
        .unwrap();
    let input = (skill.validator)(&skill, input)?;
    resolve_goal(
        storage,
        input.goal.as_ref().ok_or("Choose a goal")?,
        &snapshot.references,
    )
}
