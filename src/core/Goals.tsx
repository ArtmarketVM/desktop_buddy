import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  Plus,
  Play,
  Pause,
  X,
  MoreHorizontal,
} from "lucide-react";
import { desktop } from "../api/tauri";
import { coreApi } from "./api";
import {
  deadlineISO,
  localDeadline,
  duration,
  type GoalDetails,
  type CoreGoal,
  type CoreSnapshot,
} from "./types";
import {
  AnalysisResult,
  analysisInput,
  type GoalEnhancement,
  type GoalAnalysisResult,
} from "./analysis";

export function GoalRow({
  goal,
  snapshot,
  busy,
  run,
  edit,
  enhancement,
  readOnly = false,
}: {
  goal: CoreGoal;
  snapshot: CoreSnapshot;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
  edit: (goal: CoreGoal) => void;
  enhancement?: GoalEnhancement;
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [stepText, setStepText] = useState("");
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [result, setResult] = useState<GoalAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    request.current += 1;
    setResult(null);
    setAnalysisError("");
    setAnalyzing(false);
  }, [goal.id, goal.plan.revision]);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const done = goal.plan.steps.filter((step) => step.done).length;
  const today = snapshot.today.includes(goal.id);
  const active = snapshot.timer?.goal_id === goal.id;
  const disabled = busy || !desktop || readOnly;
  const area =
    snapshot.areas.find((item) => item.id === goal.area_id)?.title ?? "General";
  const addStep = async (text: string) => {
    if (goal.status !== "open" || !text.trim() || goal.plan.steps.length >= 20)
      return;
    if (
      await run(() =>
        coreApi.save(goal.title, area, {
          ...goal.plan,
          steps: [
            ...goal.plan.steps,
            { id: crypto.randomUUID(), text: text.trim(), done: false },
          ],
        }),
      )
    ) {
      setStepText("");
      setAdding(false);
    }
  };
  const analyze = async (
    handler: NonNullable<GoalEnhancement["onImprove"]>,
  ) => {
    const current = ++request.current;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const next = await handler(analysisInput(goal));
      if (request.current === current) setResult(next);
    } catch (error) {
      if (request.current === current) setAnalysisError(String(error));
    } finally {
      if (request.current === current) setAnalyzing(false);
    }
  };
  return (
    <article
      className={`core-goal ${goal.status}`}
      onContextMenu={(event) => {
        if (!readOnly) {
          event.preventDefault();
          setMenu(true);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setMenu(false);
      }}
    >
      <div className="goal-heading">
        <button
          className="text-button goal-status-icon"
          aria-label={`${goal.status === "completed" ? "Reopen" : "Complete"} ${goal.title}`}
          disabled={disabled}
          onClick={() =>
            void run(() =>
              coreApi.transition(
                goal.id,
                goal.status === "completed" ? "resume" : "complete",
                true,
              ),
            )
          }
        >
          {goal.status === "completed" ? <Check size={15} /> : <span />}
        </button>
        <span className="core-goal-title">
          {goal.title}
          <small>
            {goal.status === "deferred"
              ? "Set aside for later"
              : goal.status === "completed"
                ? "Completed"
                : goal.plan.steps.length
                  ? `${done} of ${goal.plan.steps.length} steps`
                  : "Open goal"}
            {active ? " · Timer running" : ""}
            {goal.due_at && (
              <span
                className={
                  goal.status !== "completed" &&
                  new Date(goal.due_at).getTime() < Date.now()
                    ? "deadline overdue"
                    : "deadline"
                }
              >
                {" "}
                · Due{" "}
                {new Date(goal.due_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            )}
            {goal.priority && <span> · {goal.priority} priority</span>}
          </small>
        </span>
        {goal.focused_seconds > 0 && (
          <span className="goal-time">
            <Clock3 size={12} />
            {duration(goal.focused_seconds)}
          </span>
        )}
        {(goal.tracked_seconds ?? 0) > 0 && (
          <span
            className="goal-time"
            title="Observed foreground activity, separate from the focus timer"
          >
            {duration(goal.tracked_seconds!)} observed
          </span>
        )}
        {!readOnly && (
          <div
            className="goal-overflow"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setMenu(false);
            }}
          >
            <button
              className="text-button"
              aria-label={`More actions for ${goal.title}`}
              aria-expanded={menu}
              disabled={disabled}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <div className="goal-menu" aria-label="Goal actions">
                <button
                  disabled={disabled}
                  onClick={() => {
                    setMenu(false);
                    edit(goal);
                  }}
                >
                  Edit goal
                </button>
                <button
                  disabled={disabled}
                  onClick={() => {
                    setMenu(false);
                    void run(() =>
                      coreApi.transition(
                        goal.id,
                        goal.status === "open" ? "defer" : "resume",
                      ),
                    );
                  }}
                >
                  {goal.status === "open" ? "Set aside" : "Reopen goal"}
                </button>
                <button
                  className="danger-text"
                  disabled={disabled}
                  onClick={() => {
                    setMenu(false);
                    setConfirmDelete(true);
                  }}
                >
                  Delete goal
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="goal-expanded">
        {goal.description && <p className="helper">{goal.description}</p>}
        {goal.plan.done_when && (
          <p className="helper">Done when: {goal.plan.done_when}</p>
        )}
        {goal.plan.steps.length > 0 ? (
          <ul className="core-steps">
            {goal.plan.steps.map((step) => (
              <li key={step.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={step.done}
                    disabled={disabled || goal.status !== "open"}
                    onChange={(event) =>
                      void run(() =>
                        coreApi.save(
                          goal.title,
                          snapshot.areas.find(
                            (area) => area.id === goal.area_id,
                          )?.title ?? "General",
                          {
                            ...goal.plan,
                            steps: goal.plan.steps.map((item) =>
                              item.id === step.id
                                ? { ...item, done: event.target.checked }
                                : item,
                            ),
                            current_step:
                              goal.plan.current_step === step.id &&
                              event.target.checked
                                ? null
                                : goal.plan.current_step,
                          },
                        ),
                      )
                    }
                  />
                  <span className={step.done ? "done" : ""}>{step.text}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="helper">No steps yet.</p>
        )}
        {!readOnly && (
          <div className="goal-actions">
            {goal.status === "open" ? (
              <>
                <button
                  className="text-button"
                  disabled={disabled || goal.plan.steps.length >= 20}
                  onClick={() => setAdding(!adding)}
                >
                  <Plus size={13} />
                  Add step
                </button>
                <button
                  className="text-button"
                  disabled={disabled || (!today && snapshot.today.length >= 3)}
                  onClick={() => void run(() => coreApi.today(goal.id, !today))}
                >
                  {today ? "Remove from Today" : "Add to Today"}
                </button>
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() =>
                    void run(() => coreApi.timer(active ? null : goal.id))
                  }
                >
                  {active ? <Pause size={14} /> : <Play size={14} />}{" "}
                  {active ? "Pause timer" : "Focus timer"}
                </button>
              </>
            ) : (
              <button
                className="text-button"
                disabled={disabled}
                onClick={() =>
                  void run(() => coreApi.transition(goal.id, "resume"))
                }
              >
                Reopen goal
              </button>
            )}
          </div>
        )}
        {adding && (
          <form
            className="inline-step"
            onSubmit={(event) => {
              event.preventDefault();
              void addStep(stepText);
            }}
          >
            <input
              autoFocus
              aria-label={`New step for ${goal.title}`}
              maxLength={500}
              value={stepText}
              disabled={disabled}
              onChange={(event) => setStepText(event.target.value)}
            />
            <button disabled={disabled || !stepText.trim()}>Add</button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setAdding(false);
                setStepText("");
              }}
            >
              Cancel
            </button>
          </form>
        )}
        {!readOnly && (
          <details className="goal-enhancement">
            <summary>Improve / Research</summary>
            <div className="goal-actions">
              <button
                className="text-button"
                disabled={disabled || analyzing || !enhancement?.onImprove}
                onClick={() =>
                  enhancement?.onImprove && void analyze(enhancement.onImprove)
                }
              >
                Improve goal
              </button>
              <button
                className="text-button"
                disabled={disabled || analyzing || !enhancement?.onResearch}
                onClick={() =>
                  enhancement?.onResearch &&
                  void analyze(enhancement.onResearch)
                }
              >
                Research / Check
              </button>
            </div>
            {!enhancement?.onImprove && !enhancement?.onResearch && (
              <p className="helper">AI analysis is not connected yet.</p>
            )}
            {analyzing && <p role="status">Preparing suggestions…</p>}
            {analysisError && <p role="alert">{analysisError}</p>}
            {result && (
              <AnalysisResult
                goalId={goal.id}
                result={result}
                disabled={
                  disabled ||
                  goal.status !== "open" ||
                  goal.plan.steps.length >= 20
                }
                acceptStep={(text) => void addStep(text)}
                acceptTitle={(title) =>
                  void run(() => coreApi.save(title, area, goal.plan))
                }
              />
            )}
          </details>
        )}
        {confirmDelete && (
          <div className="delete-confirm" role="alert">
            <p>Delete this goal, its steps and its local progress history?</p>
            <button
              className="danger-button"
              disabled={disabled}
              onClick={() =>
                void run(() => coreApi.transition(goal.id, "delete", true))
              }
            >
              Delete permanently
            </button>
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => setConfirmDelete(false)}
            >
              Keep goal
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function GoalEditor({
  goal,
  snapshot,
  close,
  save,
  remove,
}: {
  goal: CoreGoal;
  snapshot: CoreSnapshot;
  close: () => void;
  save: (
    title: string,
    area: string,
    plan: CoreGoal["plan"],
    details: GoalDetails,
  ) => Promise<boolean>;
  remove: () => Promise<boolean>;
}) {
  const [title, setTitle] = useState(goal.title);
  const [area, setArea] = useState(
    snapshot.areas.find((a) => a.id === goal.area_id)?.title ?? "General",
  );
  const [plan, setPlan] = useState(goal.plan);
  const [due, setDue] = useState(localDeadline(goal.due_at));
  const [priority, setPriority] = useState<GoalDetails["priority"]>(
    goal.priority ?? null,
  );
  const [description, setDescription] = useState(goal.description ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)",
        ) ?? [],
      );
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  async function commit() {
    setBusy(true);
    try {
      if (
        await save(title, area, plan, {
          due_at: deadlineISO(due),
          priority,
          description,
        })
      )
        close();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-overlay"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) close();
      }}
    >
      <section
        className="core-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-editor-title"
      >
        <div className="section-heading">
          <h2 id="goal-editor-title">Edit goal</h2>
          <button
            className="text-button"
            aria-label="Close goal editor"
            disabled={busy}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <fieldset disabled={busy}>
          <label>
            Goal
            <input
              autoFocus
              value={title}
              maxLength={500}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Area
            <input
              list="core-area-options"
              maxLength={80}
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
            <datalist id="core-area-options">
              {snapshot.areas.map((a) => (
                <option key={a.id}>{a.title}</option>
              ))}
            </datalist>
          </label>
          <label>
            Done when (optional)
            <input
              maxLength={500}
              value={plan.done_when}
              onChange={(e) => setPlan({ ...plan, done_when: e.target.value })}
            />
          </label>
          <label>
            Deadline (optional)
            <input
              type="datetime-local"
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
          </label>
          <label>
            Priority
            <select
              value={priority ?? ""}
              onChange={(event) =>
                setPriority(
                  (event.target.value || null) as GoalDetails["priority"],
                )
              }
            >
              <option value="">No priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Description (optional)
            <textarea
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="edit-steps">
            {plan.steps.map((step, index) => (
              <div key={step.id}>
                <input
                  aria-label={`Step ${index + 1}`}
                  maxLength={500}
                  value={step.text}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      steps: plan.steps.map((s) =>
                        s.id === step.id ? { ...s, text: e.target.value } : s,
                      ),
                    })
                  }
                />
                <button
                  className="text-button"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() =>
                    setPlan({
                      ...plan,
                      steps: plan.steps.filter((s) => s.id !== step.id),
                      current_step:
                        plan.current_step === step.id
                          ? null
                          : plan.current_step,
                    })
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="text-button"
            disabled={plan.steps.length >= 20}
            onClick={() =>
              setPlan({
                ...plan,
                steps: [
                  ...plan.steps,
                  { id: crypto.randomUUID(), text: "", done: false },
                ],
              })
            }
          >
            <Plus size={14} />
            Add a step
          </button>
        </fieldset>
        <div className="settings-actions">
          <button
            disabled={
              busy ||
              !title.trim() ||
              plan.steps.some((step) => !step.text.trim())
            }
            onClick={() => void commit()}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button className="text-button" disabled={busy} onClick={close}>
            Discard changes
          </button>
          <button
            className="text-button danger-text"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            Delete goal
          </button>
        </div>
        {confirmDelete && (
          <div className="delete-confirm">
            <p>Delete this goal, its steps and its local progress history?</p>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void remove()
                  .then((ok) => {
                    if (ok) close();
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Delete permanently
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              Keep goal
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export function GoalAreas({
  snapshot,
  busy,
  run,
  edit,
  enhancement,
}: {
  snapshot: CoreSnapshot;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
  edit: (goal: CoreGoal) => void;
  enhancement?: GoalEnhancement;
}) {
  const [showFinished, setShowFinished] = useState(false);
  const visible = snapshot.goals.filter(
    (goal) => showFinished || goal.status !== "completed",
  );
  return (
    <section className="core-section" aria-label="Goals and areas">
      <div className="section-heading">
        <h2>All goals</h2>
        <label className="small-check">
          <input
            type="checkbox"
            checked={showFinished}
            onChange={(e) => setShowFinished(e.target.checked)}
          />
          Include completed
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="empty-copy">
          A little space for what matters. Add your first goal above.
        </p>
      ) : (
        snapshot.areas
          .filter((area) => visible.some((g) => g.area_id === area.id))
          .map((area) => (
            <details className="core-area" key={area.id} open>
              <summary>
                <ChevronRight size={15} />
                {area.title}
                <span>
                  {visible.filter((g) => g.area_id === area.id).length}
                </span>
              </summary>
              <div>
                {visible
                  .filter((g) => g.area_id === area.id)
                  .map((goal) => (
                    <GoalRow
                      key={goal.id}
                      goal={goal}
                      snapshot={snapshot}
                      busy={busy}
                      run={run}
                      edit={edit}
                      enhancement={enhancement}
                    />
                  ))}
              </div>
            </details>
          ))
      )}
    </section>
  );
}
