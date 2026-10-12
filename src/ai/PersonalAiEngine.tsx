import { useState } from "react";
import { desktop } from "../api/tauri";
import {
  engineApi,
  type InferenceHealth,
  type PersonalAiEngine,
} from "./engineApi";
import "./engine.css";

const readable = (value: string) => value.replaceAll("_", " ");
const latency = (value: number | null | undefined) =>
  value == null ? "Not measured" : `${value} ms`;

export function PersonalAiEnginePanel() {
  const [data, setData] = useState<PersonalAiEngine | null>(null);
  const [health, setHealth] = useState<InferenceHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    if (!desktop) return;
    setLoading(true);
    setError("");
    try {
      const result = await engineApi.status();
      setData(result);
      setHealth(result.health);
    } catch {
      setError("Engine diagnostics are unavailable. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }
  async function check() {
    setTesting(true);
    setError("");
    setHealth(null);
    try {
      setHealth(await engineApi.health());
    } catch {
      setError(
        "Inference check could not start. Wait 60 seconds and try again.",
      );
    } finally {
      setTesting(false);
    }
  }
  const reported =
    health?.provider_reported_model ??
    data?.last_inference?.provider_reported_model;
  return (
    <details
      className="inline-details personal-ai-engine"
      onToggle={(event) => {
        if (event.currentTarget.open && !data && !loading) void refresh();
      }}
    >
      <summary>Personal AI Engine</summary>
      <p className="helper">
        Developer and demo diagnostics. Refresh reads local state only; no
        automatic inference checks.
      </p>
      <button
        type="button"
        className="secondary"
        disabled={!desktop || loading || testing}
        onClick={() => void refresh()}
      >
        {loading ? "Refreshing…" : "Refresh engine status"}
      </button>
      {!desktop && (
        <p className="helper">Available in the desktop application.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <dl className="engine-facts">
            <dt>Provider</dt>
            <dd>{data.provider}</dd>
            <dt>Configured model</dt>
            <dd>{data.configured_model ?? "Not configured"}</dd>
            {reported && (
              <>
                <dt>Provider-reported model</dt>
                <dd>{reported}</dd>
              </>
            )}
            <dt>Active goal</dt>
            <dd>{data.active_goal?.label ?? "None or sharing disabled"}</dd>
            <dt>Active step</dt>
            <dd>{data.active_step?.label ?? "Not selected"}</dd>
            <dt>Current work state</dt>
            <dd>{readable(data.work_state)}</dd>
            <dt>Relevant memories retrieved</dt>
            <dd>
              {data.retrieval
                ? `${data.retrieval.passed} passed / ${data.retrieval.found} found · ${data.retrieval.context_bytes} context bytes`
                : "No retrieval or memory disabled"}
            </dd>
            <dt>Last decision</dt>
            <dd>
              {data.last_decision
                ? readable(data.last_decision)
                : "None this session"}
            </dd>
            <dt>Last skill</dt>
            <dd>{data.last_skill ?? "None"}</dd>
            <dt>Last agent inference latency</dt>
            <dd>
              {latency(data.last_inference?.latency_ms)}
              {data.last_inference &&
                ` · ${data.last_inference.operation} · ${data.last_inference.status}`}
            </dd>
            <dt>Tavily status</dt>
            <dd>{readable(data.tavily_status)}</dd>
            <dt>AgentRuntime status</dt>
            <dd>
              {readable(data.runtime.status)} · {data.runtime.pending_events}{" "}
              pending events
            </dd>
            <dt>Runtime counters this session</dt>
            <dd>
              {data.runtime.diagnostics.ai_calls} reasoning calls ·{" "}
              {data.runtime.diagnostics.suppressed} suppressed ·{" "}
              {data.runtime.diagnostics.cancelled} cancelled ·{" "}
              {data.runtime.diagnostics.verified} verified
            </dd>
            <dt>Suppression reason</dt>
            <dd>{data.runtime.diagnostics.suppression_reason ?? "None"}</dd>
            <dt>Collector simulation / provider mock</dt>
            <dd>
              {data.demo_mode ? "DEMO_MODE on" : "DEMO_MODE off"} ·{" "}
              {data.ai_mock ? "AI_MOCK on" : "AI_MOCK off"}
            </dd>
          </dl>
          <p className="helper">
            Configured model is a setting. A provider-reported model is response
            metadata, not independent verification of the model running at the
            provider. Latency covers instrumented agent, chat, checkpoint and
            research requests, including their retries.
          </p>
          <section aria-label="Nebius inference health">
            <h4>Safe inference health check</h4>
            <p className="helper">
              Sends one small synthetic request to Nebius with a strict JSON
              Schema. No goals, memory, audio or window contents are sent.
              Provider charges may apply. Manual only, with a 10-second timeout
              and at least 60 seconds between checks.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={!desktop || testing || loading}
              onClick={() => void check()}
            >
              {testing ? "Checking inference…" : "Run inference health check"}
            </button>
            <p role="status">
              {testing
                ? "Checking real structured inference…"
                : health
                  ? `${readable(health.status)} · ${latency(health.latency_ms)}`
                  : "Not checked"}
            </p>
            {health?.error && <p role="alert">{health.error}</p>}
            {health?.checked_at && (
              <p className="helper">Last check: {health.checked_at}</p>
            )}
          </section>
          <h4>Available skills</h4>
          <p className="helper">
            Nemotron proposes actions; Rust validates permissions, IDs, scope
            and state before execution. Goal and step completion still requires
            an explicit action or confirmation.
          </p>
          {data.skills.map((group) => (
            <details className="inline-details" key={group.group}>
              <summary>{group.group}</summary>
              {group.note && <p className="helper">{group.note}</p>}
              <ul>
                {group.skills.map((skill) => (
                  <li key={skill.name}>
                    <code>{skill.name}</code> · {readable(skill.permission)}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </>
      )}
    </details>
  );
}
