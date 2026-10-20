import { useEffect, useState } from "react";
import { invoke } from "../data/ipc";
import { useQuery } from "../data/useQuery";
import { noticedQuery } from "../data/resources";
import { queryClient } from "../data/client";
import { desktop } from "../api/tauri";
import { duration } from "./types";

/** Persistent review, rather than an expiring toast that could lose noticed work. */
export function NoticedWork({ onChanged }: { onChanged: () => Promise<void> }) {
  const { data: suggestion, error: loadError } = useQuery(
    noticedQuery,
    desktop,
  );
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setTitle(suggestion?.title ?? "");
    setError("");
  }, [suggestion?.id]);
  if (!suggestion) return null;
  const respond = async (action: "add" | "dismiss" | "not_now") => {
    setBusy(true);
    setError("");
    try {
      await invoke("respond_unplanned_work_suggestion", {
        id: suggestion.id,
        action,
        title: action === "add" ? title.trim() : null,
      });
      noticedQuery.setData(null);
      await onChanged().catch(() => {});
    } catch (error) {
      const message = String(error);
      setError(
        message.includes("A goal with that title already exists")
          ? "A goal with that title already exists. Rename this work before adding it."
          : message.includes("suggestion expired")
            ? "That suggestion expired. Check Today for the latest one."
            : queryClient.recordError("noticed work choice", error),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="noticed-work"
      aria-label="Work noticed outside your goals"
    >
      <div className="noticed-work-heading">
        <h2>Work noticed</h2>
        <span>{duration(suggestion.seconds)} observed today</span>
      </div>
      <p>Add this unlisted work to what you completed today?</p>
      <input
        aria-label="Noticed work title"
        value={title}
        maxLength={120}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="noticed-work-actions">
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void respond("add")}
        >
          Add to completed
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => void respond("not_now")}
        >
          Not now
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => void respond("dismiss")}
        >
          Dismiss
        </button>
      </div>
      {(error || loadError) && <p role="alert">{error || loadError}</p>}
    </section>
  );
}
