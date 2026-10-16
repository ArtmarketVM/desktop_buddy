import { selectionShortcut } from "../api/platform";
import { useEffect, useState } from "react";
import { api, desktop } from "../api/tauri";
import {
  defaultCompanionPreferences,
  type CompanionPreferences,
} from "./types";
const time = (minute: number) =>
  `${Math.floor(minute / 60)
    .toString()
    .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
const minute = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
export function CompanionSettings({
  onChanged,
  currentPreferences,
}: {
  onChanged: () => Promise<void>;
  currentPreferences?: CompanionPreferences;
}) {
  const [preferences, setPreferences] = useState(defaultCompanionPreferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (currentPreferences) setPreferences(currentPreferences);
  }, [currentPreferences]);
  useEffect(() => {
    if (desktop)
      void api
        .companionView()
        .then((view) => setPreferences(view.preferences))
        .catch((e) => setError(String(e)));
  }, []);
  async function update(patch: Partial<CompanionPreferences>) {
    const next = { ...preferences, ...patch };
    setBusy(true);
    setError("");
    try {
      await api.companionPreferences(next);
      setPreferences(next);
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="settings-group companion-settings">
      <summary>Desktop companion</summary>
      {(
        [
          [
            "daily_checkins",
            "Daily check-ins",
            "Morning plan, midday review, evening wrap-up.",
          ],
          [
            "screen_task_detection",
            "Detect completed work",
            "Sends a small text sample to Nebius; you confirm every change.",
          ],
          [
            "hide_fullscreen",
            "Hide in full-screen apps",
            "Comes back when full-screen ends.",
          ],
          [
            "movement_reminder",
            "Stretch invitation",
            "At most once a day after two hours.",
          ],
        ] as [keyof CompanionPreferences, string, string][]
      ).map(([key, label, description]) => (
        <label className="toggle-row" key={key}>
          <span>
            {label}
            <small>{description}</small>
          </span>
          <input
            type="checkbox"
            checked={Boolean(preferences[key])}
            disabled={!desktop || busy}
            onChange={(event) => void update({ [key]: event.target.checked })}
          />
        </label>
      ))}
      <div className="companion-settings-grid">
        <label>
          Start delay
          <select
            value={preferences.morning_delay_minutes}
            disabled={!desktop || busy}
            onChange={(e) =>
              void update({ morning_delay_minutes: Number(e.target.value) })
            }
          >
            {[5, 10, 15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum pause between prompts
          <select
            value={preferences.cooldown_minutes}
            disabled={!desktop || busy}
            onChange={(e) =>
              void update({ cooldown_minutes: Number(e.target.value) })
            }
          >
            {[60, 90, 120, 180, 240].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </label>
        <label>
          Quiet hours start
          <input
            type="time"
            value={time(preferences.quiet_start_minute)}
            disabled={!desktop || busy}
            onChange={(e) => {
              if (e.target.value)
                void update({ quiet_start_minute: minute(e.target.value) });
            }}
          />
        </label>
        <label>
          Quiet hours end
          <input
            type="time"
            value={time(preferences.quiet_end_minute)}
            disabled={!desktop || busy}
            onChange={(e) => {
              if (e.target.value)
                void update({ quiet_end_minute: minute(e.target.value) });
            }}
          />
        </label>
      </div>
      <p className="helper">
        Select text anywhere and press {selectionShortcut} to send it to sumi.
      </p>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
