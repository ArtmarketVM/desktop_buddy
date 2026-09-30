import { useEffect, useState } from "react";
import { api, desktop } from "../api/tauri";
import type { BuddyPreferences } from "../types";

export function PrivacySettings({
  preferences,
  retentionDays,
  onChanged,
  onHistoryCleared,
}: {
  preferences: BuddyPreferences;
  retentionDays: number;
  onChanged: () => Promise<void>;
  onHistoryCleared: () => Promise<void>;
}) {
  const [apps, setApps] = useState(preferences.excluded_apps.join(", "));
  const [days, setDays] = useState(retentionDays);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRetention, setConfirmRetention] = useState(false);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setDays(retentionDays), [retentionDays]);
  useEffect(
    () => setApps(preferences.excluded_apps.join(", ")),
    [preferences.excluded_apps.join(",")],
  );
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="privacy-settings" aria-label="Privacy and local data">
      <h3>Privacy and local data</h3>
      <p>
        No screenshots, keystrokes, or page contents are collected. Window
        titles and goals can still contain sensitive information. Activity
        history is local and is not encrypted.
      </p>
      <ul>
        <li>
          Goal context includes the saved completion criterion and current
          unfinished step. Refine with AI separately sends the saved goal and
          full checklist, without activity history, only when you request it.
        </li>
        <li>
          AI check-ins: Nebius receives the goal and up to 10 activity segments
          (app, title, active and idle seconds).
        </li>
        <li>
          Proactive suggestions: Nebius receives the goal and up to 5 window
          titles to plan a query. Tavily receives the query. Nebius then
          receives up to 5 result titles, URLs and snippets to select a
          resource. Both stages use up to 10 rated titles and 10 recently
          offered titles for the current goal. These titles and ratings appear
          in the local preview; they are not sent directly to Tavily.
        </li>
        <li>Manual search: Tavily receives only the query you submit.</li>
        <li>
          API keys are sent only as authentication to the configured provider
          endpoint. Provider-side retention is controlled by that provider;
          deleting local history does not delete remote records.
        </li>
      </ul>
      <button
        type="button"
        disabled={!desktop || busy}
        onClick={() =>
          void run(async () => {
            setPreview(JSON.stringify(await api.privacyPreview(), null, 2));
          })
        }
      >
        Preview AI context locally
      </button>
      {preview && (
        <details open>
          <summary>Local snapshot — nothing was sent</summary>
          <pre className="privacy-preview">{preview}</pre>
          <button
            type="button"
            className="text-button"
            onClick={() => setPreview("")}
          >
            Hide preview
          </button>
        </details>
      )}
      <form
        className="provider-settings"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api.buddyPreferences({
              ...preferences,
              excluded_apps: apps
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            });
            setPreview("");
            setMessage("Application exclusions saved.");
          });
        }}
      >
        <label htmlFor="excluded-apps">
          Excluded applications (process names, comma-separated)
        </label>
        <input
          id="excluded-apps"
          value={apps}
          maxLength={5000}
          placeholder="chrome.exe, passwordmanager.exe"
          disabled={!desktop || busy}
          onChange={(e) => setApps(e.target.value)}
        />
        <p className="helper">
          Excluded apps are not recorded going forward and their existing
          segments are filtered from future AI context. This does not erase past
          records or cancel requests already sent. Goals and unrelated app
          titles are not automatically redacted.
        </p>
        <button disabled={!desktop || busy}>Save exclusions</button>
      </form>
      <label htmlFor="retention-days">Keep local history</label>
      <select
        id="retention-days"
        value={days}
        disabled={!desktop || busy}
        onChange={(e) => {
          setDays(Number(e.target.value));
          setConfirmRetention(false);
        }}
      >
        <option value={0}>Until I delete it</option>
        <option value={7}>7 days</option>
        <option value={30}>30 days</option>
        <option value={90}>90 days</option>
      </select>
      <p className="helper">
        Applies to activity, daily app time, focus decisions, recommendations
        and ratings. The active and deferred goals and their plans, settings and
        keys are retained. Old records are removed when you save, on startup,
        and hourly while the app is running. This is logical deletion, not a
        forensic secure erase.
      </p>
      {days > 0 && (
        <label className="toggle-row">
          <span>
            I understand that saving permanently removes history older than{" "}
            {days} days.
          </span>
          <input
            type="checkbox"
            checked={confirmRetention}
            onChange={(e) => setConfirmRetention(e.target.checked)}
            disabled={busy}
          />
        </label>
      )}
      <button
        type="button"
        disabled={!desktop || busy || (days > 0 && !confirmRetention)}
        onClick={() =>
          void run(async () => {
            await api.retention(days);
            setPreview("");
            setConfirmRetention(false);
            setMessage("Retention setting saved.");
          })
        }
      >
        Save retention
      </button>
      <div className="danger-zone">
        <h4>Clear local history</h4>
        <p>
          This permanently removes activity, daily app time, decisions,
          recommendations, ratings and completed or deferred goals with their
          plans. Tracking stops. Your active goal and plan, settings and API
          keys stay saved. Active-goal app rules and the daily card limit
          counter are also preserved.
        </p>
        <label className="toggle-row">
          <span>I understand this cannot be undone.</span>
          <input
            type="checkbox"
            checked={confirmClear}
            onChange={(e) => setConfirmClear(e.target.checked)}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          disabled={!desktop || busy || !confirmClear}
          onClick={() =>
            void run(async () => {
              await api.clearHistory();
              setPreview("");
              setConfirmClear(false);
              await onHistoryCleared();
              setMessage("Local history cleared. Tracking is paused.");
            })
          }
        >
          Permanently clear local history
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
