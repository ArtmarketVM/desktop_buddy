import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, desktop, safeUrl } from "../api/tauri";
import type { Recommendation } from "../types";

export function RecommendationHistory({
  recommendations,
  onChanged,
}: {
  recommendations: Recommendation[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card recommendation-history"
      aria-label="Recommendation history"
    >
      <h2>Recommendation history</h2>
      <p className="helper">
        The latest 100 retained recommendations across your goals. Ratings are
        saved locally and may be sent to Nebius for future suggestions for the
        same goal when proactive suggestions are enabled.
      </p>
      {error && <p role="alert">{error}</p>}
      {recommendations.length === 0 && (
        <p>
          No recommendations yet. Enable proactive suggestions in Settings to
          receive resources while you work.
        </p>
      )}
      <div className="recommendation-list">
        {recommendations.map((item) => {
          const url = safeUrl(item.url);
          return (
            <article className="result" key={item.id}>
              <h3>{item.title}</h3>
              <p className="helper">Goal: {item.goal}</p>
              <time dateTime={item.created_at}>
                {new Date(item.created_at).toLocaleString()}
              </time>
              <p>{item.reason}</p>
              <div className="settings-actions">
                <button
                  disabled={!desktop || busy || !url}
                  onClick={() => url && void run(() => openUrl(url))}
                >
                  Open resource ↗
                </button>
                <button
                  disabled={!desktop || busy}
                  aria-pressed={item.feedback === true}
                  onClick={() =>
                    void run(() =>
                      api.rateRecommendation(
                        item.id,
                        item.feedback === true ? null : true,
                      ),
                    )
                  }
                >
                  Helpful
                </button>
                <button
                  disabled={!desktop || busy}
                  aria-pressed={item.feedback === false}
                  onClick={() =>
                    void run(() =>
                      api.rateRecommendation(
                        item.id,
                        item.feedback === false ? null : false,
                      ),
                    )
                  }
                >
                  Not helpful
                </button>
              </div>
              <small>
                {item.feedback === null
                  ? "Not rated"
                  : item.feedback
                    ? "Rated helpful · click again to clear"
                    : "Rated not helpful · click again to clear"}
              </small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
