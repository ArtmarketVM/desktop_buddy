import { useRef, useState, type ReactNode } from "react";
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

const HOLD_MS = 250;
const MOVE_TOLERANCE = 6;
const IGNORED = "input, textarea, select, a, .goal-overflow, .goal-expanded";

type Drag = { from: number; to: number; dy: number; height: number };

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
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useRef<Array<HTMLDivElement | null>>([]);
  const press = useRef<{
    index: number;
    pointer: number;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout> | null;
    active: boolean;
    rects: Array<{ top: number; bottom: number }>;
  } | null>(null);
  const suppressClick = useRef(false);
  const blocked = disabled || !desktop;

  const cancel = () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    press.current = null;
    setDrag(null);
  };

  const targetIndex = (
    center: number,
    rects: Array<{ top: number; bottom: number }>,
  ) => {
    let best = 0;
    let distance = Infinity;
    rects.forEach((rect, index) => {
      const d = Math.abs(center - (rect.top + rect.bottom) / 2);
      if (d < distance) {
        distance = d;
        best = index;
      }
    });
    return best;
  };

  const finish = () => {
    const state = press.current;
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    press.current = null;
    if (state.active) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const current = drag;
      setDrag(null);
      if (current && current.to !== current.from)
        reorder(
          moveGoal(
            allGoals.map((goal) => goal.id),
            goals[current.from].id,
            goals[current.to].id,
          ),
        );
    }
  };

  const shift = (index: number) => {
    if (!drag || index === drag.from) return 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to)
      return -drag.height;
    if (drag.from > drag.to && index >= drag.to && index < drag.from)
      return drag.height;
    return 0;
  };

  return (
    <div className={`ordered-goals ${drag ? "reordering" : ""}`}>
      {goals.map((goal, index) => {
        const lifted = drag?.from === index;
        const offset = lifted ? drag!.dy : shift(index);
        return (
          <div
            key={goal.id}
            ref={(node) => {
              rows.current[index] = node;
            }}
            className={`ordered-goal ${lifted ? "lifted" : ""}`}
            style={drag ? { transform: `translateY(${offset}px)` } : undefined}
            onClickCapture={(event) => {
              if (suppressClick.current) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onPointerDown={(event) => {
              if (
                blocked ||
                event.button !== 0 ||
                (event.target as Element).closest(IGNORED)
              )
                return;
              const node = event.currentTarget;
              const state = {
                index,
                pointer: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                active: false,
                timer: null as ReturnType<typeof setTimeout> | null,
                rects: [] as Array<{ top: number; bottom: number }>,
              };
              state.timer = setTimeout(() => {
                state.rects = rows.current.map((row) => {
                  const rect = row?.getBoundingClientRect();
                  return { top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 };
                });
                state.active = true;
                node.setPointerCapture?.(state.pointer);
                setDrag({
                  from: index,
                  to: index,
                  dy: 0,
                  height: node.getBoundingClientRect().height,
                });
              }, HOLD_MS);
              press.current = state;
            }}
            onPointerMove={(event) => {
              const state = press.current;
              if (!state) return;
              if (!state.active) {
                if (
                  Math.hypot(event.clientX - state.x, event.clientY - state.y) >
                  MOVE_TOLERANCE
                )
                  cancel();
                return;
              }
              const dy = event.clientY - state.y;
              const origin = state.rects[state.index];
              const center = (origin.top + origin.bottom) / 2 + dy;
              setDrag({
                from: state.index,
                to: targetIndex(center, state.rects),
                dy,
                height: origin.bottom - origin.top,
              });
            }}
            onPointerUp={finish}
            onPointerCancel={cancel}
          >
            {children(goal)}
          </div>
        );
      })}
    </div>
  );
}
