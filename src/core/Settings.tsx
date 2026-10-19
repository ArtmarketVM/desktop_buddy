import { MemorySettings } from "../components/MemorySettings";
import { MacPermissions } from "../components/MacPermissions";
import { TrackingStatus } from "./TrackingStatus";
import { isMac } from "../api/platform";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, desktop } from "../api/tauri";
import {
  defaultTrackingSettings,
  defaultUserSettings,
  type Dashboard,
} from "../types";
import { ProviderRow } from "./ProviderRow";
import { serviceStatusApi, type ServiceSnapshot } from "../ai/serviceStatus";
import { openUrl } from "@tauri-apps/plugin-opener";
import { WindowActivity } from "./WindowActivity";
import { Hint } from "./Hint";
import { memoryApi } from "../api/memory";
import { AvatarPicker } from "../components/ProfileFields";
import { CompanionSettings } from "../companion/CompanionSettings";
import { PersonalAiEnginePanel } from "../ai/PersonalAiEngine";
import { AiSettings } from "../ai/AiSettings";
import { coreApi } from "./api";
import { emptyCore } from "./types";

const sections = ["General", "Profile", "AI", "Privacy", "About"] as const;
const time = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const minutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

export const PRIVACY_POLICY_URL =
  "https://artmarketvm.github.io/desktop_buddy/privacy.html";

/** One plain sentence about what sumi knows right now and what it would send. */
export function describePrivacy(
  preview: string,
  tracking: boolean,
  goalTitle: string | null,
): string {
  if (!tracking)
    return "Tracking is paused, so sumi records nothing and sends nothing. Turn it on above and this sentence will tell you exactly what it sees.";
  const never =
    "It never sends what is on your screen, what you type, or who you are.";
  const goal = goalTitle ? `your goal, “${goalTitle}”` : "your current goal";
  let apps: { app: string; seconds: number }[] = [];
  try {
    const parsed = JSON.parse(preview) as {
      focus_check?: {
        recent_activity?: { app: string; seconds: number }[];
      };
    };
    const totals = new Map<string, number>();
    for (const item of parsed.focus_check?.recent_activity ?? []) {
      // The lock screen is not something you "worked in".
      if (item.app === "loginwindow") continue;
      totals.set(item.app, (totals.get(item.app) ?? 0) + item.seconds);
    }
    apps = [...totals]
      .map(([app, seconds]) => ({ app, seconds }))
      .sort((x, y) => y.seconds - x.seconds)
      .slice(0, 3);
  } catch {
    apps = [];
  }
  if (!apps.length)
    return `sumi has not recorded any activity yet. When it checks your progress it will tell Nebius the last window titles and ${goal}. ${never}`;
  const spell = ({ app, seconds }: { app: string; seconds: number }) => {
    const m = Math.round(seconds / 60);
    return `${app} for ${m < 1 ? "under a minute" : `${m} minute${m === 1 ? "" : "s"}`}`;
  };
  const list =
    apps.length === 1
      ? spell(apps[0])
      : `${apps
          .slice(0, -1)
          .map(spell)
          .join(", ")} and ${spell(apps[apps.length - 1])}`;
  return `Right now sumi knows you have been in ${list}. When it checks your progress it tells Nebius those window titles and ${goal}. ${never}`;
}

export function CoreSettings({
  data,
  onChanged,
  onDirty,
  onUpdates,
  sectionRequest,
}: {
  data: Dashboard;
  onChanged: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
  onUpdates: () => void;
  sectionRequest?: { section: "Privacy"; revision: number };
}) {
  const settings = data.user_settings ?? defaultUserSettings;
  const [profile, setProfile] = useState(settings.profile);
  const [autostart, setAutostart] = useState(settings.autostart);
  const [preferences, setPreferences] = useState(emptyCore().preferences);
  const [hours, setHours] = useState(defaultTrackingSettings);
  const [goals, setGoals] = useState(emptyCore().goals);
  const [logGoal, setLogGoal] = useState<number | null>(null);
  const [forgetGoal, setForgetGoal] = useState<number | null>(null);
  const [forgetArmed, setForgetArmed] = useState(false);
  useEffect(() => {
    if (!forgetArmed) return;
    const timer = window.setTimeout(() => setForgetArmed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [forgetArmed]);
  const [busy, setBusy] = useState(false);
  const [colorBusy, setColorBusy] = useState(false);
  const [ready, setReady] = useState(!desktop);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [trackingConsentPending, setTrackingConsentPending] = useState(false);
  const [retention, setRetention] = useState(data.retention_days);
  const [preview, setPreview] = useState("");
  const [panel, setPanel] = useState<"log" | "memory" | "raw" | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const logLast = new Date().toISOString().slice(0, 10);
  const logFirst = new Date(Date.now() - 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [clearPending, setClearPending] = useState(false);
  useEffect(() => {
    if (!clearPending) return;
    // An armed button disarms itself after five seconds.
    const timer = window.setTimeout(() => setClearPending(false), 5000);
    return () => window.clearTimeout(timer);
  }, [clearPending]);
  useEffect(() => setRetention(data.retention_days), [data.retention_days]);
  const trackingState = !data.status.tracking
    ? "paused"
    : data.status.tracking_error
      ? "attention"
      : "running";
  const trackingLabel =
    trackingState === "paused"
      ? "Paused"
      : trackingState === "attention"
        ? "Needs attention"
        : "Running";
  const [section, setSection] = useState<(typeof sections)[number]>("General");
  const [services, setServices] = useState<ServiceSnapshot | null>(null);
  const serviceRead = useRef(0);
  const refreshServices = useCallback(async () => {
    const read = ++serviceRead.current;
    try {
      const snapshot = await serviceStatusApi.read();
      if (read === serviceRead.current) setServices(snapshot);
    } catch {
      if (read === serviceRead.current) setServices(null);
    }
  }, []);
  const providerChanged = async () => {
    await refreshServices();
    await onChanged();
  };
  useEffect(() => {
    if (section !== "AI" || !desktop) return;
    const refresh = () => {
      if (!document.hidden) void refreshServices();
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      ++serviceRead.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [
    section,
    data.status.nebius_configured,
    data.status.tavily_configured,
    refreshServices,
  ]);
  const serviceState = (id: "nebius" | "tavily") =>
    services?.services.find((item) => item.id === id)?.status;
  useEffect(() => {
    if (section !== "Privacy" || !desktop) return;
    let active = true;
    void api
      .privacyPreview()
      .then((snapshot) => {
        if (active) setPreview(JSON.stringify(snapshot, null, 2));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [section, data.status.last_collected_at]);
  const privacySentence = describePrivacy(
    preview,
    data.status.tracking,
    data.goal?.text ?? null,
  );
  useEffect(() => {
    if (sectionRequest) setSection(sectionRequest.section);
  }, [sectionRequest]);
  useEffect(() => {
    let active = true;
    if (desktop)
      void Promise.all([coreApi.snapshot(), api.trackingSettings()])
        .then(([core, tracking]) => {
          if (active) {
            setPreferences(core.preferences);
            setGoals(core.goals);
            setHours(tracking);
            setReady(true);
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const change = () => {
    setDirty(true);
    setSaved(false);
  };
  const blocked = busy || colorBusy || !desktop || !ready;
  async function selectColor(next: typeof profile) {
    const previous = profile.avatar.color;
    setProfile(next);
    setColorBusy(true);
    setError("");
    let committed = false;
    try {
      await api.setAvatarColor(next.avatar.color);
      committed = true;
      await onChanged();
    } catch (e) {
      if (!committed)
        setProfile((current) => ({
          ...current,
          avatar: { ...current.avatar, color: previous },
        }));
      setError(String(e));
    } finally {
      setColorBusy(false);
    }
  }
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await onChanged();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (
      await run(async () => {
        await coreApi.identity(
          profile.name,
          autostart,
          profile.avatar,
          profile.email,
        );
        await coreApi.preferences(preferences);
        await api.saveTrackingSettings(hours);
      })
    ) {
      setDirty(false);
      setSaved(true);
    }
  }
  return (
    <div className="core-workspace core-settings">
      <nav className="settings-sections" aria-label="Settings sections">
        {sections.map((item) => (
          <button
            key={item}
            type="button"
            className={section === item ? "selected" : ""}
            aria-current={section === item ? "page" : undefined}
            onClick={() => setSection(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="settings-drafts">
        <details className="core-section" hidden={section !== "Profile"} open>
          <summary>Profile</summary>
          <fieldset disabled={blocked}>
            <label>
              Preferred name
              <input
                required
                maxLength={120}
                value={profile.name}
                onChange={(e) => {
                  setProfile({ ...profile, name: e.target.value });
                  change();
                }}
              />
            </label>
            <label>
              Email (optional)
              <input
                type="email"
                maxLength={254}
                value={profile.email}
                onChange={(e) => {
                  setProfile({ ...profile, email: e.target.value });
                  change();
                }}
              />
            </label>
          </fieldset>
        </details>
        <details className="core-section" hidden={section !== "General"} open>
          <summary>General</summary>
          <AvatarPicker
            profile={profile}
            disabled={blocked}
            onChange={(next) => void selectColor(next)}
          />
          <div className="settings-cards">
            <section className="settings-card" aria-label="On your desktop">
              <p className="eyebrow settings-card-title">On your desktop</p>
              <label className="toggle-row">
                <span>Show sumi on desktop</span>
                <input
                  type="checkbox"
                  checked={
                    settings.profile.avatar.visible &&
                    !data.buddy.preferences.suggestions_only
                  }
                  disabled={blocked}
                  onChange={(e) => {
                    const visible = e.target.checked;
                    void run(() => api.showBuddy(visible)).then((ok) => {
                      if (ok)
                        setProfile((previous) => ({
                          ...previous,
                          avatar: { ...previous.avatar, visible },
                        }));
                    });
                  }}
                />
              </label>
              {!data.buddy.desktop_visible && data.buddy.visibility_reason && (
                <p className="helper" role="status">
                  {data.buddy.visibility_reason}
                </p>
              )}
              <label className="toggle-row">
                <span>Start when I sign in</span>
                <input
                  type="checkbox"
                  checked={autostart}
                  disabled={blocked}
                  onChange={(e) => {
                    setAutostart(e.target.checked);
                    change();
                  }}
                />
              </label>
              <CompanionSettings
                part="desktop"
                onChanged={onChanged}
                currentPreferences={data.buddy.companion?.preferences}
              />
              <label className="toggle-row">
                <span>Remind me to move every 45 minutes</span>
                <input
                  type="checkbox"
                  checked={preferences.movement_reminders}
                  disabled={blocked}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setPreferences({
                      ...preferences,
                      movement_reminders: enabled,
                    });
                    change();
                    const companion = data.buddy.companion?.preferences;
                    if (companion)
                      void run(() =>
                        api.companionPreferences({
                          ...companion,
                          movement_reminder: enabled,
                        }),
                      );
                  }}
                />
              </label>
            </section>
            <section className="settings-card" aria-label="Nudges">
              <p className="eyebrow settings-card-title">Nudges</p>
              <CompanionSettings
                part="nudges"
                onChanged={onChanged}
                currentPreferences={data.buddy.companion?.preferences}
              />
            </section>
          </div>
        </details>
        <details className="core-section" hidden={section !== "Privacy"} open>
          <summary>Privacy</summary>
          <section
            className="settings-card settings-card-wide"
            aria-label="Tracking"
          >
            <p className="eyebrow settings-card-title">Tracking</p>
            <label className="toggle-row">
              <span>Track goals and suggest completed work</span>
              <input
                type="checkbox"
                checked={data.status.tracking}
                disabled={blocked}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  if (enabled) {
                    setTrackingConsentPending(true);
                    return;
                  }
                  void run(() => api.goalMonitoring(enabled));
                }}
              />
            </label>
            {trackingConsentPending && (
              <div
                className="card"
                aria-label="Confirm local activity tracking"
              >
                <p>
                  Record foreground apps, window/tab titles and active time on
                  this computer, and send up to 3,000 characters of visible text
                  with your goal and steps to Nebius for progress checks?
                  Password and edit controls are skipped. Provider charges may
                  apply.
                </p>
                <button
                  disabled={blocked}
                  onClick={() => {
                    void run(() => api.goalMonitoring(true)).then(
                      async (ok) => {
                        if (ok) setTrackingConsentPending(false);
                        if (ok && isMac)
                          await invoke<boolean>(
                            "request_accessibility_permission",
                          ).catch((e) => setError(String(e)));
                      },
                    );
                  }}
                >
                  Enable goal tracking
                </button>
                <button
                  className="text-button"
                  disabled={blocked}
                  onClick={() => setTrackingConsentPending(false)}
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="setting-row">
              <span>Status</span>
              <span className={`tracking-state ${trackingState}`}>
                <i aria-hidden="true" />
                {trackingLabel}
              </span>
            </div>
            <MacPermissions variant="row" />
            <div className="setting-row">
              <span>Working days</span>
              <span
                className="day-chips"
                role="group"
                aria-label="Working days"
              >
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(
                  (label, day) => {
                    const on = preferences.working_days.includes(day);
                    return (
                      <button
                        type="button"
                        key={day}
                        className="day-chip"
                        aria-pressed={on}
                        disabled={blocked}
                        onClick={() => {
                          const next = {
                            ...preferences,
                            working_days: on
                              ? preferences.working_days.filter(
                                  (d) => d !== day,
                                )
                              : [...preferences.working_days, day].sort(),
                          };
                          setPreferences(next);
                          void run(() => coreApi.preferences(next));
                        }}
                      >
                        {label}
                      </button>
                    );
                  },
                )}
              </span>
            </div>
            <div
              className="setting-row"
              role="group"
              aria-label="Working hours"
            >
              <span>Working hours</span>
              <span className="quiet-hours">
                <input
                  type="time"
                  aria-label="Start time"
                  value={time(hours.working_start_minute)}
                  disabled={blocked}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const next = {
                      ...hours,
                      working_start_minute: minutes(e.target.value),
                    };
                    setHours(next);
                    void run(() => api.saveTrackingSettings(next));
                  }}
                />
                <span className="quiet-hours-to">to</span>
                <input
                  type="time"
                  aria-label="End time"
                  value={time(hours.working_end_minute)}
                  disabled={blocked}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const next = {
                      ...hours,
                      working_end_minute: minutes(e.target.value),
                    };
                    setHours(next);
                    void run(() => api.saveTrackingSettings(next));
                  }}
                />
              </span>
            </div>
            <label className="setting-row">
              <span>Keep history</span>
              <select
                value={retention}
                disabled={blocked}
                onChange={(e) => {
                  const days = Number(e.target.value);
                  setRetention(days);
                  void run(() => api.retention(days));
                }}
              >
                <option value={0}>Until I delete it</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
            <div className="setting-row">
              <button
                type="button"
                className={`clear-history ${clearPending ? "armed" : ""}`}
                disabled={blocked}
                onClick={() => {
                  if (!clearPending) {
                    setClearPending(true);
                    return;
                  }
                  void run(async () => {
                    await api.clearHistory();
                    setPreview("");
                  }).then(() => setClearPending(false));
                }}
              >
                {clearPending
                  ? "Click again to clear everything"
                  : "Clear all local history"}
              </button>
            </div>
          </section>
          <div className="privacy-sentence">
            <span className="privacy-cell" aria-hidden="true" />
            <p role="status">{privacySentence}</p>
          </div>
          <div className="privacy-actions">
            <button
              type="button"
              className={`privacy-action ${panel === "log" ? "on" : ""}`}
              aria-pressed={panel === "log"}
              onClick={() => setPanel(panel === "log" ? null : "log")}
            >
              See the activity log
            </button>
            <button
              type="button"
              className={`privacy-action ${panel === "memory" ? "on" : ""}`}
              aria-pressed={panel === "memory"}
              onClick={() => setPanel(panel === "memory" ? null : "memory")}
            >
              See what sumi remembers
            </button>
            <button
              type="button"
              className={`privacy-action ${panel === "raw" ? "on" : ""}`}
              aria-pressed={panel === "raw"}
              disabled={blocked}
              onClick={() => setPanel(panel === "raw" ? null : "raw")}
            >
              Raw data
            </button>
            <button
              type="button"
              className="privacy-action"
              onClick={() => void openUrl(PRIVACY_POLICY_URL)}
            >
              Privacy policy ↗
            </button>
          </div>
          {panel === "log" && (
            <section
              className="settings-card activity-log"
              aria-label="Activity log"
            >
              <div className="activity-log-head">
                <p className="eyebrow settings-card-title">
                  Activity log · last 7 days
                </p>
                <label className="activity-log-goal">
                  <span className="sr-only">Goal</span>
                  <select
                    value={logGoal ?? ""}
                    onChange={(e) =>
                      setLogGoal(e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">All goals</option>
                    {goals
                      .filter((goal) => goal.status !== "completed")
                      .map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.title}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <WindowActivity
                first={logFirst}
                last={logLast}
                goalId={logGoal}
              />
            </section>
          )}
          {panel === "memory" && (
            <section
              className="settings-card activity-log"
              aria-label="What sumi remembers"
            >
              <p className="eyebrow settings-card-title">What sumi remembers</p>
              <MemorySettings part="browser" onChanged={onChanged} />
            </section>
          )}
          {panel === "raw" && preview && (
            <pre className="privacy-preview">{preview}</pre>
          )}
        </details>
        <details className="core-section" hidden={section !== "AI"} open>
          <summary>AI</summary>
          <div className="settings-cards">
            <section
              className="settings-card settings-card-full"
              aria-label="Services"
            >
              <p className="eyebrow settings-card-title">Services</p>
              <ProviderRow
                provider="nebius"
                name="Nebius"
                role={
                  services?.configured_model
                    ? `runs the AI · ${services.configured_model}`
                    : "runs the AI"
                }
                configured={data.status.nebius_configured}
                checked={serviceState("nebius")}
                onChanged={providerChanged}
              />
              <ProviderRow
                provider="tavily"
                name="Tavily"
                role="web search"
                configured={data.status.tavily_configured}
                checked={serviceState("tavily")}
                onChanged={providerChanged}
              />
              <p className="helper">
                Connection tests verify key access. AI generation and web search
                can still fail or time out separately.
              </p>
              <label className="setting-row">
                <span className="svc">
                  <b>Vision model</b>
                  <small>optional</small>
                </span>
                <input
                  maxLength={160}
                  value={preferences.vision_model}
                  placeholder="Model ID"
                  disabled={blocked}
                  onChange={(e) => {
                    setPreferences({
                      ...preferences,
                      vision_model: e.target.value,
                    });
                    change();
                  }}
                />
              </label>
            </section>
            <section className="settings-card" aria-label="AI">
              <p className="eyebrow settings-card-title">AI</p>
              <AiSettings onChanged={onChanged} compact />
            </section>
            <section className="settings-card" aria-label="Memory">
              <p className="eyebrow settings-card-title">Memory</p>
              <MemorySettings part="controls" onChanged={onChanged} />
              <div className="setting-row forget-goal-row">
                <span className="lbl">
                  Forget a goal
                  <Hint text="Removes everything sumi remembers about one goal: facts, checkpoints and events. The goal itself stays." />
                </span>
                <span className="acts">
                  <select
                    aria-label="Goal to forget"
                    value={forgetGoal ?? ""}
                    disabled={blocked}
                    onChange={(e) => {
                      setForgetGoal(
                        e.target.value ? Number(e.target.value) : null,
                      );
                      setForgetArmed(false);
                    }}
                  >
                    <option value="">Choose a goal</option>
                    {goals.map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        {goal.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={`small-button ${forgetArmed ? "danger-button" : "outline-button"}`}
                    disabled={blocked || forgetGoal === null}
                    onClick={() => {
                      if (forgetGoal === null) return;
                      if (!forgetArmed) {
                        setForgetArmed(true);
                        return;
                      }
                      const id = forgetGoal;
                      setForgetArmed(false);
                      void run(() => memoryApi.clearGoal(id)).then((ok) => {
                        if (ok) setForgetGoal(null);
                      });
                    }}
                  >
                    {forgetArmed ? "Click again to forget" : "Forget"}
                  </button>
                </span>
              </div>
              <div className="setting-row">
                <span />
                <button
                  type="button"
                  className="text-button row-link"
                  onClick={() => {
                    setPanel("memory");
                    setSection("Privacy");
                  }}
                >
                  See what sumi remembers ↗
                </button>
              </div>
            </section>
          </div>
        </details>
        <details className="core-section" hidden={section !== "About"} open>
          <summary>About</summary>
          <p>sumi · v{data.version}</p>
          <div className="about-actions">
            <button
              className="outline-button"
              type="button"
              onClick={onUpdates}
            >
              Check for updates
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowDiagnostics((open) => !open)}
            >
              {showDiagnostics ? "Hide diagnostics" : "Diagnostics"}
            </button>
          </div>
          {showDiagnostics && (
            <div className="diagnostics">
              <TrackingStatus dashboard={data} compact />
              <PersonalAiEnginePanel initiallyOpen />
            </div>
          )}
        </details>
        <div
          className="settings-actions settings-save"
          hidden={section === "Privacy"}
        >
          <button
            type="button"
            onClick={() => void save()}
            disabled={blocked || !profile.name.trim() || !dirty}
          >
            {busy ? "Saving…" : "Save preferences"}
          </button>
          {saved && <span role="status">Saved</span>}
          {dirty && <span className="helper">Unsaved preferences</span>}
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
