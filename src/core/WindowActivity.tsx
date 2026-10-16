import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api/tauri";
import { duration } from "./types";
const PAGE_SIZE = 10;
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
  const [page, setPage] = useState(1);
  useEffect(() => {
    let alive = true,
      running = false;
    setHistory(null);
    setError(false);
    setPage(1);
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
  const sessions = history?.sessions ?? [];
  const total = history?.total_active_seconds ?? 0;
  const pages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = sessions.slice(
    (current - 1) * PAGE_SIZE,
    current * PAGE_SIZE,
  );
  return (
    <section className="window-activity" aria-label="Tracked activity">
      {error ? (
        <p role="alert">
          Activity history is unavailable. It will retry automatically.
        </p>
      ) : sessions.length === 0 ? (
        <p className="empty-copy">No activity tracked yet.</p>
      ) : (
        <>
          <p className="helper">
            {duration(total)} observed · {history?.total_sessions ?? 0}{" "}
            {history?.total_sessions === 1
              ? "window session"
              : "window sessions"}
          </p>
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
          {pages > 1 && (
            <nav className="pager" aria-label="Tracked activity pages">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="text-button"
                  aria-current={n === current ? "page" : undefined}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
            </nav>
          )}
        </>
      )}
    </section>
  );
}
