import { useState } from "react";
import { api, desktop } from "../api/tauri";
import type { BuddyPreferences } from "../types";
import { PrivacySettings } from "./PrivacySettings";

export function Settings({
  onChanged,
  preferences,
  retentionDays,
  onHistoryCleared,
}: {
  onChanged: () => Promise<void>;
  preferences: BuddyPreferences;
  retentionDays: number;
  onHistoryCleared: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function update(patch: Partial<BuddyPreferences>) {
    setBusy(true);
    setError("");
    try {
      await api.buddyPreferences({ ...preferences, ...patch });
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card preferences" aria-label="Settings">
      <h2>Settings</h2>
      <label className="toggle-row">
        <span>
          Local distraction reminders
          <small>
            After 2 active minutes in the same window of an app you marked as a
            distraction for this goal. No AI or API key needed.
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
          onChange={(e) => void update({ suggestions_only: e.target.checked })}
        />
      </label>
      <label className="toggle-row">
        <span>
          Proactive suggestions
          <small>
            Allows Nebius to receive your goal, completion criterion, current
            step and recent window titles to create a search query, then sends
            that query to Tavily. Provider charges may apply. Nebius also
            receives search result snippets and your ratings for this goal to
            select a resource. Disabled while paused or in DND.
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
      <p className="helper">
        Use your own provider API keys. They are stored in Windows Credential
        Manager for your Windows account, not in the app database.
      </p>
      <ProviderKey provider="nebius" label="Nebius" onChanged={onChanged} />
      <ProviderKey provider="tavily" label="Tavily" onChanged={onChanged} />
      <PrivacySettings
        preferences={preferences}
        retentionDays={retentionDays}
        onChanged={onChanged}
        onHistoryCleared={onHistoryCleared}
      />
      <p className="helper">
        Saving a key does not enable AI check-ins or send activity. Provider
        usage may incur charges. A configured key has not necessarily been
        verified.
      </p>
      <p className="helper">
        Saved keys override environment variables. Removing a saved key restores
        any environment fallback; it does not revoke the key at the provider.
        Requests already in progress may finish.
      </p>
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
