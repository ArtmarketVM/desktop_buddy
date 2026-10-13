import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api/tauri";
import { useDismissiblePopover } from "../components/useDismissiblePopover";
import type { WorkContext } from "../api/memory";
import type { CoreGoal } from "./types";

export type WorkflowReply = { message: string; context: WorkContext | null };
export const workContextApi = {
  action: (goalId: number, operation: "park" | "resume" | "inspect") =>
    invoke<WorkflowReply>("run_work_context_action", { goalId, operation }),
};
export function GoalWorkContext({
  goal,
  busy,
  run,
  readOnly = false,
}: {
  goal: CoreGoal;
  busy: boolean;
  readOnly?: boolean;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [message, setMessage] = useState("");
  const { id, open, setOpen, rootRef, surfaceRef, triggerRef } =
    useDismissiblePopover();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const context = goal.work_context;
  const parked = goal.status === "deferred" && !!context?.parked_at;
  const [pending, setPending] = useState<"park" | "resume" | null>(null);
  const disabled = !desktop || busy || pending !== null;
  const mutable = !readOnly && goal.status !== "completed";
  useLayoutEffect(() => {
    if (!open || !surfaceRef.current || !triggerRef.current) return;
    const anchor = triggerRef.current.getBoundingClientRect();
    const panel = surfaceRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        12,
        Math.min(
          anchor.right - panel.width,
          window.innerWidth - panel.width - 12,
        ),
      ),
      top:
        anchor.bottom + panel.height + 8 < window.innerHeight - 12
          ? anchor.bottom + 8
          : Math.max(12, anchor.top - panel.height - 8),
    });
  }, [open, context?.updated_at, message, pending]);
  useLayoutEffect(() => {
    if (open)
      surfaceRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  async function act(operation: "park" | "resume") {
    setPending(operation);
    setMessage("");
    try {
      await run(async () => {
        const reply = await workContextApi.action(goal.id, operation);
        setMessage(reply.message);
        setOpen(true);
      });
    } finally {
      setPending(null);
    }
  }
  if (!context && !mutable) return null;
  return (
    <div
      className="goal-work-context"
      ref={rootRef}
      aria-label={`Work context for ${goal.title}`}
    >
      {context ? (
        <button
          ref={triggerRef}
          type="button"
          className="text-button checkpoint-trigger"
          aria-label={`Checkpoint for ${goal.title}`}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-haspopup="dialog"
          title="Saved place to continue this goal"
          onClick={() => setOpen(!open)}
        >
          <Clock3 size={13} aria-hidden="true" />
          <span>{parked ? "Parked" : "Checkpoint"}</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="text-button checkpoint-trigger"
          disabled={disabled}
          title="Save a checkpoint before switching tasks"
          onClick={() => void act("park")}
        >
          {pending === "park" ? "Saving checkpoint…" : "Park"}
        </button>
      )}
      {open &&
        (context || message) &&
        createPortal(
          <div
            ref={surfaceRef}
            style={position}
            id={id}
            className="checkpoint-popover"
            role="dialog"
            aria-label={`Saved checkpoint for ${goal.title}`}
          >
            <div className="checkpoint-header">
              <strong>Saved checkpoint</strong>
              <button
                type="button"
                className="text-button"
                aria-label="Close checkpoint"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            {context && (
              <>
                <time dateTime={context.updated_at}>
                  {new Date(context.updated_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
                <p>{context.summary}</p>
                {context.last_result && (
                  <p>
                    <strong>Last confirmed result:</strong>{" "}
                    {context.last_result}
                  </p>
                )}
                {context.next_action && (
                  <p>
                    <strong>Next:</strong> {context.next_action}
                  </p>
                )}
                {context.waiting_for && (
                  <p>
                    <strong>Waiting for:</strong> {context.waiting_for}
                  </p>
                )}
                <p className="helper">
                  Your saved place to continue, not confirmation that work is
                  complete.
                </p>
              </>
            )}
            {mutable && (
              <div className="work-context-actions">
                {!parked && context && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={disabled}
                    title="Save an AI checkpoint before switching tasks"
                    onClick={() => void act("park")}
                  >
                    {pending === "park" ? "Saving checkpoint…" : "Park"}
                  </button>
                )}
                {context && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={disabled}
                    title="Restore this work context and focus the goal without starting a timer"
                    onClick={() => void act("resume")}
                  >
                    {pending === "resume" ? "Resuming…" : "Resume"}
                  </button>
                )}
              </div>
            )}
            {message && (
              <p role="status" className="work-context-receipt">
                {message}
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
