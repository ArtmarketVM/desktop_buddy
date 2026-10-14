// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { WindowActivity } from "./WindowActivity";
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows unassigned windows without claiming completion and requests the selected local period", async () => {
  vi.mocked(invoke).mockResolvedValue({
    total_active_seconds: 60,
    total_sessions: 1,
    apps: [["Editor", 60]],
    sessions: [
      {
        id: 1,
        goal_id: null,
        app: "Editor",
        title: "Architecture notes",
        domain: null,
        started_at: "2026-10-14T10:00:00Z",
        ended_at: "2026-10-14T10:01:00Z",
        active_seconds: 60,
        idle_seconds: 0,
      },
    ],
  });
  render(<WindowActivity first="2026-10-14" last="2026-10-14" />);
  await screen.findByText("Architecture notes");
  expect(screen.getByText("No goal assigned")).toBeTruthy();
  expect(screen.getByText(/not proof of completed work/)).toBeTruthy();
  expect(invoke).toHaveBeenCalledWith("get_window_activity", {
    first: new Date("2026-10-14T00:00:00").toISOString(),
    last: new Date("2026-10-15T00:00:00").toISOString(),
    goalId: null,
  });
});
it("filters a goal view and sanitizes an IPC failure", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("SECRET_CANARY"));
  render(<WindowActivity first="2026-10-14" last="2026-10-14" goalId={2} />);
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(document.body.textContent).not.toContain("SECRET_CANARY");
});
