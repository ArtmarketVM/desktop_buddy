import { useEffect, useRef, useState } from "react";
import { useQuery } from "../data/useQuery";
import { coachingQuery, workspaceQuery } from "../data/resources";
import { queryClient } from "../data/client";
import { desktop } from "../api/tauri";
import type { CoreGoal } from "../core/types";
import { coachingApi, type CoachingView } from "./api";
import { StartCoaching } from "./StartCoaching";
import "./coaching.css";

export function CoachingPanel({
  conversationId,
  requested = false,
  allowStart = true,
  onChange,
  onRememberChange,
}: {
  conversationId?: number;
  requested?: boolean;
  allowStart?: boolean;
  onChange?: (view: CoachingView | null) => void;
  onRememberChange?: (remember: boolean) => void;
}) {
  const sessionQuery = coachingQuery(conversationId);
  const sessionState = useQuery(sessionQuery, desktop);
  const view = sessionState.data;
  const loaded = sessionState.ready;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(requested);
  const [goals, setGoals] = useState<CoreGoal[]>([]);
  const [startGoal, setStartGoal] = useState<number | null>(null);
  const [remember, setRemember] = useState(false);
  const mounted = useRef(false);
  const working = useRef(false);
  function accept(next: CoachingView | null) {
    sessionQuery.setData((previous) =>
      next &&
      previous &&
      (previous.session.id > next.session.id ||
        (previous.session.id === next.session.id &&
          previous.session.revision > next.session.revision))
        ? previous
        : next,
    );
  }
  useEffect(() => {
    onChange?.(view);
  }, [view, onChange]);
  useEffect(() => {
    setRemember(false);
    onRememberChange?.(false);
  }, [
    view?.session.id,
    view?.session.revision,
    view?.chat_bound,
    onRememberChange,
  ]);
  useEffect(() => {
    if (requested) setChoosing(true);
  }, [requested]);
  const workspace = useQuery(workspaceQuery(null, "week"), choosing && desktop);
  useEffect(() => {
    if (workspace.ready)
      setGoals(workspace.data.goals.filter((g) => g.status === "open"));
  }, [workspace.data, workspace.ready]);
  useEffect(() => {
    if (sessionState.error) setError(sessionState.error);
    else if (sessionState.ready) setError("");
  }, [sessionState.error, sessionState.ready]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function control(type: "pause" | "resume" | "stop") {
    if (!view || working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await coachingApi.reply(
        view.session,
        { type },
        crypto.randomUUID(),
      );
      if (mounted.current) accept(next);
    } catch (e) {
      if (mounted.current) {
        setError(queryClient.recordError("coaching action", e));
        await sessionQuery
          .refresh()
          .then((next) => {
            if (mounted.current) accept(next);
          })
          .catch(() => {});
      }
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (!desktop) return null;
  const session = view?.session;
  const bound = !!view?.chat_bound;
  const open = session?.status === "active" || session?.status === "paused";
  if (!allowStart && !bound) return null;
  return (
    <section className="coaching-panel" aria-label="Goal coaching">
      {allowStart && !bound && loaded && (
        <button
          className="text-button"
          onClick={() => setChoosing(!choosing)}
          aria-expanded={choosing}
        >
          Help me start
        </button>
      )}
      {allowStart && choosing && !bound && (
        <label>
          Which goal would you like help starting?
          <select
            aria-label="Coaching goal"
            value=""
            onChange={(e) => {
              if (e.target.value) setStartGoal(Number(e.target.value));
            }}
          >
            <option value="">Choose an unfinished goal</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
          {!goals.length && (
            <span className="helper">
              Add an unfinished goal to start coaching.
            </span>
          )}
        </label>
      )}
      {startGoal !== null && (
        <StartCoaching
          goalId={startGoal}
          onClose={() => setStartGoal(null)}
          onStarted={(next) => {
            accept(next);
            setChoosing(false);
          }}
        />
      )}
      {view && session && bound && (
        <>
          <p className="coaching-heading">
            Coaching · {view.target?.title ?? "Saved goal"}
          </p>
          {view.target?.step_title && (
            <p className="helper">Step: {view.target.step_title}</p>
          )}
          {!view.fresh ? (
            <p className="callout">
              This goal or step changed. Exit coaching and start again with its
              current details.
            </p>
          ) : (
            <p className="helper">
              {session.status === "paused"
                ? "Paused. Resume when you’re ready."
                : session.status === "blocked"
                  ? "Session ended with an external blocker. Replies stay on this goal until you exit coaching."
                  : !open
                    ? "This session has ended. Replies stay on this goal until you exit coaching."
                    : "Reply in the message box. This chat stays on this goal until you exit coaching."}
            </p>
          )}
          <div className="coaching-actions">
            {session.status === "active" && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void control("pause")}
              >
                Pause coaching
              </button>
            )}
            {session.status === "paused" && (
              <button
                className="text-button"
                disabled={busy || !view.fresh}
                onClick={() => void control("resume")}
              >
                Resume coaching
              </button>
            )}
            {!open && view.fresh && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setStartGoal(session.goal_id)}
              >
                Start again
              </button>
            )}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void control("stop")}
            >
              Exit coaching
            </button>
          </div>
          {session.step === "execution" && view.can_remember && (
            <label className="toggle-row coaching-remember">
              <input
                type="checkbox"
                checked={remember}
                disabled={busy}
                onChange={(e) => {
                  setRemember(e.target.checked);
                  onRememberChange?.(e.target.checked);
                }}
              />
              Remember my reported result
            </label>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
