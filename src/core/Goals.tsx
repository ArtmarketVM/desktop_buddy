import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, X, MoreHorizontal } from "lucide-react";
import { desktop } from "../api/tauri";
import { coreApi } from "./api";
import { aiApi } from "../ai/api";
import { GoalWorkContext } from "./GoalWorkContext";
import { GoalOrder } from "./GoalOrder";
import { useDismissiblePopover } from "../components/useDismissiblePopover";
import {
  deadlineISO,
  localDeadline,
  sentenceCase,
  type GoalDetails,
  type CoreGoal,
  type CoreSnapshot,
} from "./types";
import { type GoalEnhancement } from "./analysis";

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
function stepCount(count: number) {
  return `${count} ${count === 1 ? "step" : "steps"}`;
}
/** Same goal title line as GoalRow, for lists that only need to show or pick a goal. */
export function GoalLine({
  goal,
  children,
}: {
  goal: CoreGoal;
  children?: ReactNode;
}) {
  return (
    <div className="core-goal">
      <div className="goal-heading">
        <span className="core-goal-title">
          {sentenceCase(goal.title)}
          <small>{stepCount(goal.plan.steps.length)}</small>
        </span>
        {children}
      </div>
    </div>
  );
}
/** Read-only steps, drawn exactly like the steps inside GoalRow. */
export function StepsPreview({ steps }: { steps: CoreGoal["plan"]["steps"] }) {
  return (
    <ul className="core-steps">
      {steps.map((step) => (
        <li key={step.id}>
          <div className="step-line">
            <input
              type="checkbox"
              aria-label={step.text}
              checked={step.done}
              disabled
              readOnly
            />
            <span className={step.done ? "done" : ""}>
              {sentenceCase(step.text)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
export function GoalRow({
  goal,
  snapshot,
  busy,
  run,
  edit,
  readOnly = false,
  showStatus = true,
  initialExpanded = false,
  initialAdding = false,
}: {
  goal: CoreGoal;
  snapshot: CoreSnapshot;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
  edit: (goal: CoreGoal) => void;
  enhancement?: GoalEnhancement;
  readOnly?: boolean;
  showStatus?: boolean;
  initialExpanded?: boolean;
  initialAdding?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const {
    open: menu,
    setOpen: setMenu,
    rootRef: menuRoot,
    surfaceRef: menuSurface,
    triggerRef: menuTrigger,
    id: menuId,
  } = useDismissiblePopover();
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!menu || !menuSurface.current || !menuTrigger.current) return;
    menuSurface.current
      .querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const anchor = menuTrigger.current.getBoundingClientRect();
    const panel = menuSurface.current.getBoundingClientRect();
    const left =
      anchor.right + panel.width + 8 < window.innerWidth - 12
        ? anchor.right + 8
        : anchor.left - panel.width - 8;
    setMenuPosition({
      left: Math.max(12, left),
      top: Math.max(
        12,
        Math.min(anchor.top, window.innerHeight - panel.height - 12),
      ),
    });
  }, [menu]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stepText, setStepText] = useState("");
  const [adding, setAdding] = useState(initialAdding);
  const [highlight, setHighlight] = useState(-1);
  const [finding, setFinding] = useState(false);
  const [completions, setCompletions] = useState<{
    prefix: string;
    items: string[];
  }>({ prefix: "", items: [] });
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
  const completeGoal = () =>
    run(() => coreApi.transition(goal.id, "complete", true));
  const suggestions = goal.analysis?.result;
  const typed = stepText.trim().toLocaleLowerCase();
  const taken = new Set(
    goal.plan.steps.map((step) => step.text.trim().toLocaleLowerCase()),
  );
  const aiIdeas = [
    ...(typed && completions.prefix && typed.startsWith(completions.prefix)
      ? completions.items
      : []),
    ...(suggestions?.suggestedSteps ?? []).map((step) => step.title),
  ];
  const earlierSteps = typed
    ? snapshot.goals.flatMap((item) => item.plan.steps.map((step) => step.text))
    : [];
  const ideas = [
    ...new Set([...aiIdeas, ...earlierSteps].map((title) => title.trim())),
  ]
    .filter((title) => {
      const lower = title.toLocaleLowerCase();
      return (
        title.length > 0 &&
        title.length <= 500 &&
        !taken.has(lower) &&
        lower !== typed &&
        (!typed || lower.startsWith(typed))
      );
    })
    .slice(0, typed ? 4 : 3)
    .map((title) => ({ title }));
  useEffect(() => {
    const prefix = stepText.trim().toLocaleLowerCase();
    if (!adding || !desktop || !prefix) {
      setFinding(false);
      return;
    }
    let current = true;
    setFinding(true);
    const timer = setTimeout(() => {
      void aiApi
        .completeStep(goal.id, stepText.trim())
        .then((items) => {
          if (current) setCompletions({ prefix, items });
        })
        .catch(() => {})
        .finally(() => {
          if (current) setFinding(false);
        });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [stepText, adding, goal.id]);
  return (
    <article className={`core-goal ${goal.status}`}>
      <div className="goal-heading">
        {!readOnly && (
          <div className="goal-overflow" ref={menuRoot}>
            <button
              ref={menuTrigger}
              className="text-button"
              aria-label={`More actions for ${goal.title}`}
              aria-expanded={menu}
              aria-controls={menu ? menuId : undefined}
              disabled={disabled}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menu &&
              createPortal(
                <div
                  ref={menuSurface}
                  style={menuPosition}
                  id={menuId}
                  className="goal-menu goal-actions-popover"
                  role="group"
                  aria-label="Goal actions"
                >
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
                    disabled={disabled}
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
                  {goal.status === "open" && (
                    <button
                      disabled={disabled}
                      onClick={() => {
                        setMenu(false);
                        void completeGoal();
                      }}
                    >
                      Mark complete
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
                </div>,
                document.body,
              )}
          </div>
        )}
        {readOnly && <span className="goal-overflow" aria-hidden="true" />}
        {showStatus && (
          <button
            className="text-button goal-status-icon"
            aria-label={`${goal.status === "completed" ? "Reopen" : "Complete"} ${goal.title}`}
            disabled={busy || !desktop}
            onClick={() =>
              void (goal.status === "completed"
                ? run(() => coreApi.transition(goal.id, "resume", true))
                : completeGoal())
            }
          >
            {goal.status === "completed" ? <Check size={12} /> : <span />}
          </button>
        )}
        <button
          className="text-button core-goal-title goal-expand-toggle"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            if (today && goal.status === "open" && !active && !disabled)
              void run(() => coreApi.focus(goal.id));
          }}
        >
          {sentenceCase(goal.title)}
          <small>
            {goal.plan.steps.length}{" "}
            {goal.plan.steps.length === 1 ? "step" : "steps"}
          </small>
          <ChevronDown
            size={16}
            className={`goal-chevron ${expanded ? "rotated" : ""}`}
          />
        </button>
        <GoalWorkContext
          goal={goal}
          busy={busy}
          run={run}
          readOnly={readOnly}
        />
      </div>
      <div className="goal-expanded" hidden={!expanded}>
        <ul className="core-steps">
          {goal.plan.steps.map((step) => (
            <li key={step.id}>
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
              <div className="step-line">
                <input
                  type="checkbox"
                  aria-label={step.text}
                  checked={step.done || goal.status === "completed"}
                  disabled={
                    disabled ||
                    (goal.status !== "open" && goal.status !== "completed")
                  }
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
                <span
                  className={
                    step.done || goal.status === "completed" ? "done" : ""
                  }
                >
                  {sentenceCase(step.text)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {!readOnly && goal.status === "open" && !adding && (
          <button
            className="text-button add-step"
            disabled={disabled || goal.plan.steps.length >= 20}
            onClick={() => setAdding(true)}
          >
            <Plus size={14} />
            Add a step
          </button>
        )}
        {!readOnly && goal.status === "open" && adding && (
          <div className="add-step-panel">
            <form
              className="add-step-row"
              onSubmit={(event) => {
                event.preventDefault();
                const pick = ideas[highlight];
                const text = pick ? pick.title : stepText;
                if (text.trim()) void addSteps([text]);
              }}
            >
              <span className="add-step-box" aria-hidden="true" />
              <input
                autoFocus
                aria-label={`New step for ${goal.title}`}
                placeholder="Type a step…"
                maxLength={500}
                value={stepText}
                disabled={disabled || goal.plan.steps.length >= 20}
                onChange={(event) => {
                  setStepText(event.target.value);
                  setHighlight(-1);
                }}
                onBlur={() => {
                  if (!stepText.trim()) setAdding(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setStepText("");
                    setAdding(false);
                  } else if (
                    (event.key === "Backspace" || event.key === "Delete") &&
                    !stepText
                  ) {
                    event.preventDefault();
                    setAdding(false);
                  } else if (event.key === "Tab" && ideas.length && typed) {
                    event.preventDefault();
                    setStepText(ideas[Math.max(highlight, 0)].title);
                    setHighlight(-1);
                  } else if (event.key === "ArrowDown" && ideas.length) {
                    event.preventDefault();
                    setHighlight((highlight + 1) % ideas.length);
                  } else if (event.key === "ArrowUp" && ideas.length) {
                    event.preventDefault();
                    setHighlight((highlight - 1 + ideas.length) % ideas.length);
                  }
                }}
              />
            </form>
            {(ideas.length > 0 ||
              finding ||
              (!suggestions &&
                ["queued", "working", "failed"].includes(
                  goal.analysis?.state ?? "",
                ))) && (
              <div
                className="ideas-menu"
                role="listbox"
                aria-label="Step ideas"
                onMouseDown={(event) => event.preventDefault()}
              >
                <p className="ideas-label">Ideas</p>
                {ideas.map((idea, index) => (
                  <button
                    key={idea.title}
                    role="option"
                    aria-selected={index === highlight}
                    className={index === highlight ? "highlighted" : ""}
                    disabled={disabled}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => void addSteps([idea.title])}
                  >
                    {typed && (
                      <span className="idea-typed">
                        {idea.title.slice(0, typed.length)}
                      </span>
                    )}
                    {idea.title.slice(typed.length)}
                  </button>
                ))}
                {finding ? (
                  <p className="ideas-note ideas-loading" role="status">
                    Finding ideas<span aria-hidden="true">...</span>
                  </p>
                ) : (
                  !suggestions &&
                  goal.analysis?.state !== "failed" && (
                    <p className="ideas-note">Looking for ideas…</p>
                  )
                )}
                {goal.analysis?.state === "failed" && (
                  <p className="ideas-note" role="alert">
                    Couldn't load ideas.{" "}
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() =>
                        void run(() => coreApi.retryAnalysis(goal.id))
                      }
                    >
                      Retry
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>
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
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const matches = (goal: CoreGoal) =>
    !normalized ||
    goal.title.toLocaleLowerCase().includes(normalized) ||
    goal.plan.steps.some((step) =>
      step.text.toLocaleLowerCase().includes(normalized),
    );
  const active = snapshot.goals.filter(
    (goal) => goal.status === "open" && matches(goal),
  );
  const archive = snapshot.goals.filter(
    (goal) => goal.status !== "open" && matches(goal),
  );
  return (
    <section className="core-section goal-log" aria-label="Goals">
      <label className="goal-search">
        <span className="sr-only">Search goals</span>
        <input
          type="search"
          placeholder="Search..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="goal-log-part">
        <h2>Active</h2>
        {active.length === 0 ? (
          <p className="empty-copy">
            {query
              ? "No matches for that search."
              : "A little space for what matters. Add your first item above."}
          </p>
        ) : (
          <GoalOrder
            goals={active}
            allGoals={snapshot.goals}
            disabled={busy || !!query}
            reorder={(ids) => run(() => coreApi.reorder(ids))}
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
                initialExpanded={false}
              />
            )}
          </GoalOrder>
        )}
      </div>
      <div className="goal-log-part">
        <h2>Archive</h2>
        {archive.length === 0 ? (
          <p className="empty-copy">
            {query
              ? "No matches for that search."
              : "Completed and set-aside items will appear here."}
          </p>
        ) : (
          archive.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              snapshot={snapshot}
              busy={busy}
              run={run}
              edit={edit}
              enhancement={enhancement}
              readOnly={goal.status === "completed"}
              initialExpanded={false}
            />
          ))
        )}
      </div>
    </section>
  );
}
