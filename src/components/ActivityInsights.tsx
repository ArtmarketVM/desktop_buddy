import { isMac } from "../api/platform";
import { useEffect, useState } from "react";
import { api, desktop } from "../api/tauri";
import type {
  AppCategory,
  AppRule,
  GoalPlan,
  Today,
  InstalledApp,
} from "../types";
import { applications } from "../data/profile";

export function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes < 1
    ? seconds > 0
      ? "<1 min"
      : "0 min"
    : minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
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
          <span>Active app time</span>
        </p>
        <p>
          <strong>{duration(goalTotal)}</strong>
          <span>While this goal was active</span>
        </p>
        <p>
          <strong>{today.nudges}</strong>
          <span>Buddy cards today</span>
        </p>
      </div>
      <p className="helper">
        This is observed app time, not a measure of goal completion. You mark
        steps and goals complete yourself.
      </p>
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
          apps, Buddy itself, gaps and detected idle periods (5 minutes by
          default, without input). This is not total computer usage. No
          historical backfill. This summary groups browser time by application;
          per-site and tab totals are available in the goal-history API. Days
          use the local time zone at collection.
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
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    let active = true;
    if (desktop)
      void api
        .installedApps()
        .then((apps) => {
          if (active) {
            setInstalled(apps);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, []);
  const names = [
    ...new Set(
      [
        ...installed.map((app) => app.process_name),
        ...processes,
        ...rules
          .filter((r) => r.preset_source !== "role")
          .map((r) => r.process_name),
      ].map((p) => p.toLowerCase()),
    ),
  ]
    .sort()
    .filter((name) =>
      `${name} ${installed.find((app) => app.process_name === name)?.name ?? ""}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    );
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
      <h2>Your apps</h2>
      <p className="helper">
        {loaded
          ? `${installed.length} installed apps detected from ${isMac ? "macOS application folders" : "Windows registrations"}.`
          : desktop
            ? "Checking installed apps…"
            : `Installed app discovery is available in the ${isMac ? "macOS" : "Windows"} app.`}{" "}
        Apps seen while tracking also appear here. Portable and some Store apps
        may appear only after you use them. Nothing is uploaded.
      </p>
      <p className="helper">
        Work defaults come from your selected role. All other detected apps
        start unclassified; your changes take priority. Categories belong to
        this goal.
      </p>
      <label>
        Find an app
        <input
          className="app-filter"
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search installed and observed apps"
        />
      </label>
      <p className="helper">
        Work and Neutral suppress automatic AI focus judgments for that app.
        Distraction uses your explicit rule; enable Local distraction reminders
        in Settings to show reminders. Unclassified apps may use AI check-ins
        when enabled. Categories do not block apps or prevent separately enabled
        resource recommendations.
      </p>
      <p className="helper">
        Rules match process names, not websites or window titles. Marking
        {isMac ? "Google Chrome" : "chrome.exe"} affects every Chrome tab for
        this goal.
      </p>
      <div className="app-inventory">
        {names.map((name) => (
          <label className="app-rule-row" key={name}>
            <span>
              {installed.find((app) => app.process_name === name)?.name ||
                applications.find((app) => app.process === name)?.name ||
                name}
              <small>
                {name} ·{" "}
                {installed.some((app) => app.process_name === name)
                  ? "Installed"
                  : processes.includes(name)
                    ? "Observed"
                    : "Manual"}
                {rules.find((rule) => rule.process_name === name)
                  ?.preset_source === "role"
                  ? " · Role default"
                  : rules.some((rule) => rule.process_name === name)
                    ? " · Your rule"
                    : " · Unclassified"}
              </small>
            </span>
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
      </div>
      {!names.length && (
        <p className="helper">
          No matching apps yet. Use an app while tracking, or add its process
          name below.
        </p>
      )}
      <details className="inline-details">
        <summary>Add an app manually</summary>
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
              placeholder={isMac ? "e.g. Safari" : "e.g. game.exe"}
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
      </details>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
