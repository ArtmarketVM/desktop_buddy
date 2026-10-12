import { MemorySettings } from "../components/MemorySettings";
import { TrackingStatus } from "./TrackingStatus";
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
import { PrivacySettings } from "../components/PrivacySettings";
import { AvatarPicker } from "../components/ProfileFields";
import { CompanionSettings } from "../companion/CompanionSettings";
import { PersonalAiEnginePanel } from "../ai/PersonalAiEngine";
import { AiSettings } from "../ai/AiSettings";
import { coreApi } from "./api";
import { emptyCore } from "./types";

const sections = [
  "General",
  "Profile",
  "Privacy",
  "Memory",
  "Appearance",
  "Updates",
  "Integrations / AI",
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
  const [ready, setReady] = useState(!desktop);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [trackingConsentPending, setTrackingConsentPending] = useState(false);
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
  const blocked = busy || !desktop || !ready;
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
            <p className="helper">
              Stored in your local profile. Email reports are not available yet;
              this does not subscribe you or share your email with AI.
            </p>
          </fieldset>
        </details>
        <details className="core-section" hidden={section !== "General"} open>
          <summary>General</summary>
          <AvatarPicker
            profile={profile}
            disabled={blocked}
            onChange={(next) => {
              setProfile(next);
              change();
            }}
          />
          <label className="toggle-row">
            <span>Show Buddy on desktop</span>
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
          <p className="helper" role="status">
            {data.buddy.desktop_visible
              ? "Buddy is visible on your desktop. Click to chat or drag to move."
              : (data.buddy.visibility_reason ??
                "Desktop visibility is being checked.")}
          </p>
          <button
            className="text-button"
            disabled={blocked || !desktop}
            onClick={() => void run(api.resetBuddyPosition)}
          >
            Reset Buddy position
          </button>
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
          <label className="toggle-row">
            <span>
              Do not disturb
              <small>
                Pause all automatic nudges until you turn this off. Chat remains
                available.
              </small>
            </span>
            <input
              type="checkbox"
              checked={data.status.dnd}
              disabled={blocked}
              onChange={(e) => void run(() => api.dnd(e.target.checked))}
            />
          </label>
          <button
            className="outline-button"
            disabled={blocked}
            onClick={() => void run(() => api.snooze(true))}
          >
            Pause nudges for 1 hour
          </button>
          {data.buddy.snoozed_until && (
            <button
              className="text-button"
              disabled={blocked}
              onClick={() => void run(() => api.snooze(false))}
            >
              Resume nudges now
            </button>
          )}
          <CompanionSettings
            onChanged={onChanged}
            currentPreferences={data.buddy.companion?.preferences}
          />
          <label className="toggle-row">
            <span>
              Movement reminders
              <small>
                A workspace note after 45 minutes on the optional timer.
              </small>
            </span>
            <input
              type="checkbox"
              checked={preferences.movement_reminders}
              disabled={blocked}
              onChange={(e) => {
                setPreferences({
                  ...preferences,
                  movement_reminders: e.target.checked,
                });
                change();
              }}
            />
          </label>
        </details>
        <details
          className="core-section"
          hidden={section !== "Appearance"}
          open
        >
          <summary>Appearance</summary>
          <label className="toggle-row">
            <span>Dark theme</span>
            <input
              type="checkbox"
              checked={settings.theme === "dark"}
              disabled={blocked}
              onChange={(e) =>
                void run(() => api.theme(e.target.checked ? "dark" : "light"))
              }
            />
          </label>
        </details>
        <details className="core-section" hidden={section !== "Privacy"} open>
          <summary>Privacy</summary>
          <MacPermissions />
          <label className="toggle-row">
            <span>
              Track goals and suggest completed work
              <small>
                Record app activity and time locally. Send a limited sample of
                visible text with your goal and steps to Nebius to suggest
                completed work. Every completion needs your confirmation.
              </small>
            </span>
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
          {data.status.tracking &&
            !data.buddy.companion?.preferences.screen_task_detection && (
              <button
                className="text-button"
                disabled={blocked}
                onClick={() => setTrackingConsentPending(true)}
              >
                Enable completion checks
              </button>
            )}
          {trackingConsentPending && (
            <div className="card" aria-label="Confirm local activity tracking">
              <p>
                Record foreground apps, window/tab titles and active time on
                this computer, and send up to 3,000 characters of visible text
                with your goal and steps to Nebius for progress checks? Password
                and edit controls are skipped. Provider charges may apply.
              </p>
              <button
                disabled={blocked}
                onClick={() => {
                  void run(() => api.goalMonitoring(true)).then(async (ok) => {
                    if (ok) setTrackingConsentPending(false);
                    if (ok && isMac)
                      await invoke<boolean>(
                        "request_accessibility_permission",
                      ).catch((e) => setError(String(e)));
                  });
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
          <TrackingStatus dashboard={data} compact />
          <fieldset disabled={blocked}>
            <div className="working-days">
              <span>Working days</span>
              <div>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (label, day) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        checked={preferences.working_days.includes(day)}
                        onChange={(e) => {
                          setPreferences({
                            ...preferences,
                            working_days: e.target.checked
                              ? [...preferences.working_days, day]
                              : preferences.working_days.filter(
                                  (d) => d !== day,
                                ),
                          });
                          change();
                        }}
                      />
                      {label}
                    </label>
                  ),
                )}
              </div>
            </div>
            <div className="working-hours">
              {(["working_start_minute", "working_end_minute"] as const).map(
                (key, index) => (
                  <label key={key}>
                    {index === 0 ? "Start time" : "End time"}
                    <input
                      type="time"
                      value={time(hours[key])}
                      onChange={(e) => {
                        if (e.target.value) {
                          setHours({
                            ...hours,
                            [key]: minutes(e.target.value),
                          });
                          change();
                        }
                      }}
                    />
                  </label>
                ),
              )}
            </div>
          </fieldset>
          <details className="core-section">
            <summary>Local data controls</summary>
            <PrivacySettings
              preferences={data.buddy.preferences}
              retentionDays={data.retention_days}
              onChanged={onChanged}
              onHistoryCleared={onChanged}
              showExclusions={false}
            />
          </details>
        </details>
        <details className="core-section" hidden={section !== "Memory"} open>
          <summary>Memory</summary>
          {section === "Memory" && <MemorySettings onChanged={onChanged} />}
        </details>
        <details className="core-section" hidden={section !== "Updates"} open>
          <summary>Updates</summary>
          <p>Installed version {data.version}</p>
          <button className="outline-button" type="button" onClick={onUpdates}>
            Check for updates
          </button>
        </details>
        <details
          className="core-section"
          hidden={section !== "Integrations / AI"}
          open
        >
          <summary>Integrations / AI</summary>
          <p className="helper">
            Goals work without AI. Provider keys are kept in the running app and
            are not stored in your profile.
          </p>
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
          <PersonalAiEnginePanel />
        </details>
        <details className="core-section" hidden={section !== "About"} open>
          <summary>About</summary>
          <p>Desktop Buddy · v{data.version}</p>
          <p className="helper">
            Local profile · {settings.profile.name || "Your workspace"}
          </p>
          <p className="helper">
            Goals, profile, chat and activity history are stored on this PC. AI
            requests use the providers you configure. Local history is not
            encrypted; deleting it does not delete records held by providers.
          </p>
        </details>
        <div className="settings-actions settings-save">
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
