// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "./AppShell";
import { defaultUserSettings } from "../types";
import type { UpdateSnapshot } from "../updates/controller";
import config from "../../src-tauri/tauri.conf.json";

vi.mock("../api/platform", () => ({ isMac: true }));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("places the only sidebar control in the macOS toolbar and preserves it when collapsed", async () => {
  const user = userEvent.setup();
  render(
    <AppShell
      page="focus"
      onNavigate={() => {}}
      profile={defaultUserSettings.profile}
      version="test"
      update={{ phase: "idle", info: null } as UpdateSnapshot}
      onUpdates={() => {}}
    >
      Today
    </AppShell>,
  );
  const toolbar = screen.getByRole("toolbar", { name: "Window toolbar" });
  const toggle = within(toolbar).getByRole("button", {
    name: "Collapse sidebar",
  });
  expect(
    screen.getAllByRole("button", { name: "Collapse sidebar" }),
  ).toHaveLength(1);
  expect(toolbar.hasAttribute("data-tauri-drag-region")).toBe(true);
  expect(toggle.hasAttribute("data-tauri-drag-region")).toBe(false);
  await user.click(toggle);
  expect(within(toolbar).getByRole("button", { name: "Expand sidebar" })).toBe(
    toggle,
  );
  expect(document.activeElement).toBe(toggle);
  await user.keyboard("{Enter}");
  expect(
    within(toolbar).getByRole("button", { name: "Collapse sidebar" }),
  ).toBe(toggle);
});

it("keeps native macOS decorations and applies titlebar overlay only to the main window", () => {
  const main = config.app.windows.find((w) => w.label === "main")!;
  const buddy = config.app.windows.find((w) => w.label === "buddy")!;
  expect(main.titleBarStyle).toBe("Overlay");
  expect(main.hiddenTitle).toBe(true);
  expect(main.decorations).not.toBe(false);
  expect(main.trafficLightPosition).toEqual({ x: 16, y: 16 });
  expect(buddy.titleBarStyle).toBeUndefined();
  expect(buddy.decorations).toBe(false);
});
