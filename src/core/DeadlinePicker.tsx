import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TimeInput } from "../components/TimeInput";
export { parseClockTime as parseTime } from "../components/TimeInput";
import { CalendarPopover } from "./CalendarPopover";
import { useDismissiblePopover } from "../components/useDismissiblePopover";

/** Local "YYYY-MM-DDTHH:MM" strings, the same shape the editor already saves. */
const pad = (n: number) => String(n).padStart(2, "0");
function localValue(date: Date, withTime: boolean): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return withTime
    ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    : `${day}T23:59`;
}
function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

export function DeadlinePanel({
  value,
  onChange,
  onDone,
  extra,
}: {
  value: string;
  onChange: (value: string) => void;
  onDone?: () => void;
  /** Optional rows under the time field, e.g. an estimated-time input. */
  extra?: ReactNode;
}) {
  const selected = value ? new Date(value) : null;
  const valid = selected && !Number.isNaN(selected.getTime()) ? selected : null;
  const withTime =
    !!valid && !(valid.getHours() === 23 && valid.getMinutes() === 59);
  const [view, setView] = useState(() => {
    const base = valid ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  function pickDay(day: Date) {
    const next = new Date(day);
    if (valid && withTime)
      next.setHours(valid.getHours(), valid.getMinutes(), 0, 0);
    onChange(localValue(next, !!valid && withTime));
  }
  function commitTime(text: string) {
    const next = new Date(valid ?? new Date());
    if (text) {
      const [hours, minutes] = text.split(":").map(Number);
      next.setHours(hours, minutes, 0, 0);
    }
    onChange(localValue(next, !!text));
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
    <div className="deadline-panel">
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
        <TimeInput
          aria-label="Deadline time"
          value={valid && withTime ? formatTime(valid) : ""}
          onCommit={commitTime}
          allowEmpty
        />
      </label>
      {extra}
      <div className="deadline-actions">
        {valid && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onChange("");
            }}
          >
            Clear
          </button>
        )}
        {onDone && (
          <button type="button" className="text-button" onClick={onDone}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}

export function DeadlinePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { open, setOpen, rootRef, surfaceRef, triggerRef, id } =
    useDismissiblePopover({ dismissOnViewportChange: false });
  const selected = value ? new Date(value) : null;
  const valid = selected && !Number.isNaN(selected.getTime()) ? selected : null;
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
        <CalendarPopover
          id={id}
          label="Deadline"
          triggerRef={triggerRef}
          surfaceRef={surfaceRef}
          onClose={() => setOpen(false)}
          width={272}
        >
          <DeadlinePanel
            value={value}
            onChange={onChange}
            onDone={() => {
              setOpen(false);
              triggerRef.current?.focus({ preventScroll: true });
            }}
          />
        </CalendarPopover>
      )}
    </div>
  );
}
