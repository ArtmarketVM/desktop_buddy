import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { fixtureReply } from "./fixtures";
import type { Dashboard } from "../src/types";

const query = new URLSearchParams(location.search);
const theme = query.get("theme") === "dark" ? "dark" : "light";
const buddy = query.has("buddy");
localStorage.clear();
localStorage.setItem("buddy-theme", theme);
localStorage.setItem("buddy-sidebar-collapsed", String(query.has("collapsed")));
Object.defineProperty(globalThis, "isTauri", {
  value: true,
  configurable: true,
});
const surface = query.get("buddy");
let notification = query.has("notification");
let longNotice = false;
let chatOpen = true;
mockWindows(surface === "mascot" ? "mascot" : buddy ? "buddy" : "main");
const calls: string[] = [];
const unexpected: string[] = [];
const state = { calls, unexpected, ready: false };
Object.assign(window, { __visual: state });
mockIPC(
  (command, args) => {
    calls.push(command);
    try {
      if (
        command === "screenshot_permission" &&
        (args as { request?: boolean } | undefined)?.request !== false
      )
        throw new Error("Visual fixtures cannot request system permissions");
      if (
        [
          "mascot_frame_ready",
          "buddy_panel_ready",
          "measure_buddy_panel",
        ].includes(command)
      )
        return null;
      const reply = structuredClone(
        fixtureReply(command, theme, buddy, query.has("review")),
      );
      if (
        command === "get_dashboard" &&
        ["panel", "mascot"].includes(surface ?? "")
      ) {
        const data = reply as Dashboard;
        data.buddy.panel = {
          generation: 1,
          mode: notification ? 2 : 3,
          side: "above",
        };
        data.buddy.companion!.chat_open = !notification && chatOpen;
        data.buddy.companion!.intervention = notification
          ? {
              id: "visual-layout",
              kind: "movement",
              text: longNotice
                ? "A longer reminder with enough detail to exercise internal scrolling. ".repeat(
                    40,
                  )
                : "You have been working for a while. Would a short stretch help?",
              confidence: 1,
              goal_id: null,
              step_id: null,
              plan_revision: null,
              expires_at: 9999999999,
            }
          : null;
      }
      return reply;
    } catch (error) {
      unexpected.push(command);
      throw error;
    }
  },
  { shouldMockEvents: true },
);

// Install the mock before any application module evaluates isTauri().
await import("../src/main");
state.ready = true;

// Only the isolated visual fixture exposes synthetic state changes.
const { queryClient } = await import("../src/data/client");
Object.assign(window, {
  __setSurfaceState: (notice: boolean, long: boolean, chat: boolean) => {
    notification = notice;
    longNotice = long;
    chatOpen = chat;
    queryClient.invalidate(["dashboard"]);
  },
});
