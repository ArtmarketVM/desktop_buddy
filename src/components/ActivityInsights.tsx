import { useState } from "react";
import { api, desktop } from "../api/tauri";
import type { AppCategory, AppRule, GoalPlan, Today } from "../types";

export function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes < 1
    ? `${seconds}s`
    : minutes < 60
      ? `${minutes}m`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function DailySummary({
  today,
  plan,
  demo,
}: {
  today: Today;
  plan: GoalPlan | null;
  demo: boolean;
}) {
  const total = today.apps.reduce((n, a) => n + a.seconds, 0);
  const goalTotal = today.apps.reduce((n, a) => n + a.goal_seconds, 0);
  const completed = plan?.steps.filter((s) => s.done).length ?? 0;
  return (
    <section
      className="card insights-card"
      aria-label="Today's activity summary"
    >
      {demo && <span className="eyebrow">SIMULATED SESSION</span>}
      <h2>Today{today.date ? ` · ${today.date}` : ""}</h2>
      <div className="insight-totals">
        <p>
          <strong>{duration(total)}</strong>
          <span>Tracked across all goals</span>
        </p>
        <p>
          <strong>{duration(goalTotal)}</strong>
          <span>Current goal today</span>
        </p>
        <p>
          <strong>{today.nudges}</strong>
          <span>Buddy cards today</span>
        </p>
      </div>
      {plan && (
        <div className="step-progress">
          <label htmlFor="goal-progress">
            Current plan: {completed} of {plan.steps.length} steps complete
          </label>
          {plan.steps.length > 0 && (
            <progress
              id="goal-progress"
              max={plan.steps.length}
              value={completed}
            />
          )}
        </div>
      )}
      {today.apps.length === 0 ? (
        <p className="helper">No tracked time yet today.</p>
      ) : (
        <div className="insights-table-wrap">
          <table className="insights-table">
            <caption>Observed app time today</caption>
            <thead>
              <tr>
                <th scope="col">Application</th>
                <th scope="col">All goals</th>
                <th scope="col">Current goal</th>
              </tr>
            </thead>
            <tbody>
              {today.apps.map((a) => (
                <tr key={a.process_name}>
                  <th scope="row">{a.process_name}</th>
                  <td>{duration(a.seconds)}</td>
                  <td>{duration(a.goal_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="inline-details">
        <summary>How time is tracked</summary>
        {plan && (
          <p className="helper">
            Saved checklist progress, not a measure of goal completion or steps
            completed today.
          </p>
        )}
        <p className="helper">
          Approximate foreground time while tracking: excludes pauses, excluded
          apps, Buddy itself, gaps and detected idle periods (60+ seconds
          without input). This is not total computer usage. No historical
          backfill; collection starts with this version. Browser time is not
          split by website. Days use the local time zone at collection.
        </p>
      </details>
    </section>
  );
}

export function AppRules({
  goalId,
  rules,
  processes,
  onChanged,
}: {
  goalId: number;
  rules: AppRule[];
  processes: string[];
  onChanged: () => Promise<void>;
}) {
  const [process, setProcess] = useState("");
  const [category, setCategory] = useState<AppCategory>("distraction");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const names = [
    ...new Set(
      [...processes, ...rules.map((r) => r.process_name)].map((p) =>
        p.toLowerCase(),
      ),
    ),
  ].sort();
  async function save(name: string, value: AppCategory | null) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.appRule(goalId, name, value);
      await onChanged();
      setMessage("App rule saved for this goal.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card insights-card"
      aria-label="App categories for this goal"
    >
      <h2>App categories for this goal</h2>
      <p className="helper">
        Work and Neutral suppress automatic AI focus judgments for that app.
        Distraction uses your explicit rule; enable Local distraction reminders
        in Settings to show reminders. Unclassified apps may use AI check-ins
        when enabled. Categories do not block apps or prevent separately enabled
        resource recommendations.
      </p>
      <p className="helper">
        Rules match process names, not websites or window titles. Marking
        chrome.exe affects every Chrome tab for this goal.
      </p>
      {names.map((name) => (
        <label className="app-rule-row" key={name}>
          <span>{name}</span>
          <select
            aria-label={`Category for ${name}`}
            value={rules.find((r) => r.process_name === name)?.category ?? ""}
            disabled={!desktop || busy}
            onChange={(e) =>
              void save(name, (e.target.value || null) as AppCategory | null)
            }
          >
            <option value="">Unclassified</option>
            <option value="work">Work</option>
            <option value="distraction">Distraction</option>
            <option value="neutral">Neutral</option>
          </select>
        </label>
      ))}
      <form
        className="app-rule-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(process.trim(), category);
        }}
      >
        <label>
          Process name
          <input
            value={process}
            maxLength={100}
            placeholder="e.g. game.exe"
            disabled={!desktop || busy}
            onChange={(e) => setProcess(e.target.value)}
          />
        </label>
        <label>
          Category
          <select
            value={category}
            disabled={!desktop || busy}
            onChange={(e) => setCategory(e.target.value as AppCategory)}
          >
            <option value="work">Work</option>
            <option value="distraction">Distraction</option>
            <option value="neutral">Neutral</option>
          </select>
        </label>
        <button disabled={!desktop || busy || !process.trim()}>
          Save app rule
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
