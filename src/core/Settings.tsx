import { useEffect, useState } from "react";
import { api, desktop } from "../api/tauri";
import {
  defaultTrackingSettings,
  defaultUserSettings,
  type Dashboard,
  type TrackingSettings,
} from "../types";
import { ProviderKey } from "../components/Settings";
import { PrivacySettings } from "../components/PrivacySettings";
import { FeedbackCard } from "../components/FeedbackCard";
import { AvatarPicker } from "../components/ProfileFields";
import { CompanionSettings } from "../companion/CompanionSettings";
import { AiSettings } from "../ai/AiSettings";
import { coreApi } from "./api";
import { emptyCore } from "./types";

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
}: {
  data: Dashboard;
  onChanged: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const settings = data.user_settings ?? defaultUserSettings;
  const [name, setName] = useState(settings.profile.name);
  const [autostart, setAutostart] = useState(settings.autostart);
  const [avatar, setAvatar] = useState(settings.profile.avatar);
  const [preferences, setPreferences] = useState(emptyCore().preferences);
  const [hours, setHours] = useState<TrackingSettings>(defaultTrackingSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (desktop)
      void Promise.all([coreApi.snapshot(), api.trackingSettings()])
        .then(([core, tracking]) => {
          setPreferences(core.preferences);
          setHours(tracking);
        })
        .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const change = () => {
    setDirty(true);
    setSaved(false);
  };
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
        await coreApi.identity(name, autostart, avatar);
        await coreApi.preferences(preferences);
        await api.saveTrackingSettings(hours);
      })
    ) {
      setDirty(false);
      setSaved(true);
    }
  }
  const visible =
    settings.profile.avatar.visible && !data.buddy.preferences.suggestions_only;
  return (
    <div className="core-workspace core-settings">
      <section className="core-section">
        <h2>Your everyday preferences</h2>
        <fieldset disabled={busy || !desktop}>
          <label>
            Your name
            <input
              maxLength={120}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                change();
              }}
            />
          </label>
          <label className="toggle-row">
            <span>Start Buddy with Windows</span>
            <input
              type="checkbox"
              checked={autostart}
              onChange={(e) => {
                setAutostart(e.target.checked);
                change();
              }}
            />
          </label>
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
                            : preferences.working_days.filter((d) => d !== day),
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
            <label>
              Start time
              <input
                type="time"
                value={time(hours.working_start_minute)}
                onChange={(e) => {
                  if (e.target.value) {
                    setHours({
                      ...hours,
                      working_start_minute: minutes(e.target.value),
                    });
                    change();
                  }
                }}
              />
            </label>
            <label>
              End time
              <input
                type="time"
                value={time(hours.working_end_minute)}
                onChange={(e) => {
                  if (e.target.value) {
                    setHours({
                      ...hours,
                      working_end_minute: minutes(e.target.value),
                    });
                    change();
                  }
                }}
              />
            </label>
          </div>
          <label className="toggle-row">
            <span>
              Movement reminders
              <small>A gentle workspace note after 45 minutes of focus.</small>
            </span>
            <input
              type="checkbox"
              checked={preferences.movement_reminders}
              onChange={(e) => {
                setPreferences({
                  ...preferences,
                  movement_reminders: e.target.checked,
                });
                change();
              }}
            />
          </label>
        </fieldset>
        <div className="settings-actions">
          <button
            disabled={busy || !desktop || !name.trim()}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save preferences"}
          </button>
          {saved && <span role="status">Saved</span>}
        </div>
        <label className="toggle-row">
          <span>Allow check-ins</span>
          <input
            type="checkbox"
            checked={!data.status.dnd}
            disabled={busy || !desktop}
            onChange={(e) => void run(() => api.dnd(!e.target.checked))}
          />
        </label>
        <label className="toggle-row">
          <span>Show companion on desktop</span>
          <input
            type="checkbox"
            checked={visible}
            disabled={busy || !desktop}
            onChange={(e) => void run(() => api.showBuddy(e.target.checked))}
          />
        </label>
        <label className="toggle-row">
          <span>Dark theme</span>
          <input
            type="checkbox"
            checked={settings.theme === "dark"}
            disabled={busy || !desktop}
            onChange={(e) =>
              void run(() => api.theme(e.target.checked ? "dark" : "light"))
            }
          />
        </label>
        <label className="toggle-row">
          <span>
            Optional activity tracking
            <small>
              Observe the selected goal's active app and window title. Goals and
              timers work with this off.
            </small>
          </span>
          <input
            type="checkbox"
            checked={data.status.tracking}
            disabled={busy || !desktop || (!data.goal && !data.status.tracking)}
            onChange={(e) => {
              const enabled = e.target.checked;
              if (
                enabled &&
                !settings.onboarding.tracking_consent &&
                !window.confirm(
                  "Enable local tracking of foreground apps, window/tab titles and active time for your selected goal? You can pause it here. Tracking alone sends nothing to AI services.",
                )
              )
                return;
              void run(() => api.tracking(enabled));
            }}
          />
        </label>
        {!data.goal && (
          <p className="helper">
            Start a goal's focus timer to select it for optional tracking.
          </p>
        )}
        <p className="helper" role="status">
          {data.status.tracking_error ||
            (data.status.tracking
              ? "Tracking on · active time is attributed to the selected goal."
              : "Tracking paused · no activity is collected.")}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      <CompanionSettings
        onChanged={onChanged}
        currentPreferences={data.buddy.companion?.preferences}
      />
      <details className="core-section">
        <summary>Companion appearance</summary>
        <AvatarPicker
          profile={{ ...settings.profile, avatar }}
          disabled={busy || !desktop}
          onChange={(profile) => {
            setAvatar(profile.avatar);
            change();
          }}
        />
        <button
          disabled={busy || !desktop || !name.trim()}
          onClick={() => void save()}
        >
          Save preferences
        </button>
      </details>
      <details className="core-section">
        <summary>AI and web connections</summary>
        <p className="helper">
          Typing goals needs no provider. Enable AI assistance once below; Ask
          Buddy then works directly.
        </p>
        <ProviderKey provider="nebius" label="Nebius" onChanged={onChanged} />
        <p className="connection">
          Nebius ·{" "}
          {data.status.nebius_configured ? "Key configured" : "Not configured"}
        </p>
        <ProviderKey provider="tavily" label="Tavily" onChanged={onChanged} />
        <p className="connection">
          Tavily ·{" "}
          {data.status.tavily_configured ? "Key configured" : "Not configured"}.
          Use Test saved connection to verify access.
        </p>
        <AiSettings onChanged={onChanged} />
        <label>
          Vision model (optional)
          <input
            maxLength={160}
            value={preferences.vision_model}
            placeholder="Your provider's vision model ID"
            disabled={busy || !desktop}
            onChange={(e) => {
              setPreferences({ ...preferences, vision_model: e.target.value });
              change();
            }}
          />
        </label>
        <p className="helper">
          Use an image-capable model for screenshots or scanned PDFs. Save
          preferences after editing.
        </p>
      </details>
      <details className="core-section">
        <summary>Privacy and local data</summary>
        <PrivacySettings
          preferences={data.buddy.preferences}
          retentionDays={data.retention_days}
          onChanged={onChanged}
          onHistoryCleared={onChanged}
        />
      </details>
      <details className="core-section">
        <summary>Send feedback</summary>
        <FeedbackCard />
      </details>
    </div>
  );
}
