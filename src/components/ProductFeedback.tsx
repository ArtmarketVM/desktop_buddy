import { useState } from "react";
import { api, desktop } from "../api/tauri";

export function ProductFeedback({ goalId = null }: { goalId?: number | null }) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.productFeedback({
        goal_id: goalId,
        rating,
        text,
        source: goalId === null ? "settings" : "goal_completed",
      });
      setSaved(true);
      setText("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="product-feedback" aria-label="Share feedback">
      <h3>
        {goalId === null
          ? "How is Buddy working for you?"
          : "How did this goal feel?"}
      </h3>
      {saved ? (
        <p role="status">Thanks. Your feedback is saved locally.</p>
      ) : (
        <>
          <fieldset disabled={!desktop || busy}>
            <legend>Rating</legend>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <label key={star}>
                  <input
                    type="radio"
                    name={`feedback-rating-${goalId ?? "settings"}`}
                    value={star}
                    checked={rating === star}
                    onChange={() => setRating(star)}
                  />
                  <span aria-hidden="true">{star <= rating ? "★" : "☆"}</span>
                  <span className="sr-only">
                    {star} {star === 1 ? "star" : "stars"}
                  </span>
                </label>
              ))}
            </div>
            <label htmlFor={`feedback-text-${goalId ?? "settings"}`}>
              Anything to add? (optional)
            </label>
            <textarea
              id={`feedback-text-${goalId ?? "settings"}`}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </fieldset>
          <button
            disabled={!desktop || busy || !rating}
            onClick={() => void save()}
          >
            Save feedback
          </button>
        </>
      )}
      <p className="helper">
        Stored on this device. No feedback is uploaded. Voice feedback is
        planned for a later version.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
