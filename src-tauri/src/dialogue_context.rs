//! One bounded, permission-filtered workspace for both conversation and skill planning.
use crate::skills::Snapshot;
use serde_json::{json, Value};

pub const PRODUCT_FACTS: &str = "sumi is the user's personal goals workspace. Today has one In focus goal and a saved, ordered Later today queue. Up next is the first open goal in that queue, not a separate service. A goal can be discussed while another is in focus. Reading or discussing a goal never changes focus. Focus now changes it explicitly; opening details does not. Goals and steps have stable IDs; the circle completes an item. Park stores a checkpoint; Resume restores it. Progress distinguishes observed time, relevant goal time and confirmed completions; time alone never proves completion. Settings controls AI sharing, tracking, memory, quiet mode and provider connections. Accessibility permission is needed for activity collection. You can read local goal facts and use registered skills, but cannot inspect arbitrary files, send messages, or act in other apps. OS permissions and provider outages cannot be fixed by claiming success.";

fn clip(value: &mut Value, limit: usize) {
    if let Some(text) = value.as_str() {
        *value = json!(text.chars().take(limit).collect::<String>());
    }
}

pub fn workspace(snapshot: &Snapshot, share: bool, selected: Option<i64>) -> Value {
    if !share {
        return json!({"state_version":snapshot.version,"sharing":false,"goals":[],"work_queue":null,
            "references":crate::skills::References::default(),"deleted_goals":[]});
    }
    let focus = snapshot.data["focused_goal_id"].as_i64();
    let next = snapshot.data["work_queue"]["up_next_goal_id"].as_i64();
    let referenced = snapshot.references.last_referenced_goal_id;
    let mut goals = snapshot.data["goals"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    goals.sort_by_key(|g| {
        let id = g["goal_id"].as_i64();
        (id != selected, id != referenced, id != focus, id != next)
    });
    let total = goals.len();
    goals.truncate(40);
    for goal in &mut goals {
        let id = goal["goal_id"].as_i64();
        clip(&mut goal["title"], 200);
        let detailed = [selected, referenced, focus, next]
            .into_iter()
            .flatten()
            .any(|i| Some(i) == id);
        if detailed {
            clip(&mut goal["description"], 800);
            if let Some(steps) = goal["plan"]["steps"].as_array_mut() {
                steps.truncate(20);
                for step in steps {
                    clip(&mut step["text"], 200);
                }
            }
        } else {
            goal["description"] = Value::Null;
            goal["plan"] = json!({"details_available_via":"inspect_goal","steps":[]});
        }
    }
    let mut queue = snapshot.data["work_queue"].clone();
    if queue["in_focus"].is_object() {
        clip(&mut queue["in_focus"]["title"], 200);
        if queue["in_focus"]["next_step"].is_object() {
            clip(&mut queue["in_focus"]["next_step"]["text"], 200);
        }
    }
    if let Some(later) = queue["later_today"].as_array_mut() {
        for item in later {
            clip(&mut item["title"], 200);
            if item["next_step"].is_object() {
                clip(&mut item["next_step"]["text"], 200);
            }
        }
    }
    let deleted: Vec<_> = snapshot.data["backups"]
        .as_array()
        .into_iter()
        .flatten()
        .take(20)
        .map(|backup| {
            let mut backup = backup.clone();
            clip(&mut backup["title"], 200);
            backup
        })
        .collect();
    let mut references = json!(snapshot.references);
    if references["last_action"].is_object() {
        let action = &references["last_action"];
        references["last_action"] = json!({"skill":action["skill"],"goal_id":action["goal_id"],"step_id":action["step_id"],
            "data":{"backup_id":action["data"]["backup_id"],"research_id":action["data"]["research_id"],"status":action["data"]["status"]}});
    }
    json!({"state_version":snapshot.version,"sharing":true,"date":snapshot.data["date"],"goals":goals,
        "today":snapshot.data["today"],"work_queue":queue,"references":references,
        "deleted_goals":deleted,"focused_goal_id":focus,"total_goals":total,"omitted_goals":total.saturating_sub(40),
        "details_rule":"Only selected, recently referenced, focused and Up next goals include bounded details. Use inspect_goal for other goals or full text. Truncated labels are not full assignment evidence."})
}

pub fn packet(request: &Value, snapshot: &Snapshot, share: bool, tools: &[Value]) -> Value {
    let history: Vec<_> = request["conversation"]
        .as_array()
        .into_iter()
        .flatten()
        .rev()
        .take(12)
        .cloned()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|mut message| {
            clip(&mut message["text"], 2000);
            message
        })
        .collect();
    let mut packet = json!({"latest_request":request["latest_request"],"event_type":request.get("event_type").cloned().unwrap_or(json!("user_message")),
        "conversation":history,"attachment_text":request["attachment_text"],
        "selected_goal_id":if share {request["selected_goal_id"].clone()}else{Value::Null},
        "state":workspace(snapshot,share,request["selected_goal_id"].as_i64()),
        "personal_memory":if share {request["personal_memory"].clone()}else{Value::Null},
        "registry":crate::skills::planning_catalog(),"tool_results":tools,"product_facts":PRODUCT_FACTS,
        "tracking_insight":if share {request["goal_context"]["tracking_insight"].clone()}else{Value::Null},
        "avoidResourceUrls":if share {request["avoidResourceUrls"].clone()}else{Value::Null}});
    let mut omitted_history = 0;
    let mut omitted_tools = 0;
    while packet.to_string().len() > 80 * 1024 {
        if packet["conversation"]
            .as_array()
            .is_some_and(|a| !a.is_empty())
        {
            packet["conversation"].as_array_mut().unwrap().remove(0);
            omitted_history += 1;
        } else if packet["tool_results"]
            .as_array()
            .is_some_and(|a| a.len() > 1)
        {
            packet["tool_results"].as_array_mut().unwrap().remove(0);
            omitted_tools += 1;
        } else {
            break;
        }
    }
    packet["context_budget"] = json!({"maximum_bytes":98304,"omitted_older_messages":omitted_history,"omitted_older_tool_results":omitted_tools,"rule":"Omitted or clipped data is not evidence. Do not invent missing facts."});
    packet
}
