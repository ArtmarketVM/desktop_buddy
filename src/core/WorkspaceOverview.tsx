import { useEffect } from "react";
export function WorkspaceOverview({ close }: { close: () => void }) {
  useEffect(() => {
    const timer = setTimeout(close, 5000);
    return () => clearTimeout(timer);
  }, [close]);
  return (
    <aside
      className="workspace-overview"
      role="status"
      aria-label="Your workspace at a glance"
    >
      <div>
        <strong>Menu</strong>
        <span>Navigate between Today, Goals and Settings on the left.</span>
      </div>
      <div>
        <strong>Goals</strong>
        <span>Add what matters, edit steps and arrange your day.</span>
      </div>
      <div>
        <strong>Buddy</strong>
        <span>
          Chat here or click your desktop companion. Both share one history.
        </span>
      </div>
      <button
        className="text-button"
        onClick={close}
        aria-label="Dismiss workspace overview"
      >
        Got it
      </button>
    </aside>
  );
}
