//! The user's words constrain operations; the model resolves exact objects and arguments.
//! This never selects a goal by title, relaxes permissions, or supplies invented IDs.
use crate::skills::{Action, Plan};
use serde_json::{json, Value};

fn words_outside_quotes(text: &str) -> String {
    let mut closing = None;
    text.chars()
        .map(|c| match (closing, c) {
            (Some(end), value) if value == end => {
                closing = None;
                ' '
            }
            (Some(_), _) => ' ',
            (None, '«') => {
                closing = Some('»');
                ' '
            }
            (None, '“') => {
                closing = Some('”');
                ' '
            }
            (None, '"') => {
                closing = Some('"');
                ' '
            }
            (_, value) => value,
        })
        .collect::<String>()
        .to_lowercase()
}

#[derive(Default)]
pub struct Contract {
    pub skills: Vec<&'static str>,
    pub read_only: bool,
    quoted: Vec<String>,
}
impl Contract {
    pub fn from_request(latest: &str) -> Self {
        let text = words_outside_quotes(latest);
        let has = |patterns: &[&str]| patterns.iter().any(|p| text.contains(p));
        let mut result = Self::default();
        let mut closing = None;
        let mut quote = String::new();
        for c in latest.chars() {
            match (closing, c) {
                (Some(end), value) if value == end => {
                    result.quoted.push(std::mem::take(&mut quote));
                    closing = None;
                }
                (Some(_), value) => quote.push(value),
                (None, '«') => closing = Some('»'),
                (None, '“') => closing = Some('”'),
                (None, '"') => closing = Some('"'),
                _ => {}
            }
        }
        // Questions about how/why to perform an action are advice, never authorization.
        if has(&[
            "how do",
            "how can",
            "should i",
            "can i",
            "what happens",
            "what does",
            "what is",
            "why",
            "explain",
            "tell me",
            "i prefer",
            "my preference",
            "remember that",
            "i deleted",
            "i created",
            "i renamed",
            "i completed",
            "я предпочитаю",
            "запомни, что",
            "что будет",
            "что значит",
            "объясни",
            "расскажи",
            "можно ли",
            "что нужно",
            "я удалил",
            "я создал",
            "я завершил",
            "я переименовал",
            "не удаляй",
            "не переименовывай",
            "what if",
            "как мне",
            "как можно",
            "стоит ли",
            "почему",
        ]) || has(&["change nothing", "ничего не меняй", "без изменений"])
            && !has(&[
                "park ",
                "resume ",
                "return me",
                "bring me back",
                "сохрани, где",
                "верни меня",
            ])
            || text.trim_start().starts_with("```")
        {
            result.read_only = true;
        }
        let creates_content = has(&[
            "create a prompt",
            "create a draft",
            "напиши промпт",
            "создай промпт",
            "translate",
            "переведи",
        ]);
        if creates_content
            || text.trim_start().starts_with("do not ")
            || text.trim_start().starts_with("don't ")
        {
            result.read_only = true;
        }
        let step = has(&[
            "step",
            "шаг",
            "первый",
            "второй",
            "третий",
            "четвертый",
            "четвёртый",
        ]);
        if has(&[
            "rename",
            "переимен",
            "назови",
            "change the title",
            "измени название",
        ]) {
            result.skills.push(
                if step
                    && !has(&[
                        "rename goal",
                        "rename the goal",
                        "переименуй цель",
                        "переименовать цель",
                    ])
                {
                    "rename_step"
                } else {
                    "rename_goal"
                },
            );
        }
        if has(&["create", "создай", "создать", "add ", "добав"])
            && !has(&["today", "сегодня"])
            && has(&[
                "goal",
                "цель",
                "цели",
                "задач",
                "step",
                "шаг",
                "туда",
                "there",
            ])
        {
            let creates_goal =
                has(&["create", "создай", "создать"]) && has(&["goal", "цель", "цели"]);
            result.skills.push(if creates_goal {
                "create_goal"
            } else if step || has(&["туда", "there"]) {
                "create_step"
            } else {
                "create_goal"
            });
            if creates_goal && step && !has(&["без шагов", "without steps", "no steps"]) {
                result.skills.push("create_step");
            }
        }
        if has(&["delete", "удали", "remove", "убери"]) {
            result.skills.push(if has(&["today", "сегодня"]) {
                "remove_goal_from_today"
            } else if step {
                "delete_step"
            } else {
                "delete_goal"
            });
        }
        if has(&[
            "reopen",
            "uncheck",
            "сними отметку",
            "не выполнен",
            "снова открой",
        ]) {
            result
                .skills
                .push(if step { "reopen_step" } else { "reopen_goal" });
        } else if has(&[
            "complete",
            "mark",
            "check off",
            "отметь",
            "готовым",
            "выполненным",
            "заверши",
        ]) && !has(&["not complete", "не отмечай", "не заверши"])
        {
            result.skills.push(if step {
                "complete_step"
            } else {
                "complete_goal"
            });
        }
        if has(&["restore", "восстанов", "bring back"]) {
            result.skills.push("restore_goal");
        }
        if has(&["add", "добав", "перенеси"]) && has(&["today", "сегодня"]) {
            result.skills.push("add_goal_to_today");
        }
        if has(&["focus", "фокус"])
            && has(&[
                "set",
                "select",
                "focus it",
                "выбери",
                "поставь",
                "сфокусируй",
            ])
        {
            result.skills.push("set_focus_goal");
        }
        if has(&[
            "park ",
            "park this",
            "сохрани, где",
            "запомни это",
            "отложи",
            "припаркуй",
        ]) {
            result.skills.push("park_context");
        }
        if has(&[
            "resume ",
            "return me",
            "bring me back",
            "верни меня",
            "продолжим",
            "возобнови",
        ]) {
            result.skills.push("resume_context");
        }
        if has(&["search", "поищи", "поискать", "найди в интернете"]) {
            result.skills.push("search_web");
        }
        if has(&[
            "feedback",
            "обратную связь",
            "research was helpful",
            "исследование помогло",
        ]) {
            result.skills.push("record_research_feedback");
        }
        if has(&[
            "what remains",
            "what is left",
            "where did i stop",
            "where i left off",
            "current priorities",
            "what did i do today",
            "что осталось",
            "что у меня",
            "что я",
            "где я",
            "что ждёт",
            "что ждет",
            "list ",
            "show ",
            "покажи",
            "список целей",
        ]) {
            result.read_only = result.skills.is_empty() || result.read_only;
        }
        if result.read_only {
            result.skills.clear();
            if has(&["что осталось", "what remains", "what is left"]) {
                result.skills.extend(["inspect_continuity", "inspect_goal"]);
            } else if has(&[
                "где я остановился",
                "where did i stop",
                "where i left off",
                "что я делал здесь",
            ]) {
                result.skills.extend([
                    "inspect_work_context",
                    "inspect_continuity",
                    "inspect_goal",
                ]);
            } else if has(&["что я сегодня сделал", "what did i do today"]) {
                result
                    .skills
                    .extend(["inspect_today", "inspect_continuity"]);
            } else if has(&[
                "что у меня сейчас главное",
                "что ждёт",
                "что ждет",
                "вчера",
                "current priorities",
                "yesterday",
            ]) {
                result.skills.push("inspect_continuity");
            } else if has(&["list goals", "list my goals", "список целей"]) {
                result.skills.push("list_goals");
            }
        }
        result.skills.sort_unstable();
        result.skills.dedup();
        result
    }
    pub fn schema(&self) -> Value {
        let mut schema = crate::agent_runtime::reasoning::schema();
        // Offers belong to background events. A chat request must execute, clarify,
        // stage a reviewed preference, or continue normal conversation.
        schema["properties"]["decision"]["enum"] = if self.skills.is_empty() {
            json!([
                "stay_silent",
                "update_memory_only",
                "execute_explicit_user_action",
                "request_clarification"
            ])
        } else {
            json!(["execute_explicit_user_action", "request_clarification"])
        };
        if let Some(alternatives) =
            schema["properties"]["proposed_actions"]["items"]["anyOf"].as_array_mut()
        {
            alternatives.retain(|schema| {
                let name = schema["properties"]["name"]["const"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();
                self.validate_action(&Action {
                    name: name.into(),
                    input: Value::Null,
                    instruction: None,
                })
                .is_ok()
            });
            for schema in alternatives {
                let name = schema["properties"]["name"]["const"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();
                if crate::skills::registry()
                    .iter()
                    .any(|s| s.name == name && s.safety != crate::skills::Safety::ReadOnly)
                {
                    schema["properties"]["instruction"] =
                        json!({"type":"string","minLength":3,"maxLength":4000});
                }
                if let Some((field, literal)) = self.literal(&name) {
                    schema["properties"]["input"]["properties"][field]["const"] = json!(literal);
                }
            }
        }
        schema
    }
    pub fn schema_for_state(&self, snapshot: &crate::skills::Snapshot, share: bool) -> Value {
        fn restrict(node: &mut Value, goals: &[Value], steps: &[Value]) {
            if node["properties"]["goal_id"]["type"] == "integer" && !goals.is_empty() {
                node["properties"]["goal_id"]["enum"] = json!(goals);
            }
            if node["properties"]["step_id"]["type"] == "string" && !steps.is_empty() {
                node["properties"]["step_id"]["enum"] = json!(steps);
            }
            if let Some(variants) = node.get_mut("anyOf").and_then(Value::as_array_mut) {
                variants.retain(|v| {
                    !(goals.is_empty() && v["properties"]["goal_id"]["type"] == "integer")
                        && !(steps.is_empty() && v["properties"]["step_id"]["type"] == "string")
                });
            }
            match node {
                Value::Object(fields) => {
                    for child in fields.values_mut() {
                        restrict(child, goals, steps)
                    }
                }
                Value::Array(items) => {
                    for child in items {
                        restrict(child, goals, steps)
                    }
                }
                _ => {}
            }
        }
        let mut schema = self.schema();
        if share {
            let goals = snapshot.data["goals"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let ids: Vec<_> = goals.iter().map(|g| g["goal_id"].clone()).collect();
            let steps: Vec<_> = goals
                .iter()
                .flat_map(|g| {
                    g["plan"]["steps"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .map(|s| s["id"].clone())
                })
                .collect();
            restrict(&mut schema, &ids, &steps);
        }
        schema
    }
    fn literal(&self, name: &str) -> Option<(&'static str, &str)> {
        if self.skills.len() != 1 {
            return None;
        }
        match (name, self.quoted.len()) {
            ("create_goal", 1) => Some(("title", self.quoted[0].as_str())),
            ("rename_goal", 2) => Some(("title", self.quoted[1].as_str())),
            ("rename_step", 2 | 3) => Some(("text", self.quoted.last().unwrap().as_str())),
            _ => None,
        }
        .filter(|(_, literal)| !literal.trim().is_empty() && literal.chars().count() <= 500)
    }
    pub fn context(&self) -> Value {
        json!({"allowed_operations":self.skills,"read_only":self.read_only,
            "rule":"Resolve IDs from authoritative state. Do not substitute another operation. If uncertain, request clarification."})
    }
    pub fn validate_action(&self, action: &Action) -> Result<(), String> {
        let read = crate::skills::registry()
            .iter()
            .any(|s| s.name == action.name && s.safety == crate::skills::Safety::ReadOnly);
        if self.read_only && !read {
            return Err(
                "This request is read-only. Please explicitly request a change separately.".into(),
            );
        }
        if !self.skills.is_empty() && !self.skills.contains(&action.name.as_str()) {
            return Err(
                "The planned operation does not match your request. Please clarify the action."
                    .into(),
            );
        }
        Ok(())
    }
    pub fn bind(&self, plan: &mut Plan, latest: &str) -> Result<(), String> {
        for action in &mut plan.actions {
            self.validate_action(action)?;
            if !self.read_only && self.skills.contains(&action.name.as_str()) {
                // Backend-owned provenance: never rely on the model copying a quote correctly.
                action.instruction = Some(latest.into());
                if let Some((field, literal)) = self.literal(&action.name) {
                    action.input[field] = json!(literal);
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn action(name: &str) -> Action {
        Action {
            name: name.into(),
            input: json!({}),
            instruction: None,
        }
    }
    #[test]
    fn literal_rename_and_read_schemas_match_user_request_and_actual_ids() {
        let text = "Переименуй цель «Interview» в «Interview ready».";
        let c = Contract::from_request(text);
        let mut p = Plan {
            kind: "actions".into(),
            state_version: "v".into(),
            actions: vec![Action {
                name: "rename_goal".into(),
                input: json!({"title":"Interview"}),
                instruction: None,
            }],
            clarification: None,
        };
        c.bind(&mut p, text).unwrap();
        assert_eq!(p.actions[0].input["title"], "Interview ready");
        let read =
            Contract::from_request("Что осталось по цели «Interview ready»? Ничего не меняй.");
        let snap = crate::skills::Snapshot {
            version: "v".into(),
            data: json!({"goals":[{"goal_id":7,"plan":{"steps":[{"id":"step-7"}]}}]}),
            references: Default::default(),
            conversation: 1,
            privacy_revision: None,
        };
        let schema = read.schema_for_state(&snap, true);
        assert_eq!(
            schema["properties"]["decision"]["enum"],
            json!(["execute_explicit_user_action", "request_clarification"])
        );
        let actions = schema["properties"]["proposed_actions"]["items"]["anyOf"]
            .as_array()
            .unwrap();
        assert_eq!(actions.len(), 2);
        assert!(actions
            .iter()
            .all(|a| ["inspect_goal", "inspect_continuity"]
                .contains(&a["properties"]["name"]["const"].as_str().unwrap())));
        assert!(schema.to_string().contains("\"enum\":[7]"));
        assert!(!read
            .schema_for_state(&snap, false)
            .to_string()
            .contains("\"enum\":[7]"));
    }
    #[test]
    fn audit_intents_do_not_allow_substituting_reopen_for_rename() {
        let c = Contract::from_request("Переименуй цель «Interview» в «Tauri onboarding».");
        assert_eq!(c.skills, vec!["rename_goal"]);
        assert!(c.validate_action(&action("reopen_goal")).is_err());
        assert!(c.validate_action(&action("rename_goal")).is_ok());
    }
    #[test]
    fn ordinals_and_explicit_resume_have_backend_owned_instruction() {
        for (text, name) in [
            ("Первый отметь готовым.", "complete_step"),
            (
                "Resume the test goal with set_focus=false.",
                "resume_context",
            ),
            ("Добавь туда четыре шага.", "create_step"),
        ] {
            let c = Contract::from_request(text);
            let mut p = Plan {
                kind: "actions".into(),
                state_version: "v".into(),
                actions: vec![action(name)],
                clarification: None,
            };
            c.bind(&mut p, text).unwrap();
            assert_eq!(p.actions[0].instruction.as_deref(), Some(text));
        }
    }
    #[test]
    fn read_questions_and_quoted_instructions_cannot_mutate() {
        for text in [
            "Что осталось по цели «удали цель»? Ничего не меняй.",
            "How do I delete a goal?",
            "Как мне создать цель?",
            "Explain this: \"delete goal\"",
            "I prefer that you never delete goals.",
            "I deleted a goal yesterday.",
            "What happens when I delete a goal?",
        ] {
            let c = Contract::from_request(text);
            assert!(!c.skills.contains(&"delete_goal"));
            if c.read_only {
                assert!(c.validate_action(&action("delete_goal")).is_err());
            }
        }
    }
}
