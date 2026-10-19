//! Opt-in real-provider rehearsal in a disposable database. Never opens personal data.
use crate::{
    agent_runtime, commands::AppState, companion, goal_analysis::Service, storage::Storage,
};
use chrono::Utc;
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

struct Workspace(PathBuf);
impl Workspace {
    fn new() -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!(
            "buddy-hero-live-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir(&path).map_err(|_| "Cannot create isolated demo directory")?;
        Ok(Self(path))
    }
    fn database(&self) -> PathBuf {
        self.0.join("synthetic.sqlite")
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn require(condition: bool, message: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(message.into())
    }
}
fn passed(rows: &mut Vec<Value>, stage: &str, started: Instant) {
    eprintln!("Hero stage {stage}: passed");
    rows.push(json!({"stage":stage,"status":"passed","latency_ms":started.elapsed().as_millis()}));
}
fn goal_id(state: &AppState, title: &str) -> Result<i64, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Demo state unavailable")?
        .storage
        .core_snapshot(None)?
        .goals
        .into_iter()
        .find(|g| g.title == title)
        .map(|g| g.id)
        .ok_or_else(|| "Expected synthetic goal was not created".into())
}
async fn send(
    state: &AppState,
    service: &Service<'_>,
    text: &str,
    voice: bool,
) -> Result<String, String> {
    let (conversation, revision, history) = {
        let mut inner = state.inner.lock().map_err(|_| "Demo state unavailable")?;
        agent_runtime::begin_explicit(
            &mut inner,
            if voice {
                agent_runtime::EventKind::VoiceMessage
            } else {
                agent_runtime::EventKind::UserMessage
            },
        );
        let id = inner.storage.current_conversation()?;
        let history: Vec<_> = inner
            .storage
            .chat_history_of(id)?
            .iter()
            .map(|m| json!({"id":m.id,"role":m.role,"text":m.text}))
            .collect();
        (id, inner.privacy_revision, history)
    };
    let outcome=agent_runtime::handle_dialogue(&json!({"latest_request":text,"conversation":history,"natural_reply":true,"event_type":if voice {"voice_message"}else{"user_message"}}),conversation,state,revision,true,service).await?;
    require(
        !outcome.reply.message.trim().is_empty(),
        "Dialogue returned an empty answer",
    )?;
    state
        .inner
        .lock()
        .map_err(|_| "Demo state unavailable")?
        .storage
        .save_chat_turn(text, &outcome.reply, None)?;
    Ok(outcome.reply.message)
}

pub async fn run() -> Result<Value, String> {
    let root = AppState::new(Storage::open(std::path::Path::new(":memory:"))?)?;
    require(
        !root
            .inner
            .lock()
            .map_err(|_| "Demo state unavailable")?
            .status
            .mock_ai,
        "Live rehearsal refuses AI_MOCK",
    )?;
    let service = Service::configured(&root.client)?;
    let tavily_url = crate::http::endpoint("TAVILY_API_URL")?;
    let tavily_key = crate::http::secret("TAVILY_API_KEY")?;
    let workspace = Workspace::new()?;
    let mut state = AppState::new(Storage::open(&workspace.database())?)?;
    let mut rows = Vec::new();
    let mut stage = "voice_input";
    let mut background = Value::Null;
    let voice_native = false;
    let outcome=async {
        let started=Instant::now();
        let command = "Create a goal named AI DEMO Hackathon with two steps: Find the official Tauri 2 documentation for the minimum macOS deployment target; Draft the technical application. Add this goal to Today and focus it.";
        rows.push(json!({"stage":stage,"status":if voice_native {"passed"}else{"transcript_fixture"},"latency_ms":started.elapsed().as_millis(),"microphone_capture_verified":false}));

        stage="voice_transcript_to_shared_actions";let started=Instant::now();
        send(&state,&service,&command,true).await?;
        let a=goal_id(&state,"AI DEMO Hackathon")?;
        {let i=state.inner.lock().unwrap();require(i.storage.goal_plan(a)?.steps.len()==2 && i.storage.core_snapshot(None)?.focused_goal_id==Some(a),"Voice transcript did not create and focus the expected two-step goal")?;}
        passed(&mut rows,stage,started);

        stage="park_goal_a";let started=Instant::now();
        send(&state,&service,"Park AI DEMO Hackathon. I stopped before finding the official Tauri 2 macOS minimum deployment target configuration. Next action: find the official configuration reference; I cannot proceed without this information.",false).await?;
        let checkpoint={let i=state.inner.lock().unwrap();i.storage.work_context(a)?.ok_or("Park did not save a checkpoint")?};
        require(checkpoint.parked_at.is_some() && checkpoint.context.next_action.as_ref().is_some_and(|n|!n.is_empty()),"Park checkpoint or next action missing")?;
        passed(&mut rows,stage,started);

        stage="create_and_focus_goal_b";let started=Instant::now();
        send(&state,&service,"Create a goal named AI DEMO Client with one step: Send the client reply. Add it to Today and focus it.",false).await?;
        let b=goal_id(&state,"AI DEMO Client")?;
        require(state.inner.lock().unwrap().storage.core_snapshot(None)?.focused_goal_id==Some(b),"Second goal was not focused")?;
        passed(&mut rows,stage,started);

        stage="completion_detection_and_confirmation";let started=Instant::now();
        let plan=state.inner.lock().unwrap().storage.goal_plan(b)?;
        let receipt="Client reply sent successfully. The client reply has been delivered.";
        let detection=companion::classify_visible_text(&state,&service,"AI DEMO Client",&plan,"Synthetic mail editor",receipt).await?;
        require(detection.kind=="completion" && detection.step_id.as_deref()==Some(plan.steps[0].id.as_str()),"Live model did not detect the explicit completion receipt")?;
        {let mut i=state.inner.lock().unwrap();require(!i.storage.goal_plan(b)?.steps[0].done,"Completion was applied before confirmation")?;
            companion::confirm_completion(&mut i.storage,&companion::engine::Intervention{id:"synthetic-demo-confirmation".into(),kind:companion::engine::Kind::Completion,text:"Mark the client reply complete?".into(),confidence:detection.confidence,goal_id:Some(b),plan_revision:Some(plan.revision),step_id:detection.step_id,expires_at:Utc::now().timestamp()+120})?;
            require(i.storage.goal_plan(b)?.steps[0].done,"Confirmed step was not completed")?;}
        passed(&mut rows,stage,started);

        stage="resume_goal_a";let started=Instant::now();
        let answer=send(&state,&service,"Resume AI DEMO Hackathon and focus it. Tell me the saved checkpoint and next action.",false).await?;
        {let i=state.inner.lock().unwrap();let context=i.storage.work_context(a)?.ok_or("Resumed checkpoint missing")?;
            require(i.storage.core_snapshot(None)?.focused_goal_id==Some(a) && context.resumed_at.is_some() && context.context.summary==checkpoint.context.summary,"Resume did not restore the original goal checkpoint")?;}
        require(!answer.contains("Client reply has been delivered"),"Resume leaked the other lane's completion receipt")?;
        passed(&mut rows,stage,started);

        stage="background_reasoning";let started=Instant::now();
        background=agent_runtime::hero_stuck(&state,&service,a).await?;
        require(background["verified"].as_u64().unwrap_or(0)>0 && background["failure"].is_null(),"Background inference was not verified")?;
        passed(&mut rows,stage,started);

        stage="research_offer_requires_consent";let started=Instant::now();
        let research_id={let mut i=state.inner.lock().unwrap();
            let before:i64=i.storage.connection.query_row("SELECT COUNT(*) FROM contextual_research",[],|r|r.get(0)).map_err(|_|"Research count unavailable")?;
            let offer=crate::research::stuck_offer(&i,Some(a),None)?;
            let after:i64=i.storage.connection.query_row("SELECT COUNT(*) FROM contextual_research",[],|r|r.get(0)).map_err(|_|"Research count unavailable")?;
            require(before==after,"Research started before consent")?;
            crate::research::respond_offer(&mut i,&offer,true)?.ok_or("Research consent did not authorize a job")?
        };
        passed(&mut rows,stage,started);

        stage="real_tavily_research_and_attachment";let started=Instant::now();
        let research=crate::research::run_with_service(&state,a,research_id,&service,&tavily_url,&tavily_key).await?;
        require(!research.sources.is_empty() && !research.summary.is_empty(),"Research did not return grounded sources")?;
        {let mut i=state.inner.lock().unwrap();let context=i.storage.work_context(a)?.ok_or("Research context missing")?;
            require(i.storage.context_research(context.id)?.iter().any(|r|r.research_id==research_id),"Research was not attached to the goal context")?;
            i.storage.research_feedback(a,research_id,true)?;}
        passed(&mut rows,stage,started);

        stage="explicit_step_completion";let started=Instant::now();
        send(&state,&service,"Mark the first step of AI DEMO Hackathon complete. Keep the second step unfinished.",false).await?;
        {let plan=state.inner.lock().unwrap().storage.goal_plan(a)?;require(plan.steps[0].done && !plan.steps[1].done,"Explicit step completion changed the wrong state")?;}
        passed(&mut rows,stage,started);

        stage="grounded_daily_summary";let started=Instant::now();
        let summary=send(&state,&service,"What did I complete today across AI DEMO Hackathon and AI DEMO Client? Use recorded facts only, mention both goals and keep unfinished work separate.",false).await?;
        require(summary.contains("AI DEMO Hackathon") && summary.contains("AI DEMO Client"),"Summary omitted a demo lane")?;
        require(!state.inner.lock().unwrap().storage.goal_plan(a)?.steps[1].done,"Summary fabricated a completion in storage")?;
        passed(&mut rows,stage,started);

        stage="restart_and_context_retrieval";let started=Instant::now();
        drop(state);
        state=AppState::new(Storage::open(&workspace.database())?)?;
        {let i=state.inner.lock().unwrap();let context=i.storage.work_context(a)?.ok_or("Checkpoint did not survive restart")?;
            require(context.context.summary==checkpoint.context.summary && context.context.next_action.is_some() && !i.storage.context_research(context.id)?.is_empty() && i.storage.goal_plan(b)?.steps[0].done,"Restart lost context, research or confirmed completion")?;}
        let reply=send(&state,&service,"Where did I stop on AI DEMO Hackathon? Use the saved work context and the recorded remaining step.",false).await?;
        require(!reply.trim().is_empty(),"Restart reply was empty")?;
        passed(&mut rows,stage,started);
        Ok::<_,String>(())
    }.await;
    if let Err(error) = &outcome {
        eprintln!(
            "Hero stage {stage}: failed ({})",
            crate::engine_observability::error_category(error)
        );
        rows.push(json!({"stage":stage,"status":"failed","error_category":crate::engine_observability::error_category(error),"error":error}));
    }
    Ok(
        json!({"synthetic_data_only":true,"mock_providers":false,"backend_passed":outcome.is_ok(),"configured_model":service.model,"configured_response_model":crate::http::response_model(&service.model),"native_stt_exercised":voice_native,"background":background,"stages":rows,
        "ready_for_live_recording":false,"manual_checks_remaining":["Physical microphone capture and transcript review","Native foreground/Accessibility evidence collection","Actual companion offer display and consent buttons","Installation and restart on physical Windows x64 and Apple Silicon macOS"],
        "coverage_note":"Real provider orchestration and storage rehearsal with synthetic activity, explicit simulated consent/confirmation and database reopen. No native microphone, popup interaction or process restart is claimed. A silent background decision is reported, never forced into an offer."}),
    )
}
pub async fn bounded_run() -> Result<Value, String> {
    tokio::time::timeout(Duration::from_secs(900), run())
        .await
        .map_err(|_| "Live rehearsal timed out; isolated data will be discarded".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn isolated_workspace_is_unique_and_removes_only_its_own_database() {
        let first = Workspace::new().unwrap();
        let second = Workspace::new().unwrap();
        assert_ne!(first.0, second.0);
        let path = first.0.clone();
        std::fs::write(first.database(), b"synthetic fixture").unwrap();
        drop(first);
        assert!(!path.exists());
        assert!(second.0.exists());
    }
}
