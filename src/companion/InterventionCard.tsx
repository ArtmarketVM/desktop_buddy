import type { Intervention, InterventionResponse } from "./types";
export function InterventionCard({
  prompt,
  busy,
  respond,
}: {
  prompt: Intervention;
  busy: boolean;
  respond: (action: InterventionResponse) => void;
}) {
  const title =
    prompt.kind === "deadline"
      ? "A deadline check-in"
      : prompt.kind === "research"
        ? "Find information for this step?"
        : prompt.kind === "goal_completion"
          ? "Looks like this goal may be complete"
          : prompt.kind === "new_task"
            ? "Looks like a new task"
            : prompt.kind === "completion"
              ? "Looks like this may be done"
              : prompt.kind === "movement"
                ? "A moment to stretch"
                : prompt.kind === "end_of_day"
                  ? "A small wrap-up"
                  : "A quick check-in";
  const accept =
    prompt.kind === "deadline"
      ? "Mark complete"
      : prompt.kind === "research"
        ? "Search the web"
        : prompt.kind === "goal_completion"
          ? "Yes, complete goal"
          : prompt.kind === "new_task"
            ? "Add task"
            : prompt.kind === "completion"
              ? "Yes, mark complete"
              : prompt.kind === "no_goals"
                ? "Plan today"
                : prompt.kind === "movement"
                  ? "Done"
                  : prompt.kind === "midday"
                    ? "Ask sumi"
                    : "Review progress";
  return (
    <div className="companion-bubble">
      <section
        className="suggestion-card companion-prompt"
        aria-live="polite"
        aria-label={title}
      >
        <h2>{title}</h2>
        <p>{prompt.text}</p>
        {prompt.kind === "research" && (
          <small>
            No search runs until you agree. Only a short query is sent to
            Tavily.
          </small>
        )}
        {["new_task", "completion", "goal_completion"].includes(
          prompt.kind,
        ) && (
          <small>
            Suggested from visible context. Nothing changes until you confirm.
          </small>
        )}
        <div className="companion-prompt-actions">
          <button disabled={busy} onClick={() => respond("accept")}>
            {accept}
          </button>
          {prompt.kind === "deadline" && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => respond("start")}
              >
                Start now
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => respond("snooze")}
              >
                Remind in 1 hour
              </button>
              <button
                className="secondary"
                disabled={busy}
                title="Move to Today and set the deadline to the end of today"
                onClick={() => respond("today")}
              >
                Do today
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => respond("reschedule")}
              >
                Move deadline 1 day
              </button>
            </>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => respond("ignore")}
          >
            {["completion", "goal_completion"].includes(prompt.kind)
              ? "Not yet"
              : prompt.kind === "no_goals"
                ? "No plan today"
                : "Not now"}
          </button>
          {prompt.kind === "end_of_day" && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => respond("tomorrow")}
              >
                Continue tomorrow
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => respond("summary")}
              >
                Daily summary
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
