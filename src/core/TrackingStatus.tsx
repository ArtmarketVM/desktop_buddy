import type { Dashboard } from "../types";

export function TrackingStatus({
  dashboard,
  onSettings,
}: {
  dashboard: Pick<Dashboard, "status" | "goal_matching" | "goal"> &
    Partial<Pick<Dashboard, "buddy">>;
  onSettings: () => void;
}) {
  const { status, goal_matching: matching, goal } = dashboard;
  const needsSettings = !status.tracking || !!status.tracking_error;
  const message = !status.tracking
    ? "Activity tracking is paused. No app activity or goal time is being recorded."
    : status.tracking_error
      ? `Activity tracking is blocked. ${status.tracking_error}`
      : matching?.enabled && matching.goal_id === null
        ? `Activity is awaiting a goal match. ${matching.reason ?? "Waiting for a clear goal match."}`
        : !goal
          ? "Choose an open goal in Today to record activity."
          : `Activity tracking is on · ${goal.text}.`;
  return (
    <section className="core-section" aria-label="Activity tracking status">
      <p role="status">{message}</p>
      <p className="helper">
        Relevant activity counts toward recorded work time. Mark steps and goals
        complete when you finish them.
      </p>
      <button className="text-button" onClick={onSettings}>
        {needsSettings ? "Set up activity tracking" : "Activity settings"}
      </button>
      {dashboard.buddy?.companion?.progress_status && (
        <p className="helper">{dashboard.buddy.companion.progress_status}</p>
      )}
    </section>
  );
}
