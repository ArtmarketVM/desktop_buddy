import { useEffect, useState } from "react";
import { api, desktop } from "../api/tauri";
import type { Goal, GoalPlan, GoalProposal, SavedGoal } from "../types";

export function GoalPlanner({
  goal,
  plan,
  onChanged,
  aiAvailable,
  mock,
  onDirty,
  onCompleted,
}: {
  goal: Goal;
  plan: GoalPlan;
  onChanged: () => Promise<void>;
  aiAvailable: boolean;
  mock: boolean;
  onDirty: (dirty: boolean) => void;
  onCompleted?: (id: number) => void;
}) {
  const [title, setTitle] = useState(goal.text);
  const [draft, setDraft] = useState(plan);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<GoalProposal | null>(null);
  const [replace, setReplace] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    onDirty(dirty || busy);
    return () => onDirty(false);
  }, [dirty, busy, onDirty]);
  const disabled = !desktop || busy;
  function update(next: GoalPlan) {
    setDraft(next);
    setDirty(true);
    setConfirmed(false);
    setProposal(null);
    setReplace(false);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, offset: number) {
    const steps = [...draft.steps];
    [steps[index], steps[index + offset]] = [
      steps[index + offset],
      steps[index],
    ];
    update({ ...draft, steps });
  }
  return (
    <section className="card goal-planner" aria-label="Goal plan">
      <h2>Your next steps</h2>
      <p className="helper">
        Choose what done looks like and the step you are working on. Save
        changes to update Buddy's context. Time spent in an app never completes
        a goal automatically.
      </p>
      <label htmlFor="plan-title">Goal</label>
      <input
        id="plan-title"
        value={title}
        maxLength={500}
        disabled={disabled}
        onChange={(e) => {
          setTitle(e.target.value);
          update(draft);
        }}
      />
      <label htmlFor="plan-done">Done when (optional)</label>
      <textarea
        id="plan-done"
        value={draft.done_when}
        maxLength={500}
        disabled={disabled}
        placeholder="For example: the draft is reviewed and exported to PDF"
        onChange={(e) => update({ ...draft, done_when: e.target.value })}
      />
      <p>
        {draft.steps.filter((s) => s.done).length} of {draft.steps.length} steps
        completed
      </p>
      {draft.steps.length === 0 && (
        <p>No steps yet. Add one yourself or ask AI for a draft.</p>
      )}
      <ol className="goal-steps">
        {draft.steps.map((step, index) => (
          <li key={step.id}>
            <input
              aria-label={`Step ${index + 1}`}
              value={step.text}
              maxLength={500}
              disabled={disabled}
              onChange={(e) =>
                update({
                  ...draft,
                  steps: draft.steps.map((s) =>
                    s.id === step.id ? { ...s, text: e.target.value } : s,
                  ),
                })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={step.done}
                disabled={disabled}
                onChange={(e) =>
                  update({
                    ...draft,
                    current_step:
                      e.target.checked && draft.current_step === step.id
                        ? null
                        : draft.current_step,
                    steps: draft.steps.map((s) =>
                      s.id === step.id ? { ...s, done: e.target.checked } : s,
                    ),
                  })
                }
              />
              Completed
            </label>
            <label>
              <input
                type="radio"
                name="current-step"
                checked={draft.current_step === step.id}
                disabled={disabled || step.done}
                onChange={() => update({ ...draft, current_step: step.id })}
              />
              Working on this
            </label>
            <div className="settings-actions">
              <button
                disabled={disabled || index === 0}
                aria-label={`Move step ${index + 1} up`}
                onClick={() => move(index, -1)}
              >
                Up
              </button>
              <button
                disabled={disabled || index === draft.steps.length - 1}
                aria-label={`Move step ${index + 1} down`}
                onClick={() => move(index, 1)}
              >
                Down
              </button>
              <button
                disabled={disabled}
                aria-label={`Remove step ${index + 1}`}
                onClick={() =>
                  update({
                    ...draft,
                    current_step:
                      draft.current_step === step.id
                        ? null
                        : draft.current_step,
                    steps: draft.steps.filter((s) => s.id !== step.id),
                  })
                }
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="settings-actions">
        <button
          disabled={disabled || draft.steps.length >= 20}
          onClick={() =>
            update({
              ...draft,
              steps: [
                ...draft.steps,
                { id: crypto.randomUUID(), text: "", done: false },
              ],
            })
          }
        >
          Add step
        </button>
        <button
          disabled={disabled || !draft.current_step}
          onClick={() => update({ ...draft, current_step: null })}
        >
          Clear current step
        </button>
        <button
          disabled={
            disabled ||
            !dirty ||
            !title.trim() ||
            draft.steps.some((s) => !s.text.trim())
          }
          onClick={() =>
            void run(async () => {
              await api.saveGoalPlan(title, draft);
              await onChanged();
            })
          }
        >
          Save plan
        </button>
        <button
          disabled={disabled || !dirty}
          onClick={() => {
            setTitle(goal.text);
            setDraft(plan);
            setDirty(false);
            setProposal(null);
            setConfirmed(false);
          }}
        >
          Discard edits
        </button>
      </div>
      {dirty && (
        <p role="status">Unsaved changes — Buddy still uses the saved plan.</p>
      )}
      <p className="helper">
        Refine with AI sends the saved goal, completion criterion and checklist
        to Nebius, but no activity history. Provider charges may apply. It does
        not enable automatic AI check-ins.
      </p>
      {mock && <p className="notice">Mock AI proposal — no Nebius request.</p>}
      <button
        disabled={disabled || dirty || !aiAvailable}
        onClick={() =>
          void run(async () => {
            setReplace(false);
            setProposal(await api.refineGoal(goal.id, plan.revision));
          })
        }
      >
        {busy ? "Working…" : "Refine with AI"}
      </button>
      {!aiAvailable && (
        <p className="helper">
          Configure Nebius in Settings to request a proposal. Manual editing
          works without AI.
        </p>
      )}
      {proposal && (
        <section className="proposal" aria-label="AI proposal">
          <h3>Proposed plan — not applied</h3>
          <p>{proposal.title}</p>
          <p>Done when: {proposal.done_when}</p>
          <ol>
            {proposal.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <label>
            <input
              type="checkbox"
              checked={replace}
              disabled={disabled}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Replace the checklist and reset its completion marks in my draft.
          </label>
          <div className="settings-actions">
            <button
              disabled={disabled || !replace}
              onClick={() => {
                setTitle(proposal.title);
                update({
                  ...draft,
                  done_when: proposal.done_when,
                  steps: proposal.steps.map((text) => ({
                    id: crypto.randomUUID(),
                    text,
                    done: false,
                  })),
                  current_step: null,
                });
              }}
            >
              Use as editable draft
            </button>
            <button disabled={disabled} onClick={() => setProposal(null)}>
              Keep original
            </button>
          </div>
        </section>
      )}
      <div className="goal-finish">
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            disabled={disabled || dirty}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm the goal's outcome is achieved, even if some steps remain
          unchecked.
        </label>
        <div className="settings-actions">
          <button
            disabled={disabled || dirty || !confirmed}
            onClick={() =>
              void run(async () => {
                await api.transitionGoal(goal.id, "complete", true);
                onCompleted?.(goal.id);
                await onChanged();
              })
            }
          >
            Complete goal
          </button>
          <button
            disabled={disabled || dirty}
            onClick={() =>
              void run(async () => {
                await api.transitionGoal(goal.id, "defer");
                await onChanged();
              })
            }
          >
            Continue later
          </button>
        </div>
        <p className="helper">
          Completing or deferring stops tracking. Deferred goals can be resumed
          below.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function SavedGoals({
  goals,
  onChanged,
  locked,
}: {
  goals: SavedGoal[];
  onChanged: () => Promise<void>;
  locked: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <details
      className="card goal-planner disclosure-card"
      aria-label="Saved goals"
    >
      <summary>
        Saved goals <span className="disclosure-count">{goals.length}</span>
      </summary>
      <p className="helper">
        Up to 100 goals, with deferred goals first. Resuming defers any current
        goal and leaves tracking paused.
      </p>
      {!goals.length && <p>No deferred or completed goals yet.</p>}
      <div className="saved-goals">
        {goals.map((g) => (
          <article key={g.id} className="result">
            <h3>{g.text}</h3>
            <p>{g.status === "completed" ? "Completed" : "Deferred"}</p>
            {g.status === "deferred" && (
              <button
                disabled={!desktop || busy || locked}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api.transitionGoal(g.id, "resume");
                    await onChanged();
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Resume goal
              </button>
            )}
          </article>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
