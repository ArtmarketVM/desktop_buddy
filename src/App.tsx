import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { defaultCompanionView } from "./companion/types";
import {
  ArrowUpRight,
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
import { AppShell, pages, type WorkspacePage } from "./components/AppShell";
import { UpdateDialog } from "./components/Updates";
import { useUpdates } from "./updates/useUpdates";
import { GoalHistoryView } from "./components/GoalHistoryView";
import { ProfileSettings } from "./components/ProfileSettings";
import { FeedbackCard } from "./components/FeedbackCard";
import { ResetProfileDialog } from "./components/ResetProfileDialog";

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
  const [page, setPage] = useState<WorkspacePage>("focus");
  const [loaded, setLoaded] = useState(!desktop);
  const [completedGoal, setCompletedGoal] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    localStorage.getItem("buddy-theme") === "dark" ? "dark" : "light",
  );
  const popup = new URLSearchParams(location.search).has("buddy");
  const { controller, snapshot: update } = useUpdates(!popup);
  const userSettings = data.user_settings ?? defaultUserSettings;
  const desktopBuddyEnabled =
    userSettings.profile.avatar.visible &&
    !data.buddy.preferences.suggestions_only &&
    !(data.buddy.snoozed_until && data.buddy.snoozed_until * 1000 > Date.now());
  const settingsOpen = page === "settings";
  const profileOpen = page === "profile";
  // Browser previews inspect the shell without inventing persisted goals or updates.
  const preview =
    !desktop &&
    new URLSearchParams(location.search).get("preview") === "workspace";
  const onboarding = !userSettings.onboarding.completed && !preview;
  useEffect(() => {
    document.documentElement.classList.toggle("buddy-window", popup);
  }, [popup]);
  useEffect(() => {
    if (!desktop || popup) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen<string>("buddy://navigate", (event) => {
      if (pages.some((page) => page.id === event.payload))
        setPage(event.payload as WorkspacePage);
    })
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      stop?.();
    };
  }, [popup]);
  useEffect(() => {
    if (data.user_settings) setTheme(data.user_settings.theme);
  }, [data.user_settings?.theme]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("buddy-theme", theme);
  }, [theme]);
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
        <DesktopBuddy
          view={
            !desktop &&
            new URLSearchParams(location.search).get("preview") === "chat"
              ? {
                  ...data.buddy,
                  companion: { ...defaultCompanionView, chat_open: true },
                }
              : data.buddy
          }
          goal={data.goal}
          plan={data.goal_plan}
          onChanged={refresh}
          onDismiss={() => void run(() => api.snooze(true))}
          onDnd={() => void run(() => api.dnd(true))}
        />
      </main>
    );
  if (!loaded)
    return (
      <main className="onboarding-shell">
        <section className="card">
          <p role="status">Opening your workspace…</p>
          {error && <p role="alert">{error}</p>}
          <button onClick={() => void run(refresh)}>Retry</button>
        </section>
      </main>
    );
  const title = pages.find((item) => item.id === page)!;
  const navigate = (next: WorkspacePage) => setPage(next);
  return (
    <>
      <div inert={updatesOpen || resetOpen}>
        <AppShell
          page={page}
          onNavigate={navigate}
          profile={userSettings.profile}
          version={data.version}
          update={update}
          onUpdates={() => setUpdatesOpen(true)}
          onboarding={onboarding}
          theme={theme}
          onTheme={(next) => {
            if (desktop) void run(() => api.theme(next));
            else setTheme(next);
          }}
          onReset={() => setResetOpen(true)}
        >
          {onboarding ? (
            <Onboarding initial={userSettings} onChanged={refresh} />
          ) : (
            <>
              <div className="page-title">
                <div>
                  <span className="eyebrow">YOUR PERSONAL WORKSPACE</span>
                  <h1>{title.label}</h1>
                  <p>{title.description}</p>
                </div>
                <div className="status-pill">
                  <i className={data.status.tracking ? "live" : ""} />
                  {data.status.tracking
                    ? "Session in progress"
                    : "Ready when you are"}
                </div>
              </div>
              {!desktop && (
                <p className="notice preview-notice">
                  Browser preview · tracking, update checks and saves are
                  available in the Windows app.
                </p>
              )}
              {(data.status.demo || data.status.mock_ai) && (
                <p className="notice">
                  {data.status.demo ? "Simulated activity" : "Live activity"} ·{" "}
                  {data.status.mock_ai
                    ? "Mock AI responses — no Nebius call"
                    : "Real Nebius integration"}
                </p>
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
                  companionPreferences={data.buddy.companion?.preferences}
                  dnd={data.status.dnd}
                  onHistoryCleared={async () => {
                    setResults([]);
                    setCompletedGoal(null);
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
              {profileOpen && (
                <ProfileSettings
                  key={JSON.stringify(userSettings.profile)}
                  settings={userSettings}
                  onChanged={refresh}
                />
              )}
              <div
                className="workspace-grid"
                hidden={settingsOpen || profileOpen}
              >
                <section className="focus-column">
                  <div
                    className="view-focus section-stack"
                    hidden={page !== "focus"}
                  >
                    <div className="card goal-card">
                      <div className="section-label">
                        <Target size={16} />
                        CURRENT GOAL<span className="subtle-tag">Personal</span>
                      </div>
                      {data.goal ? (
                        <h2>{data.goal.text}</h2>
                      ) : (
                        <div className="goal-empty">
                          <h2>What matters today?</h2>
                          <p>Give your next session a clear intention.</p>
                        </div>
                      )}
                      {data.goal ? (
                        <details className="inline-details">
                          <summary>Start a different goal</summary>
                          <GoalInput
                            disabled={busy || !desktop || plannerDirty}
                            onStart={(text) => run(() => api.setGoal(text))}
                          />
                        </details>
                      ) : (
                        <GoalInput
                          disabled={busy || !desktop || plannerDirty}
                          onStart={(text) => run(() => api.setGoal(text))}
                        />
                      )}
                      {data.goal && (
                        <div className="goal-session-footer">
                          <span className="helper">
                            A new goal moves this one to saved goals.
                          </span>
                          <button
                            className="secondary session-toggle"
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                api.tracking(!data.status.tracking),
                              )
                            }
                          >
                            {data.status.tracking ? (
                              <Pause size={14} />
                            ) : (
                              <Play size={14} />
                            )}{" "}
                            {data.status.tracking ? "Pause" : "Resume tracking"}
                          </button>
                        </div>
                      )}
                      {plannerDirty && (
                        <p className="helper">
                          Save or discard your plan edits before switching
                          goals.
                        </p>
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
                        <ProductFeedback
                          key={completedGoal}
                          goalId={completedGoal}
                        />
                        <button
                          className="text-button"
                          onClick={() => setCompletedGoal(null)}
                        >
                          Close feedback
                        </button>
                      </div>
                    )}
                  </div>
                  {page === "activity" && (
                    <DailySummary
                      today={data.today}
                      plan={data.goal_plan}
                      demo={data.status.demo}
                    />
                  )}
                  <div
                    className="card activity-card"
                    hidden={page !== "activity"}
                  >
                    <div className="section-heading">
                      <h2>Recent activity</h2>
                      <span className="muted">
                        Observed foreground sessions
                      </span>
                    </div>
                    <ActivityTimeline activity={data.activity} />
                    <div className="card-footer">
                      <LockKeyhole size={13} /> Window titles stay local unless
                      you enable AI sharing.
                    </div>
                  </div>
                  <div
                    className="view-resources section-stack"
                    hidden={page !== "resources"}
                  >
                    <div className="card search-card">
                      <div className="section-heading">
                        <h2>Find a way forward</h2>
                        <Search size={18} />
                      </div>
                      <form
                        className="input-row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () =>
                            setResults(await api.search(query)),
                          );
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
                        Optional web discovery for your goal: articles,
                        tutorials and useful links. Search with Tavily when you
                        need an idea; only your search query is sent. Nothing
                        opens automatically.
                      </p>
                      {results.map((r, i) => (
                        <article className="result" key={`${r.url}-${i}`}>
                          <a
                            href={safeUrl(r.url)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => {
                              if (desktop) {
                                e.preventDefault();
                                const url = safeUrl(r.url);
                                if (url) void run(() => openUrl(url));
                              }
                            }}
                          >
                            {r.title} <ArrowUpRight size={14} />
                          </a>
                          <p>{r.content}</p>
                        </article>
                      ))}
                    </div>
                    <RecommendationHistory
                      recommendations={data.recommendations}
                      onChanged={refresh}
                    />
                  </div>
                  {page === "history" && (
                    <GoalHistoryView
                      refreshKey={data.saved_goals
                        .map((g) => `${g.id}:${g.status}`)
                        .join(",")}
                    />
                  )}
                </section>
                <aside className="right-column" hidden={page !== "focus"}>
                  <section className="card companion-card">
                    <div className="section-label">
                      YOUR COMPANION
                      <Sparkles size={14} />
                    </div>
                    <Avatar
                      appearance={{
                        ...userSettings.profile.avatar,
                        visible: true,
                      }}
                      state={avatarState(data.buddy)}
                    />
                    <p className="companion-status">
                      {!desktop
                        ? "Desktop companion preview"
                        : !userSettings.profile.avatar.visible
                          ? "Hidden on desktop"
                          : data.buddy.snoozed_until &&
                              data.buddy.snoozed_until * 1000 > Date.now()
                            ? "Snoozed"
                            : data.buddy.preferences.suggestions_only
                              ? "Appears only for suggestions"
                              : "Visible on your desktop"}
                    </p>
                    <h2>
                      {data.decision?.state === "focused"
                        ? "You're finding your flow."
                        : "A little company."}
                    </h2>
                    <p>
                      {data.decision?.reason ||
                        "Here for a gentle nudge, a useful idea, or a quiet moment of focus."}
                    </p>
                    <button
                      className="outline-button"
                      disabled={
                        busy ||
                        !desktop ||
                        !data.goal ||
                        !data.status.ai_enabled
                      }
                      onClick={() => void run(api.analyze)}
                    >
                      <Sparkles size={15} />
                      {busy ? "Working…" : "Check my focus"}
                    </button>
                    <label className="toggle-row">
                      <span>Show on desktop</span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={!!desktopBuddyEnabled}
                        disabled={busy || !desktop}
                        onChange={(event) =>
                          void run(() => api.showBuddy(event.target.checked))
                        }
                      />
                    </label>
                    <p className="helper">
                      The character can stay visible with tracking paused. AI
                      check-ins are a separate setting.
                    </p>
                    {data.decision && (
                      <span className="decision-label">
                        {data.decision.state} ·{" "}
                        {Math.round(data.decision.confidence * 100)}% confidence
                      </span>
                    )}
                  </section>
                  <section className="card quiet-tip">
                    <LockKeyhole size={16} />
                    <h3>Your space. Your pace.</h3>
                    <p>
                      Buddy keeps running in the tray when you close this
                      window.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => navigate("settings")}
                    >
                      <SettingsIcon size={14} />
                      Personalize Buddy
                    </button>
                  </section>
                  <FeedbackCard />
                </aside>
              </div>
              <footer>
                <span>
                  <LockKeyhole size={12} />
                  Local by default · made for a little more focus
                </span>
                <button
                  className="text-button"
                  disabled={!desktop || busy}
                  onClick={() => void run(api.quit)}
                >
                  Quit Buddy
                </button>
              </footer>
            </>
          )}
        </AppShell>
      </div>
      {updatesOpen && (
        <UpdateDialog
          controller={controller}
          snapshot={update}
          version={data.version}
          onClose={() => setUpdatesOpen(false)}
          unsaved={plannerDirty}
        />
      )}
      {resetOpen && (
        <ResetProfileDialog
          busy={busy}
          unsaved={plannerDirty}
          onClose={() => setResetOpen(false)}
          onConfirm={() =>
            void run(api.resetProfile).then((ok) => {
              if (ok) {
                setResetOpen(false);
                setCompletedGoal(null);
                setResults([]);
                setPage("focus");
              }
            })
          }
        />
      )}
    </>
  );
}
