import { useEffect, useState } from "react";
import { aiApi, type ActivitySegment } from "../ai/api";
import { desktop } from "../api/tauri";
import { duration } from "./types";

export function activityDay(timestamp: string): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function ActivityTimeline({ day }: { day: string }) {
  const [segments, setSegments] = useState<ActivitySegment[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (desktop)
        void aiApi
          .segments()
          .then((rows) => {
            if (live) {
              setSegments(rows);
              setError("");
            }
          })
          .catch(() => {
            if (live)
              setError(
                "Activity history is temporarily unavailable. Try reopening Progress.",
              );
          });
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [day]);
  const rows = segments
    .filter((row) => activityDay(row.startedAt) === day)
    .reverse();
  return (
    <details className="activity-timeline">
      <summary>
        Activity timeline <span className="helper">· latest 500 intervals</span>
      </summary>
      <p className="helper">
        Window and page titles are local. URLs are omitted; available browser
        domains are shown. “Observed” intervals do not add goal progress.
      </p>
      {error && <p role="alert">{error}</p>}
      {!rows.length && (
        <p className="helper">No captured activity for this day.</p>
      )}
      <ol>
        {rows.map((row, index) => (
          <li key={`${row.startedAt}-${index}`}>
            <time dateTime={row.startedAt}>
              {new Date(row.startedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              –
              {new Date(row.endedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            <div>
              <strong>{row.title || row.app}</strong>
              <small>
                {row.app}
                {row.domain ? ` · ${row.domain}` : ""} ·{" "}
                {duration(row.durationSeconds)} ·{" "}
                {row.activityMatch?.goalId
                  ? `Relevant to goal #${row.goalId}`
                  : row.state === "paused"
                    ? "Idle"
                    : "Observed"}
              </small>
              <small>{row.activityMatch?.reason}</small>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
