import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api/tauri";
import { isMac } from "../api/platform";

export function MacPermissions() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  async function refresh() {
    try {
      setAllowed(await invoke<boolean>("get_accessibility_permission"));
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    if (!desktop || !isMac) return;
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  if (!isMac || !desktop) return null;
  return (
    <div className="card" aria-label="macOS permissions">
      <p className="helper">
        Accessibility access is{" "}
        {allowed === null
          ? "being checked"
          : allowed
            ? "enabled"
            : "needed for active-window tracking and selected text"}
        . Enable Desktop Buddy in System Settings → Privacy &amp; Security →
        Accessibility (Device Control and Data Access on newer macOS), then
        resume tracking. Goals and chat remain available without this
        permission. No screenshots are taken.
      </p>
      {!allowed && (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            void invoke<boolean>("request_accessibility_permission")
              .then(setAllowed)
              .catch((e) => setError(String(e)));
          }}
        >
          Allow Accessibility access
        </button>
      )}
      <button
        type="button"
        className="text-button"
        onClick={() => void refresh()}
      >
        Check permission
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
