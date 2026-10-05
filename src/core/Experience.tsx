import { useCallback, useEffect, useState } from "react";
import { Plus, Pause } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../api/tauri";
import type { WorkspacePage } from "../components/AppShell";
import { coreApi } from "./api";
import { Composer } from "./Composer";
import { GoalAreas, GoalEditor, GoalRow } from "./Goals";
import { DaySummary, Progress } from "./Progress";
import {
  dateLabel,
  shiftDate,
  emptyCore,
  type CoreGoal,
  type CoreSnapshot,
} from "./types";
import { QuickGoal } from "./QuickGoal";
import { CapturedGoal } from "./CapturedGoal";
import type { GoalEnhancement } from "./analysis";

export function Experience({
  page,
  onDirty,
  onChanged,
  revision,
  enhancement,
}: {
  page: WorkspacePage;
  onDirty: (dirty: boolean) => void;
  onChanged: () => Promise<void>;
  revision: string;
  enhancement?: GoalEnhancement;
}) {
  const [snapshot, setSnapshot] = useState<CoreSnapshot>(emptyCore);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const displayedError = error || loadError;
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<CoreGoal | null>(null);
  const [composerDirty, setComposerDirty] = useState(false);
  const [quickDirty, setQuickDirty] = useState(false);
  const [picking, setPicking] = useState(false);
  const [historyDate, setHistoryDate] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [drafts, setDrafts] = useState<Array<{ id: string; text: string }>>([]);
  const snapshotAnchor =
    page === "history"
      ? historyDate || null
      : page === "activity"
        ? anchor
        : null;
  const [movementDismissed, setMovementDismissed] = useState(0);
  const [ready, setReady] = useState(!desktop);
  const refresh = useCallback(async () => {
    if (desktop) {
      const [next, captured] = await Promise.all([
        coreApi.snapshot(snapshotAnchor),
        coreApi.drafts(),
      ]);
      setSnapshot(next);
      setDrafts(captured);
      setLoadError("");
      setReady(true);
    }
  }, [snapshotAnchor]);
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        if (desktop) {
          const [next, captured] = await Promise.all([
            coreApi.snapshot(snapshotAnchor),
            coreApi.drafts(),
          ]);
          if (live) {
            setSnapshot(next);
            setDrafts(captured);
            setLoadError("");
            setReady(true);
          }
        }
      } catch (e) {
        if (live) setLoadError(String(e));
      }
    };
    void poll();
    let stop: (() => void) | undefined;
    if (desktop)
      void listen("buddy://drafts-updated", () => void poll())
        .then((unlisten) => {
          if (live) stop = unlisten;
          else unlisten();
        })
        .catch(() => {});
    const id = setInterval(() => void poll(), 15000);
    return () => {
      live = false;
      clearInterval(id);
      stop?.();
    };
  }, [snapshotAnchor, revision]);
  useEffect(() => {
    onDirty(composerDirty || quickDirty || !!editor);
    return () => onDirty(false);
  }, [composerDirty, quickDirty, editor, onDirty]);
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
      <div hidden={page !== "resources" && !(page === "focus" && showImport)}>
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
                <h2>Goals for today</h2>
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
            <QuickGoal
              disabled={busy || !desktop}
              onDirty={setQuickDirty}
              save={(title, batch) => run(() => coreApi.create(title, batch))}
            />
            {drafts.length > 0 && (
              <section aria-label="Selected text drafts">
                <h3>Drafts to review</h3>
                {drafts.map((draft) => (
                  <CapturedGoal
                    key={draft.id}
                    draft={draft}
                    disabled={busy || !desktop}
                    resolve={(id, title) =>
                      run(() => coreApi.resolveDraft(id, title))
                    }
                  />
                ))}
              </section>
            )}
            {snapshot.today.length >= 3 && (
              <p className="helper">
                Today has three goals. New goals are saved in Goals for later.
              </p>
            )}
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
                enhancement={enhancement}
              />
            ))}
            {picking && (
              <div className="today-picker">
                <h3>Choose up to three open goals</h3>
                {snapshot.carryover.length > 0 && (
                  <section aria-label="Unfinished goals from previous days">
                    <h3>Pick up where you left off</h3>
                    {snapshot.goals
                      .filter((goal) => snapshot.carryover.includes(goal.id))
                      .map((goal) => (
                        <div className="carryover-row" key={goal.id}>
                          <span>{goal.title}</span>
                          <button
                            className="text-button"
                            disabled={busy || snapshot.today.length >= 3}
                            onClick={() =>
                              void run(() => coreApi.today(goal.id, true))
                            }
                          >
                            Add to today
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              void run(() => coreApi.dismissCarryover(goal.id))
                            }
                          >
                            Dismiss
                          </button>
                        </div>
                      ))}
                  </section>
                )}
                {snapshot.goals
                  .filter(
                    (goal) =>
                      goal.status === "open" &&
                      !snapshot.today.includes(goal.id) &&
                      !snapshot.carryover.includes(goal.id),
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
          <button
            className="text-button"
            aria-expanded={showImport}
            onClick={() => setShowImport(!showImport)}
          >
            Import notes or ask Buddy
          </button>
          {(snapshot.summary.completed.length > 0 || focusedSeconds > 0) && (
            <DaySummary
              day={snapshot.summary}
              unfinished={today.filter((g) => g.status === "open").length}
            />
          )}
        </>
      )}
      {page === "history" && (
        <>
          <div className="section-heading history-navigation">
            <h2>Goal history</h2>
            <label>
              Planned on
              <input
                type="date"
                value={historyDate}
                max={snapshot.date}
                disabled={busy}
                onChange={(event) => setHistoryDate(event.target.value)}
              />
            </label>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                setHistoryDate(shiftDate(historyDate || snapshot.date, -1))
              }
            >
              Previous day
            </button>
            <button
              className="text-button"
              disabled={busy || !historyDate || historyDate >= snapshot.date}
              onClick={() => setHistoryDate(shiftDate(historyDate, 1))}
            >
              Next day
            </button>
            <button
              className="text-button"
              disabled={busy || !historyDate}
              onClick={() => setHistoryDate("")}
            >
              All goals
            </button>
          </div>
          {historyDate ? (
            <section aria-label="Goals by date">
              <h3>{dateLabel(historyDate)}</h3>
              <p className="helper">
                Goals planned on this date, with their current status.
              </p>
              {snapshot.selected_date !== historyDate ? (
                <p role="status">Loading goals…</p>
              ) : (
                <>
                  {snapshot.goals
                    .filter((goal) => snapshot.date_goals.includes(goal.id))
                    .map((goal) => (
                      <GoalRow
                        key={goal.id}
                        goal={goal}
                        snapshot={snapshot}
                        busy={busy}
                        run={run}
                        edit={setEditor}
                        enhancement={enhancement}
                      />
                    ))}
                  {snapshot.date_goals.length === 0 && (
                    <p>No goals were planned on this day.</p>
                  )}
                </>
              )}
            </section>
          ) : (
            <GoalAreas
              snapshot={snapshot}
              busy={busy}
              run={run}
              edit={setEditor}
              enhancement={enhancement}
            />
          )}
        </>
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
          save={(title, area, plan, details) =>
            run(() => coreApi.save(title, area, plan, details))
          }
          remove={() =>
            run(() => coreApi.transition(editor.id, "delete", true))
          }
        />
      )}
    </div>
  );
}
