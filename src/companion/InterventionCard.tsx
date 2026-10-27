import { useState } from "react";
import { deadlineISO, localDeadline } from "../core/types";
import type { Intervention, InterventionResponse } from "./types";

type Props = {
  prompt: Intervention;
  busy: boolean;
  compactPreview?: boolean;
  respond: (action: InterventionResponse, deadline?: string) => void;
};

export function InterventionCard(props: Props) {
  if (props.prompt.kind === "onboarding_completion")
    return <OnboardingChoices key={props.prompt.id} {...props} />;
  return <Choices key={props.prompt.id} {...props} />;
}

function OnboardingChoices({ prompt, busy, respond }: Props) {
  const first = prompt.step_id === "step-0";
  const last = prompt.step_id === "step-2";
  const title = first
    ? "Welcome to Sumi!"
    : last
      ? "You’re all set!"
      : "Your first goal is ready";
  const primary = first
    ? "Cross it off"
    : last
      ? "Finish setup"
      : "Cross off & view progress";
  return (
    <div className="companion-bubble">
      <section
        className="suggestion-card companion-prompt onboarding-prompt"
        aria-label={title}
        aria-live="polite"
      >
        {last && (
          <button
            className="text-button onboarding-close"
            aria-label="Dismiss setup message"
            disabled={busy}
            onClick={() => respond("ignore")}
          >
            ×
          </button>
        )}
        <h2>{title}</h2>
        <p>{prompt.text}</p>
        {first && (
          <p className="onboarding-next">
            Next: create a goal. I can suggest ideas.
          </p>
        )}
        <div className="companion-prompt-actions">
          <button disabled={busy} onClick={() => respond("accept")}>
            {primary}
          </button>
          {!last && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => respond("ignore")}
            >
              Later
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Choices({ prompt, busy, respond, compactPreview = false }: Props) {
  const [rescheduling, setRescheduling] = useState(false);
  const seconds = Number(prompt.id.split(":")[2]);
  const [deadline, setDeadline] = useState(() =>
    localDeadline(
      Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null,
    ),
  );
  const [error, setError] = useState("");
  const title = {
    onboarding_completion: "One more step with Sumi",
    automatic_completion: "You completed this work",
    unplanned_completed: "Add this to today’s completed work?",
    unplanned_work: "Add this work to Today?",
    deadline: prompt.id.endsWith(":before")
      ? "An upcoming deadline"
      : prompt.id.endsWith(":now")
        ? "Your deadline is here"
        : "A deadline has passed",
    research: "Find information for this step?",
    goal_match: "Is this your current goal?",
    goal_completion: "Mark this goal complete?",
    new_task: "Add this step to your plan?",
    new_goal: "Add this goal to Today?",
    completion: "Mark this step complete?",
    no_goals: "What’s on for today?",
    movement: "A stretch break",
    end_of_day: "Here’s what you did today",
    midday: "A quick check-in",
  }[prompt.kind];
  const primary = {
    onboarding_completion: "Cross it off",
    automatic_completion: "Got it",
    unplanned_completed: "Add completed",
    unplanned_work: "Add to Today",
    deadline: "I’m on it",
    research: "Search the web",
    goal_match: "Yes",
    goal_completion: "Yes, complete goal",
    new_task: "Add step",
    new_goal: "Add to Today",
    completion: "Yes, mark complete",
    no_goals: "Plan today",
    movement: "I’ll stretch",
    end_of_day: "Review day",
    midday: "Not now",
  }[prompt.kind];
  const text =
    prompt.kind === "new_task"
      ? `Add “${prompt.text}” as a step in your plan?`
      : ["completion", "goal_completion"].includes(prompt.kind)
        ? `It looks like you finished “${prompt.text}”. Mark it complete?`
        : prompt.text;
  function saveDeadline() {
    try {
      const value = deadlineISO(deadline);
      if (!value || Date.parse(value) <= Date.now()) throw new Error("invalid");
      setError("");
      respond("reschedule", value);
    } catch {
      setError("Choose a future date and time.");
    }
  }
  const shortened = compactPreview && text.length > 180;
  const preview = shortened
    ? `${text.slice(0, 177).replace(/\s+\S*$/, "")}…`
    : text;
  return (
    <div className="companion-bubble">
      <section
        className="suggestion-card companion-prompt"
        aria-live="polite"
        aria-label={title}
      >
        <h2>{rescheduling ? "Reschedule your deadline" : title}</h2>
        {rescheduling ? (
          <>
            <p>
              Choose a new date and time. Your deadline changes when you save.
            </p>
            <label className="setting-row">
              <span>New deadline</span>
              <input
                type="datetime-local"
                value={deadline}
                disabled={busy}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="companion-prompt-actions">
              <button disabled={busy} onClick={saveDeadline}>
                Save deadline
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setRescheduling(false);
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p>{preview}</p>
            {prompt.kind === "no_goals" && (
              <small>Choose Not now for a reminder in 30 minutes.</small>
            )}
            {["new_task", "new_goal", "completion", "goal_completion"].includes(
              prompt.kind,
            ) && <small>Nothing changes until you confirm.</small>}
            <div className="companion-prompt-actions">
              <button
                disabled={busy}
                onClick={() =>
                  respond(
                    prompt.kind === "deadline"
                      ? "on_it"
                      : prompt.kind === "automatic_completion"
                        ? "ignore"
                        : prompt.kind === "midday"
                          ? "ignore"
                          : "accept",
                  )
                }
              >
                {primary}
              </button>
              {prompt.kind === "goal_match" && (
                <button disabled={busy} onClick={() => respond("no")}>
                  No
                </button>
              )}
              {prompt.kind === "deadline" ? (
                <button disabled={busy} onClick={() => setRescheduling(true)}>
                  Reschedule
                </button>
              ) : prompt.kind === "automatic_completion" ? (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => respond("accept")}
                >
                  Undo
                </button>
              ) : (
                <>
                  {prompt.kind === "end_of_day" && (
                    <button disabled={busy} onClick={() => respond("tomorrow")}>
                      Plan tomorrow
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => respond("ignore")}
                  >
                    {["completion", "goal_completion"].includes(prompt.kind)
                      ? "Not yet"
                      : [
                            "new_task",
                            "new_goal",
                            "unplanned_work",
                            "unplanned_completed",
                          ].includes(prompt.kind)
                        ? "Skip"
                        : "Not now"}
                  </button>
                </>
              )}
              {prompt.kind === "no_goals" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => respond("skip_today")}
                >
                  Skip today
                </button>
              )}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => respond("chat")}
              >
                {shortened ? "Details in chat" : "Chat"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
