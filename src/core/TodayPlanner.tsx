import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { browseGoals } from "./GoalFinder";
import { sentenceCase, type CoreSnapshot } from "./types";
import { stepCount } from "./Goals";

export function TodayPlanner({
  snapshot,
  disabled,
  save,
  onDirty,
  createNew,
  dayLabel,
}: {
  snapshot: CoreSnapshot;
  disabled: boolean;
  save: (ids: number[]) => Promise<boolean>;
  onDirty: (dirty: boolean) => void;
  createNew: () => void;
  dayLabel?: string;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const goals = browseGoals(snapshot);
  const ids = selected.filter((id) => goals.some((goal) => goal.id === id));
  const existing = snapshot.today.filter((id) =>
    snapshot.goals.some((goal) => goal.id === id && goal.status === "open"),
  );
  useEffect(() => {
    onDirty(ids.length > 0);
    return () => onDirty(false);
  }, [ids.length, onDirty]);

  return (
    <section className="today-picker" aria-labelledby="today-picker-title">
      <h3 id="today-picker-title">
        {dayLabel
          ? `Choose goals for ${dayLabel}`
          : "Choose from your previous goals"}
      </h3>
      <p className="helper">
        {existing.length > 0
          ? "Goals already in Today stay included. Choose any other goals, then click Done."
          : `Select the goals you want to work on ${dayLabel ? "that day" : "today"}, then click Done.`}
      </p>
      <ul className="finder-list" aria-label="Previous goals">
        {goals.map((goal) => {
          const checked = ids.includes(goal.id);
          return (
            <li
              className={`finder-row ${checked ? "selected" : ""}`}
              key={goal.id}
            >
              <button
                type="button"
                disabled={disabled}
                aria-pressed={checked}
                onClick={() =>
                  setSelected((current) =>
                    current.includes(goal.id)
                      ? current.filter((id) => id !== goal.id)
                      : [...current, goal.id],
                  )
                }
              >
                <span className="core-goal-title">
                  {sentenceCase(goal.title)}
                  <small>{stepCount(goal.plan.steps.length)}</small>
                </span>
                {checked ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Plus size={16} aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="today-picker-actions">
        <p className="helper" role="status">
          {ids.length + existing.length}{" "}
          {ids.length + existing.length === 1 ? "goal" : "goals"} selected
        </p>
        <button
          type="button"
          disabled={disabled || ids.length + existing.length === 0}
          onClick={() => void save([...existing, ...ids])}
        >
          {disabled ? "Saving…" : "Done"}
        </button>
      </div>
      {ids.length === 0 && (
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={createNew}
        >
          {dayLabel ? "Back to Today" : "Add a new goal instead"}
        </button>
      )}
    </section>
  );
}
