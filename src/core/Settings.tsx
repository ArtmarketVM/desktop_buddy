import { MemorySettings } from "../components/MemorySettings";
import { MacPermissions } from "../components/MacPermissions";
import { isMac } from "../api/platform";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { api, desktop } from "../api/tauri";
import {
  defaultTrackingSettings,
  defaultUserSettings,
  type Dashboard,
} from "../types";
import { ProviderKey } from "../components/Settings";
import { PrivacyNotes } from "../components/PrivacySettings";
import { AvatarPicker } from "../components/ProfileFields";
import { CompanionSettings } from "../companion/CompanionSettings";
import { PersonalAiEnginePanel } from "../ai/PersonalAiEngine";
import { AiSettings } from "../ai/AiSettings";
import { SidebarAiServices } from "../components/SidebarAiServices";
import { coreApi } from "./api";
import { emptyCore } from "./types";

const sections = [
  "General",
  "Profile",
  "Privacy",
  "Memory",
  "Integrations / AI",
  "AI Monitor",
  "About",
] as const;
const time = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const minutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

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
  const [busy, setBusy] = useState(false);
  const [colorBusy, setColorBusy] = useState(false);
  const [ready, setReady] = useState(!desktop);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [trackingConsentPending, setTrackingConsentPending] = useState(false);
  const [retention, setRetention] = useState(data.retention_days);
  const [preview, setPreview] = useState("");
  const [showPolicy, setShowPolicy] = useState(false);
  const [clearPending, setClearPending] = useState(false);
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
          <div className="settings-cards">
            <section className="settings-card" aria-label="Tracking">
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
                    this computer, and send up to 3,000 characters of visible
                    text with your goal and steps to Nebius for progress checks?
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
              <MacPermissions />
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
            </section>
            <section className="settings-card" aria-label="Your data">
              <p className="eyebrow settings-card-title">Your data</p>
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
                <span>What the AI can see</span>
                <button
                  type="button"
                  className="outline-button small-button"
                  disabled={blocked}
                  onClick={() => {
                    if (preview) {
                      setPreview("");
                      return;
                    }
                    void run(async () => {
                      setPreview(
                        JSON.stringify(await api.privacyPreview(), null, 2),
                      );
                    });
                  }}
                >
                  {preview ? "Hide" : "Preview"}
                </button>
              </div>
              <div className="setting-row">
                <span>How sumi uses data</span>
                <button
                  type="button"
                  className="outline-button small-button"
                  onClick={() => setShowPolicy((open) => !open)}
                >
                  {showPolicy ? "Hide" : "Read"}
                </button>
              </div>
              <div className="setting-row">
                <span>Clear all local history</span>
                {clearPending ? (
                  <span className="inline-confirm">
                    <button
                      type="button"
                      className="danger-button small-button"
                      disabled={blocked}
                      onClick={() =>
                        void run(async () => {
                          await api.clearHistory();
                          setPreview("");
                        }).then((ok) => {
                          if (ok) setClearPending(false);
                        })
                      }
                    >
                      Clear permanently
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={blocked}
                      onClick={() => setClearPending(false)}
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="outline-button small-button danger-text"
                    disabled={blocked}
                    onClick={() => setClearPending(true)}
                  >
                    Clear…
                  </button>
                )}
              </div>
            </section>
          </div>
          {preview && <pre className="privacy-preview">{preview}</pre>}
          {showPolicy && <PrivacyNotes />}
        </details>
        <details className="core-section" hidden={section !== "Memory"} open>
          <summary>Memory</summary>
          {section === "Memory" && <MemorySettings onChanged={onChanged} />}
        </details>
        <details
          className="core-section"
          hidden={section !== "Integrations / AI"}
          open
        >
          <summary>Integrations / AI</summary>
          <SidebarAiServices enabled variant="panel" />
          <label>
            Vision model (optional)
            <input
              maxLength={160}
              value={preferences.vision_model}
              placeholder="Your provider's vision model ID"
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
          <ProviderKey
            provider="nebius"
            label="Nebius Token Factory"
            onChanged={onChanged}
          />
          <p className="connection">
            Nebius ·{" "}
            {data.status.nebius_configured
              ? "Key configured"
              : "Not configured"}
          </p>
          <ProviderKey provider="tavily" label="Tavily" onChanged={onChanged} />
          <p className="connection">
            Tavily ·{" "}
            {data.status.tavily_configured
              ? "Key configured"
              : "Not configured"}
          </p>
          <AiSettings onChanged={onChanged} />
        </details>
        {section === "AI Monitor" && (
          <section className="core-section" aria-label="AI Monitor">
            <PersonalAiEnginePanel initiallyOpen />
          </section>
        )}
        <details className="core-section" hidden={section !== "About"} open>
          <summary>About</summary>
          <p>sumi · v{data.version}</p>
          <p className="helper">
            Everything is stored on this computer. AI requests go to the
            providers you configure.
          </p>
          <button className="outline-button" type="button" onClick={onUpdates}>
            Check for updates
          </button>
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
