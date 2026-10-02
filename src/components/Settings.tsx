import { useState } from "react";
import { api, desktop } from "../api/tauri";
import type { BuddyPreferences } from "../types";
import { PrivacySettings } from "./PrivacySettings";
import { TrackingSettings } from "./TrackingSettings";
import { FeedbackCard } from "./FeedbackCard";
import { ContactSettings } from "./ContactSettings";
import { defaultUserSettings, type UserSettings } from "../types";

export function Settings({
  onChanged,
  preferences,
  retentionDays,
  onHistoryCleared,
  aiEnabled = false,
  snoozedUntil = null,
  nebiusConfigured = false,
  tavilyConfigured = false,
  userSettings = defaultUserSettings,
  children,
  dnd,
}: {
  onChanged: () => Promise<void>;
  preferences: BuddyPreferences;
  retentionDays: number;
  onHistoryCleared: () => Promise<void>;
  aiEnabled?: boolean;
  snoozedUntil?: number | null;
  nebiusConfigured?: boolean;
  tavilyConfigured?: boolean;
  userSettings?: UserSettings;
  children?: React.ReactNode;
  dnd?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const snoozed = snoozedUntil !== null && snoozedUntil * 1000 > Date.now();
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const update = (patch: Partial<BuddyPreferences>) =>
    run(() => api.buddyPreferences({ ...preferences, ...patch }));
  return (
    <section className="card preferences" aria-label="Settings">
      <h2>Workspace preferences</h2>
      <p className="helper">
        Edit your name, role and companion from the profile menu at the bottom
        left.
      </p>
      <label className="toggle-row">
        <span>
          Dark theme
          <small>
            Appearance is shared by the workspace and desktop companion.
          </small>
        </span>
        <input
          type="checkbox"
          checked={userSettings.theme === "dark"}
          disabled={!desktop || busy}
          onChange={(event) =>
            void run(() => api.theme(event.target.checked ? "dark" : "light"))
          }
        />
      </label>
      {dnd !== undefined && (
        <label className="toggle-row">
          <span>
            Do not disturb<small>Keep tracking, pause the nudges.</small>
          </span>
          <input
            type="checkbox"
            checked={dnd}
            disabled={!desktop || busy}
            onChange={(e) => void run(() => api.dnd(e.target.checked))}
          />
        </label>
      )}
      {children}
      <TrackingSettings onChanged={onChanged} />
      <details className="settings-group">
        <summary>
          Notifications and suggestions
          <small>Check-ins, quiet time and your companion</small>
        </summary>
        <label className="toggle-row">
          <span>
            AI check-ins
            <small>
              Sends your goal, completion criterion, current step and recent
              window titles to Nebius. Provider charges may apply.
            </small>
          </span>
          <input
            type="checkbox"
            checked={aiEnabled}
            disabled={!desktop || busy}
            onChange={(e) => void run(() => api.ai(e.target.checked))}
          />
        </label>
        <button
          className="text-button"
          disabled={!desktop || busy}
          onClick={() => void run(() => api.snooze(!snoozed))}
        >
          {snoozed ? "Resume Buddy" : "Snooze Buddy for 1 hour"}
        </button>
        {snoozed && (
          <p role="status">
            Snoozed until{" "}
            {new Date(snoozedUntil! * 1000).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            .
          </p>
        )}
        <p className="helper">
          Snooze hides Buddy and pauses automatic check-ins and recommendations.
          Tracking is unchanged. Resuming does not turn off DND or resume paused
          tracking.
        </p>
        <label className="toggle-row">
          <span>
            Local distraction reminders
            <small>
              After 2 active minutes in a distraction app, or an unchanged
              context with no recent input. Working hours and media playback are
              respected. No AI or API key needed.
            </small>
          </span>
          <input
            type="checkbox"
            checked={preferences.local_nudges}
            disabled={!desktop || busy}
            onChange={(e) => void update({ local_nudges: e.target.checked })}
          />
        </label>
        <label htmlFor="nudge-interval">
          Minimum time between all Buddy cards
        </label>
        <select
          id="nudge-interval"
          value={preferences.nudge_interval_minutes}
          disabled={!desktop || busy}
          onChange={(e) =>
            void update({ nudge_interval_minutes: Number(e.target.value) })
          }
        >
          {[5, 15, 30, 60].map((n) => (
            <option key={n} value={n}>
              {n} minutes
            </option>
          ))}
        </select>
        <label htmlFor="daily-nudge-limit">Daily Buddy card limit</label>
        <select
          id="daily-nudge-limit"
          value={preferences.daily_nudge_limit}
          disabled={!desktop || busy}
          onChange={(e) =>
            void update({ daily_nudge_limit: Number(e.target.value) })
          }
        >
          {[0, 3, 5, 8, 10, 20, 50].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? "No cards" : `${n} cards`}
            </option>
          ))}
        </select>
        <p className="helper">
          Shared by local reminders, AI check-ins and resource recommendations,
          across all goals. Limits survive restarts and reset by local calendar
          day. Snooze, DND, meeting and fullscreen controls still apply. Manual
          focus checks remain available in the workspace.
        </p>
        <label className="toggle-row">
          <span>
            Show Buddy only with suggestions
            <small>
              When off, Buddy stays on your desktop during a session. Drag the
              character to move it.
            </small>
          </span>
          <input
            type="checkbox"
            checked={preferences.suggestions_only}
            disabled={!desktop || busy}
            onChange={(e) =>
              void update({ suggestions_only: e.target.checked })
            }
          />
        </label>
        <label className="toggle-row">
          <span>
            Proactive suggestions
            <small>
              Allows Nebius to receive your goal, completion criterion, current
              step and recent window titles to create a search query, then sends
              that query to Tavily. Provider charges may apply. Nebius also
              receives search result snippets to select a resource. Both query
              planning and selection use up to ten rated titles and ten recently
              offered titles for this goal. The current step takes priority;
              Buddy may skip a search or suggestion when nothing is useful.
              Disabled while paused or in DND.
            </small>
          </span>
          <input
            type="checkbox"
            checked={preferences.proactive}
            disabled={!desktop || busy}
            onChange={(e) => void update({ proactive: e.target.checked })}
          />
        </label>
        <p className="helper">
          Both provider keys are needed for suggestions. No automatic browser
          opening. Closing the workspace keeps Buddy running in the system tray.
          Choose Quit to stop it.
        </p>
        {error && <p role="alert">{error}</p>}
        <label htmlFor="suggestion-interval">Recommendation frequency</label>
        <select
          id="suggestion-interval"
          value={preferences.interval_minutes}
          disabled={!desktop || busy}
          onChange={(event) =>
            void update({ interval_minutes: Number(event.target.value) })
          }
        >
          {[5, 15, 30, 60].map((minutes) => (
            <option key={minutes} value={minutes}>
              At most every {minutes} minutes
            </option>
          ))}
        </select>
        <p className="helper">
          Minimum time between automatic resource-search attempts, including
          failed attempts. This does not change AI focus-check frequency or
          guarantee a recommendation.
        </p>
      </details>
      <details className="settings-group">
        <summary>
          Connected services<small>AI planning and web discovery</small>
        </summary>
        <p className="connection">
          AI planning · {nebiusConfigured ? "Connected" : "Not connected"}
        </p>
        <p className="connection">
          Web discovery · {tavilyConfigured ? "Connected" : "Not connected"}
        </p>
        <p className="helper">
          Provider credentials are protected by Windows. Bundled credentials are
          never included in an installer. A shared AI service needs a server
          connection.
        </p>
        <details className="inline-details">
          <summary>Advanced · developer connection setup</summary>
          <ContactSettings />
          <p className="helper">
            Use your own provider API keys. They are stored in Windows
            Credential Manager for your Windows account, not in the app
            database.
          </p>
          <p className="connection">
            Nebius {nebiusConfigured ? "configured" : "not configured"}
          </p>
          <ProviderKey provider="nebius" label="Nebius" onChanged={onChanged} />
          <p className="connection">
            Tavily {tavilyConfigured ? "configured" : "not configured"}
          </p>
          <ProviderKey provider="tavily" label="Tavily" onChanged={onChanged} />
          <p className="helper">
            Saving a key does not enable AI check-ins or send activity. Provider
            usage may incur charges. A configured key has not necessarily been
            verified.
          </p>
          <p className="helper">
            Saved keys override environment variables. Removing a saved key
            restores any environment fallback; it does not revoke the key at the
            provider. Requests already in progress may finish.
          </p>
        </details>
      </details>
      <details className="settings-group">
        <summary>
          Privacy and local data
          <small>AI context, exclusions and history retention</small>
        </summary>
        <PrivacySettings
          preferences={preferences}
          retentionDays={retentionDays}
          onChanged={onChanged}
          onHistoryCleared={onHistoryCleared}
        />
      </details>
      <FeedbackCard />
    </section>
  );
}

function ProviderKey({
  provider,
  label,
  onChanged,
}: {
  provider: "nebius" | "tavily";
  label: string;
  onChanged: () => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function update(value: string | null) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await api.providerKey(provider, value);
      setKey("");
      setMessage(
        value === null
          ? "Saved key removed. Any environment fallback still applies."
          : "Key saved securely. Ready to use.",
      );
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="provider-settings"
      onSubmit={(event) => {
        event.preventDefault();
        void update(key.trim());
      }}
    >
      <label htmlFor={`${provider}-key`}>{label} API key</label>
      <input
        id={`${provider}-key`}
        type="password"
        autoComplete="off"
        spellCheck={false}
        maxLength={2048}
        placeholder="Enter a new key to save or replace"
        value={key}
        disabled={!desktop || busy}
        onChange={(event) => setKey(event.target.value)}
      />
      <div className="settings-actions">
        <button
          type="button"
          disabled={!desktop || busy}
          onClick={() => {
            setBusy(true);
            setError("");
            setMessage("");
            void api
              .testConnection(provider)
              .then(setMessage)
              .catch((e) => setError(String(e)))
              .finally(() => setBusy(false));
          }}
        >
          Test saved connection
        </button>
        <button disabled={!desktop || busy || !key.trim()}>
          {busy ? "Working…" : "Save key"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={!desktop || busy}
          onClick={() => void update(null)}
        >
          Remove saved key
        </button>
      </div>
      <p className="helper">
        Tests the saved or environment key, not unsaved input. Sends only
        authentication to the configured provider, without goals, window titles,
        or search queries. It does not perform generation or search.
      </p>
      {message && (
        <p className="helper" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
