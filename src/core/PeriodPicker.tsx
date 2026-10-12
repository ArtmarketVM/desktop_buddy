import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProgressPeriod } from "./types";

const pad = (value: number) => String(value).padStart(2, "0");
const iso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parse = (value: string) => new Date(`${value}T12:00:00`);
export const endOfMonth = (year: number, month: number) =>
  iso(new Date(year, month + 1, 0, 12));
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The label of the current period; clicking it opens a small calendar, like a date field. */
export function PeriodPicker({
  period,
  newest,
  today,
  label,
  disabled,
  onPick,
}: {
  period: ProgressPeriod;
  newest: string;
  today: string;
  label: string;
  disabled: boolean;
  /** Receives the last day of the chosen period, or null for the current one. */
  onPick: (anchor: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => parse(newest));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const pick = (anchor: string) => {
    onPick(anchor >= today ? null : anchor);
    setOpen(false);
  };
  const year = view.getFullYear();
  const month = view.getMonth();
  const current = parse(newest);
  const todayYear = parse(today).getFullYear();
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const length = new Date(year, month + 1, 0).getDate();
  const weekStart = iso(new Date(current.getTime() - 6 * 86400000));
  return (
    <div className="period-picker" ref={box}>
      <button
        type="button"
        className="text-button period-label"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setView(parse(newest));
          setOpen(!open);
        }}
      >
        {label}
      </button>
      {open && (
        <div
          className="period-popover"
          role="dialog"
          aria-label="Choose period"
        >
          {(period === "day" || period === "week") && (
            <>
              <div className="period-head">
                <button
                  type="button"
                  className="text-button"
                  aria-label="Previous month"
                  onClick={() => setView(new Date(year, month - 1, 1, 12))}
                >
                  <ChevronLeft size={16} />
                </button>
                <strong>
                  {first.toLocaleDateString("en", {
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                <button
                  type="button"
                  className="text-button"
                  aria-label="Next month"
                  disabled={iso(new Date(year, month + 1, 1, 12)) > today}
                  onClick={() => setView(new Date(year, month + 1, 1, 12))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="period-grid">
                {weekdays.map((name) => (
                  <small key={name}>{name}</small>
                ))}
                {Array.from({ length: offset }, (_, index) => (
                  <span key={`blank-${index}`} />
                ))}
                {Array.from({ length }, (_, index) => {
                  const value = iso(new Date(year, month, index + 1, 12));
                  const selected =
                    period === "day"
                      ? value === newest
                      : value >= weekStart && value <= newest;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`period-cell ${selected ? "selected" : ""} ${value === today ? "today" : ""}`}
                      disabled={value > today}
                      onClick={() => {
                        if (period === "day") return pick(value);
                        const day = parse(value);
                        const toSunday =
                          (7 - (((day.getDay() + 6) % 7) + 1)) % 7;
                        pick(
                          iso(new Date(day.getTime() + toSunday * 86400000)),
                        );
                      }}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {period === "month" && (
            <>
              <div className="period-head">
                <button
                  type="button"
                  className="text-button"
                  aria-label="Previous year"
                  onClick={() => setView(new Date(year - 1, month, 1, 12))}
                >
                  <ChevronLeft size={16} />
                </button>
                <strong>{year}</strong>
                <button
                  type="button"
                  className="text-button"
                  aria-label="Next year"
                  disabled={year >= todayYear}
                  onClick={() => setView(new Date(year + 1, month, 1, 12))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="period-months">
                {Array.from({ length: 12 }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`period-cell ${current.getFullYear() === year && current.getMonth() === index ? "selected" : ""}`}
                    disabled={iso(new Date(year, index, 1, 12)) > today}
                    onClick={() => pick(endOfMonth(year, index))}
                  >
                    {new Date(year, index, 1).toLocaleDateString("en", {
                      month: "short",
                    })}
                  </button>
                ))}
              </div>
            </>
          )}
          {period === "year" && (
            <div className="period-months">
              {Array.from({ length: 9 }, (_, index) => {
                const value = todayYear - 8 + index;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`period-cell ${current.getFullYear() === value ? "selected" : ""}`}
                    onClick={() => pick(`${value}-12-31`)}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
