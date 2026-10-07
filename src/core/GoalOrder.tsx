import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
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
      {goals.map((goal, index) => (
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
            <button
              className="text-button"
              disabled={blocked || index === 0}
              aria-label={`Move ${goal.title} up`}
              onClick={() => move(goal.id, goals[index - 1].id)}
            >
              <ArrowUp size={13} />
            </button>
            <button
              className="text-button"
              disabled={blocked || index === goals.length - 1}
              aria-label={`Move ${goal.title} down`}
              onClick={() => move(goal.id, goals[index + 1].id)}
            >
              <ArrowDown size={13} />
            </button>
          </div>
          {children(goal)}
        </div>
      ))}
    </div>
  );
}
