import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../api/tauri";
import { coreApi } from "../core/api";
import type { CoreGoal } from "../core/types";
import {
  coachingApi,
  type CoachingControl,
  type CoachingReply,
  type CoachingView,
} from "./api";
import { StartCoaching } from "./StartCoaching";
import "./coaching.css";

export function CoachingPanel({
  conversationId,
  requested = false,
}: {
  conversationId?: number;
  requested?: boolean;
}) {
  const [view, setView] = useState<CoachingView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [choosing, setChoosing] = useState(requested);
  const [goals, setGoals] = useState<CoreGoal[]>([]);
  const [startGoal, setStartGoal] = useState<number | null>(null);
  const [anchor, setAnchor] = useState("");
  const [ease, setEase] = useState("");
  const [remember, setRemember] = useState(false);
  const mounted = useRef(false);
  const working = useRef(false);
  function accept(next: CoachingView | null) {
    setView((previous) =>
      next &&
      previous?.session.id === next.session.id &&
      previous.session.revision > next.session.revision
        ? previous
        : next,
    );
  }
  async function refresh() {
    accept(await coachingApi.inspect(conversationId));
  }
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
    const load = () => {
      void coachingApi
        .inspect(conversationId)
        .then((next) => {
          if (live) {
            accept(next);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (live) setError(String(e));
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
  useEffect(() => {
    setEase("");
    setAnchor("");
    setRemember(false);
  }, [view?.session.id, view?.session.revision]);
  async function control(control: CoachingControl) {
    if (!view || working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await coachingApi.reply(
        view.session,
        control,
        crypto.randomUUID(),
      );
      if (mounted.current) accept(next);
    } catch (e) {
      if (mounted.current) {
        setError(String(e));
        await refresh().catch(() => {});
      }
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const reply = (reply: CoachingReply) =>
    void control({ type: "reply", reply });
  const proposing = useRef(false);
  async function propose() {
    if (!view || proposing.current || working.current) return;
    proposing.current = true;
    setGenerating(true);
    setError("");
    try {
      const next = await coachingApi.propose(view.session, crypto.randomUUID());
      if (mounted.current) accept(next);
    } catch (e) {
      if (mounted.current) {
        setError(String(e));
        await refresh().catch(() => {});
      }
    } finally {
      proposing.current = false;
      if (mounted.current) setGenerating(false);
    }
  }
  if (!desktop) return null;
  const session = view?.session;
  const open = session?.status === "active" || session?.status === "paused";
  const active = session?.status === "active" && view?.fresh;
  const disabled = busy || generating;
  return (
    <section className="coaching-panel" aria-label="Goal coaching">
      {!open && loaded && (
        <button
          className="text-button"
          onClick={() => setChoosing(!choosing)}
          aria-expanded={choosing}
        >
          Help me start
        </button>
      )}
      {choosing && !open && (
        <div className="coaching-picker">
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
          </label>
          {!goals.length && (
            <p className="helper">Add an unfinished goal to start coaching.</p>
          )}
        </div>
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
      {view && session && (
        <>
          <p className="coaching-heading">
            Tiny Habits · {view.target?.title ?? "Saved goal"}
          </p>
          {view.target?.step_title && (
            <p className="helper">Step: {view.target.step_title}</p>
          )}
          {open && !view.fresh && (
            <p className="callout">
              This goal or step changed. Stop this session and start again with
              the current goal.
            </p>
          )}
          {active && (
            <div className="coaching-step">
              {session.data.action && (
                <p>
                  {session.data.action.title}{" "}
                  <span className="helper">
                    About {session.data.action.estimated_seconds} seconds
                  </span>
                </p>
              )}
              {session.step === "readiness" && (
                <>
                  <p>Would you like to find one small first action?</p>
                  <div className="coaching-actions">
                    <button
                      disabled={disabled}
                      onClick={() => reply({ type: "ready", ready: true })}
                    >
                      Yes, let’s try
                    </button>
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() => reply({ type: "ready", ready: false })}
                    >
                      Not now
                    </button>
                  </div>
                </>
              )}
              {session.step === "barrier" && (
                <>
                  <p>What is making it hard to start?</p>
                  <div className="coaching-actions">
                    {[
                      ["overwhelm", "It feels too big"],
                      ["unclear_first_step", "I don’t know the first step"],
                      ["perfectionism", "I want it to be perfect"],
                      ["low_confidence", "I’m not confident"],
                      ["external_dependency", "I’m waiting on something"],
                      ["other", "Something else"],
                    ].map(([barrier, label]) => (
                      <button
                        className="text-button"
                        key={barrier}
                        disabled={disabled}
                        onClick={() => reply({ type: "barrier", barrier })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {session.step === "tiny_action" && (
                <>
                  <p>Ask sumi for one action you can try in 10–60 seconds.</p>
                  <button disabled={disabled} onClick={() => void propose()}>
                    {generating
                      ? "Finding a small action…"
                      : "Suggest a small action"}
                  </button>
                </>
              )}
              {session.step === "feasibility" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (ease) reply({ type: "ease", score: Number(ease) });
                  }}
                >
                  <label>
                    How easy does this feel? (1 is hard, 10 is very easy)
                    <select
                      aria-label="Ease score"
                      value={ease}
                      onChange={(e) => setEase(e.target.value)}
                      disabled={disabled}
                    >
                      <option value="">Choose a score</option>
                      {Array.from({ length: 10 }, (_, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button disabled={disabled || !ease}>Continue</button>
                </form>
              )}
              {session.step === "anchor" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    reply({ type: "anchor", anchor: anchor.trim() || null });
                  }}
                >
                  <label>
                    Would a familiar moment help you remember? (optional)
                    <input
                      aria-label="Optional anchor"
                      maxLength={300}
                      value={anchor}
                      onChange={(e) => setAnchor(e.target.value)}
                      placeholder="After I open my laptop…"
                      disabled={disabled}
                    />
                  </label>
                  <button disabled={disabled}>
                    {anchor.trim() ? "Use this moment" : "Skip"}
                  </button>
                </form>
              )}
              {session.step === "commitment" && (
                <>
                  <p>Would you like to try this action?</p>
                  {session.data.anchor && (
                    <p className="helper">Your moment: {session.data.anchor}</p>
                  )}
                  <div className="coaching-actions">
                    <button
                      disabled={disabled}
                      onClick={() => reply({ type: "commit", accepted: true })}
                    >
                      I’ll try it
                    </button>
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() => reply({ type: "commit", accepted: false })}
                    >
                      No, stop here
                    </button>
                  </div>
                </>
              )}
              {session.step === "execution" && (
                <>
                  <p>How did that small action go?</p>
                  {view.can_remember && (
                    <label>
                      <input
                        type="checkbox"
                        checked={remember}
                        disabled={disabled}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      Remember my reported result
                    </label>
                  )}
                  <div className="coaching-actions">
                    <button
                      disabled={disabled}
                      onClick={() =>
                        reply({ type: "report", completed: true, remember })
                      }
                    >
                      I did the small action
                    </button>
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() =>
                        reply({
                          type: "report",
                          completed: false,
                          remember: false,
                        })
                      }
                    >
                      I couldn’t do it
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {session.status === "paused" && (
            <p>Coaching is paused. You can continue when you’re ready.</p>
          )}
          {session.status === "completed" && (
            <p>
              You reported completing the small action. Your goal and checklist
              stay as they are. Choose your next step when you’re ready.
            </p>
          )}
          {session.status === "blocked" && (
            <p>
              This needs something outside your control. Consider noting who or
              what you’re waiting for, or choosing another goal.
            </p>
          )}
          {session.status === "declined" && (
            <p>Coaching stopped. You can start again whenever you choose.</p>
          )}
          {open && (
            <div className="coaching-actions">
              {session.status === "paused" ? (
                <button
                  disabled={disabled || !view.fresh}
                  onClick={() => void control({ type: "resume" })}
                >
                  Resume coaching
                </button>
              ) : (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void control({ type: "pause" })}
                >
                  Pause coaching
                </button>
              )}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void control({ type: "stop" })}
              >
                Stop coaching
              </button>
            </div>
          )}
          {open && (
            <p className="helper">
              This session is saved locally. Use these controls for coaching;
              the message box stays available for other questions.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => {
              setError("");
              void refresh()
                .then(() => setLoaded(true))
                .catch((e) => setError(String(e)));
            }}
          >
            Reload session
          </button>
        </p>
      )}
    </section>
  );
}
