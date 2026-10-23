import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { fixtureReply } from "./fixtures";
import type { CoreSnapshot } from "../src/core/types";
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
const mutations: Array<{ command: string; args: unknown }> = [];
let calendarData: CoreSnapshot | null = null;
let settingsData: Dashboard | null = null;
let settingsWorkspace: CoreSnapshot | null = null;
const state = { calls, unexpected, mutations, ready: false };
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
      if (query.has("settings-audit")) {
        settingsData ??= structuredClone(
          fixtureReply("get_dashboard", theme, false),
        ) as Dashboard;
        settingsWorkspace ??= structuredClone(
          fixtureReply("get_core_snapshot", theme, false),
        ) as CoreSnapshot;
        if (command === "get_dashboard") return structuredClone(settingsData);
        if (command === "get_core_snapshot")
          return structuredClone(settingsWorkspace);
        if (command === "set_core_preferences") {
          const input = args as { preferences: CoreSnapshot["preferences"] };
          settingsWorkspace.preferences = structuredClone(input.preferences);
          settingsData.buddy.companion!.preferences.movement_reminder =
            input.preferences.movement_reminders;
          mutations.push({ command, args: structuredClone(args) });
          return null;
        }
        if (command === "set_companion_preferences") {
          settingsData.buddy.companion!.preferences = structuredClone(
            (
              args as {
                preferences: NonNullable<
                  Dashboard["buddy"]["companion"]
                >["preferences"];
              }
            ).preferences,
          );
          mutations.push({ command, args: structuredClone(args) });
          return null;
        }
        if (command === "save_core_identity") {
          const input = args as {
            name: string;
            email: string;
            autostart: boolean;
          };
          settingsData.user_settings!.profile.name = input.name;
          settingsData.user_settings!.profile.email = input.email;
          settingsData.user_settings!.autostart = input.autostart;
          mutations.push({ command, args: structuredClone(args) });
          return null;
        }
      }
      if (query.has("many-goals")) {
        if (command === "get_core_snapshot") {
          if (!calendarData) {
            const data = structuredClone(
              fixtureReply(command, theme, buddy),
            ) as CoreSnapshot;
            data.goals = Array.from({ length: 40 }, (_, i) => ({
              ...structuredClone(data.goals[0]),
              id: 100 + i,
              title: `Calendar goal ${i + 1}`,
              due_at: null,
              plan: {
                ...structuredClone(data.goals[0].plan),
                goal_id: 100 + i,
                steps: [],
                current_step: null,
              },
            }));
            data.today = data.goals.map((goal) => goal.id);
            data.date_goals = [...data.today];
            data.focused_goal_id = 100;
            calendarData = data;
          }
          return structuredClone(calendarData);
        }
        if (
          command === "save_core_goal" ||
          command === "set_core_goal_estimate"
        ) {
          if (!calendarData)
            throw new Error("Calendar fixture not initialized");
          const input = args as {
            plan?: { goal_id: number };
            details?: { due_at: string | null };
            id?: number;
            minutes?: number | null;
          };
          const goal = calendarData.goals.find(
            (goal) => goal.id === (input.plan?.goal_id ?? input.id),
          );
          if (!goal) throw new Error("Unknown synthetic calendar goal");
          if (command === "save_core_goal")
            goal.due_at = input.details?.due_at ?? null;
          else goal.estimated_minutes = input.minutes ?? null;
          mutations.push({ command, args: structuredClone(args) });
          return structuredClone(calendarData);
        }
      }
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
