import { AppWindow } from "lucide-react";
import type { ActivitySnapshot } from "../types";
import { duration } from "./ActivityInsights";
export function ActivityTimeline({
  activity,
}: {
  activity: ActivitySnapshot[];
}) {
  return (
    <div className="timeline">
      {activity.length ? (
        [...activity].reverse().map((item, i) => (
          <div className="activity" key={`${item.timestamp}-${i}`}>
            <time>
              {new Date(item.timestamp).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            <span className="app-icon">
              <AppWindow size={19} />
            </span>
            <div>
              <strong>{item.window_title || "Untitled window"}</strong>
              <small>
                {item.process_name}
                {item.browser?.domain ? ` · ${item.browser.domain}` : ""}
                {item.media_playing ? " · Media playing" : ""}
              </small>
            </div>
            <span className="duration">{duration(item.active_seconds)}</span>
          </div>
        ))
      ) : (
        <div className="empty">
          Your activity will appear here once you start a focus session.
        </div>
      )}
    </div>
  );
}
