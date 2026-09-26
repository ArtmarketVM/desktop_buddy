import type { Decision } from "../types";
export function BuddyPopup({
  decision,
  onRelated,
  onDismiss,
  onDnd,
}: {
  decision: Decision;
  onRelated: () => void;
  onDismiss: () => void;
  onDnd: () => void;
}) {
  return (
    <section className="buddy-card" aria-live="polite">
      <div className="buddy-face">:)</div>
      <span className="eyebrow">A LITTLE CHECK-IN</span>
      <h2>
        {decision.state === "stuck"
          ? "Need a fresh perspective?"
          : "A small nudge back."}
      </h2>
      <p>{decision.reason}</p>
      <div className="buddy-actions">
        <button onClick={onDismiss}>Back to my goal</button>
        <button className="secondary" onClick={onRelated}>
          This is related
        </button>
        <button className="text-button" onClick={onDnd}>
          Do not disturb
        </button>
      </div>
    </section>
  );
}
