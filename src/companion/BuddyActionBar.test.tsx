// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DesktopBuddy } from "../components/DesktopBuddy";
import { WorkspaceBuddy } from "./WorkspaceBuddy";
import { defaultCompanionView } from "./types";
import {
  defaultBuddyPreferences,
  defaultUserSettings,
  type Dashboard,
} from "../types";
import { BUDDY_ACTION_IDLE_MS, useBuddyActions } from "./useBuddyActions";
import { api } from "../api/tauri";

vi.mock("../api/tauri", () => ({
  desktop: true,
  safeUrl: () => null,
  api: {
    openChat: vi.fn().mockResolvedValue(undefined),
    closeChat: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("./useBuddyPointer", () => ({ useBuddyPointer: () => {} }));
vi.mock("./Conversation", () => ({
  Conversation: ({ mode, onClose }: { mode: string; onClose: () => void }) => (
    <div>
      <span>Input mode: {mode}</span>
      <button onClick={onClose}>Close test chat</button>
    </div>
  ),
}));
vi.mock("./CompanionChat", () => ({
  CompanionChat: () => <div>Native chat</div>,
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const appearance = { ...defaultUserSettings.profile.avatar, color: "#C9D3D8" };
const view = {
  preferences: defaultBuddyPreferences,
  suggestion: null,
  decision: null,
  quiet_reason: null,
  avatar: appearance,
  companion: defaultCompanionView,
};
const dashboard = {
  buddy: view,
  user_settings: defaultUserSettings,
  goal: null,
  goal_plan: null,
} as Dashboard;
function advance() {
  act(() => vi.advanceTimersByTime(BUDDY_ACTION_IDLE_MS));
}
function bar() {
  return document.querySelector(".buddy-action-bar") as HTMLElement;
}
function buttons() {
  return document.querySelector(".buddy-action-buttons") as HTMLElement;
}
function surface() {
  return document.querySelector(".buddy-action-surface") as HTMLElement;
}
function showWorkspace() {
  return render(
    <WorkspaceBuddy dashboard={dashboard} onChanged={async () => {}} />,
  );
}

it.each(["desktop", "workspace"])(
  "%s controls use the selected avatar color and retire from interaction after idle",
  (surface) => {
    if (surface === "desktop")
      render(<DesktopBuddy view={view} onDnd={() => {}} />);
    else showWorkspace();
    expect(bar().style.getPropertyValue("--buddy-control-color")).toBe(
      appearance.color,
    );
    expect(buttons().getAttribute("aria-hidden")).toBe("false");
    advance();
    expect(buttons().getAttribute("aria-hidden")).toBe("true");
    expect(buttons().hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "Talk to sumi" })).toBeNull();
  },
);
it("hovering the character reveals controls and crossing the gap into the bar does not hide them", () => {
  showWorkspace();
  advance();
  const character = screen.getByRole("button", { name: "Open sumi chat" });
  fireEvent.pointerEnter(character);
  advance();
  expect(buttons().getAttribute("aria-hidden")).toBe("false");
  fireEvent.pointerLeave(character);
  act(() => vi.advanceTimersByTime(300));
  fireEvent.pointerEnter(surface());
  advance();
  expect(buttons().getAttribute("aria-hidden")).toBe("false");
  fireEvent.pointerLeave(surface());
  advance();
  expect(buttons().getAttribute("aria-hidden")).toBe("true");
});
it("keyboard focus reveals controls and keeps them reachable until focus leaves", () => {
  showWorkspace();
  const outside = document.createElement("button");
  document.body.append(outside);
  advance();
  const character = screen.getByRole("button", { name: "Open sumi chat" });
  act(() => character.focus());
  advance();
  const write = screen.getByRole("button", { name: "Write to sumi" });
  act(() => write.focus());
  advance();
  expect(buttons().hasAttribute("inert")).toBe(false);
  act(() => outside.focus());
  advance();
  expect(buttons().getAttribute("aria-hidden")).toBe("true");
  outside.remove();
});
it("an open workspace chat pins controls and they hide again after closing", () => {
  showWorkspace();
  fireEvent.click(screen.getByRole("button", { name: "Talk to sumi" }));
  advance();
  expect(screen.getByText("Input mode: voice")).toBeTruthy();
  expect(buttons().getAttribute("aria-hidden")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Close test chat" }));
  advance();
  expect(buttons().getAttribute("aria-hidden")).toBe("true");
});
it("native text and voice controls retain their existing open-chat callbacks", async () => {
  render(<DesktopBuddy view={view} onDnd={() => {}} />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Write to sumi" })),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Talk to sumi" })),
  );
  expect(api.openChat).toHaveBeenCalledTimes(2);
});
it("an open native chat keeps controls visible even after the idle deadline", () => {
  render(
    <DesktopBuddy
      view={{
        ...view,
        companion: { ...defaultCompanionView, chat_open: true },
      }}
      onDnd={() => {}}
    />,
  );
  advance();
  advance();
  expect(buttons().getAttribute("aria-hidden")).toBe("false");
});
it("changing the selected color updates controls and unmount clears the idle timer", () => {
  const rendered = showWorkspace();
  rendered.rerender(
    <WorkspaceBuddy
      dashboard={{
        ...dashboard,
        buddy: { ...view, avatar: { ...appearance, color: "#E8EEF0" } },
      }}
      onChanged={async () => {}}
    />,
  );
  expect(bar().style.getPropertyValue("--buddy-control-color")).toBe("#E8EEF0");
  rendered.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps a visible capsule surface when the two action buttons collapse", () => {
  showWorkspace();
  act(() => vi.advanceTimersByTime(499));
  expect(bar().getAttribute("data-collapsed")).toBe("false");
  act(() => vi.advanceTimersByTime(1));
  expect(bar().getAttribute("data-collapsed")).toBe("true");
  expect(surface().hasAttribute("inert")).toBe(false);
  fireEvent.pointerEnter(surface());
  expect(bar().getAttribute("data-collapsed")).toBe("false");
});

it("native hover reveals controls without a click and overrides stale DOM hover after click-through", () => {
  const { result } = renderHook(() => useBuddyActions(false));
  advance();
  expect(result.current.visible).toBe(false);
  act(() => result.current.setNativeHovered(true));
  expect(result.current.visible).toBe(true);
  act(() => result.current.events.onPointerEnter());
  act(() => result.current.setNativeHovered(false));
  advance();
  expect(result.current.visible).toBe(false);
});

it("quiet mode closes the workspace bubble, rests, and routes explicit chat to the workspace", () => {
  const changed = async () => {};
  const ui = render(
    <WorkspaceBuddy dashboard={dashboard} onChanged={changed} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open sumi chat" }));
  expect(screen.getByText("Input mode: text")).toBeTruthy();
  ui.rerender(
    <WorkspaceBuddy
      dashboard={{
        ...dashboard,
        buddy: {
          ...view,
          companion: { ...defaultCompanionView, quiet_mode: true },
        },
      }}
      onChanged={changed}
    />,
  );
  expect(screen.queryByText("Input mode: text")).toBeNull();
  expect(
    screen.getByRole("img", { name: "sumi companion, sleeping" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open sumi chat" }));
  expect(api.openChat).toHaveBeenCalledWith("ask");
  expect(screen.queryByText("Input mode: text")).toBeNull();
  act(() =>
    window.dispatchEvent(new CustomEvent("buddy:ask-goal", { detail: {} })),
  );
  expect(screen.queryByText("Input mode: text")).toBeNull();
  ui.rerender(<WorkspaceBuddy dashboard={dashboard} onChanged={changed} />);
  expect(screen.queryByText("Input mode: text")).toBeNull();
});
