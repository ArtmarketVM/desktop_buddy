// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell, type WorkspacePage } from "./AppShell";
import { defaultUserSettings } from "../types";
import type { UpdateSnapshot } from "../updates/controller";

const base = {
  page: "focus" as WorkspacePage,
  onNavigate: vi.fn(),
  profile: defaultUserSettings.profile,
  version: "test",
  update: { phase: "idle", info: null } as UpdateSnapshot,
  onUpdates: vi.fn(),
};
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

it("keeps utility controls in the requested reading and keyboard order above services and profile", () => {
  render(<AppShell {...base}>Today</AppShell>);
  const controls = screen.getByRole("navigation", {
    name: "Workspace controls",
  });
  expect(
    within(controls)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label")),
  ).toEqual([
    "Settings",
    "Updates",
    "Feedback",
    "Switch to dark theme",
    "Quiet mode",
  ]);
  const services = screen.getByRole("group", { name: "AI services" });
  const profile = screen.getByRole("button", { name: "Open profile menu" });
  expect(
    controls.compareDocumentPosition(services) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    services.compareDocumentPosition(profile) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("keeps Quiet mode available outside Today and exposes its actual state", async () => {
  const user = userEvent.setup();
  const onQuietMode = vi.fn();
  const view = render(
    <AppShell {...base} page="chats" onQuietMode={onQuietMode}>
      Chats
    </AppShell>,
  );
  expect(
    within(screen.getByRole("button", { name: "Quiet mode" })).getByText("Off"),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Quiet mode", pressed: false }),
  );
  expect(onQuietMode).toHaveBeenCalledTimes(1);
  view.rerender(
    <AppShell {...base} page="chats" quietMode onQuietMode={onQuietMode}>
      Chats
    </AppShell>,
  );
  expect(
    screen.getByRole("button", { name: "Quiet mode", pressed: true }).title,
  ).toContain("Chat stays available");
  expect(
    within(screen.getByRole("button", { name: "Quiet mode" })).getByText("On"),
  ).toBeTruthy();
  await user.keyboard(" ");
  expect(onQuietMode).toHaveBeenCalledTimes(2);
});

it("preserves the separate theme action and blocks Quiet mode while a change is pending", async () => {
  const user = userEvent.setup();
  const onTheme = vi.fn();
  const onQuietMode = vi.fn();
  render(
    <AppShell
      {...base}
      theme="dark"
      onTheme={onTheme}
      quietModeDisabled
      onQuietMode={onQuietMode}
    >
      Today
    </AppShell>,
  );
  await user.click(
    screen.getByRole("button", { name: "Switch to light theme" }),
  );
  expect(onTheme).toHaveBeenCalledWith("light");
  await user.click(screen.getByRole("button", { name: "Quiet mode" }));
  expect(onQuietMode).not.toHaveBeenCalled();
});

it("retains sidebar-toggle focus and service controls through collapse and expand", async () => {
  const user = userEvent.setup();
  render(<AppShell {...base}>Today</AppShell>);
  const services = screen.getByRole("group", { name: "AI services" });
  const refresh = screen.getByRole("button", { name: "Check AI connections" });
  const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
  await user.click(toggle);
  expect(document.activeElement).toBe(toggle);
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toBe(toggle);
  expect(screen.getByRole("group", { name: "AI services" })).toBe(services);
  expect(screen.getByRole("button", { name: "Check AI connections" })).toBe(
    refresh,
  );
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBe(toggle);
});

it("keeps the user's name and profile actions accessible in the collapsed sidebar", async () => {
  const user = userEvent.setup();
  render(
    <AppShell {...base} profile={{ ...base.profile, name: "Mark" }}>
      Today
    </AppShell>,
  );
  const profile = screen.getByRole("button", { name: "Open profile menu" });
  expect(profile.textContent).toBe("Mark");
  expect(profile.title).toBe("Mark");
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(profile.textContent).toBe("Mark");
  await user.click(profile);
  expect(screen.getByRole("button", { name: "Edit profile" })).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(profile);
});
