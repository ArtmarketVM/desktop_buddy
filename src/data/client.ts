import { listen } from "@tauri-apps/api/event";
import { QueryClient, type DataTag } from "./queryClient";
const eventTags: Record<string, readonly DataTag[] | undefined> = {
  "buddy://data-changed": undefined,
  "buddy://event": ["dashboard", "workspace", "coaching"],
  "buddy://chat-updated": [
    "chats",
    "current-chat",
    "coaching",
    "workspace",
    "dashboard",
  ],
  "buddy://goal-completed": ["workspace", "dashboard", "activity", "noticed"],
  "buddy://goal-analysis": ["workspace", "dashboard"],
  "buddy://drafts-updated": ["drafts"],
  "buddy://avatar-color": ["dashboard"],
  unplanned_work_suggestion: ["noticed"],
};
const tags: readonly DataTag[] = [
  "current-chat",
  "dashboard",
  "workspace",
  "drafts",
  "chats",
  "preferences",
  "services",
  "activity",
  "coaching",
  "noticed",
  "engine",
];
export const queryClient = new QueryClient(
  (invalidate) => {
    let disposed = false;
    const stops: Array<() => void> = [];
    const registrations = Object.entries(eventTags).map(([name, defaults]) => {
      return listen<{ resources?: string[]; reset?: boolean; type?: string }>(
        name,
        ({ payload }) => {
          if (disposed) return;
          if (name === "buddy://data-changed") {
            const resources = Array.isArray(payload?.resources)
              ? payload.resources.filter(
                  (tag): tag is DataTag =>
                    typeof tag === "string" && tags.includes(tag as DataTag),
                )
              : [];
            if (resources?.length)
              queryClient.invalidate(resources, payload.reset === true);
          } else if (
            name === "buddy://event" &&
            typeof payload?.type === "string" &&
            payload.type.startsWith("activity")
          ) {
            // The generic activity packet is emitted every backend tick. Time
            // journals use the coalesced data event; foreground transitions only
            // need dashboard state, not every progress/history query.
            if (payload.type !== "activity") invalidate(["dashboard"]);
          } else invalidate(defaults);
        },
      )
        .then((stop) => {
          if (disposed) stop();
          else stops.push(stop);
        })
        .catch((error) => {
          if (!disposed) queryClient.recordError(`subscribe:${name}`, error);
        });
    });
    const focus = () => {
      if (!document.hidden && !disposed) invalidate();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    document.addEventListener("visibilitychange", focus);
    // Close the initial read/subscription gap, including late listener registration.
    void Promise.allSettled(registrations).then(() => {
      if (!disposed) invalidate();
    });
    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  },
  () =>
    typeof document === "undefined" ||
    !document.hidden ||
    // Floating surfaces must receive state before their native window is shown.
    ["mascot", "panel"].includes(
      new URLSearchParams(location.search).get("buddy") ?? "",
    ),
);
