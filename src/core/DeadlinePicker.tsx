import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDismissiblePopover } from "../components/useDismissiblePopover";

/** Local "YYYY-MM-DDTHH:MM" strings, the same shape the editor already saves. */
const pad = (n: number) => String(n).padStart(2, "0");
export function localValue(date: Date, withTime: boolean): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return withTime
    ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    : `${day}T23:59`;
}
/** Accepts "13:00", "1pm", "1:30 pm", "9.15"; returns [hours, minutes] or null. */
export function parseTime(text: string): [number, number] | null {
  const m = /^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a|p)?\s*$/i.exec(text);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const suffix = m[3]?.toLowerCase();
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (suffix.startsWith("p") ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) return null;
  return [hours, minutes];
}
export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
export function formatDeadline(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const allDay = date.getHours() === 23 && date.getMinutes() === 59;
  return allDay ? day : `${day} · ${formatTime(date)}`;
}

export function DeadlinePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { open, setOpen, rootRef, surfaceRef, triggerRef, id } =
    useDismissiblePopover();
  const selected = value ? new Date(value) : null;
  const valid = selected && !Number.isNaN(selected.getTime()) ? selected : null;
  const withTime =
    !!valid && !(valid.getHours() === 23 && valid.getMinutes() === 59);
  const [view, setView] = useState(() => {
    const base = valid ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const [timeText, setTimeText] = useState(
    valid && withTime ? formatTime(valid) : "",
  );
  const [timeError, setTimeError] = useState(false);
  const timeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const base = valid ?? new Date();
    setView({ year: base.getFullYear(), month: base.getMonth() });
    setTimeText(valid && withTime ? formatTime(valid) : "");
    setTimeError(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickDay(day: Date) {
    const next = new Date(day);
    if (valid && withTime)
      next.setHours(valid.getHours(), valid.getMinutes(), 0, 0);
    onChange(localValue(next, !!valid && withTime));
  }
  function commitTime() {
    const text = timeText.trim();
    const base = valid ?? new Date();
    if (!text) {
      setTimeError(false);
      onChange(localValue(base, false));
      return;
    }
    const parsed = parseTime(text);
    if (!parsed) return setTimeError(true);
    setTimeError(false);
    const next = new Date(base);
    next.setHours(parsed[0], parsed[1], 0, 0);
    onChange(localValue(next, true));
    setTimeText(formatTime(next));
  }
  const first = new Date(view.year, view.month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const days: Date[] = [];
  for (let i = -offset; i < 42 - offset; i++)
    days.push(new Date(view.year, view.month, 1 + i));
  const today = new Date();
  const same = (a: Date, b: Date | null) =>
    !!b && a.toDateString() === b.toDateString();
  return (
    <div className="deadline-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="deadline-trigger"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        {valid ? formatDeadline(value) : "No deadline"}
      </button>
      {open && (
        <div
          className="period-popover deadline-popover"
          id={id}
          ref={surfaceRef}
          role="dialog"
          aria-label="Deadline"
        >
          <div className="period-head">
            <strong>
              {first.toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              })}
            </strong>
            <span>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const now = new Date();
                  setView({ year: now.getFullYear(), month: now.getMonth() });
                  onChange(localValue(now, true));
                  setTimeText(formatTime(now));
                }}
              >
                Now
              </button>
              <button
                type="button"
                className="text-button"
                aria-label="Previous month"
                onClick={() =>
                  setView(({ year, month }) =>
                    month
                      ? { year, month: month - 1 }
                      : { year: year - 1, month: 11 },
                  )
                }
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="text-button"
                aria-label="Next month"
                onClick={() =>
                  setView(({ year, month }) =>
                    month === 11
                      ? { year: year + 1, month: 0 }
                      : { year, month: month + 1 },
                  )
                }
              >
                <ChevronRight size={15} />
              </button>
            </span>
          </div>
          <div className="period-grid">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <small key={d}>{d}</small>
            ))}
            {days.map((day) => (
              <button
                type="button"
                key={day.toISOString()}
                className={`deadline-day ${day.getMonth() !== view.month ? "outside" : ""} ${same(day, today) ? "today" : ""} ${same(day, valid) ? "selected" : ""}`}
                aria-pressed={same(day, valid)}
                aria-label={day.toDateString()}
                onClick={() => pickDay(day)}
              >
                {day.getDate()}
              </button>
            ))}
          </div>
          <label className="deadline-time">
            <span>Time</span>
            <input
              ref={timeInput}
              type="text"
              inputMode="numeric"
              placeholder="e.g. 13:00 or 1 pm"
              aria-label="Deadline time"
              aria-invalid={timeError || undefined}
              value={timeText}
              onChange={(event) => setTimeText(event.target.value)}
              onBlur={commitTime}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTime();
                }
              }}
            />
          </label>
          {timeError && (
            <p className="error deadline-error">
              Use a time like 13:00 or 1:30 pm.
            </p>
          )}
          <div className="deadline-actions">
            {valid && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  onChange("");
                  setTimeText("");
                }}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
