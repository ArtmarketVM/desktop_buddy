import { useCallback, useEffect, useState } from "react";
import { Pause, Plus } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { api, desktop } from "../api/tauri";
import type { WorkspacePage } from "../components/AppShell";
import { coreApi } from "./api";
import { Composer } from "./Composer";
import { GoalAreas, GoalEditor, GoalLine, GoalRow } from "./Goals";
import { Progress, TodaySummary, type FinishedItem } from "./Progress";
import {
  emptyCore,
  type ProgressPeriod,
  type CoreGoal,
  type CoreSnapshot,
} from "./types";
import { GoalFinder, browseGoals } from "./GoalFinder";
import { TodayPlanner } from "./TodayPlanner";
import { CapturedGoal } from "./CapturedGoal";
import type { GoalEnhancement } from "./analysis";
import type { Dashboard } from "../types";
import { WorkspaceBuddy } from "../companion/WorkspaceBuddy";
import { Chats } from "../companion/Chats";
import { GoalOrder } from "./GoalOrder";
import { priorityRank } from "./Priority";
import { TrackingStatus } from "./TrackingStatus";
import { Toasts } from "../components/Toasts";
import { NoticedWork } from "./NoticedWork";
import { GoalMatchToasts } from "../components/GoalMatchToasts";

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
  const [skipPlanningDate, setSkipPlanningDate] = useState<string | null>(null);
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
  // One list: open goals by priority, then the saved drag order; finished goals stay at the
  // bottom, checked, so they can be unchecked again today.
  const openToday = today
    .map((goal, index) => ({ goal, index }))
    .sort(
      (a, b) =>
        Number(a.goal.status === "completed") -
          Number(b.goal.status === "completed") ||
        priorityRank(a.goal.priority) - priorityRank(b.goal.priority) ||
        a.index - b.index,
    )
    .map(({ goal }) => goal);
  const finishedToday = today.filter((goal) => goal.status === "completed");
  const planningToday =
    ready &&
    snapshot.day_mode === "plan" &&
    today.length === 0 &&
    browseGoals(snapshot).length > 0;
  const timeFor = (id: number) =>
    snapshot.summary.goals.find((goal) => goal.goal_id === id)
      ?.relevant_seconds ?? 0;
  // Finished goals with all their done steps, then open goals with steps finished today.
  const finishedItems: FinishedItem[] = [
    ...finishedToday.map((goal) => ({
      id: goal.id,
      title: goal.title,
      seconds: timeFor(goal.id),
      steps: goal.plan.steps.filter((s) => s.done).map((s) => s.text),
      completed: true,
    })),
    ...today
      .filter((goal) => goal.status !== "completed")
      .map((goal) => ({
        id: goal.id,
        title: goal.title,
        seconds: timeFor(goal.id),
        steps: goal.plan.steps
          .filter((s) => s.done && snapshot.summary.completed.includes(s.text))
          .map((s) => s.text),
        completed: false,
      }))
      .filter((item) => item.steps.length > 0),
  ];
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
              {planningToday && skipPlanningDate !== snapshot.date ? (
                <TodayPlanner
                  key={snapshot.date}
                  snapshot={snapshot}
                  disabled={busy || !desktop}
                  onDirty={setQuickDirty}
                  save={(ids) => run(() => coreApi.planGoals(ids))}
                  createNew={() => setSkipPlanningDate(snapshot.date)}
                />
              ) : (
                <div className="section-heading today-actions">
                  <GoalFinder
                    snapshot={snapshot}
                    disabled={busy || !desktop}
                    onDirty={setQuickDirty}
                    showRecent={false}
                    create={(title, batch) =>
                      run(() => coreApi.create(title, batch))
                    }
                    addToToday={(id) => run(() => coreApi.today(id, true))}
                  />
                </div>
              )}
              {planningToday && skipPlanningDate === snapshot.date && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setSkipPlanningDate(null)}
                >
                  Choose from previous goals
                </button>
              )}
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
                    onClick={() => void run(() => coreApi.planDay(false))}
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
              {openToday.length > 0 && (
                <GoalOrder
                  goals={openToday}
                  allGoals={snapshot.goals}
                  disabled={busy}
                  reorder={(ids) => run(() => coreApi.reorder(ids))}
                >
                  {(goal) => (
                    <GoalRow
                      goal={goal}
                      snapshot={snapshot}
                      busy={busy}
                      run={run}
                      edit={setEditor}
                      enhancement={enhancement}
                    />
                  )}
                </GoalOrder>
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
          <NoticedWork onChanged={refresh} />
          {(focusedSeconds > 0 || finishedItems.length > 0) && (
            <TodaySummary day={snapshot.summary} items={finishedItems} />
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
      <Toasts />
      <GoalMatchToasts onChanged={refresh} />
    </div>
  );
}
