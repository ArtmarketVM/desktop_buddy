// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TodayPlanner } from "./TodayPlanner";
import { emptyCore, type CoreGoal } from "./types";

afterEach(cleanup);

function snapshot() {
  return {
    ...emptyCore(),
    day_mode: "plan" as const,
    goals: [1, 2, 3].map(
      (id) =>
        ({
          id,
          title: `Previous goal ${id}`,
          status: "open",
          area_id: 1,
          focused_seconds: 0,
          plan: { steps: [] },
        }) as unknown as CoreGoal,
    ),
  };
}

it("keeps multiple choices open through refreshes and saves only when Done is clicked", async () => {
  const save = vi.fn().mockResolvedValue(true);
  const onDirty = vi.fn();
  const props = {
    snapshot: snapshot(),
    disabled: false,
    save,
    onDirty,
    createNew: vi.fn(),
  };
  const view = render(<TodayPlanner {...props} />);
  expect(screen.getByText("Choose from your previous goals")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Done" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Previous goal 1/ }));
  view.rerender(<TodayPlanner {...props} snapshot={snapshot()} />);
  fireEvent.click(screen.getByRole("button", { name: /Previous goal 2/ }));
  expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(2);
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Previous goal 1/ }));
  fireEvent.click(screen.getByRole("button", { name: /Previous goal 3/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
  });
  expect(save).toHaveBeenCalledExactlyOnceWith([2, 3]);
});

it("keeps the selection on a failed save and excludes goals closed during selection", async () => {
  const save = vi.fn().mockResolvedValue(false);
  const props = {
    snapshot: snapshot(),
    disabled: false,
    save,
    onDirty: vi.fn(),
    createNew: vi.fn(),
  };
  const view = render(<TodayPlanner {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /Previous goal 1/ }));
  fireEvent.click(screen.getByRole("button", { name: /Previous goal 2/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
  });
  expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(2);
  const next = snapshot();
  next.goals[0].status = "completed";
  view.rerender(<TodayPlanner {...props} snapshot={next} />);
  expect(screen.getByRole("status").textContent).toBe("1 goal selected");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
  });
  expect(save).toHaveBeenLastCalledWith([2]);
  view.rerender(<TodayPlanner {...props} snapshot={next} disabled />);
  expect(
    screen
      .getAllByRole("button")
      .every((button) => (button as HTMLButtonElement).disabled),
  ).toBe(true);
});
