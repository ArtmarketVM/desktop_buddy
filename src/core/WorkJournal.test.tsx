// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "../data/ipc";
import { WorkJournal } from "./WorkJournal";
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("../data/ipc", () => ({ invoke: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("distinguishes observed work from completed work and offers durable Undo only for reversible results", async () => {
  vi.mocked(invoke).mockImplementation(async (name) =>
    name === "get_work_journal"
      ? [
          {
            id: 1,
            title: "Prepare follow-ups",
            app: "Browser",
            occurred_at: "2026-10-21T12:00:00Z",
            source: "observed",
            status: "observed",
            can_undo: false,
          },
          {
            id: 2,
            title: "Send interview follow-up",
            app: "Browser",
            occurred_at: "2026-10-21T12:01:00Z",
            source: "automatic_verified",
            status: "completed",
            can_undo: true,
          },
        ]
      : undefined,
  );
  render(<WorkJournal day="2026-10-21" />);
  expect(
    await screen.findByText(/Observed · completion unverified/),
  ).toBeTruthy();
  expect(screen.getByText(/Automatically verified/)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("undo_work_event", { id: 2 }),
  );
});
