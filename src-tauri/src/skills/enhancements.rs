//! Shared goal workflows. All mutations remain inside the existing skill transaction.
use super::*;
use crate::core::{CoreGoal, GoalDetails};
use crate::memory::{ContextStatus, WorkContextInput};
use chrono::{NaiveDate, Utc};
use std::collections::HashSet;
mod receipts;
#[cfg(test)]
mod tests;
pub(super) fn receipt(result: &SkillResult, status: &str) -> Option<String> {
    receipts::receipt(result, status)
}

#[derive(Clone, Default, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Input {
    pub goal: Option<GoalTarget>,
    pub title: Option<String>,
    pub area: Option<String>,
    pub description: Option<String>,
    pub due_at: Option<String>,
    pub priority: Option<String>,
    pub done_when: Option<String>,
    pub steps: Option<Vec<String>>,
    pub date: Option<String>,
    pub include: Option<bool>,
    pub clear_fields: Option<Vec<String>>,
    pub query: Option<String>,
    pub status: Option<String>,
    pub overdue: Option<bool>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub ordered_step_ids: Option<Vec<String>>,
    pub step: Option<StepTarget>,
    pub summary: Option<String>,
    pub next_action: Option<String>,
    pub waiting_for: Option<String>,
    pub last_result: Option<String>,
    pub research_id: Option<i64>,
}

fn optional(max: usize) -> Value {
    json!({"type":["string","null"],"maxLength":max})
}
fn enum_optional(values: &[&str]) -> Value {
    let mut options = vec![Value::Null];
    options.extend(values.iter().map(|s| json!(s)));
    json!({"type":["string","null"],"enum":options})
}
fn clear_schema(values: &[&str]) -> Value {
    json!({"type":"array","maxItems":values.len(),"items":{"type":"string","enum":values}})
}
fn filter_schema() -> Value {
    shape(
        json!({"query":optional(500),"status":enum_optional(&["open","completed","deferred"]),
        "area":optional(80),"priority":enum_optional(&["low","medium","high"]),"date":optional(10),"overdue":{"type":["boolean","null"]}}),
    )
}
pub fn is_skill(name: &str) -> bool {
    [
        "create_planned_goal",
        "update_goal",
        "find_goals",
        "schedule_goal",
        "reorder_steps",
        "set_current_step",
        "restart_goal",
        "undo_last_goal_edit",
        "update_work_context",
        "inspect_research",
        "add_research_step",
    ]
    .contains(&name)
}
pub fn goal_schema_result() -> Value {
    shape(json!({"title":{"type":"string"},"status":{"type":"string"},
        "revision":{"type":"integer"},"created_at":{"type":"string"},
        "steps":{"type":"array","items":shape(json!({"id":{"type":"string"},"text":{"type":"string"},"done":{"type":"boolean"}}))},
        "on_today":{"type":"boolean"},"focused":{"type":"boolean"},
        "removed_step":{"anyOf":[shape(json!({"id":{"type":"string"},"text":{"type":"string"},"done":{"type":"boolean"}})),{"type":"null"}]},
        "goal_id":{"type":"integer"},"area":{"type":"string"},"description":{"type":"string"},
        "due_at":{"type":["string","null"]},"priority":{"type":["string","null"]},
        "done_when":{"type":"string"},"current_step":{"type":["string","null"]},
        "scheduled_dates":{"type":"array","items":{"type":"string"}},
        "checkpoint":{"anyOf":[crate::work_context::public_checkpoint_schema(),{"type":"null"}]}}))
}
fn goal_summary_schema() -> Value {
    shape(
        json!({"goal_id":{"type":"integer"},"title":{"type":"string"},"status":{"type":"string"},"area":{"type":"string"},
        "due_at":{"type":["string","null"]},"priority":{"type":["string","null"]},"step_count":{"type":"integer"},"completed_steps":{"type":"integer"},
        "next_step_preview":{"type":["string","null"]},"clipped":{"type":"boolean"},"details_available_via":{"type":"string","const":"inspect_goal"}}),
    )
}
pub fn registry() -> Vec<Skill> {
    let goal = super::goal_schema();
    let text = json!({"type":"string","minLength":1,"maxLength":500});
    let properties = json!({"goal":goal,"title":optional(500),"area":optional(80),
        "description":optional(4000),"due_at":optional(80),
        "priority":enum_optional(&["low","medium","high"]),"done_when":optional(500),
        "clear_fields":clear_schema(&["description","due_at","priority","done_when"])});
    let definitions = [
        ("create_planned_goal", "Create a goal with properties and up to 20 steps. date=null keeps it in the backlog; use an explicit local YYYY-MM-DD date only when scheduling was requested", Safety::Reversible,
            json!({"title":text,"area":optional(80),"description":optional(4000),"due_at":optional(80),"priority":enum_optional(&["low","medium","high"]),"done_when":optional(500),"steps":{"type":"array","maxItems":20,"items":text},"date":optional(10)})),
        ("update_goal", "Update only explicitly requested goal properties; null leaves a property unchanged, clear_fields explicitly clears it", Safety::Reversible, properties),
        ("find_goals", "Search ALL goals, including goals outside planning details; filter by title/description, state, area, priority, scheduled date and overdue deadline; paginate with offset. Null filters match all", Safety::ReadOnly,
            json!({"query":optional(500),"status":enum_optional(&["open","completed","deferred"]),"area":optional(80),"priority":enum_optional(&["low","medium","high"]),"date":optional(10),"overdue":{"type":["boolean","null"]},"offset":{"type":"integer","minimum":0,"maximum":500},"limit":{"type":"integer","minimum":1,"maximum":40}})),
        ("schedule_goal", "Add/remove an open goal to/from a specific local YYYY-MM-DD day; scheduling is separate from deadline and focus", Safety::Reversible,
            json!({"goal":goal,"date":{"type":"string","minLength":10,"maxLength":10},"include":{"type":"boolean"}})),
        ("reorder_steps", "Reorder existing steps with each actual step ID exactly once; preserves completion and current step", Safety::Reversible,
            json!({"goal":goal,"ordered_step_ids":{"type":"array","maxItems":20,"items":{"type":"string","minLength":1,"maxLength":80}}})),
        ("set_current_step", "Select one unfinished step in this goal; step=null clears the selection without changing progress or starting a timer", Safety::Reversible,
            json!({"goal":goal,"step":{"anyOf":[super::step_schema(),{"type":"null"}]}})),
        ("restart_goal", "Explicitly start this goal over: reopen it and reset ALL completed steps. Always preview and confirm the reset", Safety::Confirmation, json!({"goal":goal})),
        ("undo_last_goal_edit", "Undo the last supported goal property, step-order/current-step or scheduling edit in this conversation, only while the saved state is unchanged; deletes use restore_goal instead", Safety::Reversible, json!({})),
        ("update_work_context", "Update a goal checkpoint from explicit user facts without parking, focusing or completing work; null keeps existing fields, clear_fields clears waiting/next/result. last_result is user-reported, never verified completion", Safety::Reversible,
            json!({"goal":goal,"summary":optional(500),"next_action":optional(500),"waiting_for":optional(500),"last_result":optional(500),"clear_fields":clear_schema(&["next_action","waiting_for","last_result"])})),
        ("inspect_research", "Read an existing validated research receipt for this exact goal, with its actual sources, suggested next action and original step", Safety::ReadOnly,
            json!({"goal":goal,"research_id":{"type":"integer","minimum":1}})),
        ("add_research_step", "Only on explicit user request: add the saved validated research next action as an unfinished step in its original goal; never imply completion", Safety::Reversible,
            json!({"goal":goal,"research_id":{"type":"integer","minimum":1}})),
    ];
    definitions.into_iter().map(|(name, description, safety, properties)| {
        let data = match name {
            "find_goals" => shape(json!({"goals":{"type":"array","maxItems":40,"items":goal_summary_schema()},"total":{"type":"integer"},"offset":{"type":"integer"},"limit":{"type":"integer"},"filters":filter_schema()})),
            "update_work_context" => shape(json!({"title":{"type":"string"},"status":{"type":"string"},"created_at":{"type":"string"},"checkpoint":{"anyOf":[crate::work_context::public_checkpoint_schema(),{"type":"null"}]}})),
            "inspect_research" => shape(json!({"title":{"type":"string"},"created_at":{"type":"string"},"research_id":{"type":"integer"},"step_text":{"type":["string","null"]},"summary":{"type":"string"},"next_action":{"type":"string"},"sources":crate::research::attachment_list_schema()["items"]["properties"]["sources"]})),
            _ => goal_schema_result(),
        };
        Skill { name, description, safety, input_schema: shape(properties),
            result_schema: shape(json!({"skill":{"type":"string","const":name},"goal_id":{"type":["integer","null"]},"step_id":{"type":["string","null"]},"data":data})),
            validator: super::validate_input, executor: super::execute_one }
    }).collect()
}

// Validate the complete strict input contract before touching storage.
fn matches(schema: &Value, value: &Value) -> bool {
    if let Some(options) = schema["anyOf"].as_array() {
        return options.iter().any(|s| matches(s, value));
    }
    if !super::valid_result(schema, value) {
        return false;
    }
    if let Some(options) = schema["enum"].as_array() {
        if !options.contains(value) {
            return false;
        }
    }
    if let Some(s) = value.as_str() {
        let len = s.chars().count() as u64;
        if schema["minLength"].as_u64().is_some_and(|n| len < n)
            || schema["maxLength"].as_u64().is_some_and(|n| len > n)
        {
            return false;
        }
    }
    if let Some(n) = value.as_i64() {
        if schema["minimum"].as_i64().is_some_and(|min| n < min)
            || schema["maximum"].as_i64().is_some_and(|max| n > max)
        {
            return false;
        }
    }
    if let Some(items) = value.as_array() {
        if schema["maxItems"]
            .as_u64()
            .is_some_and(|n| items.len() as u64 > n)
        {
            return false;
        }
        return items.iter().all(|v| matches(&schema["items"], v));
    }
    if let Some(fields) = value.as_object() {
        return fields
            .iter()
            .all(|(key, v)| matches(&schema["properties"][key], v));
    }
    true
}
fn valid_date(date: &str) -> Result<(), String> {
    let parsed =
        NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "Use a valid YYYY-MM-DD date")?;
    if parsed.to_string() != date {
        return Err("Use a valid YYYY-MM-DD date".into());
    }
    Ok(())
}
pub fn validate(skill: &Skill, value: &Value) -> Result<Input, String> {
    if !matches(&skill.input_schema, value) {
        return Err("Skill input does not match its schema".into());
    }
    let input: Input =
        serde_json::from_value(value.clone()).map_err(|_| "Invalid skill arguments")?;
    if let Some(g) = &input.goal {
        if g.goal_id.is_some() == g.reference.is_some()
            || g.goal_id.is_some_and(|id| id <= 0)
            || g.reference
                .as_deref()
                .is_some_and(|r| ["active_goal", "only_parked"].contains(&r))
        {
            return Err("Supply one unambiguous goal reference".into());
        }
    }
    if let Some(s) = &input.step {
        if usize::from(s.step_id.is_some())
            + usize::from(s.ordinal.is_some())
            + usize::from(s.reference.is_some())
            != 1
        {
            return Err("Supply one unambiguous step reference".into());
        }
    }
    if let Some(date) = &input.date {
        valid_date(date)?;
    }
    if let Some(deadline) = &input.due_at {
        chrono::DateTime::parse_from_rfc3339(deadline)
            .map_err(|_| "Use an RFC3339 deadline with its timezone")?;
    }
    for title in input.title.iter().chain(input.steps.iter().flatten()) {
        crate::goals::text(title, true)?;
    }
    if let Some(clear) = &input.clear_fields {
        if clear.iter().collect::<HashSet<_>>().len() != clear.len() {
            return Err("Clear each field only once".into());
        }
        for field in clear {
            if !value[field].is_null() {
                return Err("Do not set and clear the same field".into());
            }
        }
    }
    if skill.name == "update_goal"
        && input.title.is_none()
        && input.area.is_none()
        && input.description.is_none()
        && input.due_at.is_none()
        && input.priority.is_none()
        && input.done_when.is_none()
        && input.clear_fields.as_ref().is_none_or(Vec::is_empty)
    {
        return Err("Specify at least one goal property to change".into());
    }
    if skill.name == "update_work_context"
        && input.summary.is_none()
        && input.next_action.is_none()
        && input.waiting_for.is_none()
        && input.last_result.is_none()
        && input.clear_fields.as_ref().is_none_or(Vec::is_empty)
    {
        return Err("Specify a checkpoint field to update".into());
    }
    Ok(input)
}
pub fn goal_data(storage: &Storage, id: i64) -> Result<Value, String> {
    let core = storage.core_snapshot(None)?;
    let goal = core
        .goals
        .iter()
        .find(|g| g.id == id)
        .ok_or("Goal no longer exists")?;
    let mut q = storage
        .connection
        .prepare("SELECT day FROM core_day_items WHERE goal_id=?1 ORDER BY day")
        .map_err(|e| e.to_string())?;
    let dates = q
        .query_map([id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let controls = storage.memory_controls()?;
    let checkpoint = if controls.enabled && controls.remember_work_context {
        storage
            .inspect_work_context(id)?
            .map(|c| crate::work_context::public_checkpoint(&c))
    } else {
        None
    };
    Ok(
        json!({"goal_id":id,"title":goal.title,"status":goal.status,"revision":goal.plan.revision,
        "created_at":goal.created_at,"steps":goal.plan.steps,"on_today":core.today.contains(&id),
        "focused":core.focused_goal_id==Some(id),"removed_step":null,
        "area":core.areas.iter().find(|a|a.id==goal.area_id).map(|a|a.title.as_str()).unwrap_or("General"),
        "description":goal.description,"due_at":goal.due_at,"priority":goal.priority,
            "done_when":goal.plan.done_when,"current_step":goal.plan.current_step,"scheduled_dates":dates,"checkpoint":checkpoint}),
    )
}
fn save_properties(storage: &mut Storage, id: i64, input: &Input) -> Result<(), String> {
    let core = storage.core_snapshot(None)?;
    let goal = core
        .goals
        .iter()
        .find(|g| g.id == id)
        .ok_or("Goal no longer exists")?;
    let mut plan = goal.plan.clone();
    let clears = input.clear_fields.clone().unwrap_or_default();
    if let Some(value) = &input.done_when {
        plan.done_when = value.clone();
    }
    if clears.iter().any(|f| f == "done_when") {
        plan.done_when.clear();
    }
    let mut details = GoalDetails {
        due_at: input.due_at.clone().or(goal.due_at.clone()),
        priority: input.priority.clone().or(goal.priority.clone()),
        description: input
            .description
            .clone()
            .unwrap_or_else(|| goal.description.clone()),
    };
    if clears.iter().any(|f| f == "due_at") {
        details.due_at = None;
    }
    if clears.iter().any(|f| f == "priority") {
        details.priority = None;
    }
    if clears.iter().any(|f| f == "description") {
        details.description.clear();
    }
    let area = input.area.as_deref().unwrap_or_else(|| {
        core.areas
            .iter()
            .find(|a| a.id == goal.area_id)
            .map(|a| a.title.as_str())
            .unwrap_or("General")
    });
    storage.core_save_goal_details(
        input.title.as_deref().unwrap_or(&goal.title),
        area,
        plan,
        Some(details),
    )
}
fn remember_result(
    storage: &Storage,
    result: &SkillResult,
    refs: &mut References,
) -> Result<(), String> {
    if let Some(id) = result.goal_id {
        if refs.last_referenced_goal_id != Some(id) {
            refs.last_referenced_step_id = None;
        }
        refs.last_referenced_goal_id = Some(id);
        refs.last_referenced_goal_created_at =
            result.data["created_at"].as_str().map(str::to_owned);
        if result.step_id.is_some() {
            refs.last_referenced_step_id = result.step_id.clone();
        }
        if result.skill == "create_planned_goal" {
            refs.last_created_goal_id = Some(id);
            refs.last_created_goal_created_at = refs.last_referenced_goal_created_at.clone();
            refs.last_created_step_id = None;
            refs.last_created_step_goal_id = None;
        }
    }
    refs.last_action = Some(serde_json::to_value(result).map_err(|e| e.to_string())?);
    let _ = storage;
    Ok(())
}
pub fn execute(
    skill: &Skill,
    storage: &mut Storage,
    input: Input,
    refs: &mut References,
    conversation: i64,
) -> Result<SkillResult, String> {
    let mut result = SkillResult {
        skill: skill.name.into(),
        goal_id: None,
        step_id: None,
        data: Value::Null,
    };
    if skill.name == "find_goals" {
        let core = storage.core_snapshot(input.date.as_deref())?;
        let query = input
            .query
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_lowercase();
        let goals: Vec<&CoreGoal> = core
            .goals
            .iter()
            .filter(|g| {
                let overdue = g.status != "completed"
                    && g.due_at
                        .as_ref()
                        .and_then(|d| chrono::DateTime::parse_from_rfc3339(d).ok())
                        .is_some_and(|d| d < Utc::now());
                (query.is_empty()
                    || g.title.to_lowercase().contains(&query)
                    || g.description.to_lowercase().contains(&query))
                    && input.status.as_ref().is_none_or(|s| &g.status == s)
                    && input
                        .priority
                        .as_ref()
                        .is_none_or(|p| g.priority.as_ref() == Some(p))
                    && input.area.as_ref().is_none_or(|area| {
                        core.areas.iter().any(|a| {
                            a.id == g.area_id && a.title.to_lowercase() == area.to_lowercase()
                        })
                    })
                    && input
                        .date
                        .as_ref()
                        .is_none_or(|_| core.date_goals.contains(&g.id))
                    && input.overdue.is_none_or(|wanted| overdue == wanted)
            })
            .collect();
        let offset = input.offset.unwrap_or(0);
        let limit = input.limit.unwrap_or(20);
        let page:Vec<_>=goals.iter().skip(offset).take(limit).map(|g|{
            let next=g.plan.steps.iter().find(|s|!s.done).map(|s|s.text.chars().take(200).collect::<String>());
            json!({"goal_id":g.id,"title":g.title.chars().take(200).collect::<String>(),"status":g.status,
                "area":core.areas.iter().find(|a|a.id==g.area_id).map(|a|a.title.as_str()).unwrap_or("General"),
                "due_at":g.due_at,"priority":g.priority,"step_count":g.plan.steps.len(),"completed_steps":g.plan.steps.iter().filter(|s|s.done).count(),
                "next_step_preview":next,"clipped":g.title.chars().count()>200 || g.plan.steps.iter().find(|s|!s.done).is_some_and(|s|s.text.chars().count()>200),"details_available_via":"inspect_goal"})
        }).collect();
        result.data = json!({"goals":page,"total":goals.len(),"offset":offset,"limit":limit,
            "filters":{"query":input.query,"status":input.status,"area":input.area,"priority":input.priority,"date":input.date,"overdue":input.overdue}});
        refs.last_action = Some(serde_json::to_value(&result).map_err(|e| e.to_string())?);
        let goal_ids: Vec<_> = page.iter().map(|g| g["goal_id"].clone()).collect();
        storage.connection.execute("INSERT INTO buddy_goal_search(conversation_id,payload) VALUES(?1,?2) ON CONFLICT(conversation_id) DO UPDATE SET payload=excluded.payload",params![conversation,json!({"filters":result.data["filters"],"offset":offset,"limit":limit,"total":goals.len(),"goal_ids":goal_ids}).to_string()]).map_err(|e|e.to_string())?;
        return Ok(result);
    }
    let id = if skill.name == "create_planned_goal" {
        storage.core_add_goals(
            vec![GoalDraft {
                title: input.title.clone().ok_or("Supply a title")?,
                area: input.area.clone().unwrap_or_else(|| "General".into()),
                steps: input.steps.clone().unwrap_or_default(),
            }],
            &format!(
                "skill-plan-{}",
                Utc::now().timestamp_nanos_opt().unwrap_or_default()
            ),
        )?;
        // core_add_goals inserts several child rows, so obtain the actual parent identity.
        let id: i64 = storage
            .connection
            .query_row("SELECT MAX(id) FROM goals", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        save_properties(storage, id, &input)?;
        if let Some(date) = &input.date {
            storage.core_today(id, true, date)?;
        }
        id
    } else if skill.name == "undo_last_goal_edit" {
        undo(storage, conversation)?
    } else {
        super::resolve_goal(storage, input.goal.as_ref().ok_or("Choose a goal")?, refs)?
    };
    result.goal_id = Some(id);
    if !["create_planned_goal", "undo_last_goal_edit"].contains(&skill.name) {
        let core = storage.core_snapshot(None)?;
        let goal = core
            .goals
            .iter()
            .find(|g| g.id == id)
            .ok_or("Goal no longer exists")?;
        let area = core
            .areas
            .iter()
            .find(|a| a.id == goal.area_id)
            .ok_or("Goal area unavailable")?;
        match skill.name {
            "update_goal" => save_properties(storage, id, &input)?,
            "schedule_goal" => storage.core_today(
                id,
                input.include.ok_or("Choose add or remove")?,
                input.date.as_deref().ok_or("Choose a date")?,
            )?,
            "restart_goal" => {
                storage.core_transition(id, "resume")?;
                let mut plan = storage.goal_plan(id)?;
                for step in &mut plan.steps {
                    step.done = false;
                }
                plan.current_step = None;
                storage.core_save_goal_details(&goal.title, &area.title, plan, None)?;
            }
            "reorder_steps" => {
                let ids = input
                    .ordered_step_ids
                    .as_ref()
                    .ok_or("Supply the complete step order")?;
                if ids.len() != goal.plan.steps.len()
                    || ids.iter().collect::<HashSet<_>>().len() != ids.len()
                    || ids
                        .iter()
                        .any(|id| !goal.plan.steps.iter().any(|s| &s.id == id))
                {
                    return Err(
                        "Include every existing step exactly once; do not invent or omit step IDs"
                            .into(),
                    );
                }
                let mut plan = goal.plan.clone();
                plan.steps = ids
                    .iter()
                    .map(|id| {
                        goal.plan
                            .steps
                            .iter()
                            .find(|s| &s.id == id)
                            .unwrap()
                            .clone()
                    })
                    .collect();
                storage.core_save_goal_details(&goal.title, &area.title, plan, None)?;
            }
            "set_current_step" => {
                if goal.status != "open" {
                    return Err("Reopen this goal before selecting a current step".into());
                }
                let mut plan = goal.plan.clone();
                plan.current_step = input
                    .step
                    .as_ref()
                    .map(|target| super::resolve_step(&plan, target, refs))
                    .transpose()?;
                result.step_id = plan.current_step.clone();
                storage.core_save_goal_details(&goal.title, &area.title, plan, None)?;
            }
            "update_work_context" => {
                update_context(storage, id, &input)?;
                result.data = json!({"title":goal.title,"status":goal.status,"created_at":goal.created_at,
                    "checkpoint":storage.inspect_work_context(id)?.map(|c|crate::work_context::public_checkpoint(&c))});
                remember_result(storage, &result, refs)?;
                return Ok(result);
            }
            "inspect_research" | "add_research_step" => {
                let controls = storage.memory_controls()?;
                if !controls.enabled || !controls.remember_work_context {
                    return Err(
                        "Enable Remember work context to use saved contextual research".into(),
                    );
                }
                let record =
                    storage.research_record(id, input.research_id.ok_or("Choose research")?)?;
                if record.status != "ready" {
                    return Err("This research is not ready".into());
                }
                let research = record
                    .result
                    .ok_or("This research has no validated result")?;
                if skill.name == "inspect_research" {
                    result.step_id = research.step_id.clone();
                    result.data = json!({"title":goal.title,"created_at":goal.created_at,"research_id":research.research_id,
                        "step_text":goal.plan.steps.iter().find(|s|Some(&s.id)==research.step_id.as_ref()).map(|s|&s.text),
                        "summary":research.summary,"next_action":research.next_action,"sources":research.sources});
                    // Research retains the real goal identity for subsequent references.
                    refs.last_referenced_goal_id = Some(id);
                    refs.last_referenced_goal_created_at = Some(goal.created_at.clone());
                    refs.last_referenced_step_id = result.step_id.clone();
                    refs.last_action =
                        Some(serde_json::to_value(&result).map_err(|e| e.to_string())?);
                    return Ok(result);
                }
                if goal.status != "open" {
                    return Err("Choose an open goal before adding a research step".into());
                }
                let mut plan = goal.plan.clone();
                let step_id = format!("research-{}", research.research_id);
                if plan.steps.iter().any(|s| s.id == step_id) {
                    return Err("This research next action is already a step".into());
                }
                plan.steps.push(Step {
                    id: step_id.clone(),
                    text: crate::goals::text(&research.next_action, true)?,
                    done: false,
                });
                storage.core_save_goal_details(&goal.title, &area.title, plan, None)?;
                result.step_id = Some(step_id.clone());
                refs.last_created_step_id = Some(step_id);
                refs.last_created_step_goal_id = Some(id);
            }
            _ => return Err("Unknown enhanced skill".into()),
        }
    }
    result.data = goal_data(storage, id)?;
    remember_result(storage, &result, refs)?;
    Ok(result)
}
fn update_context(storage: &mut Storage, id: i64, input: &Input) -> Result<(), String> {
    let old = storage.work_context(id)?;
    let goal = storage
        .core_snapshot(None)?
        .goals
        .into_iter()
        .find(|g| g.id == id)
        .ok_or("Goal no longer exists")?;
    let mut context = old
        .as_ref()
        .map(|c| c.context.clone())
        .unwrap_or(WorkContextInput {
            goal_id: id,
            step_id: goal.plan.current_step.clone(),
            summary: goal.title.clone(),
            next_action: None,
            status: if goal.status == "completed" {
                ContextStatus::Completed
            } else if goal.status == "deferred" {
                ContextStatus::Paused
            } else {
                ContextStatus::Active
            },
            last_app: None,
            last_window: None,
            waiting_for: None,
        });
    if let Some(s) = &input.summary {
        context.summary = s.clone();
    }
    if let Some(s) = &input.next_action {
        context.next_action = Some(s.clone());
    }
    if let Some(s) = &input.waiting_for {
        context.waiting_for = Some(s.clone());
    }
    let clear = input.clear_fields.clone().unwrap_or_default();
    if clear.iter().any(|s| s == "next_action") {
        context.next_action = None;
    }
    if clear.iter().any(|s| s == "waiting_for") {
        context.waiting_for = None;
    }
    context.status = if goal.status == "completed" {
        ContextStatus::Completed
    } else if context.waiting_for.is_some() {
        ContextStatus::Waiting
    } else if goal.status == "deferred" {
        ContextStatus::Paused
    } else {
        ContextStatus::Active
    };
    if context
        .step_id
        .as_ref()
        .is_some_and(|id| !goal.plan.steps.iter().any(|s| &s.id == id && !s.done))
    {
        context.step_id = None;
    }
    storage.save_work_context(context, old.map(|c| c.updated_at))?;
    if let Some(s) = &input.last_result {
        let s = crate::memory::safe_text(s, 500)?;
        storage
            .connection
            .execute(
                "UPDATE work_contexts SET last_result=?1 WHERE goal_id=?2",
                params![s, id],
            )
            .map_err(|e| e.to_string())?;
    } else if clear.iter().any(|s| s == "last_result") {
        storage
            .connection
            .execute(
                "UPDATE work_contexts SET last_result=NULL WHERE goal_id=?1",
                [id],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Undo is intentionally limited to edits whose complete effects can be restored locally.
const UNDOABLE: &[&str] = &[
    "rename_goal",
    "update_goal",
    "reorder_steps",
    "set_current_step",
    "schedule_goal",
    "add_goal_to_today",
    "remove_goal_from_today",
];
pub fn capture_undo(
    storage: &Storage,
    plan: &Plan,
    refs: &References,
) -> Result<Option<Value>, String> {
    if plan.actions.len() != 1 || !UNDOABLE.contains(&plan.actions[0].name.as_str()) {
        return Ok(None);
    }
    let target: GoalTarget = serde_json::from_value(plan.actions[0].input["goal"].clone())
        .map_err(|_| "Choose a goal")?;
    let id = super::resolve_goal(storage, &target, refs)?;
    let mut before = goal_data(storage, id)?;
    // A goal-edit journal never retains private checkpoint/research content.
    before.as_object_mut().unwrap().remove("checkpoint");
    before["operation"] = json!(plan.actions[0].name);
    let mut dates = before["scheduled_dates"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    dates.push(json!(plan.actions[0].input["date"]
        .as_str()
        .unwrap_or(&chrono::Local::now().date_naive().to_string())));
    let mut modes = serde_json::Map::new();
    for date in dates {
        let date = date.as_str().ok_or("Invalid undo date")?;
        let mode: Option<String> = storage
            .connection
            .query_row("SELECT mode FROM core_days WHERE day=?1", [date], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;
        modes.insert(date.into(), json!(mode));
    }
    before["day_modes"] = json!(modes);
    let mut query = storage
        .connection
        .prepare("SELECT day,rowid FROM core_day_items WHERE goal_id=?1")
        .map_err(|e| e.to_string())?;
    let positions = query
        .query_map([id], |r| {
            Ok((r.get::<_, String>(0)?, json!(r.get::<_, i64>(1)?)))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<serde_json::Map<String, Value>, _>>();
    // Preserve the saved day-plan membership order.
    before["day_positions"] = json!(positions.map_err(|e| e.to_string())?);
    Ok(Some(before))
}
fn fingerprint(storage: &Storage, conversation: i64) -> Result<Value, String> {
    let revision: i64 = storage
        .connection
        .query_row(
            "SELECT revision FROM buddy_action_version WHERE id=1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    // Ordinary reads change conversational references, not domain state or authorization.
    Ok(
        json!({"conversation":conversation,"revision":revision,"date":chrono::Local::now().date_naive().to_string(),"memory_controls":storage.memory_controls()?,"ai_permissions":storage.ai_preferences()?}),
    )
}
pub(super) fn journal_context(
    storage: &Storage,
    conversation: i64,
) -> Result<Option<Value>, String> {
    let raw: Option<String> = storage
        .connection
        .query_row(
            "SELECT payload FROM buddy_goal_edit_undo WHERE conversation_id=?1",
            [conversation],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(raw) = raw else { return Ok(None) };
    let saved: Value = serde_json::from_str(&raw).map_err(|_| "Invalid goal undo record")?;
    if saved["after"] != fingerprint(storage, conversation)? {
        return Ok(None);
    }
    let before = &saved["before"];
    Ok(Some(
        json!({"goal_id":before["goal_id"],"title":before["title"].as_str().unwrap_or_default().chars().take(200).collect::<String>(),"operation":before["operation"]}),
    ))
}
pub(super) fn search_context(
    storage: &Storage,
    conversation: i64,
) -> Result<Option<Value>, String> {
    let raw: Option<String> = storage
        .connection
        .query_row(
            "SELECT payload FROM buddy_goal_search WHERE conversation_id=?1",
            [conversation],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    raw.map(|s| serde_json::from_str(&s).map_err(|_| "Invalid goal search state".into()))
        .transpose()
}
pub fn save_undo(
    storage: &Storage,
    conversation: i64,
    plan: &Plan,
    before: Option<Value>,
) -> Result<(), String> {
    if let Some(before) = before {
        let payload = json!({"before":before,"after":fingerprint(storage,conversation)?});
        storage.connection.execute("INSERT INTO buddy_goal_edit_undo(conversation_id,payload) VALUES(?1,?2) ON CONFLICT(conversation_id) DO UPDATE SET payload=excluded.payload",params![conversation,payload.to_string()]).map_err(|e|e.to_string())?;
    } else if plan.actions.iter().any(|a| {
        registry()
            .iter()
            .any(|s| s.name == a.name && s.safety != Safety::ReadOnly)
    }) {
        storage
            .connection
            .execute(
                "DELETE FROM buddy_goal_edit_undo WHERE conversation_id=?1",
                [conversation],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn undo(storage: &mut Storage, conversation: i64) -> Result<i64, String> {
    let raw: String = storage
        .connection
        .query_row(
            "SELECT payload FROM buddy_goal_edit_undo WHERE conversation_id=?1",
            [conversation],
            |r| r.get(0),
        )
        .map_err(|_| "No supported goal edit is available to undo")?;
    let saved: Value = serde_json::from_str(&raw).map_err(|_| "Invalid goal undo record")?;
    if saved["after"] != fingerprint(storage, conversation)? {
        return Err(
            "The goal or conversation changed; the earlier edit cannot be safely undone".into(),
        );
    }
    let before = &saved["before"];
    let id = before["goal_id"].as_i64().ok_or("Invalid undo goal")?;
    let current = goal_data(storage, id)?;
    if before["created_at"] != current["created_at"] || before["status"] != current["status"] {
        return Err("The goal state changed; cannot undo this edit".into());
    }
    let mut plan = storage.goal_plan(id)?;
    plan.steps =
        serde_json::from_value(before["steps"].clone()).map_err(|_| "Invalid undo steps")?;
    plan.done_when = before["done_when"].as_str().unwrap_or_default().into();
    plan.current_step = before["current_step"].as_str().map(str::to_owned);
    let details = GoalDetails {
        description: before["description"].as_str().unwrap_or_default().into(),
        due_at: before["due_at"].as_str().map(str::to_owned),
        priority: before["priority"].as_str().map(str::to_owned),
    };
    storage.core_save_goal_details(
        before["title"].as_str().ok_or("Invalid undo title")?,
        before["area"].as_str().ok_or("Invalid undo area")?,
        plan,
        Some(details),
    )?;
    storage
        .connection
        .execute("DELETE FROM core_day_items WHERE goal_id=?1", [id])
        .map_err(|e| e.to_string())?;
    for date in before["scheduled_dates"]
        .as_array()
        .ok_or("Invalid undo dates")?
    {
        storage
            .connection
            .execute(
                "INSERT INTO core_day_items(rowid,day,goal_id) VALUES(?1,?2,?3)",
                params![
                    before["day_positions"][date.as_str().ok_or("Invalid undo date")?]
                        .as_i64()
                        .ok_or("Invalid saved queue position")?,
                    date.as_str().ok_or("Invalid undo date")?,
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
    }
    for (date, mode) in before["day_modes"]
        .as_object()
        .ok_or("Invalid undo day modes")?
    {
        if let Some(mode) = mode.as_str() {
            storage.connection.execute("INSERT INTO core_days(day,mode) VALUES(?1,?2) ON CONFLICT(day) DO UPDATE SET mode=excluded.mode",params![date,mode]).map_err(|e|e.to_string())?;
        } else {
            storage
                .connection
                .execute("DELETE FROM core_days WHERE day=?1", [date])
                .map_err(|e| e.to_string())?;
        }
    }
    storage
        .connection
        .execute(
            "DELETE FROM buddy_goal_edit_undo WHERE conversation_id=?1",
            [conversation],
        )
        .map_err(|e| e.to_string())?;
    Ok(id)
}
