// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalOrder, moveVisibleGoal } from "./GoalOrder";
import type { CoreGoal } from "./types";
vi.mock("../api/tauri", () => ({ desktop: true }));
const goal = (id: number): CoreGoal => ({
  id,
  title: `Goal ${id}`,
  status: "open",
  area_id: 1,
  focused_seconds: 0,
  plan: {
    goal_id: id,
    revision: 1,
    current_step: null,
    done_when: "",
    steps: [],
  },
});
const visible = [1, 2, 3].map(goal),
  all = [1, 99, 2, 3].map(goal);
const reorder = vi.fn<(_: number[]) => Promise<boolean>>();
const titleClick = vi.fn();
function view(disabled = false, goals = visible) {
  return (
    <GoalOrder
      goals={goals}
      allGoals={all}
      disabled={disabled}
      reorder={reorder}
      showHandles
    >
      {(item) => (
        <article>
          <div className="goal-heading">
            <button className="goal-expand-toggle" onClick={titleClick}>
              {item.title}
            </button>
            <div className="goal-work-context">
              <button>Checkpoint {item.id}</button>
            </div>
          </div>
        </article>
      )}
    </GoalOrder>
  );
}
function setup(disabled = false) {
  const result = render(view(disabled));
  document
    .querySelectorAll(".ordered-goal")
    .forEach((row, i) =>
      vi
        .spyOn(row, "getBoundingClientRect")
        .mockReturnValue({
          top: i * 100,
          bottom: (i + 1) * 100,
          height: 100,
          left: 0,
          right: 600,
          width: 600,
          x: 0,
          y: i * 100,
          toJSON: () => ({}),
        }),
    );
  return { ...result, user: userEvent.setup() };
}
beforeEach(() => {
  reorder.mockReset().mockResolvedValue(true);
  titleClick.mockReset();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("preserves non-Today slots while reordering up to six goals", () => {
  expect(moveVisibleGoal([1, 9, 2, 8, 3, 7], [1, 2, 3], 1, 3)).toEqual([
    2, 9, 3, 8, 1, 7,
  ]);
  expect(moveVisibleGoal([1, 2], [1, 1], 1, 2)).toEqual([1, 2]);
  expect(moveVisibleGoal([1, 2], [1, 3], 1, 3)).toEqual([1, 2]);
});
it("a grip starts immediately and pointer drop saves the complete validated order", async () => {
  const { user } = setup();
  const handle = screen.getByRole("button", { name: "Reorder Goal 1" });
  await user.pointer({
    keys: "[MouseLeft>]",
    target: handle,
    coords: { x: 8, y: 50 },
  });
  expect(document.querySelector(".lifted")).toBeTruthy();
  await user.pointer({ target: handle, coords: { x: 8, y: 250 } });
  await user.pointer({ keys: "[/MouseLeft]", target: handle });
  expect(reorder).toHaveBeenCalledWith([2, 99, 3, 1]);
  expect(titleClick).not.toHaveBeenCalled();
  expect(document.querySelector(".lifted")).toBeNull();
});
it("keyboard pickup, move and drop use the same backend order", async () => {
  const { user } = setup();
  screen.getByRole("button", { name: "Reorder Goal 1" }).focus();
  await user.keyboard(" {ArrowDown} ");
  expect(reorder).toHaveBeenCalledWith([2, 99, 1, 3]);
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Moved Goal 1"),
  );
});
it("Escape cancels a keyboard move without saving", async () => {
  const { user } = setup();
  screen.getByRole("button", { name: "Reorder Goal 1" }).focus();
  await user.keyboard(" {ArrowDown}{Escape}");
  expect(reorder).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain("canceled");
});
it("checkpoint controls never start a row drag", async () => {
  const { user } = setup();
  await user.pointer({
    keys: "[MouseLeft>]",
    target: screen.getByRole("button", { name: "Checkpoint 1" }),
  });
  expect(document.querySelector(".lifted")).toBeNull();
  await user.pointer({ keys: "[/MouseLeft]" });
  expect(reorder).not.toHaveBeenCalled();
});
it("busy state blocks pointer and keyboard reordering", async () => {
  const { user } = setup(true);
  const handle = screen.getByRole("button", { name: "Reorder Goal 1" });
  expect((handle as HTMLButtonElement).disabled).toBe(true);
  await user.click(handle);
  fireEvent.keyDown(handle, { key: " " });
  expect(reorder).not.toHaveBeenCalled();
  expect(document.querySelector(".lifted")).toBeNull();
});
it("a refreshed lane cancels a pending keyboard move", async () => {
  const { user, rerender } = setup();
  screen.getByRole("button", { name: "Reorder Goal 1" }).focus();
  await user.keyboard(" {ArrowDown}");
  rerender(view(false, [visible[1], visible[0], visible[2]]));
  await user.keyboard(" ");
  expect(reorder).not.toHaveBeenCalled();
});
it("backend failure is announced without claiming a saved order", async () => {
  const { user } = setup();
  reorder.mockResolvedValue(false);
  screen.getByRole("button", { name: "Reorder Goal 1" }).focus();
  await user.keyboard(" {ArrowDown} ");
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("not saved"),
  );
});
