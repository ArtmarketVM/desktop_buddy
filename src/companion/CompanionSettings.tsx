import { useEffect, useState } from "react";
import { api, desktop } from "../api/tauri";
import {
  defaultCompanionPreferences,
  type CompanionPreferences,
} from "./types";

const time = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const minutes = (value: string) => {
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
  part: "desktop" | "nudges";
}) {
  const [preferences, setPreferences] = useState(defaultCompanionPreferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (currentPreferences) setPreferences(currentPreferences);
  }, [currentPreferences]);
  useEffect(() => {
    if (!desktop || currentPreferences) return;
    let active = true;
    void api
      .companionView()
      .then((view) => {
        if (active) setPreferences(view.preferences);
      })
      .catch(() => {
        if (active) setError("Could not load reminder settings. Try again.");
      });
    return () => {
      active = false;
    };
  }, [currentPreferences]);
  async function update(patch: Partial<CompanionPreferences>) {
    const next = { ...preferences, ...patch };
    // Older versions used equal endpoints to disable quiet hours.
    if (
      patch.quiet_hours_enabled &&
      (next.quiet_start_minute === next.quiet_end_minute ||
        next.quiet_start_minute >= 1440 ||
        next.quiet_end_minute >= 1440)
    ) {
      next.quiet_start_minute = defaultCompanionPreferences.quiet_start_minute;
      next.quiet_end_minute = defaultCompanionPreferences.quiet_end_minute;
    }
    setBusy(true);
    setError("");
    try {
      await api.companionPreferences(next);
      setPreferences(next);
      await onChanged();
    } catch {
      setError("Could not save reminder settings. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const toggle = (key: keyof CompanionPreferences, label: string) => (
    <label className="toggle-row" key={key}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={Boolean(preferences[key])}
        disabled={!desktop || busy}
        onChange={(event) => void update({ [key]: event.target.checked })}
      />
    </label>
  );
  return part === "desktop" ? (
    <>
      {toggle("hide_fullscreen", "Hide sumi in full-screen apps")}
      {error && <p role="alert">{error}</p>}
    </>
  ) : (
    <>
      {toggle(
        "deadline_reminders",
        "Remind me before, at, and after deadlines",
      )}
      {toggle("daily_checkins", "Daily planning and end-of-day summary")}
      <label className="setting-row">
        <span>Daily summary time</span>
        <input
          type="time"
          value={time(preferences.summary_minute ?? 1080)}
          disabled={!desktop || busy || !preferences.daily_checkins}
          onChange={(event) => {
            if (event.target.value)
              void update({ summary_minute: minutes(event.target.value) });
          }}
        />
      </label>
      {toggle("quiet_hours_enabled", "Use quiet hours")}
      <div className="setting-row" role="group" aria-label="Quiet hours">
        <span>Quiet hours</span>
        <span className="quiet-hours">
          <input
            type="time"
            aria-label="Quiet hours start"
            value={time(preferences.quiet_start_minute)}
            disabled={!desktop || busy || !preferences.quiet_hours_enabled}
            onChange={(event) => {
              if (event.target.value)
                void update({
                  quiet_start_minute: minutes(event.target.value),
                });
            }}
          />
          <span className="quiet-hours-to">to</span>
          <input
            type="time"
            aria-label="Quiet hours end"
            value={time(preferences.quiet_end_minute)}
            disabled={!desktop || busy || !preferences.quiet_hours_enabled}
            onChange={(event) => {
              if (event.target.value)
                void update({ quiet_end_minute: minutes(event.target.value) });
            }}
          />
        </span>
      </div>
      <div className="setting-row">
        <span>Quiet days</span>
        <span className="day-chips" role="group" aria-label="Quiet days">
          {[
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ].map((label, day) => {
            const selected = (preferences.quiet_days ?? []).includes(day);
            return (
              <button
                type="button"
                key={day}
                className="day-chip"
                aria-label={label}
                aria-pressed={selected}
                disabled={!desktop || busy}
                onClick={() =>
                  void update({
                    quiet_days: selected
                      ? (preferences.quiet_days ?? []).filter((d) => d !== day)
                      : [...(preferences.quiet_days ?? []), day].sort(),
                  })
                }
              >
                {label.slice(0, 2)}
              </button>
            );
          })}
        </span>
      </div>
      <p className="muted">
        Selected days stay quiet all day. Quiet hours apply every day, including
        overnight. During either, sumi rests with no bubbles, including deadline
        reminders and summaries. Tracking continues.
      </p>
      {toggle(
        "screen_task_detection",
        "Suggest completed and unlisted work from what is on screen",
      )}
      <p className="muted">
        Plan Today appears when you first open sumi each day, including after
        your computer starts. Your daily summary appears at the time you choose.
        Other suggestions follow your activity. Quiet mode and your quiet
        schedule always take priority.
      </p>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
