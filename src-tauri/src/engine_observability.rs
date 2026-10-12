//! Local, content-free engine diagnostics and an explicitly requested synthetic inference probe.
use crate::{
    commands::{AppState, Inner},
    goal_analysis::{self, Service},
    http, skills,
};
use rusqlite::OptionalExtension;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{State, WebviewWindow};

#[derive(Clone, Debug, Serialize)]
pub struct Inference {
    operation: String,
    status: &'static str,
    latency_ms: u64,
    provider_reported_model: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct Health {
    pub status: &'static str,
    pub latency_ms: Option<u64>,
    pub provider_reported_model: Option<String>,
    pub error: Option<&'static str>,
    pub checked_at: Option<String>,
}
impl Default for Health {
    fn default() -> Self {
        Self {
            status: "not_checked",
            latency_ms: None,
            provider_reported_model: None,
            error: None,
            checked_at: None,
        }
    }
}
#[derive(Default)]
pub struct Telemetry {
    sequence: u64,
    last: Option<Inference>,
    last_skill: Option<String>,
    privacy: u64,
    health: Health,
    health_privacy: u64,
    health_started: Option<Instant>,
    health_running: bool,
}
fn model_label(value: &str) -> Option<String> {
    (value.len() <= 160
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/_:.-".contains(&b)))
    .then(|| crate::memory::safe_text(value, 160).ok())
    .flatten()
}
fn label(value: &str) -> String {
    crate::memory::safe_text(value, 500).unwrap_or_else(|_| "[Private label]".into())
}
fn elapsed(start: Instant) -> u64 {
    start.elapsed().as_millis().min(u64::MAX as u128) as u64
}
struct InferenceGuard<'a> {
    state: &'a AppState,
    sequence: u64,
    privacy: u64,
    operation: String,
    start: Instant,
    finished: bool,
}
impl<'a> InferenceGuard<'a> {
    fn start(state: &'a AppState, operation: &str) -> Result<Self, String> {
        let mut inner = state.inner.lock().map_err(|_| "Engine state unavailable")?;
        inner.engine.sequence = inner.engine.sequence.wrapping_add(1);
        Ok(Self {
            state,
            sequence: inner.engine.sequence,
            privacy: inner.privacy_revision,
            operation: operation.into(),
            start: Instant::now(),
            finished: false,
        })
    }
    fn finish(&mut self, status: &'static str, model: Option<String>) {
        if let Ok(mut inner) = self.state.inner.lock() {
            if inner.engine.sequence == self.sequence && inner.privacy_revision == self.privacy {
                inner.engine.privacy = self.privacy;
                inner.engine.last = Some(Inference {
                    operation: self.operation.clone(),
                    status,
                    latency_ms: elapsed(self.start),
                    provider_reported_model: model,
                });
            }
        }
        self.finished = true;
    }
}
impl Drop for InferenceGuard<'_> {
    fn drop(&mut self) {
        if !self.finished {
            self.finish("cancelled", None);
        }
    }
}
/// Existing retry/validation logic stays authoritative. Dropped requests are recorded as cancelled.
pub async fn request_validated<T>(
    state: &AppState,
    service: &Service<'_>,
    system: &str,
    context: Value,
    name: &str,
    schema: Value,
    parse: impl Fn(&Value) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = InferenceGuard::start(state, name)?;
    let reported = Mutex::new(None);
    let result = service
        .request_validated(system, context, name, schema, |value| {
            let parsed = parse(value)?;
            if let Ok(mut model) = reported.lock() {
                *model = value["model"].as_str().and_then(model_label);
            }
            Ok(parsed)
        })
        .await;
    guard.finish(
        if result.is_ok() { "success" } else { "error" },
        reported.into_inner().unwrap_or_default(),
    );
    result
}
pub(crate) fn record_execution(inner: &mut Inner, execution: &skills::Execution) {
    if execution.status == "executed" {
        inner.engine.last_skill = execution.results.last().map(|r| r.skill.clone());
    }
}
fn skill_groups() -> Value {
    let groups = [
        (
            "Goals",
            vec![
                "list_goals",
                "inspect_goal",
                "create_goal",
                "rename_goal",
                "delete_goal",
                "restore_goal",
                "add_goal_to_today",
                "remove_goal_from_today",
                "set_focus_goal",
            ],
        ),
        ("Steps", vec!["create_step", "rename_step", "delete_step"]),
        ("Memory", vec![]),
        (
            "Work Context",
            vec!["park_context", "resume_context", "inspect_work_context"],
        ),
        (
            "Research",
            vec![
                "search_web",
                "attach_research_to_context",
                "record_research_feedback",
            ],
        ),
        (
            "Completion Verification",
            vec![
                "complete_step",
                "reopen_step",
                "complete_goal",
                "reopen_goal",
            ],
        ),
        ("Daily Review", vec!["inspect_today", "inspect_continuity"]),
    ];
    let registry = skills::registry();
    json!(groups.into_iter().map(|(group,names)|json!({"group":group,"skills":registry.iter().filter(|s|names.contains(&s.name)).map(|s|json!({"name":s.name,"permission":s.safety})).collect::<Vec<_>>(),"note":if group=="Memory" {"Validated local Memory APIs and reviewed preference proposals; no unrestricted memory-write skill."}else{""}})).collect::<Vec<_>>())
}
pub(crate) fn view(inner: &Inner) -> Result<Value, String> {
    let ai = inner.storage.ai_preferences()?;
    let memory = inner.storage.memory_controls()?;
    let sharing = ai.enabled && ai.share_goal_context;
    let goal = if sharing { inner.storage.goal()? } else { None };
    let plan = goal
        .as_ref()
        .map(|g| inner.storage.goal_plan(g.id))
        .transpose()?;
    let step = plan.as_ref().and_then(|p| {
        p.current_step
            .as_ref()
            .and_then(|id| p.steps.iter().find(|s| &s.id == id))
    });
    let refs = inner
        .storage
        .action_references(inner.storage.current_conversation()?)?;
    let last_skill = if sharing {
        inner
            .engine
            .last_skill
            .as_deref()
            .or_else(|| refs.last_action.as_ref().and_then(|a| a["skill"].as_str()))
            .filter(|n| skills::registry().iter().any(|s| s.name == *n))
    } else {
        None
    };
    let metadata: Option<String> = if memory.enabled && sharing {
        inner
            .storage
            .connection
            .query_row(
                "SELECT metadata FROM memory_retrieval_debug WHERE id=1",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| "Memory diagnostics unavailable")?
    } else {
        None
    };
    let metadata = metadata.and_then(|s| serde_json::from_str::<Value>(&s).ok());
    let retrieval=metadata.map(|m|json!({"found":m["found"].as_u64(),"passed":m["passed"].as_u64(),"context_bytes":m["context_bytes"].as_u64()}));
    let research: Option<String> = if memory.enabled && sharing && ai.web_research {
        inner.storage.connection.query_row("SELECT status FROM contextual_research WHERE goal_id IS ?1 ORDER BY id DESC LIMIT 1",[goal.as_ref().map(|g|g.id)],|r|r.get(0)).optional().map_err(|_|"Research diagnostics unavailable")?
    } else {
        None
    };
    let tavily = if !ai.web_research {
        "disabled"
    } else if !inner.status.tavily_configured {
        "key_not_configured"
    } else {
        match research.as_deref() {
            Some("authorized") => "authorized",
            Some("running") => "running",
            Some("ready") => "ready",
            Some("failed") => "failed",
            _ => "key_configured_not_search_tested",
        }
    };
    Ok(
        json!({"provider":"Nebius Token Factory","configured_model":http::secret("NEBIUS_MODEL_ID").ok().as_deref().and_then(model_label),
        "active_goal":goal.as_ref().map(|g|json!({"id":g.id,"label":label(&g.text)})),"active_step":step.map(|s|json!({"id":s.id,"label":label(&s.text)})),
        "work_state":crate::work_state::compute(inner)?.state,"retrieval":retrieval,"last_decision":inner.agent.diagnostics.last_decision,
        "last_skill":last_skill,"last_inference":if inner.engine.privacy==inner.privacy_revision {inner.engine.last.as_ref()}else{None},
        "tavily_status":tavily,"runtime":crate::agent_runtime::diagnostics_view(inner),"health":if inner.engine.health_privacy==inner.privacy_revision {inner.engine.health.clone()}else{Health::default()},
        "skills":skill_groups(),"demo_mode":inner.status.demo,"ai_mock":inner.status.mock_ai}),
    )
}
fn main_window(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("Open Personal AI Engine in the main Settings window".into())
    }
}
#[tauri::command(async)]
pub fn get_personal_ai_engine(
    window: WebviewWindow,
    state: State<AppState>,
) -> Result<Value, String> {
    main_window(window.label())?;
    let inner = state.inner.lock().map_err(|_| "Engine state unavailable")?;
    view(&inner)
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Probe {
    ok: bool,
}
fn failure(status: &'static str, error: &'static str, start: Instant) -> Health {
    Health {
        status,
        latency_ms: Some(elapsed(start)),
        provider_reported_model: None,
        error: Some(error),
        checked_at: Some(chrono::Utc::now().to_rfc3339()),
    }
}
/// One bounded request, no retries, no user context, no automatic scheduling.
async fn health_call(service: &Service<'_>, timeout: Duration) -> Health {
    let start = Instant::now();
    let schema = json!({"type":"object","additionalProperties":false,"properties":{"ok":{"type":"boolean","const":true}},"required":["ok"]});
    let payload = json!({"model":service.model,"temperature":0,"max_tokens":256,
        "response_format":{"type":"json_schema","json_schema":{"name":"buddy_safe_inference_health","strict":true,"schema":schema}},
        "messages":[{"role":"system","content":"Return exactly the JSON object {\"ok\":true}. No explanation or user data is needed."},{"role":"user","content":"Check structured inference."}]});
    let result = tokio::time::timeout(timeout, async {
        let mut response = service
            .client
            .post(&service.endpoint)
            .bearer_auth(&service.key)
            .json(&payload)
            .send()
            .await
            .map_err(|_| ("network_error", "Nebius could not be reached."))?;
        if !response.status().is_success() {
            return Err(match response.status().as_u16() {
                401 | 403 => (
                    "access_denied",
                    "Check the saved key and model permissions.",
                ),
                402 => ("billing_required", "Provider credits are required."),
                429 => ("rate_limited", "Provider rate limit reached."),
                500..=599 => ("unavailable", "Nebius is temporarily unavailable."),
                _ => (
                    "request_rejected",
                    "Check the configured model and endpoint.",
                ),
            });
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| ("network_error", "Nebius response could not be read."))?
        {
            if bytes.len() + chunk.len() > 16384 {
                return Err((
                    "invalid_response",
                    "Nebius health response exceeded the size limit.",
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| ("invalid_json", "Nebius returned invalid JSON."))?;
        let text = goal_analysis::response_text(&value).map_err(|_| {
            (
                "invalid_response",
                "Nebius did not complete the structured response.",
            )
        })?;
        let probe: Probe = serde_json::from_str(text).map_err(|_| {
            (
                "invalid_schema",
                "Nebius did not return the required JSON Schema.",
            )
        })?;
        if !probe.ok {
            return Err((
                "invalid_schema",
                "Nebius did not return the required JSON Schema.",
            ));
        }
        Ok(value["model"].as_str().and_then(model_label))
    })
    .await;
    match result {
        Ok(Ok(model)) => Health {
            status: "success",
            latency_ms: Some(elapsed(start)),
            provider_reported_model: model,
            error: None,
            checked_at: Some(chrono::Utc::now().to_rfc3339()),
        },
        Ok(Err((status, error))) => failure(status, error, start),
        Err(_) => failure(
            "timeout",
            "Nebius inference timed out after the bounded wait.",
            start,
        ),
    }
}
struct HealthGuard<'a> {
    state: &'a AppState,
    finished: bool,
}
impl Drop for HealthGuard<'_> {
    fn drop(&mut self) {
        if !self.finished {
            if let Ok(mut inner) = self.state.inner.lock() {
                inner.engine.health_running = false;
                inner.engine.health.status = "cancelled";
                inner.engine.health.error = Some("The manual health check was cancelled.");
            }
        }
    }
}
fn claim_health(inner: &mut Inner, now: Instant) -> Result<u64, String> {
    if inner.engine.health_running {
        return Err("An inference health check is already running".into());
    }
    if inner
        .engine
        .health_started
        .is_some_and(|last| now.duration_since(last) < Duration::from_secs(60))
    {
        return Err("Wait 60 seconds between manual inference health checks".into());
    }
    inner.engine.health_privacy = inner.privacy_revision;
    inner.engine.health_started = Some(now);
    inner.engine.health_running = true;
    inner.engine.health = Health {
        status: "running",
        ..Default::default()
    };
    Ok(inner.privacy_revision)
}
#[tauri::command(async)]
pub async fn test_nebius_inference(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Result<Health, String> {
    main_window(window.label())?;
    let privacy = {
        let mut inner = state.inner.lock().map_err(|_| "Engine state unavailable")?;
        claim_health(&mut inner, Instant::now())?
    };
    let mut guard = HealthGuard {
        state: &state,
        finished: false,
    };
    let result = match Service::configured(&state.client) {
        Ok(service) => health_call(&service, Duration::from_secs(10)).await,
        Err(_) => failure(
            "not_configured",
            "Configure Nebius before testing inference.",
            Instant::now(),
        ),
    };
    let mut inner = state.inner.lock().map_err(|_| "Engine state unavailable")?;
    let result = if inner.privacy_revision == privacy {
        result
    } else {
        failure(
            "stale",
            "Configuration or privacy changed; run a new check.",
            Instant::now(),
        )
    };
    inner.engine.health = result.clone();
    inner.engine.health_running = false;
    guard.finished = true;
    Ok(result)
}
#[cfg(test)]
mod tests;

#[cfg(test)]
mod hero_tests;
