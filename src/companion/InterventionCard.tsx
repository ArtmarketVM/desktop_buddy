import type { Intervention } from "./types";
export function InterventionCard({
  prompt,
  busy,
  respond,
}: {
  prompt: Intervention;
  busy: boolean;
  respond: (action: "accept" | "ignore" | "tomorrow" | "summary") => void;
}) {
  const title =
    prompt.kind === "new_task"
      ? "Looks like a new task"
      : prompt.kind === "completion"
        ? "Looks like this may be done"
        : prompt.kind === "movement"
          ? "A moment to stretch"
          : prompt.kind === "end_of_day"
            ? "A small wrap-up"
            : "A quick check-in";
  const accept =
    prompt.kind === "new_task"
      ? "Add task"
      : prompt.kind === "completion"
        ? "Yes, mark complete"
        : prompt.kind === "no_goals"
          ? "Plan today"
          : prompt.kind === "movement"
            ? "Done"
            : prompt.kind === "midday"
              ? "Ask Buddy"
              : "Review progress";
  return (
    <section
      className="suggestion-card companion-prompt"
      aria-live="polite"
      aria-label={title}
    >
      <span className="eyebrow">BUDDY · YOUR CHOICE</span>
      <h2>{title}</h2>
      <p>{prompt.text}</p>
      {["new_task", "completion"].includes(prompt.kind) && (
        <small>
          Suggested from visible context. Nothing changes until you confirm.
        </small>
      )}
      <div className="companion-prompt-actions">
        <button disabled={busy} onClick={() => respond("accept")}>
          {accept}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => respond("ignore")}
        >
          {prompt.kind === "completion"
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
  );
}
