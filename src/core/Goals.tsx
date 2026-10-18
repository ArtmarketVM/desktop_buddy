import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Plus,
  Search,
  X,
  MoreHorizontal,
} from "lucide-react";
import { desktop } from "../api/tauri";
import { coreApi } from "./api";
import { aiApi } from "../ai/api";
import { PriorityPicker } from "./Priority";
import { InlineText } from "./InlineText";
import { DeadlinePanel, DeadlinePicker } from "./DeadlinePicker";
import { toast } from "../components/Toasts";
import { memoryApi } from "../api/memory";
import { GoalOrder } from "./GoalOrder";
import { Pager, usePage } from "./Pager";
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
export function stepCount(count: number) {
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
  const [forgetArmed, setForgetArmed] = useState(false);
  useEffect(() => {
    if (!menu) setForgetArmed(false);
  }, [menu]);
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
  const [stepText, setStepText] = useState("");
  const [adding, setAdding] = useState(initialAdding);
  const [highlight, setHighlight] = useState(-1);
  const [finding, setFinding] = useState(false);
  const [ideasOutcome, setIdeasOutcome] = useState<"idle" | "none" | "failed">(
    "idle",
  );
  const [ideasError, setIdeasError] = useState("");
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
  const deleteWithUndo = async () => {
    let backup = 0;
    const ok = await run(async () => {
      backup = await coreApi.deleteGoal(goal.id);
    });
    if (!ok) return;
    toast({
      message: `Deleted “${sentenceCase(goal.title)}”`,
      undo: () => run(() => coreApi.restoreGoal(backup)),
    });
  };
  const removeStep = (id: string) =>
    run(() =>
      coreApi.save(goal.title, area, {
        ...goal.plan,
        steps: goal.plan.steps.filter((item) => item.id !== id),
        current_step:
          goal.plan.current_step === id ? null : goal.plan.current_step,
      }),
    );
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
    setIdeasOutcome("idle");
    const timer = setTimeout(() => {
      void aiApi
        .completeStep(goal.id, stepText.trim())
        .then((items) => {
          if (!current) return;
          setCompletions({ prefix, items });
          setIdeasOutcome(items.length ? "idle" : "none");
        })
        .catch((error) => {
          console.warn("Step ideas unavailable", error);
          if (!current) return;
          setIdeasOutcome("failed");
          setIdeasError(typeof error === "string" ? error : "");
        })
        .finally(() => {
          if (current) setFinding(false);
        });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [stepText, adding, goal.id]);
  const toggleFromBlankSpace = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "button, input, textarea, a, [contenteditable], .inline-text, .priority-picker, .goal-meta-wrap, .goal-overflow",
      )
    )
      return;
    setExpanded(!expanded);
  };
  return (
    <article className={`core-goal ${goal.status}`}>
      <div className="goal-heading" onClick={toggleFromBlankSpace}>
        {!readOnly && (
          <div className="goal-overflow" ref={menuRoot}>
            <button
              ref={menuTrigger}
              className="text-button"
              aria-label={`More actions for ${goal.title}`}
              title="Click for actions · hold to drag"
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
                      void run(() => coreApi.today(goal.id, !today));
                    }}
                  >
                    {today ? "Remove from Today" : "Add to Today"}
                  </button>
                  <button
                    disabled={disabled}
                    onClick={() => {
                      // Forgetting is permanent, so the first click only arms the item.
                      if (!forgetArmed) {
                        setForgetArmed(true);
                        return;
                      }
                      setForgetArmed(false);
                      setMenu(false);
                      void run(() => memoryApi.clearGoal(goal.id)).then(
                        (ok) => {
                          if (ok)
                            toast({
                              message: `Forgot what sumi remembered about “${sentenceCase(goal.title)}”`,
                            });
                        },
                      );
                    }}
                  >
                    {forgetArmed
                      ? "Click again to forget"
                      : "Forget what sumi remembers about this goal"}
                  </button>
                  <button
                    className="danger-text"
                    disabled={disabled}
                    onClick={() => {
                      setMenu(false);
                      void deleteWithUndo();
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
                ? run(async () => {
                    await coreApi.transition(goal.id, "resume", true);
                    if (!today) await coreApi.today(goal.id, true);
                  })
                : completeGoal())
            }
          >
            {goal.status === "completed" ? <Check size={12} /> : <span />}
          </button>
        )}
        <div className="core-goal-title goal-title-row">
          <InlineText
            value={goal.title}
            display={sentenceCase(goal.title)}
            label={`Goal title: ${goal.title}`}
            disabled={disabled || goal.status !== "open"}
            onSave={(text) =>
              void run(() => coreApi.save(text, area, goal.plan))
            }
            onDelete={() =>
              void run(() => coreApi.transition(goal.id, "delete", true))
            }
          />
          {!readOnly && goal.status === "open" && (
            <PriorityPicker
              priority={goal.priority}
              disabled={disabled}
              label={goal.title}
              onChange={(priority) =>
                void run(() => coreApi.priority(goal.id, priority))
              }
            />
          )}
          <small>
            {goal.plan.steps.length}{" "}
            {goal.plan.steps.length === 1 ? "step" : "steps"}
          </small>
          {goal.status === "open" && (
            <GoalMeta goal={goal} onToday={today} area={area} run={run} />
          )}
        </div>
        <button
          type="button"
          className="text-button goal-expand-toggle"
          aria-label={`${expanded ? "Hide" : "Show"} steps for ${goal.title}`}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown
            size={16}
            className={`goal-chevron ${expanded ? "rotated" : ""}`}
          />
        </button>
      </div>
      <div className="goal-expanded" hidden={!expanded}>
        <ul className="core-steps">
          {goal.plan.steps.map((step) => (
            <li key={step.id}>
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
                <InlineText
                  value={step.text}
                  display={sentenceCase(step.text)}
                  label={`Step: ${step.text}`}
                  className={
                    step.done || goal.status === "completed" ? "done" : ""
                  }
                  disabled={disabled || goal.status !== "open"}
                  onSave={(text) =>
                    void run(() =>
                      coreApi.save(goal.title, area, {
                        ...goal.plan,
                        steps: goal.plan.steps.map((item) =>
                          item.id === step.id ? { ...item, text } : item,
                        ),
                      }),
                    )
                  }
                  onDelete={() => void removeStep(step.id)}
                />
                {!readOnly && goal.status === "open" && (
                  <button
                    type="button"
                    className="text-button step-remove"
                    aria-label={`Remove step: ${step.text}`}
                    title="Remove step"
                    disabled={disabled}
                    onClick={() => void removeStep(step.id)}
                  >
                    <X size={13} />
                  </button>
                )}
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
              (typed && ideasOutcome !== "idle") ||
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
                ) : typed && ideasOutcome === "failed" ? (
                  <p className="ideas-note" role="status">
                    {ideasError || "Ideas are unavailable right now."} Press
                    Enter to add the step as typed.
                  </p>
                ) : typed && ideasOutcome === "none" && ideas.length === 0 ? (
                  <p className="ideas-note" role="status">
                    No ideas for this yet. Keep typing or press Enter to add it.
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
  const title = goal.title;
  const [saveError, setSaveError] = useState("");
  const [minutes, setMinutes] = useState(
    goal.estimated_minutes ? String(goal.estimated_minutes) : "",
  );
  const [area, setArea] = useState(
    snapshot.areas.find((a) => a.id === goal.area_id)?.title ?? "General",
  );
  const [plan, setPlan] = useState(goal.plan);
  const priority = goal.priority ?? null;
  const [due, setDue] = useState(localDeadline(goal.due_at));
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
      const parsed = minutes.trim() ? Number(minutes) : null;
      if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1)) {
        setSaveError("Use whole minutes, at least 1.");
        return;
      }
      if (parsed !== (goal.estimated_minutes ?? null))
        await coreApi.estimate(goal.id, parsed);
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
          <h2 id="goal-editor-title">Goal details</h2>
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
          <div className="field">
            <span className="field-label">Deadline (optional)</span>
            <DeadlinePicker value={due} onChange={setDue} />
          </div>
          <label>
            Estimated time (minutes, optional)
            <input
              type="number"
              min={1}
              max={100000}
              placeholder="For example 90"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          <label>
            Description (optional)
            <textarea
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </fieldset>
        {(error || saveError) && (
          <p className="error" role="alert">
            {saveError || error}
          </p>
        )}
        <div className="settings-actions">
          <button disabled={busy} onClick={() => void commit()}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="text-button" disabled={busy} onClick={close}>
            Cancel
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
  const activePage = usePage(active, normalized);
  const archivePage = usePage(archive, normalized);
  return (
    <section className="core-section goal-log" aria-label="Goals">
      <form
        className="goal-finder goal-search"
        onSubmit={(event) => {
          event.preventDefault();
          const title = query.trim();
          if (!title || busy || !desktop) return;
          void run(() => coreApi.create(title)).then((ok) => {
            if (ok) setQuery("");
          });
        }}
      >
        <div className="quick-goal search-field">
          <Search size={16} aria-hidden="true" className="search-field-icon" />
          <input
            type="search"
            aria-label="Search or add a goal"
            placeholder="Search your goals, or type a new one…"
            maxLength={500}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button disabled={busy || !desktop || !query.trim()}>Add goal</button>
        </div>
      </form>
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
            goals={activePage.visible}
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
        <Pager
          page={activePage.page}
          pages={activePage.pages}
          onChange={activePage.setPage}
          label="Active goals"
        />
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
          archivePage.visible.map((goal) => (
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
        <Pager
          page={archivePage.page}
          pages={archivePage.pages}
          onChange={archivePage.setPage}
          label="Archive"
        />
      </div>
    </section>
  );
}

/** Deadline and expected time after the title; click opens the date, time and estimate popover.
 *  Today goals without a deadline are shown as due today. */
export function GoalMeta({
  goal,
  onToday,
  area,
  run,
}: {
  goal: CoreGoal;
  onToday: boolean;
  area: string;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
}) {
  const { open, setOpen, rootRef, surfaceRef, triggerRef, id } =
    useDismissiblePopover();
  const [minutes, setMinutes] = useState(
    goal.estimated_minutes ? String(goal.estimated_minutes) : "",
  );
  useEffect(() => {
    setMinutes(goal.estimated_minutes ? String(goal.estimated_minutes) : "");
  }, [goal.estimated_minutes]);
  const now = new Date();
  const due = goal.due_at ? new Date(goal.due_at) : null;
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  let deadline = "";
  let overdue = false;
  if (due && !Number.isNaN(due.getTime())) {
    overdue = due.getTime() < now.getTime();
    deadline = sameDay(due, now)
      ? "due today"
      : `due ${due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  } else if (onToday) {
    deadline = "due today";
  }
  const estimated = goal.estimated_minutes ?? null;
  const estimate =
    estimated === null
      ? (goal.analysis?.result?.estimatedDuration ?? "")
      : estimated >= 60
        ? `~${Math.round((estimated / 60) * 10) / 10} h`
        : `~${estimated} min`;
  const label =
    [deadline, estimate].filter(Boolean).join(" · ") || "set deadline";
  function saveDeadline(local: string) {
    void run(() =>
      coreApi.save(goal.title, area, goal.plan, {
        due_at: deadlineISO(local),
        priority: goal.priority ?? null,
        description: goal.description ?? "",
      }),
    );
  }
  function saveEstimate() {
    const text = minutes.trim();
    const parsed = text ? Number(text) : null;
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1)) return;
    if (parsed !== (goal.estimated_minutes ?? null))
      void run(() => coreApi.estimate(goal.id, parsed));
  }
  return (
    <span className="goal-meta-wrap" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`text-button goal-meta ${overdue ? "overdue" : ""}`}
        title="Deadline and expected time"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div
          className="period-popover deadline-popover goal-meta-popover"
          id={id}
          ref={surfaceRef}
          role="dialog"
          aria-label={`Deadline for ${goal.title}`}
        >
          <DeadlinePanel
            value={localDeadline(goal.due_at)}
            onChange={saveDeadline}
            onDone={() => setOpen(false)}
            extra={
              <label className="deadline-time">
                <span>Takes</span>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  inputMode="numeric"
                  placeholder="minutes"
                  aria-label="Estimated minutes"
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                  onBlur={saveEstimate}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveEstimate();
                    }
                  }}
                />
              </label>
            }
          />
        </div>
      )}
    </span>
  );
}
