import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
/** Reorder the visible lane without moving unrelated goals out of their slots. */
export function moveVisibleGoal(
  all: number[],
  visible: number[],
  source: number,
  target: number,
) {
  if (
    new Set(visible).size !== visible.length ||
    visible.some((id) => !all.includes(id)) ||
    !visible.includes(source) ||
    !visible.includes(target)
  )
    return all;
  const reordered = moveGoal(visible, source, target);
  const selected = new Set(visible);
  let cursor = 0;
  return all.map((id) => (selected.has(id) ? reordered[cursor++] : id));
}
const HOLD_MS = 250;
const MOVE_TOLERANCE = 6;
const IGNORED =
  "input, textarea, select, a, .goal-overflow, .goal-menu, .goal-expanded, .goal-work-context, .checkpoint-popover, .goal-status-icon";
type Bounds = { top: number; bottom: number };
type Drag = { from: number; to: number; dy: number; height: number };
type Press = {
  index: number;
  to: number;
  pointer: number;
  x: number;
  y: number;
  lastY: number;
  scrollY: number;
  timer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  rects: Bounds[];
  all: number[];
  visible: number[];
};
export function GoalOrder({
  goals,
  allGoals,
  disabled,
  reorder,
  children,
  showHandles = false,
}: {
  goals: CoreGoal[];
  allGoals: CoreGoal[];
  disabled: boolean;
  reorder: (ids: number[]) => void | Promise<boolean>;
  children: (goal: CoreGoal) => ReactNode;
  showHandles?: boolean;
}) {
  const hintId = useId();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [keyboard, setKeyboard] = useState<number | null>(null);
  const [announcement, announce] = useState("");
  const rows = useRef<Array<HTMLDivElement | null>>([]);
  const press = useRef<Press | null>(null);
  const frame = useRef<number | null>(null);
  const keyboardState = useRef<{
    index: number;
    to: number;
    rects: Bounds[];
    all: number[];
    visible: number[];
  } | null>(null);
  const suppressClick = useRef(false);
  const alive = useRef(true);
  const blocked = disabled || !desktop;
  const allIds = allGoals.map((goal) => goal.id);
  const visibleIds = goals.map((goal) => goal.id);
  const bounds = () =>
    rows.current.slice(0, goals.length).map((row) => {
      const rect = row?.getBoundingClientRect();
      return { top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 };
    });
  function stopPointer() {
    if (press.current?.timer) clearTimeout(press.current.timer);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    press.current = null;
  }
  function cancel() {
    stopPointer();
    keyboardState.current = null;
    setKeyboard(null);
    setDrag(null);
  }
  useEffect(() => {
    alive.current = true;
    const blur = () => cancel();
    window.addEventListener("blur", blur);
    return () => {
      alive.current = false;
      stopPointer();
      window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    if (press.current || keyboardState.current) {
      cancel();
      announce("Goals changed. Start the move again.");
    }
  }, [allIds.join(","), visibleIds.join(","), blocked]);
  async function commit(
    all: number[],
    visible: number[],
    from: number,
    to: number,
  ) {
    if (from === to || blocked) return;
    const same =
      all.join(",") === allIds.join(",") &&
      visible.join(",") === visibleIds.join(",");
    if (!same) {
      announce("Goals changed. Start the move again.");
      return;
    }
    announce(`Saving the position of ${goals[from].title}…`);
    try {
      const result = await reorder(
        moveVisibleGoal(all, visible, visible[from], visible[to]),
      );
      if (alive.current)
        announce(
          result === false
            ? "The order was not saved. Try again."
            : result === true
              ? `Moved ${goals[from].title} to position ${to + 1} of ${goals.length}.`
              : "Order update requested.",
        );
    } catch {
      if (alive.current) announce("The order was not saved. Try again.");
    }
  }
  function updatePointer(y: number) {
    const state = press.current;
    if (!state?.active) return;
    state.lastY = y;
    const dy = y - state.y + window.scrollY - state.scrollY;
    const origin = state.rects[state.index];
    const center = (origin.top + origin.bottom) / 2 + dy;
    let closest = 0,
      distance = Infinity;
    state.rects.forEach((rect, index) => {
      const d = Math.abs(center - (rect.top + rect.bottom) / 2);
      if (d < distance) {
        closest = index;
        distance = d;
      }
    });
    state.to = closest;
    setDrag({
      from: state.index,
      to: closest,
      dy,
      height: origin.bottom - origin.top,
    });
  }
  function scrollWhileDragging() {
    const state = press.current;
    if (!state?.active) return;
    const edge = 56;
    const speed =
      state.lastY < edge
        ? -12
        : state.lastY > window.innerHeight - edge
          ? 12
          : 0;
    if (speed) {
      const previous = window.scrollY;
      window.scrollBy(0, speed);
      if (window.scrollY !== previous) updatePointer(state.lastY);
    }
    frame.current = requestAnimationFrame(scrollWhileDragging);
  }
  function lift(node: HTMLDivElement, state: Press) {
    state.rects = bounds();
    state.active = true;
    node.setPointerCapture?.(state.pointer);
    updatePointer(state.y);
    frame.current = requestAnimationFrame(scrollWhileDragging);
  }
  function finish() {
    const state = press.current;
    stopPointer();
    setDrag(null);
    if (!state?.active) return;
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    void commit(state.all, state.visible, state.index, state.to);
  }
  function shift(index: number) {
    if (!drag || index === drag.from) return 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to)
      return -drag.height;
    if (drag.from > drag.to && index >= drag.to && index < drag.from)
      return drag.height;
    return 0;
  }
  return (
    <div
      className={`ordered-goals ${drag ? "reordering" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && drag) {
          event.preventDefault();
          cancel();
          announce("Move canceled.");
        }
      }}
    >
      {showHandles && (
        <span id={hintId} className="sr-only">
          Drag to reorder. With the keyboard, press Space to pick up, use the
          arrow keys, then Space to save. Escape cancels.
        </span>
      )}
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {goals.map((goal, index) => (
        <div
          key={goal.id}
          ref={(node) => {
            rows.current[index] = node;
          }}
          className={`ordered-goal ${showHandles ? "has-drag-handle" : ""} ${drag?.from === index ? "lifted" : ""} ${drag?.to === index && drag.from !== index ? "drop-target" : ""}`}
          style={
            drag
              ? {
                  transform: `translateY(${drag.from === index ? drag.dy : shift(index)}px)`,
                }
              : undefined
          }
          onClickCapture={(event) => {
            if (suppressClick.current) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onPointerDown={(event) => {
            const handle = (event.target as Element).closest<HTMLButtonElement>(
              ".goal-drag-handle",
            );
            if (
              blocked ||
              event.button !== 0 ||
              event.isPrimary === false ||
              (!handle && (event.target as Element).closest(IGNORED))
            )
              return;
            cancel();
            const state: Press = {
              index,
              to: index,
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              lastY: event.clientY,
              scrollY: window.scrollY,
              active: false,
              timer: null,
              rects: [],
              all: allIds,
              visible: visibleIds,
            };
            press.current = state;
            if (handle) {
              event.preventDefault();
              handle.focus();
              lift(event.currentTarget, state);
            } else {
              const node = event.currentTarget;
              state.timer = setTimeout(() => lift(node, state), HOLD_MS);
            }
          }}
          onPointerMove={(event) => {
            const state = press.current;
            if (!state || state.pointer !== event.pointerId) return;
            if (!state.active) {
              if (
                Math.hypot(event.clientX - state.x, event.clientY - state.y) >
                MOVE_TOLERANCE
              )
                cancel();
              return;
            }
            event.preventDefault();
            updatePointer(event.clientY);
          }}
          onPointerUp={(event) => {
            if (press.current?.pointer === event.pointerId) finish();
          }}
          onPointerCancel={cancel}
          onLostPointerCapture={() => {
            if (press.current) cancel();
          }}
        >
          {showHandles && (
            <button
              type="button"
              className="text-button goal-drag-handle"
              disabled={blocked || goals.length < 2}
              aria-label={`Reorder ${goal.title}`}
              aria-describedby={hintId}
              aria-pressed={keyboard === goal.id}
              title="Drag to reorder · Space and arrow keys also work"
              onKeyDown={(event) => {
                if (
                  blocked ||
                  ![" ", "Enter", "ArrowUp", "ArrowDown"].includes(event.key)
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                const state = keyboardState.current;
                if (event.key === " " || event.key === "Enter") {
                  if (state) {
                    keyboardState.current = null;
                    setKeyboard(null);
                    setDrag(null);
                    void commit(
                      state.all,
                      state.visible,
                      state.index,
                      state.to,
                    );
                  } else {
                    stopPointer();
                    const rects = bounds();
                    keyboardState.current = {
                      index,
                      to: index,
                      rects,
                      all: allIds,
                      visible: visibleIds,
                    };
                    setKeyboard(goal.id);
                    setDrag({
                      from: index,
                      to: index,
                      dy: 0,
                      height: rects[index].bottom - rects[index].top,
                    });
                    announce(
                      `Picked up ${goal.title}. Use the arrow keys, then Space to save.`,
                    );
                  }
                } else if (state) {
                  state.to = Math.max(
                    0,
                    Math.min(
                      goals.length - 1,
                      state.to + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  );
                  setDrag({
                    from: state.index,
                    to: state.to,
                    dy:
                      state.rects[state.to].top - state.rects[state.index].top,
                    height:
                      state.rects[state.index].bottom -
                      state.rects[state.index].top,
                  });
                  rows.current[state.to]?.scrollIntoView?.({
                    block: "nearest",
                  });
                  announce(
                    `Position ${state.to + 1} of ${goals.length}. Space saves; Escape cancels.`,
                  );
                }
              }}
            >
              <GripVertical size={14} aria-hidden="true" />
            </button>
          )}
          {children(goal)}
        </div>
      ))}
    </div>
  );
}
