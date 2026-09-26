import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  BellOff,
  Compass,
  LockKeyhole,
  Pause,
  Play,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { api, desktop, safeUrl } from "./api/tauri";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Dashboard, SearchResult } from "./types";
import { GoalInput } from "./components/GoalInput";
import { ActivityTimeline } from "./components/ActivityTimeline";
import { DesktopBuddy } from "./components/DesktopBuddy";
import packageInfo from "../package.json";
import { Settings } from "./components/Settings";

const empty: Dashboard = {
  version: packageInfo.version,
  buddy: {
    preferences: { suggestions_only: true, proactive: false },
    suggestion: null,
    decision: null,
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
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const popup = new URLSearchParams(location.search).has("buddy");
  useEffect(() => {
    document.documentElement.classList.toggle("buddy-window", popup);
  }, [popup]);
  const refresh = useCallback(async () => {
    if (desktop) setData(await api.dashboard());
  }, []);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        if (desktop) {
          const next = await api.dashboard();
          if (active) setData(next);
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
            onDismiss={() => void run(api.dismiss)}
            onDnd={() => void run(() => api.dnd(true))}
          />
        }
      </main>
    );
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
        <button
          className="text-button"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          Settings
        </button>
        <div className="sidebar-note">
          <span className="small-orbit">✳</span>
          <h3>A little more present.</h3>
          <p>Make room for the work that matters to you.</p>
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
        </header>
        <div className="page-title">
          <div>
            <span className="eyebrow">LESS NOISE, MORE MOMENTUM</span>
            <h1>
              One thing at a time<span>.</span>
            </h1>
            <p>A calm corner for your next good idea.</p>
          </div>
          <div className="status-pill">
            <i className={data.status.tracking ? "live" : ""} />
            {data.status.tracking
              ? "Session in progress"
              : "Ready when you are"}
          </div>
        </div>
        {!desktop && (
          <div className="notice">
            Design preview · Open the desktop app with{" "}
            <code>npm run tauri dev</code> to track activity and connect AI.
          </div>
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
        {settingsOpen && (
          <Settings onChanged={refresh} preferences={data.buddy.preferences} />
        )}
        <div className="workspace-grid">
          <section className="focus-column">
            <div className="card goal-card">
              <div className="section-label">
                <Target size={17} /> YOUR NORTH STAR <span>01</span>
              </div>
              <h2>
                {data.goal?.text || "Good work starts with an intention."}
              </h2>
              <GoalInput
                disabled={busy || !desktop}
                onStart={(text) => run(() => api.setGoal(text))}
              />
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
            <div className="card activity-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">THE LITTLE STEPS ADD UP</span>
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
                  <span className="eyebrow">A FRESH PERSPECTIVE</span>
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
          </section>
          <aside className="right-column">
            <section className="companion-card">
              <div className="section-label">
                YOUR QUIET COMPANION <Sparkles size={15} />
              </div>
              <p>
                Buddy lives on your desktop. Start a session and minimize this
                workspace to keep working.
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
            <section className="card preferences">
              <h3>Make yourself comfortable</h3>
              <button
                className="text-button"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen(!settingsOpen)}
              >
                Manage API keys
              </button>
              <label className="toggle-row">
                <span>
                  <Sparkles size={16} /> AI check-ins
                  <small>
                    Sends your goal and recent window titles to Nebius.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={data.status.ai_enabled}
                  disabled={!desktop || busy}
                  onChange={(e) => void run(() => api.ai(e.target.checked))}
                />
              </label>
              <label className="toggle-row">
                <span>
                  <BellOff size={16} /> Do not disturb
                  <small>Keep tracking, pause the nudges.</small>
                </span>
                <input
                  type="checkbox"
                  checked={data.status.dnd}
                  disabled={!desktop || busy}
                  onChange={(e) => void run(() => api.dnd(e.target.checked))}
                />
              </label>
              <div className="connection">
                <i className={data.status.nebius_configured ? "live" : ""} />{" "}
                Nebius{" "}
                {data.status.nebius_configured
                  ? "configured"
                  : "not configured"}
              </div>
              <div className="connection">
                <i className={data.status.tavily_configured ? "live" : ""} />{" "}
                Tavily{" "}
                {data.status.tavily_configured
                  ? "configured"
                  : "not configured"}
              </div>
            </section>
            <p className="quiet-note">Progress doesn’t have to be loud.</p>
          </aside>
        </div>
        <footer>
          DESIGNED FOR A LITTLE MORE FOCUS{" "}
          <span>No screenshots. Automatic search only with your consent.</span>
        </footer>
      </main>
    </div>
  );
}
