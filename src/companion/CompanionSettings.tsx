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
  part,
}: {
  onChanged: () => Promise<void>;
  currentPreferences?: CompanionPreferences;
  /** "desktop" renders the full-screen toggle; "nudges" the check-ins, timing and quiet hours. */
  part: "desktop" | "nudges";
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
  const off = !desktop || busy;
  const toggle = (key: keyof CompanionPreferences, label: string) => (
    <label className="toggle-row" key={key}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={Boolean(preferences[key])}
        disabled={off}
        onChange={(event) => void update({ [key]: event.target.checked })}
      />
    </label>
  );
  if (part === "desktop")
    return (
      <>
        {toggle("hide_fullscreen", "Hide sumi in full-screen apps")}
        {error && <p role="alert">{error}</p>}
      </>
    );
  return (
    <>
      {toggle(
        "daily_checkins",
        "Daily check-ins: morning plan, midday review, evening wrap-up",
      )}
      {toggle(
        "screen_task_detection",
        "Suggest completed work from what is on screen",
      )}
      <label className="setting-row">
        <span>Wait after sign-in</span>
        <select
          value={preferences.morning_delay_minutes}
          disabled={off}
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
      <label className="setting-row">
        <span>Pause between prompts</span>
        <select
          value={preferences.cooldown_minutes}
          disabled={off}
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
      <div className="setting-row" role="group" aria-label="Quiet hours">
        <span>Quiet hours</span>
        <span className="quiet-hours">
          <input
            type="time"
            aria-label="Quiet hours start"
            value={time(preferences.quiet_start_minute)}
            disabled={off}
            onChange={(e) => {
              if (e.target.value)
                void update({ quiet_start_minute: minute(e.target.value) });
            }}
          />
          <span className="quiet-hours-to">to</span>
          <input
            type="time"
            aria-label="Quiet hours end"
            value={time(preferences.quiet_end_minute)}
            disabled={off}
            onChange={(e) => {
              if (e.target.value)
                void update({ quiet_end_minute: minute(e.target.value) });
            }}
          />
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
