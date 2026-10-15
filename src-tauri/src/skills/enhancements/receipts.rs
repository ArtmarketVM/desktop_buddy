//! Deterministic readable receipts; provider prose never owns action status.
use super::*;

fn label(value: &Value) -> String {
    value
        .as_str()
        .unwrap_or_default()
        .replace(['\n', '\r'], " ")
}
fn checklist(data: &Value) -> String {
    data["steps"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|s| {
            format!(
                "- [{}] {}{}",
                if s["done"] == true { "x" } else { " " },
                label(&s["text"]),
                if s["id"] == data["current_step"] {
                    " — current step"
                } else {
                    ""
                }
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}
fn properties(data: &Value) -> String {
    let mut rows = vec![format!("- Status: {}", label(&data["status"]))];
    for (key, name) in [
        ("area", "Area"),
        ("priority", "Priority"),
        ("due_at", "Deadline"),
        ("description", "Description"),
        ("done_when", "Done when"),
    ] {
        if data[key].as_str().is_some_and(|s| !s.is_empty()) {
            rows.push(format!("- {name}: {}", label(&data[key])));
        }
    }
    if let Some(dates) = data["scheduled_dates"].as_array().filter(|a| !a.is_empty()) {
        rows.push(format!(
            "- Scheduled: {}",
            dates.iter().map(label).collect::<Vec<_>>().join(", ")
        ));
    }
    if data["focused"] == true {
        rows.push("- Current focus".into());
    }
    rows.join("\n")
}
fn goal_list(data: &Value) -> String {
    let goals = data["goals"].as_array().cloned().unwrap_or_default();
    if goals.is_empty() {
        if data["total"].as_u64().unwrap_or(0) > 0 {
            return "No goals on this page. Ask for the previous page or narrow the search.".into();
        }
        return "No matching goals found.".into();
    }
    let mut out = vec!["### Goals".into()];
    for (state, title) in [
        ("open", "Open"),
        ("deferred", "Paused"),
        ("completed", "Completed"),
    ] {
        let matching: Vec<_> = goals.iter().filter(|g| g["status"] == state).collect();
        if matching.is_empty() {
            continue;
        }
        out.push(format!("\n**{title}**"));
        for goal in matching {
            let mut details = Vec::new();
            for key in ["area", "priority", "due_at"] {
                if goal[key].as_str().is_some_and(|s| !s.is_empty()) {
                    details.push(label(&goal[key]));
                }
            }
            if let Some(steps) = goal["steps"].as_array().filter(|s| !s.is_empty()) {
                details.push(format!(
                    "{}/{} steps",
                    steps.iter().filter(|s| s["done"] == true).count(),
                    steps.len()
                ));
            } else if goal["step_count"].as_u64().unwrap_or(0) > 0 {
                details.push(format!(
                    "{}/{} steps",
                    goal["completed_steps"].as_u64().unwrap_or(0),
                    goal["step_count"].as_u64().unwrap_or(0)
                ));
            }
            out.push(format!(
                "- **{}**{}",
                label(&goal["title"]),
                if details.is_empty() {
                    String::new()
                } else {
                    format!(" — {}", details.join(" · "))
                }
            ));
        }
    }
    if let Some(total) = data["total"].as_u64() {
        let offset = data["offset"].as_u64().unwrap_or(0);
        out.push(format!(
            "\nShowing {}–{} of {total} goals.{}",
            offset + 1,
            offset + goals.len() as u64,
            if offset + (goals.len() as u64) < total {
                " Ask for the next page to see more."
            } else {
                ""
            }
        ));
    }
    out.join("\n")
}
pub(super) fn receipt(result: &SkillResult, status: &str) -> Option<String> {
    let data = &result.data;
    let title = label(&data["title"]);
    let preview = status == "confirmation_required";
    let text = match result.skill.as_str() {
        "inspect_today" => {
            let mut out = vec![
                format!("### Today — {}", label(&data["day"])),
                "\n**Confirmed results**".into(),
            ];
            let results = data["confirmed_results"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            if results.is_empty() {
                out.push("No confirmed completion is recorded today.".into());
            }
            for result in results.iter().take(40) {
                out.push(format!("- [x] {}", label(result)));
            }
            if results.len() > 40 {
                out.push(format!(
                    "{} additional recorded results; ask about a specific goal.",
                    results.len() - 40
                ));
            }
            out.push("\n**Remaining in Today**".into());
            let remaining = data["remaining_goals"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            if remaining.is_empty() {
                out.push("No unfinished goals in today's plan.".into());
            }
            for goal in remaining {
                out.push(format!("\n**{}**", label(&goal["title"])));
                let steps = goal["steps"].as_array().cloned().unwrap_or_default();
                if steps.is_empty() {
                    out.push("No unfinished steps recorded; the goal remains open.".into());
                }
                for step in steps {
                    out.push(format!("- [ ] {}", label(&step)));
                }
            }
            out.push("\n**Waiting for**".into());
            let waiting = data["waiting_goals"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            if waiting.is_empty() {
                out.push("No waiting items are recorded in the available context.".into());
            }
            for item in waiting {
                out.push(format!(
                    "- **{}:** {}",
                    label(&item["title"]),
                    label(&item["waiting_for"])
                ));
            }
            if data["omitted_goals"].as_u64().unwrap_or(0) > 0 {
                out.push("Additional goals omitted; ask about one goal for details.".into());
            }
            out.push(format!("\n**Activity time**\n- Relevant activity: {} min\n- Observed activity: {} min\n- Manual timer: {} min\n\nTime alone does not confirm completion.",data["relevant_seconds"].as_u64().unwrap_or(0)/60,data["observed_seconds"].as_u64().unwrap_or(0)/60,data["timer_seconds"].as_u64().unwrap_or(0)/60));
            out.join("\n")
        }
        "list_goals" | "find_goals" => goal_list(data),
        "inspect_goal" => {
            let steps = checklist(data);
            let checkpoint = if data["checkpoint"].is_object() {
                format!(
                    "\n\n{}",
                    crate::work_context::receipt(
                        "inspect_work_context",
                        &title,
                        &data["checkpoint"]
                    )
                )
            } else {
                String::new()
            };
            format!(
                "### {title}\n\n{}\n\n{}{checkpoint}",
                properties(data),
                if steps.is_empty() {
                    "No steps yet.".into()
                } else {
                    steps
                }
            )
        }
        "create_goal" | "create_planned_goal" => {
            let steps = checklist(data);
            format!(
                "Created \"{title}\"{}\n\n{}{}",
                if data["on_today"] == true {
                    " and added it to Today."
                } else {
                    "."
                },
                properties(data),
                if steps.is_empty() {
                    String::new()
                } else {
                    format!("\n\n{steps}")
                }
            )
        }
        "update_goal" => format!("Updated \"{title}\".\n\n{}", properties(data)),
        "reorder_steps" => format!("Reordered steps in \"{title}\".\n\n{}", checklist(data)),
        "set_current_step" => {
            let step = data["steps"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|s| s["id"] == data["current_step"]);
            step.map(|s| format!("Current step for \"{title}\": **{}**.", label(&s["text"])))
                .unwrap_or_else(|| format!("Cleared the current step for \"{title}\"."))
        }
        "schedule_goal" => format!(
            "Updated the schedule for \"{title}\".\n\n{}",
            properties(data)
        ),
        "complete_goal" => format!(
            "{} \"{title}\" and all {} steps.{}",
            if preview { "Complete" } else { "Completed" },
            data["steps"].as_array().map_or(0, Vec::len),
            if preview {
                " Any timer on this goal will stop after confirmation."
            } else {
                ""
            }
        ),
        "reopen_goal" => format!(
            "Reopened \"{title}\"; step progress was preserved.{}",
            if data["on_today"] == true {
                String::new()
            } else {
                " Add it to Today when you want to work on it today.".into()
            }
        ),
        "restart_goal" => format!(
            "{} \"{title}\"{}\n\n{}",
            if preview { "Restart" } else { "Restarted" },
            if preview {
                ": all step completion marks will be cleared after confirmation."
            } else {
                "; all steps are now unfinished."
            },
            checklist(data)
        ),
        "undo_last_goal_edit" => format!(
            "Undid the last supported edit to \"{title}\".\n\n{}",
            properties(data)
        ),
        "park_context" | "resume_context" | "inspect_work_context" | "update_work_context" => {
            crate::work_context::receipt(&result.skill, &title, &data["checkpoint"])
        }
        "inspect_research" => {
            let sources = data["sources"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|s| {
                    format!(
                        "- [{}]({})",
                        label(&s["title"]).replace(['[', ']'], ""),
                        label(&s["url"])
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            format!("### Research for {title}\n\n{}{}\n\n**Suggested next action:** {}\n\n**Sources**\n{sources}\n\nAsk sumi to add this next action as an unfinished step if useful.",label(&data["summary"]),data["step_text"].as_str().map(|s|format!("\n\n**Original step:** {}",s.replace(['\n','\r']," "))).unwrap_or_default(),label(&data["next_action"]))
        }
        "add_research_step" => {
            let text = data["steps"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|s| s["id"].as_str() == result.step_id.as_deref())
                .map(|s| label(&s["text"]))
                .unwrap_or_default();
            format!("Added the research next action to \"{title}\".\n\n- [ ] {text}")
        }
        _ => return None,
    };
    Some(text)
}
