// @vitest-environment jsdom
import { Chats } from "../companion/Chats";
import type { BuddyView } from "../types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { DesktopBuddy } from "./DesktopBuddy";
import { defaultCompanionView } from "../companion/types";
import { defaultBuddyPreferences, defaultUserSettings } from "../types";
const bus = vi.hoisted(
  () => new Map<string, Set<(event: { payload: unknown }) => void>>(),
);
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((name: string, callback: (e: { payload: unknown }) => void) => {
    const s = bus.get(name) ?? new Set();
    s.add(callback);
    bus.set(name, s);
    return Promise.resolve(() => s.delete(callback));
  }),
  emit: vi.fn(async (name: string, payload: unknown) => {
    for (const cb of bus.get(name) ?? []) cb({ payload });
  }),
}));
vi.mock("../data/useQuery", () => ({
  useQuery: () => ({
    ready: true,
    data: [
      {
        id: 1,
        title: "Audit chat",
        active: true,
        updated_at: "2026-10-22T10:00:00Z",
      },
    ],
  }),
}));
vi.mock("../companion/Conversation", () => ({
  Conversation: ({ onState }: { onState: (state: string) => void }) => (
    <>
      <button onClick={() => onState("thinking")}>Main chat think</button>
      <button onClick={() => onState("listening")}>Main chat listen</button>
    </>
  ),
}));
vi.mock("../api/tauri", () => ({
  desktop: true,
  safeUrl: () => null,
  api: {
    mascotFrameReady: vi.fn().mockResolvedValue(null),
    buddyPanelReady: vi.fn().mockResolvedValue(null),
    measureBuddyPanel: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("../companion/useBuddyPointer", () => ({ useBuddyPointer: () => {} }));
vi.mock("../companion/useBuddyActions", () => ({
  useBuddyActions: () => ({
    events: {},
    setNativeHovered: () => {},
    visible: false,
  }),
}));
vi.mock("../companion/BuddyActionBar", () => ({ BuddyActionBar: () => null }));
vi.mock("../companion/CompanionChat", () => ({
  CompanionChat: ({ onState }: { onState: (s: string) => void }) => (
    <div>
      <button onClick={() => onState("thinking")}>Audit think</button>
      <button onClick={() => onState("listening")}>Audit listen</button>
      <button onClick={() => onState("idle")}>Audit idle</button>
    </div>
  ),
}));
const view = {
  preferences: defaultBuddyPreferences,
  suggestion: null,
  decision: null,
  quiet_reason: null,
  activity_event: "paused" as const,
  activity_revision: 1,
  completion_revision: 0,
  avatar: defaultUserSettings.profile.avatar,
  companion: defaultCompanionView,
};
beforeEach(() => {
  vi.useFakeTimers();
  bus.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const draw = (v: BuddyView) =>
  render(<DesktopBuddy surface="mascot" view={v} onDnd={() => {}} />);
function send(name: string, payload: unknown) {
  act(() => {
    for (const cb of bus.get(name) ?? []) cb({ payload });
  });
}
it("committed manual completion revision celebrates without a legacy tracker event", () => {
  const ui = draw(view);
  send("buddy://goal-completed", { goalId: "123" });
  ui.rerender(
    <DesktopBuddy
      surface="mascot"
      view={{ ...view, activity_revision: 2, completion_revision: 1 }}
      onDnd={() => {}}
    />,
  );
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, success",
  );
});
it("durable completion revision does celebrate and its frames advance before returning to idle", () => {
  const ui = draw(view);
  ui.rerender(
    <DesktopBuddy
      surface="mascot"
      view={{ ...view, completion_revision: 1 }}
      onDnd={() => {}}
    />,
  );
  const svg = screen.getByRole("img");
  expect(svg.getAttribute("aria-label")).toBe("sumi companion, success");
  const a = svg.innerHTML;
  act(() => vi.advanceTimersByTime(1000));
  expect(svg.innerHTML).not.toBe(a);
  act(() => vi.advanceTimersByTime(600));
  expect(svg.getAttribute("aria-label")).toBe("sumi companion, idle");
});
it("mini-chat forwards thinking and listening to the separate mascot and listening animates", () => {
  const v = {
    ...view,
    companion: { ...defaultCompanionView, chat_open: true },
  };
  render(
    <>
      <DesktopBuddy surface="mascot" view={v} onDnd={() => {}} />
      <DesktopBuddy surface="panel" view={v} onDnd={() => {}} />
    </>,
  );
  fireEvent.click(screen.getByText("Audit think"));
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, thinking",
  );
  fireEvent.click(screen.getByText("Audit listen"));
  const svg = screen.getByRole("img");
  expect(svg.getAttribute("aria-label")).toBe("sumi companion, listening");
  const a = svg.innerHTML;
  act(() => vi.advanceTimersByTime(1000));
  expect(svg.innerHTML).not.toBe(a);
  fireEvent.click(screen.getByText("Audit idle"));
  expect(svg.getAttribute("aria-label")).toBe("sumi companion, idle");
});
it("movement reminder selects stretching and advances its frames", () => {
  draw({
    ...view,
    companion: {
      ...defaultCompanionView,
      intervention: {
        id: "audit",
        kind: "movement",
        text: "Synthetic stretch",
        confidence: 1,
        goal_id: null,
        plan_revision: null,
        step_id: null,
        expires_at: 9999999999,
      },
    },
  });
  const svg = screen.getByRole("img");
  expect(svg.getAttribute("aria-label")).toBe("sumi companion, stretching");
  const a = svg.innerHTML;
  act(() => vi.advanceTimersByTime(1000));
  expect(svg.innerHTML).not.toBe(a);
});
it("quiet mode intentionally masks goal completion and chat state with sleeping", () => {
  draw({
    ...view,
    activity_revision: 2,
    activity_event: "goal_completed",
    companion: { ...defaultCompanionView, quiet_mode: true, chat_open: true },
  });
  send("buddy://chat-pose", { source: "panel", state: "thinking" });
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, sleeping",
  );
});
it("idle from inactivity uses resting whereas normal idle uses the working drawing", () => {
  const ui = draw({
    ...view,
    companion: { ...defaultCompanionView, state: "sleeping" },
  });
  const svg = screen.getByRole("img");
  const sleeping = svg.innerHTML;
  expect(svg.getAttribute("aria-label")).toBe("sumi companion, sleeping");
  ui.rerender(<DesktopBuddy surface="mascot" view={view} onDnd={() => {}} />);
  expect(svg.getAttribute("aria-label")).toBe("sumi companion, idle");
  expect(svg.innerHTML).not.toBe(sleeping);
});

it("does not replay historical completions on startup, refresh or leaving Quiet mode", () => {
  const ui = draw({ ...view, completion_revision: 20 });
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, idle",
  );
  ui.rerender(
    <DesktopBuddy
      surface="mascot"
      view={{
        ...view,
        completion_revision: 21,
        companion: { ...defaultCompanionView, quiet_mode: true },
      }}
      onDnd={() => {}}
    />,
  );
  ui.rerender(
    <DesktopBuddy
      surface="mascot"
      view={{ ...view, completion_revision: 21 }}
      onDnd={() => {}}
    />,
  );
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, idle",
  );
});
it("closing the panel does not clear another chat surface's thinking pose", () => {
  draw(view);
  send("buddy://chat-pose", { source: "workspace", state: "thinking" });
  send("buddy://chat-pose", { source: "panel", state: "idle" });
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, thinking",
  );
  send("buddy://chat-pose", { source: "workspace", state: "idle" });
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, idle",
  );
});
it("shows thinking for a real background reasoning job and returns after it ends", () => {
  const ui = draw({ ...view, background_thinking: true });
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, thinking",
  );
  ui.rerender(<DesktopBuddy surface="mascot" view={view} onDnd={() => {}} />);
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, idle",
  );
});

it("the actual Chats page forwards its conversation state to the desktop mascot", () => {
  const ui = render(
    <>
      <DesktopBuddy surface="mascot" view={view} onDnd={() => {}} />
      <Chats
        dashboard={
          {
            buddy: view,
            user_settings: defaultUserSettings,
            goal: null,
            goal_plan: null,
          } as import("../types").Dashboard
        }
        onChanged={async () => {}}
      />
    </>,
  );
  fireEvent.click(screen.getByText("Main chat think"));
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, thinking",
  );
  fireEvent.click(screen.getByText("Main chat listen"));
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, listening",
  );
  ui.rerender(<DesktopBuddy surface="mascot" view={view} onDnd={() => {}} />);
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "sumi companion, idle",
  );
});
