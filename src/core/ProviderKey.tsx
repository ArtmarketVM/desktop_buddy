import { useState } from "react";
import { api, desktop } from "../api/tauri";

export function ProviderKey({
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
