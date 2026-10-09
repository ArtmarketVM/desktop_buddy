import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Plus, X, MoreHorizontal } from "lucide-react";
import { desktop } from "../api/tauri";
import { coreApi } from "./api";
import { GoalOrder } from "./GoalOrder";
import {
  deadlineISO,
  localDeadline,
  type GoalDetails,
  type CoreGoal,
  type CoreSnapshot,
} from "./types";
import { AnalysisResult, type GoalEnhancement } from "./analysis";

export function mergeSuggestedSteps(
  existing: CoreGoal["plan"]["steps"],
  titles: string[],
) {
  const seen = new Set(existing.map((s) => s.text.trim().toLocaleLowerCase()));
  const additions = titles
    .filter((title) => {
      const key = title.trim().toLocaleLowerCase();
      if (!key || title.length > 500 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(0, 20 - existing.length))
    .map((text) => ({
      id: crypto.randomUUID(),
      text: text.trim(),
      done: false,
    }));
  return [...existing, ...additions];
}
export function GoalRow({
  goal,
  snapshot,
  busy,
  run,
  edit,
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
  const [expanded, setExpanded] = useState(true);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stepText, setStepText] = useState("");
  const disabled = busy || !desktop || readOnly;
  const today = snapshot.today.includes(goal.id);
  const active = snapshot.focused_goal_id === goal.id;
  const area =
    snapshot.areas.find((item) => item.id === goal.area_id)?.title ?? "General";
  async function addSteps(titles: string[]) {
    const ok = await run(() =>
      coreApi.save(goal.title, area, {
        ...goal.plan,
        steps: mergeSuggestedSteps(goal.plan.steps, titles),
      }),
    );
    if (ok) setStepText("");
    return ok;
  }
  const suggestions = goal.analysis?.result;
  return (
    <article
      className={`core-goal ${goal.status}`}
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
        <button
          className="text-button core-goal-title goal-expand-toggle"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            if (today && !active && !disabled)
              void run(() => coreApi.focus(goal.id));
          }}
        >
          <ChevronRight size={14} className={expanded ? "rotated" : ""} />
          {goal.title}
        </button>
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
                    window.dispatchEvent(
                      new CustomEvent("buddy:ask-goal", { detail: goal }),
                    );
                  }}
                >
                  Ask Buddy about this
                </button>
                <button
                  disabled={disabled || (!today && snapshot.today.length >= 3)}
                  onClick={() => {
                    setMenu(false);
                    void run(() => coreApi.today(goal.id, !today));
                  }}
                >
                  {today ? "Remove from Today" : "Add to Today"}
                </button>
                {today && (
                  <button
                    disabled={disabled || active}
                    onClick={() => {
                      setMenu(false);
                      void run(() => coreApi.focus(goal.id));
                    }}
                  >
                    {active ? "Current goal" : "Focus on this goal"}
                  </button>
                )}
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
      <div className="goal-expanded" hidden={!expanded}>
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
                      coreApi.save(goal.title, area, {
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
                      }),
                    )
                  }
                />
                <span className={step.done ? "done" : ""}>{step.text}</span>
              </label>
              {!readOnly && goal.status === "open" && (
                <details className="step-menu">
                  <summary aria-label={`Actions for step: ${step.text}`}>
                    <MoreHorizontal size={15} />
                  </summary>
                  <div className="goal-menu">
                    <button disabled={disabled} onClick={() => edit(goal)}>
                      Edit step
                    </button>
                    <button
                      disabled={disabled}
                      onClick={() =>
                        void run(() =>
                          coreApi.save(goal.title, area, {
                            ...goal.plan,
                            steps: goal.plan.steps.filter(
                              (item) => item.id !== step.id,
                            ),
                            current_step:
                              goal.plan.current_step === step.id
                                ? null
                                : goal.plan.current_step,
                          }),
                        )
                      }
                    >
                      Delete step
                    </button>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && suggestions && goal.status === "open" && (
          <AnalysisResult
            goalId={goal.id}
            capacity={20 - goal.plan.steps.length}
            compact
            result={{
              ...suggestions,
              suggestedSteps: suggestions.suggestedSteps?.filter(
                (step) =>
                  !goal.plan.steps.some(
                    (existing) =>
                      existing.text.trim().toLocaleLowerCase() ===
                      step.title.trim().toLocaleLowerCase(),
                  ),
              ),
            }}
            disabled={disabled}
            acceptTitle={() => {}}
            acceptStep={(text) => addSteps([text])}
            acceptSteps={addSteps}
          />
        )}
        {!readOnly && goal.status === "open" && (
          <form
            className="inline-step"
            onSubmit={(event) => {
              event.preventDefault();
              if (stepText.trim()) void addSteps([stepText]);
            }}
          >
            <input
              aria-label={`New step for ${goal.title}`}
              placeholder="Add your own step…"
              maxLength={500}
              value={stepText}
              disabled={disabled || goal.plan.steps.length >= 20}
              onChange={(event) => setStepText(event.target.value)}
            />
            <button
              className="text-button"
              disabled={
                disabled || !stepText.trim() || goal.plan.steps.length >= 20
              }
            >
              <Plus size={14} />
              Add
            </button>
          </form>
        )}
        {!readOnly && goal.analysis?.state === "failed" && (
          <p className="helper" role="alert">
            {goal.analysis.message}
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => void run(() => coreApi.retryAnalysis(goal.id))}
            >
              Retry suggestions
            </button>
          </p>
        )}
      </div>
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
    </article>
  );
}

export function GoalEditor({
  goal,
  snapshot,
  close,
  save,
  remove,
  error = "",
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
  error?: string;
}) {
  const [title, setTitle] = useState(goal.title);
  const [saveError, setSaveError] = useState("");
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
    setSaveError("");
    try {
      if (
        await save(title, area, plan, {
          due_at: deadlineISO(due),
          priority,
          description,
        })
      )
        close();
    } catch (e) {
      setSaveError(String(e));
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
        {(error || saveError) && (
          <p className="error" role="alert">
            {saveError || error}
          </p>
        )}
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
                <GoalOrder
                  goals={visible.filter((g) => g.area_id === area.id)}
                  allGoals={snapshot.goals}
                  disabled={busy}
                  reorder={(ids) => void run(() => coreApi.reorder(ids))}
                >
                  {(goal) => (
                    <GoalRow
                      key={goal.id}
                      goal={goal}
                      snapshot={snapshot}
                      busy={busy}
                      run={run}
                      edit={edit}
                      enhancement={enhancement}
                    />
                  )}
                </GoalOrder>
              </div>
            </details>
          ))
      )}
    </section>
  );
}
