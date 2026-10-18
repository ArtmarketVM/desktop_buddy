import { useCallback, useEffect, useState } from "react";
import { Hint } from "../core/Hint";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api/tauri";
import { isMac } from "../api/platform";

export function MacPermissions({
  variant = "callout",
}: {
  /** "row" is a Settings row with status and actions; "callout" shows only when access is missing. */
  variant?: "callout" | "row";
} = {}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async (manual = false) => {
    if (manual) {
      setChecking(true);
      setNote("");
    }
    try {
      const next = await invoke<boolean>("get_accessibility_permission");
      setAllowed(next);
      setError("");
      // A background refresh must dismiss instructions for a permission already granted.
      if (next) setNote("");
      if (manual)
        setNote(
          next
            ? "Accessibility access is enabled. Tracking can start."
            : "Still blocked. If sumi is already switched on in System Settings, macOS tied that switch to an older copy of the app. Choose Reset and ask again.",
        );
    } catch (e) {
      setError(String(e));
    } finally {
      if (manual) setChecking(false);
    }
  }, []);
  useEffect(() => {
    if (!desktop || !isMac) return;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  useEffect(() => {
    if (!desktop || !isMac || allowed !== false) return;
    // Pick up the change as soon as the switch is flipped in System Settings.
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [allowed, refresh]);
  if (!isMac || !desktop) return null;
  const request = () =>
    void invoke<boolean>("request_accessibility_permission")
      .then(setAllowed)
      .catch((e) => setError(String(e)));
  const reset = () => {
    setNote("");
    void invoke<boolean>("reset_accessibility_permission")
      .then((next) => {
        setAllowed(next);
        setNote(
          next
            ? "Accessibility access is enabled. Tracking can start."
            : "Switch sumi on when macOS asks. This page updates by itself.",
        );
      })
      .catch((e) => setError(String(e)));
  };
  if (variant === "row")
    return (
      <>
        <div className="setting-row" aria-label="macOS permissions">
          <span className="lbl">
            Accessibility access
            <Hint text="Tracking reads the title of the front window through macOS Accessibility. If it stays blocked after an update, Reset and allow it again in System Settings → Privacy & Security → Accessibility." />
          </span>
          <span className="acts">
            <span
              className={`tracking-state ${allowed ? "running" : allowed === false ? "attention" : "paused"}`}
              role="status"
            >
              <i aria-hidden="true" />
              {allowed === null ? "Checking…" : allowed ? "Granted" : "Needed"}
            </span>
            {allowed === false && (
              <button
                type="button"
                className="text-button row-link"
                onClick={request}
              >
                Allow access
              </button>
            )}
            <button
              type="button"
              className="text-button row-link"
              disabled={checking}
              onClick={() => void refresh(true)}
            >
              {checking ? "Checking…" : "Check again"}
            </button>
            {allowed === false && (
              <button
                type="button"
                className="text-button row-link muted"
                onClick={reset}
              >
                Reset
              </button>
            )}
          </span>
        </div>
        {note && (
          <p className="helper" role="status">
            {note}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </>
    );
  return (
    <div className="mac-permissions" aria-label="macOS permissions">
      {allowed === false ? (
        <p className="callout" role="status">
          Accessibility access is needed for tracking.
          <span className="callout-actions">
            <button
              type="button"
              className="text-button callout-action"
              onClick={() => {
                void invoke<boolean>("request_accessibility_permission")
                  .then(setAllowed)
                  .catch((e) => setError(String(e)));
              }}
            >
              Allow access
            </button>
            <button
              type="button"
              className="text-button callout-action"
              onClick={() => {
                setNote("");
                void invoke<boolean>("reset_accessibility_permission")
                  .then((next) => {
                    setAllowed(next);
                    setNote(
                      next
                        ? "Accessibility access is enabled. Tracking can start."
                        : "Switch sumi on when macOS asks. This page updates by itself.",
                    );
                  })
                  .catch((e) => setError(String(e)));
              }}
            >
              Reset and ask again
            </button>
          </span>
        </p>
      ) : null}
      {note && (
        <p className="helper" role="status">
          {note}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
