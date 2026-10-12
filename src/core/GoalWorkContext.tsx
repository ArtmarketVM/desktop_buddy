import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api/tauri";
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
  const context = goal.work_context;
  const parked = goal.status === "deferred" && !!context?.parked_at;
  const [pending, setPending] = useState<"park" | "resume" | null>(null);
  async function act(operation: "park" | "resume") {
    setPending(operation);
    setMessage("");
    try {
      await run(async () => {
        const reply = await workContextApi.action(goal.id, operation);
        setMessage(reply.message);
      });
    } finally {
      setPending(null);
    }
  }
  if (goal.status === "completed" && !context) return null;
  return (
    <section
      className="goal-work-context"
      aria-label={`Work context for ${goal.title}`}
    >
      <div className="work-context-actions">
        {parked && <span className="work-context-status">Parked</span>}
        {context?.waiting_for && (
          <span className="work-context-status">Waiting</span>
        )}
        {!readOnly && goal.status !== "completed" && (
          <>
            {!parked && (
              <button
                type="button"
                className="text-button"
                disabled={!desktop || busy || pending !== null}
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
                disabled={!desktop || busy || pending !== null}
                title="Restore this work context and focus the goal without starting a timer"
                onClick={() => void act("resume")}
              >
                {pending === "resume" ? "Resuming…" : "Resume"}
              </button>
            )}
          </>
        )}
      </div>
      {context && (
        <details className="work-context-checkpoint" open={parked || undefined}>
          <summary>
            Checkpoint · {new Date(context.updated_at).toLocaleString()}
          </summary>
          <p>{context.summary}</p>
          {context.last_result && (
            <p>
              <strong>Last confirmed result:</strong> {context.last_result}
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
            Saved context, not proof of current progress. Park uses Nebius with
            your goal and relevant memory; screen text is not included.
          </p>
        </details>
      )}
      {message && (
        <p role="status" className="work-context-receipt">
          {message}
        </p>
      )}
    </section>
  );
}
