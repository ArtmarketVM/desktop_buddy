import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  Plus,
  Play,
  Pause,
  Pencil,
  X,
} from "lucide-react";
import { desktop } from "../api/tauri";
import { coreApi } from "./api";
import { duration, type CoreGoal, type CoreSnapshot } from "./types";

export function GoalRow({
  goal,
  snapshot,
  busy,
  run,
  edit,
}: {
  goal: CoreGoal;
  snapshot: CoreSnapshot;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
  edit: (goal: CoreGoal) => void;
}) {
  const done = goal.plan.steps.filter((step) => step.done).length;
  const today = snapshot.today.includes(goal.id);
  const active = snapshot.timer?.goal_id === goal.id;
  const disabled = busy || !desktop;
  return (
    <details className={`core-goal ${goal.status}`}>
      <summary>
        <ChevronRight size={15} />
        <span className="goal-status-icon">
          {goal.status === "completed" ? <Check size={15} /> : <span />}
        </span>
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
          </small>
        </span>
        {goal.focused_seconds > 0 && (
          <span className="goal-time">
            <Clock3 size={12} />
            {duration(goal.focused_seconds)}
          </span>
        )}
      </summary>
      <div className="goal-expanded">
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
          <p className="helper">
            A small next step can make this easier to start.
          </p>
        )}
        <div className="goal-actions">
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => edit(goal)}
          >
            <Pencil size={13} />
            Edit goal and steps
          </button>
          {goal.status === "open" ? (
            <>
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
              <button
                className="text-button"
                disabled={disabled}
                onClick={() =>
                  void run(() => coreApi.transition(goal.id, "complete", true))
                }
              >
                Complete goal
              </button>
              <button
                className="text-button"
                disabled={disabled}
                onClick={() =>
                  void run(() => coreApi.transition(goal.id, "defer"))
                }
              >
                Later
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
      </div>
    </details>
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
  ) => Promise<boolean>;
  remove: () => Promise<boolean>;
}) {
  const [title, setTitle] = useState(goal.title);
  const [area, setArea] = useState(
    snapshot.areas.find((a) => a.id === goal.area_id)?.title ?? "General",
  );
  const [plan, setPlan] = useState(goal.plan);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled)",
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
      if (await save(title, area, plan)) close();
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
}: {
  snapshot: CoreSnapshot;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
  edit: (goal: CoreGoal) => void;
}) {
  const [showFinished, setShowFinished] = useState(false);
  const visible = snapshot.goals.filter(
    (goal) => showFinished || goal.status !== "completed",
  );
  return (
    <section className="core-section" aria-label="Goals and areas">
      <div className="section-heading">
        <h2>Goals / Areas</h2>
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
                    />
                  ))}
              </div>
            </details>
          ))
      )}
    </section>
  );
}
