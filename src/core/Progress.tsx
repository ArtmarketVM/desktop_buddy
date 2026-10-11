import { useMemo, useState } from "react";
import { StepsPreview } from "./Goals";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
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

function percent(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function totalRelevant(day: DayProgress) {
  return day.goals.reduce((sum, goal) => sum + (goal.relevant_seconds ?? 0), 0);
}

function totalTracked(day: DayProgress) {
  return day.goals.reduce((sum, goal) => sum + (goal.tracked_seconds ?? 0), 0);
}

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
  const [selectedGoal, setSelectedGoal] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const days = snapshot.week.length
    ? [...snapshot.week].reverse()
    : [snapshot.summary];
  const newest = anchor ?? snapshot.date;
  const oldest = days[0]?.day ?? snapshot.date;
  const selectedGoalNumber =
    selectedGoal === "all" ? null : Number.parseInt(selectedGoal, 10);
  const visibleDays = selectedGoalNumber
    ? days.map((day) => ({
        ...day,
        goals: day.goals.filter((goal) => goal.goal_id === selectedGoalNumber),
      }))
    : days;
  const goals = useMemo(() => {
    const rows = new Map<
      number,
      {
        id: number;
        title: string;
        area: string;
        relevant: number;
        tracked: number;
        days: Array<{ day: string; relevant: number; tracked: number }>;
      }
    >();
    for (const day of days) {
      for (const item of day.goals) {
        const row = rows.get(item.goal_id) ?? {
          id: item.goal_id,
          title: item.title,
          area: item.area,
          relevant: 0,
          tracked: 0,
          days: [],
        };
        const relevant = item.relevant_seconds ?? 0;
        const tracked = item.tracked_seconds ?? 0;
        row.relevant += relevant;
        row.tracked += tracked;
        row.days.push({ day: day.day, relevant, tracked });
        rows.set(item.goal_id, row);
      }
    }
    return [...rows.values()].sort(
      (a, b) => b.relevant + b.tracked - (a.relevant + a.tracked),
    );
  }, [days]);
  const selectedGoalDetails = snapshot.goals.find(
    (goal) => goal.id === selectedGoalNumber,
  );
  const selectedGoalStats = goals.find(
    (goal) => goal.id === selectedGoalNumber,
  );
  const maxDay = Math.max(1, ...visibleDays.map(totalRelevant));
  const completedSteps =
    selectedGoalDetails?.plan.steps.filter((step) => step.done).length ?? 0;
  const totalSteps = selectedGoalDetails?.plan.steps.length ?? 0;
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const move = (direction: -1 | 1) => {
    onWeek(shiftDate(newest, direction * periodDays(period)));
  };
  return (
    <section
      className="core-section progress-history"
      aria-label="Progress history"
    >
      <div className="section-heading progress-toolbar">
        <h2>Progress</h2>
        <div
          className="week-navigation"
          role="group"
          aria-label="Progress period navigation"
        >
          <button
            className="text-button"
            aria-label={`Previous ${period}`}
            disabled={busy}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="text-button"
            disabled={busy || !anchor}
            onClick={() => onWeek(null)}
          >
            Current
          </button>
          <button
            className="text-button"
            aria-label={`Next ${period}`}
            disabled={busy || newest >= snapshot.date}
            onClick={() => {
              const next = shiftDate(newest, periodDays(period));
              onWeek(next >= snapshot.date ? null : next);
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="progress-controls">
        <label>
          Period
          <select
            value={period}
            disabled={busy}
            onChange={(event) => {
              onWeek(null);
              onPeriod(event.target.value as ProgressPeriod);
            }}
          >
            {periodOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Goal
          <select
            value={selectedGoal}
            onChange={(event) => setSelectedGoal(event.target.value)}
          >
            <option value="all">All goals</option>
            {snapshot.goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {sentenceCase(goal.title)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="progress-range">
        {dateLabel(oldest)}
        {" – "}
        {dateLabel(newest)}
      </p>
      <div className="progress-chart" aria-label="Focused time by day">
        {visibleDays.map((day) => {
          const seconds = totalRelevant(day);
          const observed = totalTracked(day);
          return (
            <div key={day.day} className="progress-bar-day">
              <div>
                <span
                  style={{
                    height: `${Math.max(4, Math.round((seconds / maxDay) * 100))}%`,
                  }}
                />
              </div>
              <small>
                {period === "year"
                  ? dateLabel(day.day).slice(4)
                  : dateLabel(day.day)}
              </small>
              <strong>{duration(seconds)}</strong>
              {observed > seconds && <em>{duration(observed)} observed</em>}
            </div>
          );
        })}
      </div>
      {selectedGoalDetails && (
        <section className="selected-goal-progress" aria-label="Goal progress">
          <div>
            <h3>{selectedGoalDetails.title}</h3>
            <p>
              {completedSteps}/{totalSteps} steps complete
              {totalSteps > 0
                ? ` · ${percent(completedSteps, totalSteps)}%`
                : ""}
            </p>
          </div>
          <strong>{duration(selectedGoalStats?.relevant ?? 0)}</strong>
        </section>
      )}
      {goals.length > 0 && selectedGoal === "all" && (
        <ul className="goal-time-list progress-goals">
          {goals.map((goal) => {
            const isExpanded = expanded.has(String(goal.id));
            const goalDetails = snapshot.goals.find(
              (item) => item.id === goal.id,
            );
            const done =
              goalDetails?.plan.steps.filter((step) => step.done).length ?? 0;
            const total = goalDetails?.plan.steps.length ?? 0;
            return (
              <li key={goal.id} className="core-goal">
                <div className="goal-heading">
                  <span className="goal-overflow" aria-hidden="true" />
                  <span className="goal-status-icon" aria-hidden="true">
                    {goalDetails?.status === "completed" ? (
                      <Check size={12} />
                    ) : (
                      <span />
                    )}
                  </span>
                  <button
                    className="text-button core-goal-title goal-expand-toggle"
                    aria-expanded={isExpanded}
                    onClick={() => toggle(String(goal.id))}
                  >
                    {sentenceCase(goal.title)}
                    <small>
                      {total} {total === 1 ? "step" : "steps"}
                    </small>
                    <span className="goal-time">
                      <Clock3 size={14} />
                      {duration(goal.relevant)}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`goal-chevron ${isExpanded ? "rotated" : ""}`}
                    />
                  </button>
                </div>
                <div className="goal-expanded" hidden={!isExpanded}>
                  {goalDetails && (
                    <StepsPreview steps={goalDetails.plan.steps} />
                  )}
                  <div className="progress-goal-details">
                    <p>
                      {done}/{total} steps complete
                      {total > 0 ? ` · ${percent(done, total)}%` : ""}
                    </p>
                    {goal.tracked > goal.relevant && (
                      <p>
                        {duration(goal.tracked - goal.relevant)} observed time
                        stayed unclassified.
                      </p>
                    )}
                    <div className="mini-days">
                      {goal.days.map((item) => (
                        <span key={`${goal.id}-${item.day}`}>
                          {dateLabel(item.day)} · {duration(item.relevant)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {goals.length === 0 && (
        <p className="empty-copy">No goal activity in this period yet.</p>
      )}
    </section>
  );
}
