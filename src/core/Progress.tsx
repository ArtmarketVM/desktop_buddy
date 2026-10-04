import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import {
  dateLabel,
  duration,
  shiftDate,
  type CoreSnapshot,
  type DayProgress,
} from "./types";
export function DaySummary({
  day,
  unfinished = 0,
}: {
  day: DayProgress;
  unfinished?: number;
}) {
  const seconds = day.goals.reduce((sum, goal) => sum + goal.seconds, 0);
  const areas = Object.entries(
    day.goals.reduce<Record<string, number>>((times, goal) => {
      times[goal.area] = (times[goal.area] ?? 0) + goal.seconds;
      return times;
    }, {}),
  );
  return (
    <section className="day-summary" aria-label="Day summary">
      <div className="summary-mark">
        <Check size={18} />
      </div>
      <div>
        <h2>Here's what moved forward today</h2>
        <p>
          {day.completed.length
            ? `You wrapped up ${day.completed.length} ${day.completed.length === 1 ? "thing" : "things"}.`
            : seconds
              ? "You made a little space for focused work."
              : "A quieter day counts, too."}
          {seconds > 0 ? ` ${duration(seconds)} of focused time.` : ""}
        </p>
        {day.completed.length > 0 && (
          <ul>
            {day.completed.map((item, i) => (
              <li key={`${i}-${item}`}>{item}</li>
            ))}
          </ul>
        )}
        {areas.length > 0 && (
          <div className="summary-areas">
            {areas.map(([area, time]) => (
              <span key={area}>
                {area} · {duration(time)}
              </span>
            ))}
          </div>
        )}
        {unfinished > 0 && (
          <p className="helper">Pick up the rest tomorrow if you want.</p>
        )}
      </div>
    </section>
  );
}
export function Progress({
  snapshot,
  anchor,
  onWeek,
  busy,
}: {
  snapshot: CoreSnapshot;
  anchor: string | null;
  onWeek: (anchor: string | null) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const day =
    snapshot.week.find((day) => day.day === selected) ??
    snapshot.week[0] ??
    snapshot.summary;
  const newest = anchor ?? snapshot.date;
  return (
    <section
      className="core-section progress-history"
      aria-label="Progress history"
    >
      <div className="section-heading progress-toolbar">
        <p className="progress-range">
          {dateLabel(
            snapshot.week[snapshot.week.length - 1]?.day ?? snapshot.date,
          )}
          {" – "}
          {dateLabel(newest)}
        </p>
        <div
          className="week-navigation"
          role="group"
          aria-label="Week navigation"
        >
          <button
            className="text-button"
            aria-label="Previous week"
            disabled={busy}
            onClick={() => {
              setSelected(null);
              onWeek(shiftDate(newest, -7));
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="text-button"
            disabled={busy || !anchor}
            onClick={() => {
              setSelected(null);
              onWeek(null);
            }}
          >
            This week
          </button>
          <button
            className="text-button"
            aria-label="Next week"
            disabled={busy || newest >= snapshot.date}
            onClick={() => {
              setSelected(null);
              const next = shiftDate(newest, 7);
              onWeek(next >= snapshot.date ? null : next);
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="week-strip">
        {[...snapshot.week].reverse().map((item) => (
          <button
            key={item.day}
            className={item.day === day.day ? "selected" : ""}
            aria-pressed={item.day === day.day}
            onClick={() => setSelected(item.day)}
          >
            <span>{dateLabel(item.day)}</span>
            <strong>
              {duration(item.goals.reduce((sum, g) => sum + g.seconds, 0))}
            </strong>
            <small>{item.completed.length} completed</small>
          </button>
        ))}
      </div>
      <h3 className="progress-date">{dateLabel(day.day)}</h3>
      {day.day === snapshot.date ? (
        <DaySummary day={day} />
      ) : (
        <div className="past-summary">
          <h3>
            {day.completed.length
              ? `You wrapped up ${day.completed.length} things.`
              : "Room for a fresh start."}
          </h3>
          {day.completed.map((item, i) => (
            <p key={`${i}-${item}`}>
              <Check size={14} />
              {item}
            </p>
          ))}
        </div>
      )}
      {day.goals.length > 0 && (
        <ul className="goal-time-list">
          {day.goals.map((goal) => (
            <li key={goal.goal_id}>
              <div>
                {goal.title}
                <small>{goal.area}</small>
              </div>
              <span>
                <Clock3 size={14} />
                {duration(goal.seconds)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="helper">
        Focus time comes from the timer you start. App downtime and sleep are
        skipped; screen tracking is not required.
      </p>
    </section>
  );
}
