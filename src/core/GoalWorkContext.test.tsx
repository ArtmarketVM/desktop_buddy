// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { GoalWorkContext } from "./GoalWorkContext";
import type { CoreGoal } from "./types";
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const goal: CoreGoal = {
  id: 7,
  title: "Hackathon",
  status: "open",
  area_id: 1,
  focused_seconds: 0,
  plan: {
    goal_id: 7,
    revision: 1,
    current_step: "s1",
    done_when: "",
    steps: [{ id: "s1", text: "Write outline", done: false }],
  },
};
const context = {
  id: 1,
  goal_id: 7,
  step_id: "s1",
  summary: "Outline started",
  next_action: "Review draft",
  status: "waiting" as const,
  last_app: "Editor",
  last_window: null,
  waiting_for: "Reviewer feedback",
  created_at: "2026-10-12T10:00:00Z",
  updated_at: "2026-10-12T10:00:00Z",
  pinned: false,
  parked_at: "2026-10-12T10:00:00Z",
  last_result: "Requirements confirmed",
};
const run = async (work: () => Promise<unknown>) => {
  try {
    await work();
    return true;
  } catch {
    return false;
  }
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(invoke).mockResolvedValue({ message: "Checkpoint saved", context });
});
afterEach(cleanup);
it("parks the exact goal through Rust and shows its authoritative receipt", async () => {
  render(<GoalWorkContext goal={goal} busy={false} run={run} />);
  await userEvent.click(screen.getByRole("button", { name: "Park" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("run_work_context_action", {
      goalId: 7,
      operation: "park",
    }),
  );
  expect(screen.getByRole("status").textContent).toBe("Checkpoint saved");
});
it("keeps parked checkpoints compact until explicitly opened", async () => {
  render(
    <GoalWorkContext
      goal={{ ...goal, status: "deferred", work_context: context }}
      busy={false}
      run={run}
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Checkpoint for Hackathon" }),
  );
  for (const text of [
    "Parked",
    "Waiting for:",
    "Outline started",
    "Review draft",
    "Reviewer feedback",
    "Requirements confirmed",
  ])
    expect(screen.getByText(text)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Park" })).toBeNull();
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("resumes the exact parked goal without a frontend state mutation", async () => {
  render(
    <GoalWorkContext
      goal={{ ...goal, status: "deferred", work_context: context }}
      busy={false}
      run={run}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Checkpoint for Hackathon" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Resume" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("run_work_context_action", {
      goalId: 7,
      operation: "resume",
    }),
  );
});
it("blocks repeat clicks during checkpoint generation", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<GoalWorkContext goal={goal} busy={false} run={run} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Park" }));
  const button = screen.getByRole("button", {
    name: "Saving checkpoint…",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  await user.click(button);
  expect(invoke).toHaveBeenCalledOnce();
  finish({ message: "Saved", context });
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Saved"),
  );
});
it("failed generation leaves the action available and shows no success receipt", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("Sharing is off"));
  render(<GoalWorkContext goal={goal} busy={false} run={run} />);
  await userEvent.click(screen.getByRole("button", { name: "Park" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Park" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  expect(screen.queryByRole("status")).toBeNull();
});
it("read-only and completed goals expose no workflow mutations", async () => {
  const { rerender } = render(
    <GoalWorkContext
      goal={{ ...goal, work_context: context }}
      busy={false}
      run={run}
      readOnly
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Checkpoint for Hackathon" }),
  );
  expect(screen.queryByRole("button", { name: "Park" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  expect(screen.getByText("Outline started")).toBeTruthy();
  rerender(
    <GoalWorkContext
      goal={{ ...goal, status: "completed" }}
      busy={false}
      run={run}
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("allows reading while the shared busy lock blocks workflow mutations", async () => {
  render(
    <GoalWorkContext
      goal={{ ...goal, work_context: context }}
      busy
      run={run}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Checkpoint for Hackathon" }),
  );
  for (const name of ["Park", "Resume"])
    expect(
      (screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
    ).toBe(true);
});
