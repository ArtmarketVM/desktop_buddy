import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { coachingApi, type CoachingView } from "./api";
import "./coaching.css";

export function StartCoaching({
  goalId,
  stepId = null,
  onClose,
  onStarted,
}: {
  goalId: number;
  stepId?: string | null;
  onClose: () => void;
  onStarted?: (view: CoachingView) => void;
}) {
  const [entry, setEntry] = useState<Awaited<
    ReturnType<typeof coachingApi.prepare>
  > | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(crypto.randomUUID());
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const focus = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => focus?.focus();
  }, []);
  useEffect(() => {
    let live = true;
    void coachingApi
      .prepare(goalId, stepId)
      .then((value) => {
        if (live) setEntry(value);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [goalId, stepId]);
  async function start() {
    if (!entry || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await coachingApi.start(entry, request.current);
      onStarted?.(result);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="coaching-start"
      aria-labelledby="coaching-start-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="coaching-start-title">Help me start</h2>
      {entry && <p>{entry.target.title}</p>}
      {entry?.target.step_title && (
        <p className="helper">Step: {entry.target.step_title}</p>
      )}
      <p>
        Choose one small action with sumi. You can pause or stop at any time.
      </p>
      <p className="helper">
        The session is saved locally, even with Personal Memory off. A suggested
        action uses your AI and goal-sharing settings. Remembering a result is
        optional.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="coaching-actions">
        <button disabled={!entry || busy} onClick={() => void start()}>
          {busy ? "Starting…" : "Start coaching"}
        </button>
        <button className="text-button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
