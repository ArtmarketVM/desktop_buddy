import { useEffect, useRef } from "react";

export function ResetProfileDialog({
  busy,
  unsaved,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  unsaved: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="dialog-backdrop">
      <div
        className="update-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onClose();
          if (event.key === "Tab") {
            const buttons = Array.from(
              dialog.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ) ?? [],
            );
            if (event.shiftKey && document.activeElement === buttons[0]) {
              event.preventDefault();
              buttons.at(-1)?.focus();
            } else if (
              !event.shiftKey &&
              document.activeElement === buttons.at(-1)
            ) {
              event.preventDefault();
              buttons[0]?.focus();
            }
          }
        }}
      >
        <h2 id="reset-title">Start setup again?</h2>
        <p>
          This signs out of your local profile and pauses tracking and AI
          check-ins. Your goals, history and protected provider credentials are
          kept on this device.
        </p>
        <p>
          There is no online account connected yet. You can enter your details
          and choose your companion again.
        </p>
        {unsaved && (
          <p className="notice">
            Save or discard your plan changes before continuing.
          </p>
        )}
        <div className="dialog-actions">
          <button className="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy || unsaved} onClick={onConfirm}>
            Sign out and open setup
          </button>
        </div>
      </div>
    </div>
  );
}
