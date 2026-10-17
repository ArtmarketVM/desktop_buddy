import { useMemo, useState } from "react";
import { WindowActivity } from "./WindowActivity";
import { Check, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { PeriodPicker, endOfMonth } from "./PeriodPicker";
import {
  sentenceCase,
  dateLabel,
  duration,
  shiftDate,
  type CoreSnapshot,
  type DayProgress,
  type ProgressPeriod,
} from "./types";

const periodOptions: Array<{
  value: ProgressPeriod;
  label: string;
  days: number;
}> = [
  { value: "day", label: "Day", days: 1 },
  { value: "week", label: "Week", days: 7 },
  { value: "month", label: "Month", days: 31 },
  { value: "year", label: "Year", days: 366 },
];

const periodDays = (period: ProgressPeriod) =>
  periodOptions.find((item) => item.value === period)?.days ?? 7;

export function DaySummary({ day }: { day: DayProgress; unfinished?: number }) {
  const seconds = day.goals.reduce(
    (sum, goal) => sum + (goal.relevant_seconds ?? 0),
    0,
  );
  const closedGoals = day.completed_goals?.length ?? 0;
  const goalsDone = closedGoals;
  const stepsDone = Math.max(0, day.completed.length - closedGoals);
  const parts = [
    stepsDone > 0
      ? `${stepsDone} ${stepsDone === 1 ? "step" : "steps"} done`
      : "",
    goalsDone > 0
      ? `${goalsDone} ${goalsDone === 1 ? "goal" : "goals"} completed`
      : "",
    seconds > 0 ? `${duration(seconds)} focused` : "",
  ].filter(Boolean);
  return (
    <section
      className={`day-summary ${parts.length ? "has-progress" : ""}`}
      aria-label="Day summary"
    >
      <Check size={16} aria-hidden="true" />
      <p>
        {parts.length ? (
          <strong>{parts.join(" · ")}</strong>
        ) : (
          "No recorded activity or completed goals for this day."
        )}
      </p>
    </section>
  );
}
export interface FinishedItem {
  id: number;
  title: string;
  seconds: number;
  /** Steps finished today; for a completed goal, all of its done steps. */
  steps: string[];
  completed: boolean;
}
/** Today's callout: focused time first, counts on the right, finished work in the dropdown. */
export function TodaySummary({
  day,
  items,
}: {
  day: DayProgress;
  items: FinishedItem[];
}) {
  const seconds = day.goals.reduce(
    (sum, goal) => sum + (goal.relevant_seconds ?? 0),
    0,
  );
  const goalsDone = items.filter((item) => item.completed).length;
  const stepsDone = items.reduce((sum, item) => sum + item.steps.length, 0);
  const counts = [
    goalsDone > 0 ? `${goalsDone} ${goalsDone === 1 ? "goal" : "goals"}` : "",
    stepsDone > 0 ? `${stepsDone} ${stepsDone === 1 ? "step" : "steps"}` : "",
  ].filter(Boolean);
  const headline =
    seconds > 0
      ? `${duration(seconds)} of focused work today`
      : "No focused work recorded yet today";
  if (!items.length)
    return (
      <section className="today-summary" aria-label="Day summary">
        <div className="today-summary-head">
          <strong>{headline}</strong>
        </div>
      </section>
    );
  return (
    <details className="today-summary" aria-label="Day summary">
      <summary className="today-summary-head">
        <strong>{headline}</strong>
        <span className="today-summary-counts">
          {counts.join(" · ")}
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="summary-chevron"
          />
        </span>
      </summary>
      <ul className="today-summary-list">
        {items.map((item) => (
          <li key={item.id}>
            <div className="today-summary-row">
              <span className="today-summary-dot" aria-hidden="true" />
              <span className={item.completed ? "finished" : ""}>
                {item.title}
              </span>
              <span className="today-summary-time">
                {item.seconds > 0 ? duration(item.seconds) : "—"}
              </span>
            </div>
            {item.steps.length > 0 && (
              <p className="today-summary-steps">{item.steps.join(" · ")}</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
// Direction A: violet, lime and ink first, then their lighter steps.
const goalColors = [
  "#6c5fff",
  "#e4fa8e",
  "#1f1f1f",
  "#b3acff",
  "#c8d87a",
  "#8c8c86",
];

type Bucket = {
  key: string;
  label: string;
  goals: Map<number, number>;
};

function minutes(seconds: number) {
  return seconds > 0 && seconds < 60 ? "<1m" : duration(seconds);
}

function bucketsFor(days: DayProgress[], period: ProgressPeriod): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (const day of days) {
    const key = period === "year" ? day.day.slice(0, 7) : day.day;
    const bucket = buckets.get(key) ?? {
      key,
      label:
        period === "year"
          ? new Date(`${key}-01T12:00:00`).toLocaleDateString("en", {
              month: "short",
            })
          : period === "week"
            ? new Date(`${day.day}T12:00:00`).toLocaleDateString("en", {
                weekday: "short",
              })
            : dateLabel(day.day).replace(/^[A-Za-z]+, /, ""),
      goals: new Map<number, number>(),
    };
    for (const goal of day.goals)
      bucket.goals.set(
        goal.goal_id,
        (bucket.goals.get(goal.goal_id) ?? 0) + (goal.relevant_seconds ?? 0),
      );
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
}

function hourBuckets(hourly: CoreSnapshot["hourly"]): Bucket[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    key: String(hour),
    label: hour % 6 === 0 ? `${String(hour).padStart(2, "0")}:00` : "",
    goals: new Map(
      hourly
        .filter((item) => item.hour === hour)
        .map((item) => [item.goal_id, item.seconds] as const),
    ),
  }));
}

export function Progress({
  snapshot,
  anchor,
  period,
  onWeek,
  onPeriod,
  busy,
}: {
  snapshot: CoreSnapshot;
  anchor: string | null;
  period: ProgressPeriod;
  onWeek: (anchor: string | null) => void;
  onPeriod: (period: ProgressPeriod) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const days = snapshot.week.length
    ? [...snapshot.week].reverse()
    : [snapshot.summary];
  const newest = anchor ?? snapshot.date;
  const oldest = days[0]?.day ?? snapshot.date;
  const goals = useMemo(() => {
    const totals = new Map<
      number,
      { id: number; title: string; seconds: number }
    >();
    for (const day of days)
      for (const item of day.goals) {
        const row = totals.get(item.goal_id) ?? {
          id: item.goal_id,
          title: item.title,
          seconds: 0,
        };
        row.seconds += item.relevant_seconds ?? 0;
        totals.set(item.goal_id, row);
      }
    return [...totals.values()]
      .filter((goal) => goal.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
  }, [days]);
  const colorOf = (id: number) =>
    goalColors[
      Math.max(
        0,
        goals.findIndex((goal) => goal.id === id),
      ) % goalColors.length
    ];
  const focus =
    selected === null ? null : snapshot.goals.find((g) => g.id === selected);
  const buckets = (
    period === "day"
      ? hourBuckets(snapshot.hourly ?? [])
      : bucketsFor(days, period)
  ).map((bucket) => ({
    ...bucket,
    goals:
      selected === null
        ? bucket.goals
        : new Map([[selected, bucket.goals.get(selected) ?? 0]]),
  }));
  const bucketTotal = (bucket: Bucket) =>
    [...bucket.goals.values()].reduce((sum, value) => sum + value, 0);
  const maxBucket = Math.max(1, ...buckets.map(bucketTotal));
  // The tallest day gets eleven bricks; every goal with any time keeps at least one.
  const bricksFor = (seconds: number) =>
    Math.max(1, Math.round((seconds / maxBucket) * 11));
  const total = buckets.reduce((sum, bucket) => sum + bucketTotal(bucket), 0);
  const stepSeconds = new Map<string, number>();
  if (selected !== null)
    for (const day of days)
      for (const item of day.goals)
        if (item.goal_id === selected)
          for (const step of item.steps ?? [])
            stepSeconds.set(
              step.step_id,
              (stepSeconds.get(step.step_id) ?? 0) + step.seconds,
            );
  const doneSteps = focus?.plan.steps.filter((step) => step.done) ?? [];
  const allSteps = focus?.plan.steps ?? [];
  const periodGoalsDone = days.reduce(
    (sum, day) => sum + (day.completed_goals?.length ?? 0),
    0,
  );
  const periodStepsDone = days.reduce(
    (sum, day) =>
      sum +
      Math.max(0, day.completed.length - (day.completed_goals?.length ?? 0)),
    0,
  );
  const periodWord =
    period === "day"
      ? "today"
      : period === "week"
        ? "this week"
        : period === "month"
          ? "this month"
          : "this year";
  const listed = doneSteps.reduce(
    (sum, step) => sum + (stepSeconds.get(step.id) ?? 0),
    0,
  );
  const other = Math.max(0, total - listed);
  const step = periodDays(period);
  const shiftPeriod = (direction: -1 | 1) => {
    const base = new Date(`${newest}T12:00:00`);
    const target =
      period === "month"
        ? endOfMonth(base.getFullYear(), base.getMonth() + direction)
        : period === "year"
          ? `${base.getFullYear() + direction}-12-31`
          : shiftDate(newest, direction * step);
    return target >= snapshot.date ? null : target;
  };
  const shortDate = (value: string) =>
    dateLabel(value).replace(/^[A-Za-z]+, /, "");
  const rangeLabel =
    period === "day"
      ? dateLabel(newest)
      : period === "month"
        ? new Date(`${newest}T12:00:00`).toLocaleDateString("en", {
            month: "long",
            year: "numeric",
          })
        : period === "year"
          ? newest.slice(0, 4)
          : `${shortDate(oldest)} – ${shortDate(newest)}`;
  return (
    <section
      className="core-section progress-history progress-screen"
      aria-label="Progress"
    >
      {focus && (
        <div className="progress-top">
          <button
            className="text-button progress-back"
            onClick={() => setSelected(null)}
          >
            <ChevronLeft size={16} />
            Progress
          </button>
        </div>
      )}
      {focus && (
        <h2 className="progress-goal-title">{sentenceCase(focus.title)}</h2>
      )}
      <div className="progress-bar">
        <div className="progress-nav" role="group" aria-label="Choose period">
          <button
            className="text-button"
            aria-label={`Previous ${period}`}
            disabled={busy}
            onClick={() => onWeek(shiftPeriod(-1))}
          >
            <ChevronLeft size={16} />
          </button>
          <PeriodPicker
            period={period}
            newest={newest}
            today={snapshot.date}
            label={rangeLabel}
            disabled={busy}
            onPick={onWeek}
          />
          <button
            className="text-button"
            aria-label={`Next ${period}`}
            disabled={busy || newest >= snapshot.date}
            onClick={() => onWeek(shiftPeriod(1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="segmented-control" role="tablist" aria-label="Period">
          {periodOptions.map((item) => (
            <button
              key={item.value}
              role="tab"
              aria-selected={period === item.value}
              className={period === item.value ? "selected" : ""}
              disabled={busy}
              onClick={() => {
                onWeek(null);
                onPeriod(item.value);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="progress-headline">
        <div className="progress-total">
          {total > 0 ? duration(total) : "0m"}
        </div>
        <p className="progress-sub">
          {focus
            ? `focused ${periodWord} · ${doneSteps.length} of ${allSteps.length} ${allSteps.length === 1 ? "step" : "steps"} done`
            : [
                `focused ${periodWord}`,
                periodGoalsDone > 0
                  ? `${periodGoalsDone} ${periodGoalsDone === 1 ? "goal" : "goals"}`
                  : "",
                periodStepsDone > 0
                  ? `${periodStepsDone} ${periodStepsDone === 1 ? "step" : "steps"} done`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
      </div>
      <div className="stack-chart" aria-label="Focused time">
        {buckets.map((bucket) => (
          <div
            key={bucket.key}
            className="stack-col"
            onMouseEnter={() => setHover(bucket.key)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === bucket.key && bucketTotal(bucket) > 0 && (
              <div className="stack-tip" role="tooltip">
                <strong>
                  {bucket.label} · {duration(bucketTotal(bucket))}
                </strong>
                {[...bucket.goals.entries()]
                  .filter(([, seconds]) => seconds > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, seconds]) => (
                    <span key={id}>
                      <i style={{ background: colorOf(id) }} />
                      {sentenceCase(
                        snapshot.goals.find((g) => g.id === id)?.title ??
                          goals.find((g) => g.id === id)?.title ??
                          "Goal",
                      )}
                      <em>{duration(seconds)}</em>
                    </span>
                  ))}
              </div>
            )}
            <div className="stack-bar">
              {[...bucket.goals.entries()]
                .filter(([, seconds]) => seconds > 0)
                .map(([id, seconds]) => (
                  <i
                    key={id}
                    style={
                      {
                        height: `${bricksFor(seconds) * 10 - 2}px`,
                        "--bar-color": colorOf(id),
                      } as React.CSSProperties
                    }
                  />
                ))}
            </div>
            <small>
              {buckets.length > 14 && period !== "day" ? "" : bucket.label}
            </small>
          </div>
        ))}
      </div>
      {!focus &&
        (goals.length === 0 ? (
          <p className="empty-copy">No focused time in this period yet.</p>
        ) : (
          <ul className="progress-list">
            {goals.map((goal) => (
              <li key={goal.id}>
                <button
                  className="text-button progress-row"
                  onClick={() => setSelected(goal.id)}
                >
                  <i style={{ background: colorOf(goal.id) }} />
                  <span>{sentenceCase(goal.title)}</span>
                  <em>{duration(goal.seconds)}</em>
                  <ChevronRight size={16} />
                </button>
              </li>
            ))}
          </ul>
        ))}
      {focus && (
        <ul className="progress-list">
          {allSteps.map((item) => (
            <li
              key={item.id}
              className={`progress-row static ${item.done ? "" : "open"}`}
            >
              <span
                className={`done-box ${item.done ? "" : "empty"}`}
                aria-hidden="true"
              >
                {item.done && <Check size={10} />}
              </span>
              <span>{sentenceCase(item.text)}</span>
              <em>
                {stepSeconds.get(item.id)
                  ? minutes(stepSeconds.get(item.id)!)
                  : "–"}
              </em>
            </li>
          ))}
          {other > 0 && (
            <li className="progress-row static muted">
              <span />
              <span>Other work on this goal</span>
              <em>{minutes(other)}</em>
            </li>
          )}
          {allSteps.length === 0 && other === 0 && (
            <li className="empty-copy">
              No steps or focused time in this period.
            </li>
          )}
        </ul>
      )}
      <details className="progress-details">
        <summary>Tracked activity</summary>
        <WindowActivity first={oldest} last={newest} goalId={selected} />
      </details>
    </section>
  );
}
