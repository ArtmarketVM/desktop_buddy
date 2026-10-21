import { invoke } from "../data/ipc";
import { queryClient } from "../data/client";
import { useQuery } from "../data/useQuery";
import { desktop } from "../api/tauri";
import { duration } from "./types";
import { Pager, usePage } from "./Pager";
interface WindowSession {
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
  const start = new Date(`${first}T00:00:00`);
  const end = new Date(`${last}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const bounds = {
    first: start.toISOString(),
    last: end.toISOString(),
    goalId,
  };
  const query = queryClient.query(
    `windows:${JSON.stringify(bounds)}`,
    ["activity"],
    null as WindowHistory | null,
    async () => {
      const data = await invoke<WindowHistory>("get_window_activity", bounds);
      return data?.sessions ? data : null;
    },
    15_000,
  );
  const { data: history, error } = useQuery(query, desktop);
  const sessions = history?.sessions ?? [];
  const total = history?.total_active_seconds ?? 0;
  const { page, pages, visible, setPage } = usePage(
    sessions,
    `${first}|${last}|${goalId}`,
  );
  return (
    <section className="window-activity" aria-label="Tracked activity">
      {error ? (
        <p role="alert">{error}</p>
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
          <Pager
            page={page}
            pages={pages}
            onChange={setPage}
            label="Tracked activity"
          />
        </>
      )}
    </section>
  );
}
