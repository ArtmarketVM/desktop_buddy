import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, desktop, safeUrl } from "../api/tauri";
import type { BuddyView } from "../types";

export function DesktopBuddy({
  view,
  onDismiss,
  onDnd,
}: {
  view: BuddyView;
  onDismiss: () => void;
  onDnd: () => void;
}) {
  const [error, setError] = useState("");
  const card = view.suggestion || view.decision;
  async function action(work: () => Promise<unknown>) {
    try {
      setError("");
      await work();
    } catch {
      setError("Buddy could not complete this action. Please try again.");
    }
  }
  return (
    <main className={`desktop-buddy ${card ? "expanded" : "compact"}`}>
      {card && (
        <section className="suggestion-card" aria-live="polite">
          <span className="eyebrow">
            {view.suggestion
              ? "A LITTLE HELP FOR YOUR GOAL"
              : "A LITTLE CHECK-IN"}
          </span>
          <h2>{view.suggestion?.title || "A moment to refocus?"}</h2>
          <p>{card.reason}</p>
          {view.suggestion && (
            <button
              onClick={() =>
                void action(async () => {
                  const url = safeUrl(view.suggestion!.url);
                  if (url) await openUrl(url);
                })
              }
            >
              Open resource ↗
            </button>
          )}
          <div className="settings-actions">
            {view.decision?.id && (
              <button
                className="text-button"
                onClick={() =>
                  void action(() => api.feedback(view.decision!.id!, true))
                }
              >
                This is related
              </button>
            )}
            <button className="text-button" onClick={onDismiss}>
              Not now · 1 hour
            </button>
            <button className="text-button" onClick={onDnd}>
              Do not disturb
            </button>
          </div>
          <small>Closes after 45 seconds.</small>
        </section>
      )}
      <button
        className="desktop-character"
        aria-label="Drag Buddy to move"
        title="Drag to move Buddy"
        onPointerDown={(event) => {
          if (desktop && event.button === 0)
            void action(() => getCurrentWindow().startDragging());
        }}
      >
        <span className="desktop-eyes">
          <i />
          <i />
        </span>
        <span className="desktop-smile" />
        <span className="desktop-arm" />
      </button>
      <button
        className="workspace-link"
        onClick={() => void action(api.openWorkspace)}
      >
        Workspace
      </button>
      {error && <small role="alert">{error}</small>}
    </main>
  );
}
