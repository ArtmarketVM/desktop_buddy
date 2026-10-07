import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { defaultCompanionView } from "./companion/types";
import { api, desktop } from "./api/tauri";
import type { Dashboard } from "./types";
import { defaultBuddyPreferences, defaultUserSettings } from "./types";
import { DesktopBuddy } from "./components/DesktopBuddy";
import packageInfo from "../package.json";
import { AppShell, pages, type WorkspacePage } from "./components/AppShell";
import { StartupUpdate, UpdateDialog } from "./components/Updates";
import { useUpdates } from "./updates/useUpdates";
import { ResetProfileDialog } from "./components/ResetProfileDialog";
import { Experience } from "./core/Experience";
import { CoreSettings } from "./core/Settings";
import { goalEnhancement } from "./ai/api";
import { CoreOnboarding } from "./core/Onboarding";
import { WorkspaceOverview } from "./core/WorkspaceOverview";
import { FeedbackCard } from "./components/FeedbackCard";
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
  const [dashboardError, setDashboardError] = useState("");
  const displayedError = error || dashboardError;
  const [busy, setBusy] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [setupDirty, setSetupDirty] = useState(false);
  const dirty = draftDirty || settingsDirty || setupDirty;
  const [page, setPage] = useState<WorkspacePage>("focus");
  const [loaded, setLoaded] = useState(!desktop);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [overview, setOverview] = useState(false);
  const [quickRequest, setQuickRequest] = useState(0);
  const closeOverview = useCallback(() => setOverview(false), []);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    localStorage.getItem("buddy-theme") === "dark" ? "dark" : "light",
  );
  const popup = new URLSearchParams(location.search).has("buddy");
  const { controller, snapshot: update } = useUpdates(!popup);
  const startupBlocked = desktop && !popup && update.startup !== "ready";
  const settings = data.user_settings ?? defaultUserSettings;
  const preview =
    !desktop &&
    new URLSearchParams(location.search).get("preview") === "workspace";
  const onboarding = !settings.onboarding.completed && !preview;
  useEffect(() => {
    if (quickRequest && page === "focus" && !onboarding)
      document.querySelector<HTMLInputElement>(".quick-goal input")?.focus();
  }, [quickRequest, page, onboarding]);
  useEffect(() => {
    if (!desktop || popup) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen<string>("buddy://navigate", (event) => {
      if (pages.some((item) => item.id === event.payload))
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
    document.documentElement.classList.toggle("buddy-window", popup);
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
      setDashboardError("");
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
            setDashboardError("");
            setLoaded(true);
          }
        }
      } catch (e) {
        if (active) setDashboardError(String(e));
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  async function run(action: () => Promise<unknown>) {
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
  }
  if (popup)
    return (
      <main className="popup-shell">
        {displayedError && <p role="alert">{displayedError}</p>}
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
          {displayedError && <p role="alert">{displayedError}</p>}
          <button onClick={() => void run(refresh)}>Retry</button>
        </section>
      </main>
    );
  const title = pages.find((item) => item.id === page)!;
  return (
    <>
      {startupBlocked && <StartupUpdate snapshot={update} />}
      <div inert={startupBlocked || updatesOpen || resetOpen}>
        <AppShell
          page={page}
          onNavigate={setPage}
          profile={settings.profile}
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
          onQuickGoal={() => {
            setPage("focus");
            setQuickRequest((previous) => previous + 1);
          }}
        >
          {onboarding ? (
            <CoreOnboarding
              nebiusConfigured={data.status.nebius_configured}
              initial={settings}
              onChanged={refresh}
              onDirty={setSetupDirty}
              onComplete={() => {
                setPage("focus");
                setOverview(true);
              }}
            />
          ) : (
            <>
              {overview && <WorkspaceOverview close={closeOverview} />}
              <div className="page-title">
                <div>
                  <h1>{title.label}</h1>
                  <p>{title.description}</p>
                </div>
              </div>
              {!desktop && (
                <p className="notice preview-notice">
                  Browser preview · saves, voice recognition and updates are
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
              {displayedError && (
                <p className="error" role="alert">
                  {displayedError}
                </p>
              )}
              {update.error && !startupBlocked && (
                <p className="notice" role="status">
                  Automatic update unavailable. Your installed version is ready
                  to use. Open Updates to retry.
                </p>
              )}
              <div
                hidden={
                  page === "settings" ||
                  page === "profile" ||
                  page === "feedback"
                }
              >
                <Experience
                  dashboard={data}
                  onSettings={() => setPage("settings")}
                  enhancement={desktop ? goalEnhancement : undefined}
                  page={page}
                  onDirty={setDraftDirty}
                  onChanged={refresh}
                  revision={
                    String(data.goal?.id) +
                    ":" +
                    String(settings.onboarding.completed)
                  }
                />
              </div>
              {page === "feedback" && <FeedbackCard />}
              <div hidden={page !== "settings" && page !== "profile"}>
                <CoreSettings
                  data={data}
                  onChanged={refresh}
                  onDirty={setSettingsDirty}
                />
              </div>
              <footer>
                <span>Your space. Your pace.</span>
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
          unsaved={dirty}
        />
      )}{" "}
      {resetOpen && (
        <ResetProfileDialog
          busy={busy}
          unsaved={dirty}
          onClose={() => setResetOpen(false)}
          onConfirm={() =>
            void run(api.resetProfile).then((ok) => {
              if (ok) {
                setResetOpen(false);
                setDraftDirty(false);
                setSettingsDirty(false);
                setSetupDirty(false);
                setPage("focus");
              }
            })
          }
        />
      )}
    </>
  );
}
