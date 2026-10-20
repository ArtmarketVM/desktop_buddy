import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { fixtureReply } from "./fixtures";

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
mockWindows(buddy ? "buddy" : "main");
const calls: string[] = [];
const unexpected: string[] = [];
Object.assign(window, { __visual: { calls, unexpected } });
mockIPC(
  (command) => {
    calls.push(command);
    try {
      return structuredClone(fixtureReply(command, theme, buddy));
    } catch (error) {
      unexpected.push(command);
      throw error;
    }
  },
  { shouldMockEvents: true },
);

// Install the mock before any application module evaluates isTauri().
await import("../src/main");
