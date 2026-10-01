import { useEffect, useState } from "react";
import { api, desktop } from "../api/tauri";
import {
  defaultTrackingSettings,
  type TrackingSettings as Preferences,
} from "../types";

export function formatTime(minute: number): string {
  return `${Math.floor(minute / 60)
    .toString()
    .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
}
export function parseTime(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function TrackingSettings({
  onChanged,
}: {
  onChanged: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<Preferences>(
    defaultTrackingSettings,
  );
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    if (desktop)
      api
        .trackingSettings()
        .then((value) => {
          if (active) {
            setSettings(value);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, []);
  const patch = (value: Partial<Preferences>) => {
    setMessage("");
    setSettings((s) => ({ ...s, ...value }));
  };
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.saveTrackingSettings(settings);
      await onChanged();
      setMessage("Tracking settings saved.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const disabled = !desktop || !loaded || busy;
  return (
    <details className="inline-details">
      <summary>Tracking and working hours</summary>
      <p className="helper">
        Tracking may continue outside these local working hours. Automatic
        productivity cards and check-ins stay quiet.
      </p>
      <label htmlFor="working-start">Working hours start</label>
      <input
        id="working-start"
        type="time"
        value={formatTime(settings.working_start_minute)}
        disabled={disabled}
        onChange={(e) => {
          const minute = parseTime(e.target.value);
          if (minute !== null) patch({ working_start_minute: minute });
        }}
      />
      <label htmlFor="working-end">Working hours end</label>
      <input
        id="working-end"
        type="time"
        value={formatTime(settings.working_end_minute)}
        disabled={disabled}
        onChange={(e) => {
          const minute = parseTime(e.target.value);
          if (minute !== null) patch({ working_end_minute: minute });
        }}
      />
      <label htmlFor="idle-threshold">
        Pause after no keyboard or mouse input
      </label>
      <select
        id="idle-threshold"
        value={settings.idle_seconds}
        disabled={disabled}
        onChange={(e) => patch({ idle_seconds: Number(e.target.value) })}
      >
        {[...new Set([300, 600, 900, settings.idle_seconds])]
          .sort((a, b) => a - b)
          .map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds / 60} minutes
            </option>
          ))}
      </select>
      <label className="toggle-row">
        <span>
          Browser domain metadata
          <small>
            Read the active browser address bar when available. Store only
            domain and tab title; no page content or full URLs.
          </small>
        </span>
        <input
          type="checkbox"
          checked={settings.browser_metadata}
          disabled={disabled}
          onChange={(e) => patch({ browser_metadata: e.target.checked })}
        />
      </label>
      <p className="helper">
        Drifting means an unchanged context for{" "}
        {settings.drifting_context_seconds / 60} minutes with no input for{" "}
        {settings.drifting_no_input_seconds / 60} minutes. It is an observable
        signal, not proof of distraction. Confirmed media playback suppresses
        cards.
      </p>
      <button
        className="secondary"
        disabled={disabled}
        onClick={() => void save()}
      >
        Save tracking settings
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
