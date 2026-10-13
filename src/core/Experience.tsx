import { useCallback, useEffect, useState } from "react";
import { Pause, Plus } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { api, desktop } from "../api/tauri";
import type { WorkspacePage } from "../components/AppShell";
import { coreApi } from "./api";
import { Composer } from "./Composer";
import { GoalAreas, GoalEditor, GoalLine, GoalRow } from "./Goals";
import { DaySummary, Progress } from "./Progress";
import {
  emptyCore,
  type ProgressPeriod,
  type CoreGoal,
  type CoreSnapshot,
} from "./types";
import { QuickGoal } from "./QuickGoal";
import { CapturedGoal } from "./CapturedGoal";
import type { GoalEnhancement } from "./analysis";
import type { Dashboard } from "../types";
import { WorkspaceBuddy } from "../companion/WorkspaceBuddy";
import { Chats } from "../companion/Chats";
import { GoalOrder } from "./GoalOrder";
import { TrackingStatus } from "./TrackingStatus";

export function Experience({
  page,
  onDirty,
  onChanged,
  revision,
  enhancement,
  dashboard,
  onSettings,
}: {
  page: WorkspacePage;
  onDirty: (dirty: boolean) => void;
  onChanged: () => Promise<void>;
  revision: string;
  enhancement?: GoalEnhancement;
  dashboard: Dashboard;
  onSettings: () => void;
}) {
  const [snapshot, setSnapshot] = useState<CoreSnapshot>(emptyCore);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [progressPeriod, setProgressPeriod] = useState<ProgressPeriod>("week");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const displayedError = error || loadError;
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<CoreGoal | null>(null);
  const [composerDirty, setComposerDirty] = useState(false);
  const [quickDirty, setQuickDirty] = useState(false);
  const [picking, setPicking] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [drafts, setDrafts] = useState<Array<{ id: string; text: string }>>([]);
  const snapshotAnchor = page === "activity" ? anchor : null;
  const snapshotPeriod = page === "activity" ? progressPeriod : "week";
  const [movementDismissed, setMovementDismissed] = useState(0);
  const [ready, setReady] = useState(!desktop);
  const refresh = useCallback(async () => {
    if (desktop) {
      const [next, captured] = await Promise.all([
        coreApi.snapshot(snapshotAnchor, snapshotPeriod),
        coreApi.drafts(),
      ]);
      setSnapshot(next);
      setDrafts(captured);
      setLoadError("");
      setReady(true);
    }
  }, [snapshotAnchor, snapshotPeriod]);
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        if (desktop) {
          const [next, captured] = await Promise.all([
            coreApi.snapshot(snapshotAnchor, snapshotPeriod),
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
    const stops: Array<() => void> = [];
    if (desktop)
      for (const name of [
        "buddy://drafts-updated",
        "buddy://goal-analysis",
        "buddy://goal-completed",
      ])
        void listen(name, () => void poll())
          .then((unlisten) => {
            if (live) stops.push(unlisten);
            else unlisten();
          })
          .catch(() => {});
    const id = setInterval(() => void poll(), 5000);
    return () => {
      live = false;
      clearInterval(id);
      stops.forEach((stop) => stop());
    };
  }, [snapshotAnchor, snapshotPeriod, revision, page]);
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
    (sum, goal) => sum + (goal.relevant_seconds ?? 0),
    0,
  );
  const movement =
    !dashboard.status.dnd &&
    !dashboard.buddy.companion?.preferences.paused &&
    (!dashboard.buddy.snoozed_until ||
      dashboard.buddy.snoozed_until * 1000 <= Date.now()) &&
    snapshot.preferences.movement_reminders &&
    snapshot.focused_goal_id !== null &&
    Math.floor(focusedSeconds / 2700) > movementDismissed;
  return (
    <div className="core-workspace">
      {displayedError && (
        <p className="error" role="alert">
          {displayedError}
        </p>
      )}
      {!ready && <p role="status">Opening your goals…</p>}
      {page === "activity" &&
        (!dashboard.status.tracking || dashboard.status.tracking_error) && (
          <p className="callout" role="status">
            {dashboard.status.tracking
              ? "Tracking is blocked."
              : "Tracking is paused."}
            <button className="text-button callout-action" onClick={onSettings}>
              Fix in Settings
            </button>
          </p>
        )}
      <div hidden={page !== "resources" && !(page === "history" && showImport)}>
        <Composer
          importMode={page === "resources" || page === "history"}
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
          <div className="today-layout">
            <section className="core-section today-goals">
              <div className="section-heading">
                <div>
                  <h2>Goals</h2>
                </div>
                <button
                  className="text-button"
                  disabled={busy || !desktop}
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
              <GoalOrder
                goals={today}
                showHandles
                allGoals={snapshot.goals}
                disabled={busy}
                reorder={(ids) => run(() => coreApi.reorder(ids))}
              >
                {(goal) => (
                  <GoalRow
                    key={goal.id}
                    goal={goal}
                    snapshot={snapshot}
                    busy={busy}
                    run={run}
                    edit={setEditor}
                    enhancement={enhancement}
                  />
                )}
              </GoalOrder>
              {picking && (
                <div className="today-picker">
                  <h3>Choose goals for Today</h3>
                  {snapshot.carryover.length > 0 && (
                    <section aria-label="Unfinished goals from previous days">
                      <h3>Pick up where you left off</h3>
                      {snapshot.goals
                        .filter((goal) => snapshot.carryover.includes(goal.id))
                        .map((goal) => (
                          <GoalLine goal={goal} key={goal.id}>
                            <button
                              className="text-button"
                              disabled={busy}
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
                                void run(() =>
                                  coreApi.dismissCarryover(goal.id),
                                )
                              }
                            >
                              Dismiss
                            </button>
                          </GoalLine>
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
                      <GoalLine goal={goal} key={goal.id}>
                        <button
                          className="text-button"
                          aria-label={`Add ${goal.title} to today`}
                          disabled={busy}
                          onClick={() =>
                            void run(() => coreApi.today(goal.id, true))
                          }
                        >
                          <Plus size={14} />
                        </button>
                      </GoalLine>
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
          </div>
          {(snapshot.summary.completed.length > 0 || focusedSeconds > 0) && (
            <DaySummary day={snapshot.summary} />
          )}
        </>
      )}
      {page !== "chats" && (
        <WorkspaceBuddy
          dashboard={dashboard}
          onChanged={onChanged}
          showLauncher={!desktop}
        />
      )}
      {page === "chats" && (
        <Chats dashboard={dashboard} onChanged={onChanged} />
      )}
      {page === "history" && (
        <>
          <div className="section-heading history-navigation">
            <button
              className="text-button"
              aria-expanded={showImport}
              onClick={() => setShowImport(!showImport)}
            >
              <Plus size={15} />
              Import
            </button>
          </div>
          <GoalAreas
            snapshot={snapshot}
            busy={busy}
            run={run}
            edit={setEditor}
            enhancement={enhancement}
          />
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
          period={progressPeriod}
          onWeek={setAnchor}
          onPeriod={setProgressPeriod}
          busy={busy}
        />
      )}
      {editor && (
        <GoalEditor
          error={displayedError}
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
