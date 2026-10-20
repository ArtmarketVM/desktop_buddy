// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopBuddy } from "./DesktopBuddy";
import { defaultBuddyPreferences } from "../types";
import { defaultCompanionView } from "../companion/types";
const { startDragging } = vi.hoisted(() => ({
  startDragging: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging }),
}));
vi.mock("../api/tauri", () => ({
  desktop: true,
  api: {},
  safeUrl: () => null,
}));
vi.mock("../companion/useBuddyPointer", () => ({ useBuddyPointer: () => {} }));
vi.mock("../companion/useBuddyActions", () => ({
  useBuddyActions: () => ({ events: {}, visible: false }),
}));
vi.mock("../companion/CompanionChat", () => ({
  CompanionChat: ({ onMove }: { onMove: React.PointerEventHandler }) => (
    <header onPointerDown={onMove}>
      <strong>sumi chat</strong>
      <button>Close chat</button>
    </header>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("drags the native chat and mascot together from the header, leaving controls clickable", async () => {
  // JSDOM otherwise drops the button value in pointer events.
  vi.stubGlobal("PointerEvent", MouseEvent);
  render(
    <DesktopBuddy
      view={{
        preferences: defaultBuddyPreferences,
        companion: { ...defaultCompanionView, chat_open: true },
        suggestion: null,
        decision: null,
        quiet_reason: null,
        snoozed_until: null,
      }}
      onDismiss={() => {}}
      onDnd={() => {}}
    />,
  );
  fireEvent.pointerDown(screen.getByText("sumi chat"), { button: 0 });
  await waitFor(() => expect(startDragging).toHaveBeenCalledTimes(1));
  fireEvent.pointerDown(screen.getByRole("button", { name: "Close chat" }), {
    button: 0,
  });
  fireEvent.pointerDown(screen.getByText("sumi chat"), { button: 2 });
  expect(startDragging).toHaveBeenCalledTimes(1);
});
