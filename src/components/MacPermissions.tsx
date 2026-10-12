import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api/tauri";
import { isMac } from "../api/platform";

export function MacPermissions() {
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
      if (manual)
        setNote(
          next
            ? "Accessibility access is enabled. Tracking can start."
            : "Still blocked. If Desktop Buddy is already switched on in System Settings, macOS tied that switch to an older copy of the app. Choose Reset and ask again.",
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
                        : "Switch Desktop Buddy on when macOS asks. This page updates by itself.",
                    );
                  })
                  .catch((e) => setError(String(e)));
              }}
            >
              Reset and ask again
            </button>
          </span>
        </p>
      ) : (
        <p className="helper">
          Accessibility access is{" "}
          {allowed === null ? "being checked" : "enabled"}. No screenshots are
          taken.
        </p>
      )}
      {allowed === false && (
        <p className="helper">
          Turn on Desktop Buddy in System Settings → Privacy &amp; Security →
          Accessibility. If it is already on but access stays blocked, for
          example after an update, choose Reset and ask again. Goals and chat
          work without it. No screenshots are taken.{" "}
          <button
            type="button"
            className="text-button"
            disabled={checking}
            onClick={() => void refresh(true)}
          >
            {checking ? "Checking…" : "Check permission"}
          </button>
        </p>
      )}
      {note && (
        <p className="helper" role="status">
          {note}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
