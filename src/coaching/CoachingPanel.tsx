import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../api/tauri";
import { coreApi } from "../core/api";
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
  const [view, setView] = useState<CoachingView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(requested);
  const [goals, setGoals] = useState<CoreGoal[]>([]);
  const [startGoal, setStartGoal] = useState<number | null>(null);
  const [remember, setRemember] = useState(false);
  const mounted = useRef(false);
  const working = useRef(false);
  function accept(next: CoachingView | null) {
    setView((previous) =>
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
  useEffect(() => {
    if (!choosing || !desktop) return;
    let live = true;
    void coreApi
      .snapshot()
      .then((s) => {
        if (live) setGoals(s.goals.filter((g) => g.status === "open"));
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [choosing]);
  useEffect(() => {
    if (!desktop) return;
    mounted.current = true;
    let live = true;
    let stop: (() => void) | undefined;
    let request = 0;
    const load = () => {
      const sequence = ++request;
      void coachingApi
        .inspect(conversationId)
        .then((next) => {
          if (live && sequence === request) {
            accept(next);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (live && sequence === request) setError(String(e));
        });
    };
    load();
    void listen("buddy://chat-updated", load)
      .then((unlisten) => {
        if (live) stop = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      live = false;
      mounted.current = false;
      stop?.();
    };
  }, [conversationId]);
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
        setError(String(e));
        await coachingApi
          .inspect(conversationId)
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
