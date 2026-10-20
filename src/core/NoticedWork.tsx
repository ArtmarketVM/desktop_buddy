import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../api/tauri";
import { duration } from "./types";

type Suggestion = { id: string; title: string; seconds: number; app: string };
/** Persistent review, rather than an expiring toast that could lose noticed work. */
export function NoticedWork({ onChanged }: { onChanged: () => Promise<void> }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const saving = useRef(false);
  useEffect(() => {
    if (!desktop) return;
    let live = true;
    let stop: (() => void) | undefined;
    const refresh = async () => {
      if (saving.current) return;
      const requestEpoch = epoch.current;
      try {
        const next = await invoke<Suggestion | null>(
          "get_unplanned_work_suggestion",
        );
        if (live && requestEpoch === epoch.current) setSuggestion(next);
      } catch {
        // Preserve an existing offer through a temporary refresh failure. The
        // mutation command still rechecks the authoritative backend offer.
      }
    };
    void listen("unplanned_work_suggestion", () => void refresh())
      .then((unlisten) => {
        if (!live) {
          unlisten();
          return;
        }
        stop = unlisten;
        void refresh();
      })
      .catch(() => void refresh());
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      live = false;
      stop?.();
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    setTitle(suggestion?.title ?? "");
    setError("");
  }, [suggestion?.id]);
  if (!suggestion) return null;
  const respond = async (action: "add" | "dismiss" | "not_now") => {
    epoch.current += 1;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await invoke("respond_unplanned_work_suggestion", {
        id: suggestion.id,
        action,
        title: action === "add" ? title.trim() : null,
      });
      setSuggestion(null);
      await onChanged().catch(() => {});
    } catch (error) {
      const message = String(error);
      setError(
        message.includes("A goal with that title already exists")
          ? "A goal with that title already exists. Rename this work before adding it."
          : message.includes("suggestion expired")
            ? "That suggestion expired. Check Today for the latest one."
            : "Couldn't save that choice. Check Today and try again.",
      );
    } finally {
      epoch.current += 1;
      saving.current = false;
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
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
