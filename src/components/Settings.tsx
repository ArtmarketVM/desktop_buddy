import { useState } from "react";
import { api, desktop } from "../api/tauri";
import type { BuddyPreferences } from "../types";

export function Settings({
  onChanged,
  preferences,
}: {
  onChanged: () => Promise<void>;
  preferences: BuddyPreferences;
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
            Allows Nebius to receive your goal and recent window titles to
            create a search query, then sends that query to Tavily. Provider
            charges may apply. At most once every 15 minutes; disabled while
            paused or in DND.
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
        opening. Minimize the workspace to keep Buddy running; closing it exits
        the app.
      </p>
      {error && <p role="alert">{error}</p>}
      <p className="helper">
        Use your own provider API keys. They are stored in Windows Credential
        Manager for your Windows account, not in the app database.
      </p>
      <ProviderKey provider="nebius" label="Nebius" onChanged={onChanged} />
      <ProviderKey provider="tavily" label="Tavily" onChanged={onChanged} />
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
