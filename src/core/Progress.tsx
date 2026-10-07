import { useState } from "react";
import { ActivityTimeline } from "./Timeline";
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
  const completed = day.completed_goals ?? day.completed;
  const seconds = day.goals.reduce(
    (sum, goal) => sum + (goal.relevant_seconds ?? 0),
    0,
  );
  const areas = Object.entries(
    day.goals.reduce<Record<string, number>>((times, goal) => {
      times[goal.area] = (times[goal.area] ?? 0) + (goal.relevant_seconds ?? 0);
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
          {completed.length
            ? `You wrapped up ${completed.length} ${completed.length === 1 ? "goal" : "goals"}.`
            : seconds
              ? "You made a little space for focused work."
              : "A quieter day counts, too."}
          {seconds > 0 ? ` ${duration(seconds)} of relevant activity.` : ""}
        </p>
        {completed.length > 0 && (
          <ul>
            {completed.map((item, i) => (
              <li key={`${i}-${item}`}>{item}</li>
            ))}
          </ul>
        )}
        {areas.length > 0 && (
          <div className="summary-areas">
            {areas
              .filter(([, time]) => time > 0)
              .map(([area, time]) => (
                <span key={area}>
                  {area} · {duration(time)}
                </span>
              ))}
          </div>
        )}
        {unfinished > 0 && (
          <p className="helper">
            {unfinished} {unfinished === 1 ? "goal is" : "goals are"} still
            open. Pick up the rest tomorrow if you want.
          </p>
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
  const completedGoals = day.completed_goals ?? day.completed;
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
              {duration(
                item.goals.reduce(
                  (sum, g) => sum + (g.relevant_seconds ?? 0),
                  0,
                ),
              )}
            </strong>
            <small>
              {(item.completed_goals ?? item.completed).length} goals completed
            </small>
          </button>
        ))}
      </div>
      <h3 className="progress-date">{dateLabel(day.day)}</h3>
      {day.day === snapshot.date ? (
        <DaySummary
          day={day}
          unfinished={
            snapshot.goals.filter(
              (g) => g.status === "open" && snapshot.today.includes(g.id),
            ).length
          }
        />
      ) : (
        <div className="past-summary">
          <h3>
            {completedGoals.length
              ? `You wrapped up ${completedGoals.length} goals.`
              : "Room for a fresh start."}
          </h3>
          {completedGoals.map((item, i) => (
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
                {duration(goal.relevant_seconds ?? 0)}
                {(goal.tracked_seconds ?? 0) > 0 && (
                  <small>
                    {duration(goal.tracked_seconds!)} observed activity
                  </small>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ActivityTimeline day={day.day} />
      <p className="helper">
        Relevant time uses sufficiently matched window or page titles and apps
        you explicitly mark as work for a goal. Idle periods, sleep and excluded
        apps are skipped. Unclassified activity is shown separately; it does not
        prove task completion.
      </p>
    </section>
  );
}
