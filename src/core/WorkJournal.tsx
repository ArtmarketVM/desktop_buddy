import { useMemo, useState } from "react";
import { invoke } from "../data/ipc";
import { desktop } from "../api/tauri";
import { queryClient } from "../data/client";
import { useQuery } from "../data/useQuery";
interface WorkEvent {
  id: number;
  goal_id: number | null;
  title: string;
  app: string;
  occurred_at: string;
  source: string;
  status: string;
  can_undo: boolean;
}
export function WorkJournal({ day }: { day: string }) {
  const journal = useMemo(
    () =>
      queryClient.query(
        `work-journal:${day}`,
        ["activity", "workspace"],
        [] as WorkEvent[],
        () => invoke<WorkEvent[]>("get_work_journal", { day }),
        5000,
      ),
    [day],
  );
  const state = useQuery(journal, desktop);
  const items = state.data;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function undo(id: number) {
    setBusy(true);
    setError("");
    try {
      await invoke("undo_work_event", { id });
      await journal.refresh();
    } catch {
      setError("This goal changed. Review its current steps before undoing.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" aria-label="Work journal">
      <h2>Work journal</h2>
      <p className="muted">
        Meaningful results and work noticed outside your plan. Observation alone
        does not mean completed.
      </p>
      {!items.length && <p>No meaningful work recorded for this day yet.</p>}
      {items.map((item) => (
        <div className="setting-row" key={item.id}>
          <span>
            {item.title}
            <small>
              {new Date(item.occurred_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {item.app} ·{" "}
              {item.status === "undone"
                ? "Undone"
                : item.source === "automatic_verified"
                  ? "Automatically verified"
                  : item.source === "user_confirmed_unplanned"
                    ? "Completed outside the plan · confirmed by you"
                    : item.status === "planned"
                      ? "Added to Today"
                      : "Observed · completion unverified"}
            </small>
          </span>
          {item.can_undo && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void undo(item.id)}
            >
              Undo
            </button>
          )}
        </div>
      ))}
      {(error || state.error) && (
        <p role="alert">{error || "Work journal is unavailable."}</p>
      )}
    </section>
  );
}
