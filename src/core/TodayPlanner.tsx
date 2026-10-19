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
}: {
  snapshot: CoreSnapshot;
  disabled: boolean;
  save: (ids: number[]) => Promise<boolean>;
  onDirty: (dirty: boolean) => void;
  createNew: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const goals = browseGoals(snapshot);
  const ids = selected.filter((id) => goals.some((goal) => goal.id === id));
  useEffect(() => {
    onDirty(ids.length > 0);
    return () => onDirty(false);
  }, [ids.length, onDirty]);

  return (
    <section className="today-picker" aria-labelledby="today-picker-title">
      <h3 id="today-picker-title">Choose from your previous goals</h3>
      <p className="helper">
        Select the goals you want to work on today, then click Done.
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
          {ids.length} {ids.length === 1 ? "goal" : "goals"} selected
        </p>
        <button
          type="button"
          disabled={disabled || ids.length === 0}
          onClick={() => void save(ids)}
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
          Add a new goal instead
        </button>
      )}
    </section>
  );
}
