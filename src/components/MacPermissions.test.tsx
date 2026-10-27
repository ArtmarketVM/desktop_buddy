// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { MacPermissions } from "./MacPermissions";

const platform = vi.hoisted(() => ({ isMac: true }));
vi.mock("../api/platform", () => platform);
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  platform.isMac = true;
});
afterEach(cleanup);

describe("macOS Accessibility state", () => {
  it("dismisses old repair instructions when permission becomes available", async () => {
    let allowed = false;
    vi.mocked(invoke).mockImplementation(async () => allowed as never);
    render(<MacPermissions />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Reset and ask again" }),
    );
    expect(
      await screen.findByText(/Switch sumi on when macOS asks/),
    ).toBeTruthy();
    allowed = true;
    fireEvent.focus(window);
    await waitFor(() =>
      expect(screen.queryByText(/Switch sumi on when macOS asks/)).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "Allow access" })).toBeNull();
    // Granted access shows nothing at all; the status row in Settings carries the state.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("checks an existing grant after remount without requesting or resetting it", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    const first = render(<MacPermissions />);
    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<MacPermissions />);
    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "get_accessibility_permission",
      "get_accessibility_permission",
    ]);
  });

  it("reports a failed check without automatically changing system permissions", async () => {
    vi.mocked(invoke).mockRejectedValue(
      new Error("Permission check unavailable"),
    );
    render(<MacPermissions />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Permission check unavailable",
    );
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      "get_accessibility_permission",
    );
  });

  it("does not request macOS permissions on Windows", () => {
    platform.isMac = false;
    const { container } = render(<MacPermissions />);
    expect(container.textContent).toBe("");
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("minimal onboarding permission prompt", () => {
  it("shows no granted badge, repair controls or extra text after access is allowed", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    const view = render(<MacPermissions variant="onboarding" />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_accessibility_permission"),
    );
    expect(view.container.textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows one action only when access is missing and clears itself after the user grants it", async () => {
    let allowed = false;
    vi.mocked(invoke).mockImplementation(async () => allowed as never);
    render(<MacPermissions variant="onboarding" />);
    await screen.findByText("Allow Accessibility to track activity.");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("request_accessibility_permission"),
    );
    allowed = true;
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("button")).toBeNull();
  });
});
