//! Deterministic daily continuity. Stored checkpoints are reports, never completion evidence.
use crate::{
    memory::{MemoryQuery, MemoryType, Scope},
    storage::Storage,
};
use chrono::{DateTime, Duration, Local, NaiveDate, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum View {
    Priorities,
    Yesterday,
    Waiting,
    Remaining,
    EndOfDay,
}
#[derive(Debug, Serialize)]
pub struct Completion {
    pub event_id: i64,
    pub day: String,
    pub step_id: String,
    pub title: String,
    pub source: String,
}
#[derive(Debug, Serialize)]
pub struct Checkpoint {
    pub summary: String,
    pub next_action: Option<String>,
    pub status: String,
    pub waiting_for: Option<String>,
    pub last_result: Option<String>,
    pub updated_at: String,
}
#[derive(Debug, Serialize)]
pub struct Lane {
    pub goal_id: i64,
    pub title: String,
    pub status: String,
    pub priority: Option<String>,
    pub focused: bool,
    pub on_today: bool,
    pub checkpoint: Option<Checkpoint>,
    pub completed: Vec<Completion>,
    pub remaining: Vec<Value>,
    pub meaningful_events: Vec<Value>,
}
#[derive(Debug, Serialize)]
pub struct Report {
    pub day: String,
    pub view: View,
    pub lanes: Vec<Lane>,
    pub pinned_preferences: Vec<String>,
    pub work_events: Vec<crate::work_journal::WorkEvent>,
    pub omitted_lanes: usize,
    pub note: &'static str,
}
const NOTE: &str = "Only recorded facts are shown. Saved checkpoints are user or AI-assisted reports, not verified completions. Missing history is unknown; time alone never proves completion.";
fn db(e: rusqlite::Error) -> String {
    e.to_string()
}
fn checkpoint_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Checkpoint> {
    Ok(Checkpoint {
        summary: r.get(0)?,
        next_action: r.get(1)?,
        status: r.get(2)?,
        waiting_for: r.get(3)?,
        last_result: r.get(4)?,
        updated_at: r.get(5)?,
    })
}
impl Storage {
    pub(crate) fn initialize_continuity(&self) -> Result<(), String> {
        let tx = self.connection.unchecked_transaction().map_err(db)?;
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='continuity_checkpoints')",
                [],
                |r| r.get(0),
            )
            .map_err(db)?;
        tx.execute_batch(include_str!("continuity/schema.sql"))
            .map_err(db)?;
        // Backfill only the date actually recorded by the existing checkpoint; never invent yesterday.
        if !exists {
            tx.execute("INSERT OR IGNORE INTO continuity_checkpoints SELECT id,goal_id,date(updated_at,'localtime'),step_id,summary,next_action,status,waiting_for,last_result,updated_at FROM work_contexts WHERE date(updated_at,'localtime') IS NOT NULL AND (SELECT enabled AND remember_work_context FROM memory_controls WHERE id=1)", []).map_err(db)?;
        }
        let has_source = tx
            .prepare("PRAGMA table_info(core_events)")
            .map_err(db)?
            .query_map([], |r| r.get::<_, String>(1))
            .map_err(db)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db)?
            .iter()
            .any(|s| s == "completion_source");
        if !has_source {
            // Older events cannot be reliably classified as manual versus AI-assisted.
            tx.execute_batch("ALTER TABLE core_events ADD COLUMN completion_source TEXT NOT NULL DEFAULT 'confirmed_unspecified' CHECK(completion_source IN ('confirmed_unspecified','manual','ai_suggested_user_confirmed'));").map_err(db)?;
        }
        tx.commit().map_err(db)
    }
    pub(crate) fn continuity_report(
        &self,
        view: View,
        goal_id: Option<i64>,
        today: NaiveDate,
    ) -> Result<Report, String> {
        let controls = self.memory_controls()?;
        if !controls.enabled || !controls.remember_work_context {
            return Err(
                "Daily continuity requires Memory and Remember work context in Settings > Memory."
                    .into(),
            );
        }
        if view == View::Remaining && goal_id.is_none() {
            return Err("Which goal should I inspect?".into());
        }
        if let Some(id) = goal_id {
            self.memory_scope_exists(id)?;
        }
        let selected = if view == View::Yesterday {
            today - Duration::days(1)
        } else {
            today
        };
        let day = selected.to_string();
        let snapshot = self.core_snapshot(None)?;
        let mut goals = snapshot
            .goals
            .into_iter()
            .filter(|g| g.status != "deleted" && goal_id.is_none_or(|id| id == g.id))
            .collect::<Vec<_>>();
        // Explicit priority and focus outrank recency. IDs are a deterministic tie breaker.
        goals.sort_by_key(|g| {
            (
                !snapshot.today.contains(&g.id),
                snapshot.focused_goal_id != Some(g.id),
                match g.priority.as_deref() {
                    Some("high") => 0,
                    Some("medium") => 1,
                    Some("low") => 3,
                    _ => 2,
                },
                g.id,
            )
        });
        let mut lanes = Vec::new();
        for g in goals {
            let checkpoint = if view == View::Yesterday {
                self.connection.query_row("SELECT summary,next_action,status,waiting_for,last_result,updated_at FROM continuity_checkpoints WHERE goal_id=?1 AND day<=?2 ORDER BY day DESC LIMIT 1",params![g.id,day],checkpoint_row).optional().map_err(db)?
            } else {
                g.work_context.map(|c| Checkpoint {
                    summary: c.context.summary,
                    next_action: c.context.next_action,
                    status: c.context.status.name().into(),
                    waiting_for: c.context.waiting_for,
                    last_result: c.last_result,
                    updated_at: c.updated_at,
                })
            };
            let mut q=self.connection.prepare("SELECT e.id,e.step_id,e.title,COALESCE((SELECT w.source FROM work_events w WHERE w.core_event_id=e.id AND w.status='completed' LIMIT 1),e.completion_source),e.day FROM core_events e WHERE e.goal_id=?1 AND e.day BETWEEN ?2 AND ?3 AND e.kind='completed' AND e.id=(SELECT MAX(x.id) FROM core_events x WHERE x.goal_id=e.goal_id AND x.step_id=e.step_id AND x.day<=?3 AND (?4 OR x.day=e.day)) ORDER BY e.id LIMIT 101").map_err(db)?;
            let start_day = if view == View::Priorities {
                (selected - Duration::days(6)).to_string()
            } else {
                day.clone()
            };
            let completed = q
                .query_map(
                    params![g.id, start_day, day, view == View::Priorities],
                    |r| {
                        Ok(Completion {
                            event_id: r.get(0)?,
                            step_id: r.get(1)?,
                            title: r.get(2)?,
                            source: r.get(3)?,
                            day: r.get(4)?,
                        })
                    },
                )
                .map_err(db)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(db)?;
            let mut q=self.connection.prepare("SELECT id,event_kind,created_at FROM memories WHERE goal_id=?1 AND memory_type='episodic' AND archived=0 AND source IN ('confirmed_event','user','intervention_feedback','research_feedback') AND event_kind IN ('goal_parked','goal_resumed','waiting_state','meaningful_correction','research_accepted','research_rejected') AND date(created_at,'localtime')=?2 ORDER BY id LIMIT 31").map_err(db)?;
            let mut meaningful_events=q.query_map(params![g.id,day],|r|Ok(json!({"memory_id":r.get::<_,i64>(0)?,"kind":r.get::<_,String>(1)?,"at":r.get::<_,String>(2)?}))).map_err(db)?.collect::<Result<Vec<_>,_>>().map_err(db)?;
            if !controls.learn_from_feedback {
                meaningful_events.retain(|e| {
                    !matches!(
                        e["kind"].as_str(),
                        Some("research_accepted" | "research_rejected")
                    )
                });
            }
            if view == View::Waiting
                && checkpoint
                    .as_ref()
                    .is_none_or(|c| c.waiting_for.is_none() || c.status == "completed")
            {
                continue;
            }
            if view != View::Yesterday && g.status == "completed" && completed.is_empty() {
                continue;
            }
            if view == View::Yesterday
                && completed.is_empty()
                && meaningful_events.is_empty()
                && checkpoint.is_none()
            {
                continue;
            }
            // Current remaining steps are deliberately excluded from a historical report.
            let remaining = if view == View::Yesterday {
                vec![]
            } else {
                g.plan
                    .steps
                    .into_iter()
                    .filter(|s| !s.done)
                    .take(100)
                    .map(|s| json!({"step_id":s.id,"text":s.text}))
                    .collect()
            };
            lanes.push(Lane {
                goal_id: g.id,
                title: g.title,
                status: g.status,
                priority: g.priority,
                focused: snapshot.focused_goal_id == Some(g.id),
                on_today: snapshot.today.contains(&g.id),
                checkpoint,
                completed,
                remaining,
                meaningful_events,
            });
        }
        let omitted_lanes = lanes.len().saturating_sub(12);
        lanes.truncate(12);
        let pinned_preferences = if controls.remember_preferences && view != View::Yesterday {
            self.list_memories(MemoryQuery {
                memory_type: Some(MemoryType::ExplicitPreference),
                limit: 100,
                ..Default::default()
            })?
            .into_iter()
            .filter(|m| {
                m.pinned
                    && (m.scope == Scope::global()
                        || goal_id.is_some_and(|id| m.scope == Scope::goal(id)))
            })
            .take(8)
            .map(|m| m.content)
            .collect()
        } else {
            vec![]
        };
        Ok(Report {
            work_events: self
                .work_journal(&day)?
                .into_iter()
                .filter(|e| goal_id.is_none_or(|id| e.goal_id == Some(id)))
                .collect(),
            day,
            view,
            lanes,
            pinned_preferences,
            omitted_lanes,
            note: NOTE,
        })
    }
    fn memory_scope_exists(&self, id: i64) -> Result<(), String> {
        self.work_context(id).map(|_| ())
    }
}
impl Report {
    /// The answer bypasses free-form generation: a model cannot add accomplishments.
    pub fn render(&self) -> String {
        let title = match self.view {
            View::Priorities => "Current priorities",
            View::Yesterday => "Yesterday's recorded work",
            View::Waiting => "Waiting for",
            View::Remaining => "Remaining work",
            View::EndOfDay => "End-of-day review",
        };
        let mut out = vec![format!("### {title} — {}", self.day)];
        for lane in &self.lanes {
            out.push(format!(
                "\n### {}{}{}{}",
                lane.title.replace(['\n', '\r'], " "),
                if self.view == View::Yesterday {
                    String::new()
                } else {
                    format!(" — {}", lane.status)
                },
                if lane.focused && self.view != View::Yesterday {
                    " · focused"
                } else {
                    ""
                },
                if self.view != View::Yesterday {
                    lane.priority
                        .as_ref()
                        .map(|p| format!(" · {p} priority"))
                        .unwrap_or_default()
                } else {
                    String::new()
                }
            ));
            for c in &lane.completed {
                out.push(format!(
                    "- [x] Completed ({}): {} [recorded {}]",
                    c.source,
                    c.title.replace(['\n', '\r'], " "),
                    c.day
                ));
            }
            if lane.completed.is_empty() {
                out.push(if self.view == View::Priorities {
                    "No confirmed completion recorded in the last seven days.".into()
                } else {
                    "No confirmed completion recorded for this date.".into()
                });
            }
            if let Some(c) = &lane.checkpoint {
                out.push(format!(
                    "\n**Saved checkpoint** ({}): {}",
                    c.updated_at,
                    c.summary.replace(['\n', '\r'], " ")
                ));
                if c.status == "paused" {
                    out.push("Parked context".into());
                }
                if let Some(w) = &c.waiting_for {
                    out.push(format!(
                        "- **Waiting for:** {}",
                        w.replace(['\n', '\r'], " ")
                    ));
                }
                if let Some(n) = &c.next_action {
                    out.push(format!(
                        "- **Next action:** {}",
                        n.replace(['\n', '\r'], " ")
                    ));
                }
                if let Some(r) = &c.last_result {
                    out.push(format!(
                        "- **Reported result:** {}",
                        r.replace(['\n', '\r'], " ")
                    ));
                }
            }
            if !lane.remaining.is_empty() {
                out.push("\n**Remaining steps**".into());
            }
            for s in &lane.remaining {
                out.push(format!(
                    "- [ ] {}",
                    s["text"]
                        .as_str()
                        .unwrap_or_default()
                        .replace(['\n', '\r'], " ")
                ));
            }
            for event in &lane.meaningful_events {
                out.push(format!(
                    "- Recorded event: {}",
                    event["kind"].as_str().unwrap_or_default()
                ));
            }
        }
        if self.lanes.is_empty() {
            out.push("No matching recorded work context or results.".into());
        }
        if !self.work_events.is_empty() {
            out.push("### Work outside the plan and verified results".into());
            for event in &self.work_events {
                if event.status == "undone" {
                    continue;
                }
                // Goal-linked completions are already included in the lane above.
                if event.source == "automatic_verified"
                    || event.source == "user_confirmed_unplanned"
                {
                    continue;
                }
                out.push(format!(
                    "- {} — {} (completion is not inferred).",
                    event.title,
                    if event.status == "planned" {
                        "added to Today"
                    } else {
                        "observed work"
                    }
                ));
            }
        }
        for p in &self.pinned_preferences {
            out.push(format!(
                "- Pinned preference: {}",
                p.replace(['\n', '\r'], " ")
            ));
        }
        if self.omitted_lanes > 0 {
            out.push(format!(
                "{} more lanes; ask about a specific goal.",
                self.omitted_lanes
            ));
        }
        out.push(self.note.into());
        let mut bounded = String::new();
        for line in out.iter().take(out.len().saturating_sub(1)) {
            if bounded.len() + line.len() + NOTE.len() + 150 > 12_000 {
                bounded.push_str("\nAdditional recorded facts omitted to fit the context budget; ask about one goal.");
                break;
            }
            if !bounded.is_empty() {
                bounded.push('\n');
            }
            bounded.push_str(line);
        }
        bounded.push('\n');
        bounded.push_str(NOTE);
        bounded
    }
}

#[derive(Default, Debug, Serialize)]
pub struct AdaptivePolicy {
    pub help_allowed: bool,
    pub research_allowed: bool,
    pub extra_cooldown_seconds: i64,
    pub accepted: u32,
    pub rejected: u32,
    pub research_accepted: u32,
    pub research_rejected: u32,
    pub corrections: u32,
    pub resumes: u32,
    pub evidence_days: u32,
}
impl Storage {
    /// Scope-local, recent feedback affects interruption policy, never completion or model weights.
    pub(crate) fn adaptive_policy(
        &self,
        goal: Option<i64>,
        now: DateTime<Utc>,
    ) -> Result<AdaptivePolicy, String> {
        let mut policy = AdaptivePolicy {
            help_allowed: true,
            research_allowed: true,
            ..Default::default()
        };
        let controls = self.memory_controls()?;
        if !controls.enabled {
            return Ok(policy);
        }
        if controls.learn_from_feedback {
            let mut q=self.connection.prepare("SELECT event_kind,COUNT(*) FROM memories WHERE archived=0 AND memory_type='episodic' AND source IN ('confirmed_event','intervention_feedback','research_feedback','user') AND (scope_type='global' OR (scope_type='goal' AND goal_id=?1)) AND julianday(created_at) BETWEEN julianday(?2) AND julianday(?3) AND NOT (event_kind='intervention_rejected' AND source_key LIKE 'intervention-%-ignore' AND EXISTS(SELECT 1 FROM memories r WHERE r.event_kind='research_rejected' AND r.archived=0 AND r.scope_type=memories.scope_type AND r.scope_id IS memories.scope_id AND r.source_key=substr(memories.source_key,14,length(memories.source_key)-20)||'-declined')) GROUP BY event_kind").map_err(db)?;
            for row in q
                .query_map(
                    params![
                        goal,
                        (now - Duration::days(30)).to_rfc3339(),
                        now.to_rfc3339()
                    ],
                    |r| Ok((r.get::<_, String>(0)?, r.get::<_, u32>(1)?)),
                )
                .map_err(db)?
            {
                let (k, n) = row.map_err(db)?;
                match k.as_str() {
                    "intervention_accepted" => policy.accepted = n,
                    "intervention_rejected" => policy.rejected = n,
                    "research_accepted" => policy.research_accepted = n,
                    "research_rejected" => policy.research_rejected = n,
                    "meaningful_correction" => policy.corrections = n,
                    "goal_resumed" => policy.resumes = n,
                    _ => {}
                }
            }
            policy.evidence_days=self.connection.query_row("SELECT COUNT(DISTINCT date(created_at,'localtime')) FROM memories WHERE archived=0 AND memory_type='episodic' AND source IN ('intervention_feedback','research_feedback') AND (scope_type='global' OR (scope_type='goal' AND goal_id=?1)) AND julianday(created_at) BETWEEN julianday(?2) AND julianday(?3)",params![goal,(now-Duration::days(30)).to_rfc3339(),now.to_rfc3339()],|r|r.get(0)).map_err(db)?;
            let rejects = policy.rejected + policy.research_rejected;
            let accepts = policy.accepted + policy.research_accepted;
            if rejects >= 3 && policy.evidence_days >= 2 {
                policy.extra_cooldown_seconds =
                    rejects.saturating_sub(accepts).min(8) as i64 * 15 * 60;
            }
        }
        if controls.remember_preferences {
            // Exact, documented preference values only. No interpretation of arbitrary prose as policy.
            let mut q=self.connection.prepare("SELECT content FROM memories WHERE archived=0 AND memory_type='explicit_preference' AND (scope_type='global' OR (scope_type='goal' AND goal_id=?1)) ORDER BY CASE scope_type WHEN 'goal' THEN 0 ELSE 1 END,updated_at DESC,id DESC").map_err(db)?;
            let values = q
                .query_map([goal], |r| r.get::<_, String>(0))
                .map_err(db)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(db)?;
            let help = values.iter().find(|s| {
                ["Do not offer proactive help", "Offer proactive help"].contains(&s.as_str())
            });
            let research = values.iter().find(|s| {
                ["Do not offer web research", "Offer web research"].contains(&s.as_str())
            });
            if let Some(v) = help {
                policy.help_allowed = v == "Offer proactive help";
                if policy.help_allowed {
                    policy.extra_cooldown_seconds = 0;
                }
            }
            if let Some(v) = research {
                policy.research_allowed = v == "Offer web research";
            }
        }
        Ok(policy)
    }
    pub(crate) fn adaptive_offer_allowed(
        &self,
        goal: Option<i64>,
        research: bool,
        now: i64,
        last_prompt: i64,
    ) -> bool {
        let Some(date) = DateTime::from_timestamp(now, 0) else {
            return false;
        };
        self.adaptive_policy(goal, date).is_ok_and(|p| {
            p.help_allowed
                && (!research || p.research_allowed)
                && now.saturating_sub(last_prompt) >= p.extra_cooldown_seconds
        })
    }
    /// Daily, bounded, exact maintenance. No semantic merges and no event/evidence inflation.
    pub(crate) fn maintain_personal_memory(&self, now: DateTime<Utc>) -> Result<(), String> {
        let controls = self.memory_controls()?;
        if !controls.enabled {
            return Ok(());
        }
        let day = now.with_timezone(&Local).date_naive().to_string();
        if self
            .read_setting::<String>("memory_maintenance_day")?
            .as_deref()
            == Some(&day)
        {
            return Ok(());
        }
        crate::memory::atomic(&self.connection, || {
            let support="FROM memory_evidence e JOIN memories m ON m.id=e.episode_id WHERE e.memory_type=memories.memory_type AND e.scope_type=memories.scope_type AND e.scope_key=COALESCE(memories.scope_id,0) AND e.content=memories.content AND m.memory_type='episodic' AND m.archived=0 AND m.source IN ('confirmed_event','intervention_feedback','research_feedback') AND julianday(m.created_at) BETWEEN julianday(?1) AND julianday(?2)";
            self.connection.execute(&format!("UPDATE memories SET archived=1 WHERE archived=0 AND pinned=0 AND memory_type IN ('inferred_preference','behavioral_pattern') AND (julianday(updated_at)<julianday(?1) OR confidence<0.85 OR evidence_count<3 OR (SELECT COUNT(*) {support})<3 OR (SELECT COUNT(DISTINCT date(m.created_at,'localtime')) {support})<2)"),params![(now-Duration::days(90)).to_rfc3339(),now.to_rfc3339()]).map_err(db)?;
            // Only identical unpinned user-authored explicit items with no provenance key are redundant.
            // Pinned duplicates remain independent; episodic events and inference evidence are never merged.
            self.connection.execute("DELETE FROM memories WHERE pinned=0 AND archived=0 AND source='user' AND source_key IS NULL AND memory_type IN ('explicit_fact','explicit_preference') AND id NOT IN (SELECT MAX(id) FROM memories WHERE pinned=0 AND archived=0 AND source='user' AND source_key IS NULL AND memory_type IN ('explicit_fact','explicit_preference') GROUP BY memory_type,scope_type,scope_id,content)",[]).map_err(db)?;
            self.write_setting("memory_maintenance_day", &day)
        })
    }
}
#[cfg(test)]
mod tests;
