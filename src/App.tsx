import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Compass,
  LockKeyhole,
  Pause,
  Play,
  Search,
  Sparkles,
  Target,
  Settings as SettingsIcon,
} from "lucide-react";
import { api, desktop, safeUrl } from "./api/tauri";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Dashboard, SearchResult } from "./types";
import { defaultBuddyPreferences, defaultUserSettings } from "./types";
import { GoalInput } from "./components/GoalInput";
import { ActivityTimeline } from "./components/ActivityTimeline";
import { DesktopBuddy } from "./components/DesktopBuddy";
import packageInfo from "../package.json";
import { Settings } from "./components/Settings";
import { GoalPlanner, SavedGoals } from "./components/GoalPlanner";
import { RecommendationHistory } from "./components/RecommendationHistory";
import { AppRules, DailySummary } from "./components/ActivityInsights";
import { Onboarding } from "./components/Onboarding";
import { ProductFeedback } from "./components/ProductFeedback";
import { Avatar } from "./components/Avatar";
import { avatarState } from "./data/profile";

const empty: Dashboard = {
  app_rules: [],
  today: { date: "", apps: [], nudges: 0 },
  goal_plan: null,
  saved_goals: [],
  retention_days: 0,
  recommendations: [],
  version: packageInfo.version,
  buddy: {
    preferences: defaultBuddyPreferences,
    suggestion: null,
    decision: null,
    snoozed_until: null,
    quiet_reason: null,
  },
  goal: null,
  activity: [],
  decision: null,
  status: {
    tracking: false,
    ai_enabled: false,
    dnd: false,
    demo: false,
    mock_ai: false,
    nebius_configured: false,
    tavily_configured: false,
  },
};
export default function App() {
  const [data, setData] = useState<Dashboard>(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [plannerDirty, setPlannerDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(!desktop);
  const [completedGoal, setCompletedGoal] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const popup = new URLSearchParams(location.search).has("buddy");
  useEffect(() => {
    document.documentElement.classList.toggle("buddy-window", popup);
  }, [popup]);
  const refresh = useCallback(async () => {
    if (desktop) {
      setData(await api.dashboard());
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        if (desktop) {
          const next = await api.dashboard();
          if (active) {
            setData(next);
            setLoaded(true);
          }
        }
      } catch (e) {
        if (active) setError(String(e));
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (popup)
    return (
      <main className="popup-shell">
        {error && <p role="alert">{error}</p>}
        {
          <DesktopBuddy
            view={data.buddy}
            onDismiss={() => void run(() => api.snooze(true))}
            onDnd={() => void run(() => api.dnd(true))}
          />
        }
      </main>
    );
  if (!loaded)
    return (
      <main className="onboarding-shell">
        <section className="card">
          <p role="status">Loading your workspace…</p>
          {error && <p role="alert">{error}</p>}
          <button onClick={() => void run(refresh)}>Retry</button>
        </section>
      </main>
    );
  const userSettings = data.user_settings ?? defaultUserSettings;
  if (!userSettings.onboarding.completed)
    return <Onboarding initial={userSettings} onChanged={refresh} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-mark">b.</span>buddy
          <span className="brand-dot">•</span>
        </a>
        <span className="eyebrow nav-heading">YOUR SPACE</span>
        <div className="nav-item selected">
          <Compass size={18} /> Focus room <span>01</span>
        </div>
        <div className="local-badge">
          <LockKeyhole size={15} />
          <span>
            Local by default<small>Your space. Your pace.</small>
          </span>
        </div>
      </aside>
      <main className="main">
        <header>
          <span>
            WORKSPACE <span className="slash">/</span> Focus room
          </span>
          <span className="version">EARLY ACCESS · v{data.version}</span>
          <button
            className="text-button"
            aria-expanded={settingsOpen}
            aria-controls="workspace-settings"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <SettingsIcon size={16} />{" "}
            {settingsOpen ? "Close settings" : "Settings"}
          </button>
        </header>
        <div className="page-title">
          <div>
            <h1>Focus</h1>
          </div>
          <div className="status-pill">
            <i className={data.status.tracking ? "live" : ""} />
            {data.status.tracking
              ? "Session in progress"
              : "Ready when you are"}
          </div>
        </div>
        {!desktop && (
          <details className="inline-details preview-details">
            <summary>Browser preview · tracking unavailable</summary>
            <p className="helper">
              Open the desktop app with <code>npm run tauri dev</code> to track
              activity and connect AI.
            </p>
          </details>
        )}
        {(data.status.demo || data.status.mock_ai) && (
          <div className="notice">
            {data.status.demo ? "Simulated activity" : "Live activity"} ·{" "}
            {data.status.mock_ai
              ? "Mock AI responses — no Nebius call"
              : "Real Nebius integration"}
          </div>
        )}
        {(error || data.last_error) && (
          <div className="error" role="alert">
            {error || data.last_error}
            <button className="text-button" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}
        <div id="workspace-settings" hidden={!settingsOpen}>
          <Settings
            onChanged={refresh}
            preferences={data.buddy.preferences}
            retentionDays={data.retention_days}
            aiEnabled={data.status.ai_enabled}
            snoozedUntil={data.buddy.snoozed_until}
            nebiusConfigured={data.status.nebius_configured}
            tavilyConfigured={data.status.tavily_configured}
            userSettings={userSettings}
            dnd={data.status.dnd}
            onHistoryCleared={async () => {
              setResults([]);
              await refresh();
            }}
          >
            {data.goal && (
              <AppRules
                key={data.goal.id}
                goalId={data.goal.id}
                rules={data.app_rules}
                processes={[
                  ...data.activity.map((a) => a.process_name),
                  ...data.today.apps.map((a) => a.process_name),
                ]}
                onChanged={refresh}
              />
            )}
          </Settings>
        </div>
        <div className="workspace-grid" hidden={settingsOpen}>
          <section className="focus-column">
            <div className="card goal-card">
              <div className="section-label">
                <Target size={17} /> CURRENT GOAL
              </div>
              {data.goal && <h2>{data.goal.text}</h2>}
              <GoalInput
                disabled={busy || !desktop || plannerDirty}
                onStart={(text) => run(() => api.setGoal(text))}
              />
              {data.goal && (
                <p className="helper">
                  Starting another goal defers this one without marking it
                  complete.
                </p>
              )}
              {plannerDirty && (
                <p className="helper">
                  Save or discard plan edits before switching goals.
                </p>
              )}
              {data.goal && (
                <button
                  className="text-button session-toggle"
                  disabled={busy}
                  onClick={() =>
                    void run(() => api.tracking(!data.status.tracking))
                  }
                >
                  {data.status.tracking ? (
                    <Pause size={15} />
                  ) : (
                    <Play size={15} />
                  )}{" "}
                  {data.status.tracking ? "Pause tracking" : "Resume tracking"}
                </button>
              )}
            </div>
            {data.goal && data.goal_plan && (
              <GoalPlanner
                key={`${data.goal.id}:${data.goal_plan.revision}`}
                goal={data.goal}
                plan={data.goal_plan}
                onChanged={refresh}
                onDirty={setPlannerDirty}
                onCompleted={setCompletedGoal}
                aiAvailable={
                  data.status.nebius_configured || data.status.mock_ai
                }
                mock={data.status.mock_ai}
              />
            )}
            <SavedGoals
              goals={data.saved_goals}
              onChanged={refresh}
              locked={plannerDirty || busy}
            />
            {completedGoal !== null && (
              <div className="card">
                <ProductFeedback key={completedGoal} goalId={completedGoal} />
                <button
                  className="text-button"
                  onClick={() => setCompletedGoal(null)}
                >
                  Close feedback
                </button>
              </div>
            )}
            <DailySummary
              today={data.today}
              plan={data.goal_plan}
              demo={data.status.demo}
            />
            <div className="card activity-card">
              <div className="section-heading">
                <div>
                  <h2>Your activity</h2>
                </div>
                <span className="muted">Recent sessions</span>
              </div>
              <ActivityTimeline activity={data.activity} />
              <div className="card-footer">
                <LockKeyhole size={13} /> Window titles stay on this device
                unless you enable AI check-ins or proactive suggestions.
              </div>
            </div>
            <div className="card search-card">
              <div className="section-heading">
                <div>
                  <h2>Find a way forward</h2>
                </div>
                <Search size={20} />
              </div>
              <form
                className="input-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => setResults(await api.search(query)));
                }}
              >
                <input
                  aria-label="Search the web"
                  placeholder="What could help you move forward?"
                  maxLength={500}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button disabled={busy || !desktop || !query.trim()}>
                  Search <ArrowUpRight size={16} />
                </button>
              </form>
              <p className="helper">
                On-demand web search with Tavily. Only your search query is
                sent.
              </p>
              {results.map((r, i) => (
                <article className="result" key={`${r.url}-${i}`}>
                  <a
                    href={safeUrl(r.url)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => {
                      if (desktop) {
                        event.preventDefault();
                        const url = safeUrl(r.url);
                        if (url) void run(() => openUrl(url));
                      }
                    }}
                  >
                    {r.title} ↗
                  </a>
                  <p>{r.content}</p>
                </article>
              ))}
            </div>
            <RecommendationHistory
              recommendations={data.recommendations}
              onChanged={refresh}
            />
          </section>
          <aside className="right-column">
            <section className="companion-card">
              <div className="section-label">
                YOUR QUIET COMPANION <Sparkles size={15} />
              </div>
              <Avatar
                appearance={userSettings.profile.avatar}
                state={avatarState(data.buddy)}
              />
              <p>
                Buddy lives on your desktop. Closing this workspace keeps it
                running in the system tray. Choose Quit to stop the app.
              </p>
              <h2>
                {data.decision?.state === "focused"
                  ? "You’re finding your flow."
                  : "Here, when you need me."}
              </h2>
              <p>
                {data.decision?.reason ||
                  "A gentle nudge, a useful thought, or just a little company along the way."}
              </p>
              <button
                className="outline-button"
                disabled={
                  busy || !desktop || !data.goal || !data.status.ai_enabled
                }
                onClick={() => void run(api.analyze)}
              >
                <Sparkles size={16} /> {busy ? "Working…" : "Check my focus"}
              </button>
              {data.decision && (
                <span className="decision-label">
                  {data.decision.state} ·{" "}
                  {Math.round(data.decision.confidence * 100)}% confidence
                </span>
              )}
            </section>
          </aside>
        </div>
        <footer>
          <button
            className="text-button"
            disabled={!desktop || busy}
            onClick={() => void run(api.quit)}
          >
            Quit Desktop Buddy
          </button>
          DESIGNED FOR A LITTLE MORE FOCUS{" "}
          <span>No screenshots. Automatic search only with your consent.</span>
        </footer>
      </main>
    </div>
  );
}
