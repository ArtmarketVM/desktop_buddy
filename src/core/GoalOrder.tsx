import { useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { desktop } from "../api/tauri";
import type { CoreGoal } from "./types";

export function moveGoal(
  ids: number[],
  source: number,
  target: number,
): number[] {
  if (source === target || !ids.includes(source) || !ids.includes(target))
    return ids;
  const result = ids.filter((id) => id !== source);
  result.splice(ids.indexOf(target), 0, source);
  return result;
}
export function GoalOrder({
  goals,
  allGoals,
  disabled,
  reorder,
  children,
}: {
  goals: CoreGoal[];
  allGoals: CoreGoal[];
  disabled: boolean;
  reorder: (ids: number[]) => void;
  children: (goal: CoreGoal) => ReactNode;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const blocked = disabled || !desktop;
  const move = (source: number, target: number) =>
    reorder(
      moveGoal(
        allGoals.map((goal) => goal.id),
        source,
        target,
      ),
    );
  return (
    <div className="ordered-goals">
      {goals.map((goal) => (
        <div
          key={goal.id}
          className={`ordered-goal ${over === goal.id ? "drop-target" : ""}`}
          onDragOver={(event) => {
            if (dragged !== null && !blocked) {
              event.preventDefault();
              setOver(goal.id);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragged !== null && !blocked) move(dragged, goal.id);
            setDragged(null);
            setOver(null);
          }}
        >
          <div
            className="goal-order-controls"
            aria-label={`Order ${goal.title}`}
          >
            <button
              className="text-button drag-handle"
              draggable={!blocked}
              disabled={blocked}
              aria-label={`Drag ${goal.title} to reorder`}
              onKeyDown={(event) => {
                const index = goals.findIndex((item) => item.id === goal.id);
                const target =
                  event.key === "ArrowUp"
                    ? goals[index - 1]
                    : event.key === "ArrowDown"
                      ? goals[index + 1]
                      : undefined;
                if (target && !blocked) {
                  event.preventDefault();
                  move(goal.id, target.id);
                }
              }}
              onDragStart={(event) => {
                setDragged(goal.id);
                event.dataTransfer.setData("text/plain", String(goal.id));
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDragged(null);
                setOver(null);
              }}
            >
              <GripVertical size={16} />
            </button>
          </div>
          {children(goal)}
        </div>
      ))}
    </div>
  );
}
