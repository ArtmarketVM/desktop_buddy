import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api/tauri";
import { duration } from "./types";
export interface WindowSession {
  id: number;
  goal_id: number | null;
  app: string;
  title: string;
  domain: string | null;
  started_at: string;
  ended_at: string;
  active_seconds: number;
  idle_seconds: number;
}
interface WindowHistory {
  sessions: WindowSession[];
  total_active_seconds: number;
  total_sessions: number;
  apps: [string, number][];
}
export function WindowActivity({
  first,
  last,
  goalId = null,
}: {
  first: string;
  last: string;
  goalId?: number | null;
}) {
  const [history, setHistory] = useState<WindowHistory | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true,
      running = false;
    setHistory(null);
    setError(false);
    const poll = async () => {
      if (!desktop || running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const start = new Date(`${first}T00:00:00`);
        const end = new Date(`${last}T00:00:00`);
        end.setDate(end.getDate() + 1);
        const data = await invoke<WindowHistory>("get_window_activity", {
          first: start.toISOString(),
          last: end.toISOString(),
          goalId,
        });
        if (alive) {
          setHistory(data?.sessions ? data : null);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 10000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [first, last, goalId]);
  const visible = history?.sessions ?? [];
  const sorted = history?.apps ?? [];
  const total = history?.total_active_seconds ?? 0;
  return (
    <section className="window-activity" aria-label="Window activity">
      <div className="today-lane-heading">
        <h3>Window activity</h3>
        <span>
          {duration(total)} observed · {history?.total_sessions ?? 0} window
          sessions
        </span>
      </div>
      <p className="helper">
        Local history of active windows and tabs, including activity without a
        goal. Active time is observation, not proof of completed work. Private
        and excluded apps are omitted.
      </p>
      {error ? (
        <p role="alert">
          Activity history is unavailable. It will retry automatically.
        </p>
      ) : visible.length === 0 ? (
        <p className="empty-copy">
          Windows will appear here while activity tracking is on.
        </p>
      ) : (
        <>
          <ul className="observed-apps">
            {sorted.slice(0, 8).map(([app, seconds]) => (
              <li key={app}>
                <span>{app}</span>
                <meter
                  aria-label={`${app} observed time`}
                  min={0}
                  max={Math.max(total, 1)}
                  value={seconds}
                />
                <span>{duration(seconds)}</span>
              </li>
            ))}
          </ul>
          <details className="inline-details">
            <summary>Recent windows · {visible.length}</summary>
            <ol className="window-session-list">
              {visible.map((row) => (
                <li key={row.id}>
                  <time dateTime={row.started_at}>
                    {new Date(row.started_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </time>
                  <div>
                    <strong>{row.app}</strong>
                    <span>
                      {row.title || "Untitled window"}
                      {row.domain ? ` · ${row.domain}` : ""}
                    </span>
                    <small>
                      {row.goal_id == null
                        ? "No goal assigned"
                        : "Goal context recorded"}
                    </small>
                  </div>
                  <span>{duration(row.active_seconds)}</span>
                </li>
              ))}
            </ol>
            <p className="helper">
              Latest 500 sessions in this period. Foreground context is sampled
              every 3 seconds. Full page text, screenshots and URL paths are not
              stored here.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
