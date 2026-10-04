import { useCallback, useEffect, useState } from "react";
import { Plus, Pause } from "lucide-react";
import { desktop } from "../api/tauri";
import type { WorkspacePage } from "../components/AppShell";
import { coreApi } from "./api";
import { Composer } from "./Composer";
import { GoalAreas, GoalEditor, GoalRow } from "./Goals";
import { DaySummary, Progress } from "./Progress";
import { emptyCore, type CoreGoal, type CoreSnapshot } from "./types";

export function Experience({
  page,
  onDirty,
  onChanged,
  revision,
}: {
  page: WorkspacePage;
  onDirty: (dirty: boolean) => void;
  onChanged: () => Promise<void>;
  revision: string;
}) {
  const [snapshot, setSnapshot] = useState<CoreSnapshot>(emptyCore);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const displayedError = error || loadError;
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<CoreGoal | null>(null);
  const [composerDirty, setComposerDirty] = useState(false);
  const [picking, setPicking] = useState(false);
  const [movementDismissed, setMovementDismissed] = useState(0);
  const [ready, setReady] = useState(!desktop);
  const refresh = useCallback(async () => {
    if (desktop) {
      const next = await coreApi.snapshot(anchor);
      setSnapshot(next);
      setLoadError("");
      setReady(true);
    }
  }, [anchor]);
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        if (desktop) {
          const next = await coreApi.snapshot(anchor);
          if (live) {
            setSnapshot(next);
            setLoadError("");
            setReady(true);
          }
        }
      } catch (e) {
        if (live) setLoadError(String(e));
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 15000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [anchor, revision]);
  useEffect(() => {
    onDirty(composerDirty || !!editor);
    return () => onDirty(false);
  }, [composerDirty, editor, onDirty]);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
      await onChanged();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const today = snapshot.goals.filter((goal) =>
    snapshot.today.includes(goal.id),
  );
  const focusedSeconds = snapshot.summary.goals.reduce(
    (sum, goal) => sum + goal.seconds,
    0,
  );
  const movement =
    snapshot.preferences.movement_reminders &&
    !!snapshot.timer &&
    Math.floor(focusedSeconds / 2700) > movementDismissed;
  return (
    <div className="core-workspace">
      {displayedError && (
        <p className="error" role="alert">
          {displayedError}
        </p>
      )}
      {!ready && <p role="status">Opening your goals…</p>}
      <div
        hidden={page !== "focus" && page !== "resources" && page !== "history"}
      >
        <Composer
          importMode={page === "resources"}
          onDirty={setComposerDirty}
          disabled={busy}
          onSave={async (drafts, batch) => {
            if (!(await run(() => coreApi.add(drafts, batch))))
              throw new Error(
                "The goals were not saved. Your draft is still here; try again.",
              );
          }}
        />
      </div>
      {page === "focus" && (
        <>
          {movement && (
            <div className="movement-note">
              <span>A little stretch or a sip of water?</span>
              <button
                className="text-button"
                onClick={() =>
                  setMovementDismissed(Math.floor(focusedSeconds / 2700))
                }
              >
                Thanks, got it
              </button>
            </div>
          )}
          <section className="core-section">
            <div className="section-heading">
              <div>
                <h2>Today's intentions</h2>
                <p className="helper">
                  One to three things that matter. You choose the pace.
                </p>
              </div>
              <button
                className="text-button"
                disabled={busy || !desktop || snapshot.today.length >= 3}
                onClick={() => setPicking(!picking)}
              >
                <Plus size={15} />
                Choose goals
              </button>
            </div>
            {snapshot.day_mode === "unset" && (
              <div className="morning-plan">
                <p>
                  {snapshot.preferences.working_days.includes(
                    new Date().getDay(),
                  )
                    ? "What would you like to move forward today?"
                    : "A quieter day? Make a plan only if you want one."}
                </p>
                <button
                  disabled={busy || !desktop}
                  onClick={() =>
                    void run(() => coreApi.planDay(false)).then((ok) => {
                      if (ok) setPicking(true);
                    })
                  }
                >
                  Plan today
                </button>
                <button
                  className="text-button"
                  disabled={busy || !desktop}
                  onClick={() => void run(() => coreApi.planDay(true))}
                >
                  No plan today
                </button>
              </div>
            )}
            {snapshot.day_mode === "no_plan" && (
              <p className="empty-copy">
                No plan today. Your goals will be here whenever you need them.
              </p>
            )}
            {today.length === 0 && snapshot.day_mode === "plan" && (
              <p className="empty-copy">
                Choose a saved goal, or add a new one above.
              </p>
            )}
            {today.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                snapshot={snapshot}
                busy={busy}
                run={run}
                edit={setEditor}
              />
            ))}
            {picking && (
              <div className="today-picker">
                <h3>Choose up to three open goals</h3>
                {snapshot.goals
                  .filter(
                    (goal) =>
                      goal.status === "open" &&
                      !snapshot.today.includes(goal.id),
                  )
                  .map((goal) => (
                    <button
                      className="outline-button"
                      key={goal.id}
                      disabled={busy || snapshot.today.length >= 3}
                      onClick={() =>
                        void run(() => coreApi.today(goal.id, true))
                      }
                    >
                      {goal.title}
                      <Plus size={14} />
                    </button>
                  ))}
                {!snapshot.goals.some((g) => g.status === "open") && (
                  <p className="helper">Add your first goal above.</p>
                )}
                <button
                  className="text-button"
                  onClick={() => setPicking(false)}
                >
                  Done choosing
                </button>
              </div>
            )}
            {snapshot.timer && (
              <button
                className="text-button"
                disabled={busy || !desktop}
                onClick={() => void run(() => coreApi.timer(null))}
              >
                <Pause size={14} />
                Pause focus timer
              </button>
            )}
          </section>
          <GoalAreas
            snapshot={snapshot}
            busy={busy}
            run={run}
            edit={setEditor}
          />
          <DaySummary
            day={snapshot.summary}
            unfinished={today.filter((g) => g.status === "open").length}
          />
        </>
      )}
      {page === "history" && (
        <GoalAreas snapshot={snapshot} busy={busy} run={run} edit={setEditor} />
      )}
      {page === "resources" && (
        <p className="helper">
          Review each proposed goal and its steps before confirming. Imported
          goals stay separate from today's plan until you choose them.
        </p>
      )}
      {page === "activity" && (
        <Progress
          snapshot={snapshot}
          anchor={anchor}
          onWeek={setAnchor}
          busy={busy}
        />
      )}
      {editor && (
        <GoalEditor
          goal={editor}
          snapshot={snapshot}
          close={() => setEditor(null)}
          save={(title, area, plan) =>
            run(() => coreApi.save(title, area, plan))
          }
          remove={() =>
            run(() => coreApi.transition(editor.id, "delete", true))
          }
        />
      )}
    </div>
  );
}
