import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import type { Dashboard } from "../types";

export function TrackingStatus({
  dashboard,
  onSettings,
  compact = false,
  now,
}: {
  dashboard: Pick<Dashboard, "status" | "goal_matching" | "goal"> &
    Partial<Pick<Dashboard, "buddy" | "goal_plan">>;
  onSettings?: () => void;
  compact?: boolean;
  now?: number;
}) {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const currentTime = now ?? Math.max(clock, Date.now());
  const { status, goal_matching: matching, goal } = dashboard;
  const sampledAt = Date.parse(status.last_collected_at ?? "");
  const fresh =
    Number.isFinite(sampledAt) &&
    currentTime - sampledAt >= -5000 &&
    currentTime - sampledAt < 20000;
  const needsSettings = !status.tracking || !!status.tracking_error;
  const health = needsSettings ? "attention" : fresh ? "active" : "waiting";
  const message = !status.tracking
    ? "Activity tracking is paused. No app activity or goal time is being recorded."
    : status.tracking_error
      ? `Activity tracking is blocked. ${status.tracking_error}`
      : status.demo
        ? "Simulated activity is running. This is not a recording of your work."
        : matching?.enabled && matching.goal_id === null
          ? `Activity is awaiting a goal match. ${matching.reason ?? "Waiting for a clear goal match."}`
          : !goal
            ? "Choose an open goal in Today to record activity."
            : !fresh
              ? "Waiting for activity from your work app. No recent activity sample has been received."
              : `Activity tracking is on · ${goal.text}.`;
  const plan = dashboard.goal_plan;
  const step =
    plan?.steps.find((item) => item.id === plan.current_step && !item.done) ??
    plan?.steps.find((item) => !item.done);
  if (!compact)
    return (
      <section className="core-section" aria-label="Activity tracking status">
        <p role="status">{message}</p>
        <p className="helper">
          Relevant activity counts toward recorded work time. Mark steps and
          goals complete when you finish them.
        </p>
        {onSettings && (
          <button className="text-button" onClick={onSettings}>
            {needsSettings ? "Set up activity tracking" : "Activity settings"}
          </button>
        )}
        {dashboard.buddy?.companion?.progress_status && (
          <p className="helper">{dashboard.buddy.companion.progress_status}</p>
        )}
      </section>
    );
  return (
    <section
      className={`tracking-settings-status ${health}`}
      aria-label="Activity tracking status"
    >
      <div className="tracking-status-heading">
        <span className="tracking-health-dot" aria-hidden="true" />
        <strong>sumi is running</strong>
        <span className="tracking-health-label">
          {!status.tracking
            ? "Tracking paused"
            : status.tracking_error
              ? "Tracking blocked"
              : status.demo
                ? "Simulated activity"
                : fresh
                  ? "Receiving activity"
                  : "Waiting for activity"}
        </span>
      </div>
      <p className="helper" role="status">
        {message}
      </p>
      <details className="tracking-details">
        <summary>
          <Activity size={14} aria-hidden="true" />
          Tracking details
        </summary>
        {goal && (
          <div className="tracking-goal-context">
            <span>
              <strong>Current goal</strong> {goal.text}
            </span>
            {plan && (
              <span>
                {plan.steps.filter((item) => item.done).length} /{" "}
                {plan.steps.length} steps complete
              </span>
            )}
            {step && (
              <span>
                <strong>Next unfinished step</strong> {step.text}
              </span>
            )}
          </div>
        )}
        <p className="helper">
          {Number.isFinite(sampledAt) ? (
            <>
              Last activity sample:{" "}
              <time dateTime={status.last_collected_at!}>
                {new Date(sampledAt).toLocaleTimeString()}
              </time>
              .
            </>
          ) : (
            "No activity sample received since sumi started."
          )}
        </p>
        {dashboard.buddy?.companion?.progress_status && (
          <p className="helper">{dashboard.buddy.companion.progress_status}</p>
        )}
        <p className="helper">
          Relevant activity counts toward recorded work time. Mark steps and
          goals complete when you finish them. AI completion proposals always
          need your confirmation.
        </p>
        {dashboard.buddy?.quiet_reason && (
          <p className="helper">
            Automatic nudges: {dashboard.buddy.quiet_reason}.
          </p>
        )}
      </details>
    </section>
  );
}
