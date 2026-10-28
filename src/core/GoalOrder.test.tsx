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
function view(disabled = false, goals = visible, showHandles = true) {
  return (
    <GoalOrder
      goals={goals}
      allGoals={all}
      disabled={disabled}
      reorder={reorder}
      showHandles={showHandles}
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
function setup(disabled = false, showHandles = true) {
  const result = render(view(disabled, visible, showHandles));
  document.querySelectorAll(".ordered-goal").forEach((row, i) =>
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => ({
      top:
        Array.from(document.querySelectorAll(".ordered-goal")).indexOf(row) *
        100,
      bottom:
        (Array.from(document.querySelectorAll(".ordered-goal")).indexOf(row) +
          1) *
        100,
      height: 100,
      left: 0,
      right: 600,
      width: 600,
      x: 0,
      y: i * 100,
      toJSON: () => ({}),
    })),
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

const rowOrder = () =>
  Array.from(document.querySelectorAll<HTMLElement>(".ordered-goal"), (row) =>
    Number(row.dataset.goalId),
  );
async function dragFirstToLast(user: ReturnType<typeof userEvent.setup>) {
  const handle = screen.getByRole("button", { name: "Reorder Goal 1" });
  await user.pointer({
    keys: "[MouseLeft>]",
    target: handle,
    coords: { x: 8, y: 50 },
  });
  await user.pointer({ target: handle, coords: { x: 8, y: 250 } });
  await user.pointer({ keys: "[/MouseLeft]", target: handle });
}
it("holds the dropped order during persistence and rolls back a failed save", async () => {
  let finish!: (saved: boolean) => void;
  reorder.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { user } = setup();
  await dragFirstToLast(user);
  expect(rowOrder()).toEqual([2, 3, 1]);
  expect(document.querySelector(".drop-target")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Reorder Goal 2" }));
  expect(reorder).toHaveBeenCalledTimes(1);
  finish(false);
  await waitFor(() => expect(rowOrder()).toEqual([1, 2, 3]));
  expect(screen.getByRole("status").textContent).toContain("not saved");
});
it("settles to the refreshed parent order, preserving its priority policy", async () => {
  let finish!: (saved: boolean) => void;
  reorder.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { user, rerender } = setup();
  await dragFirstToLast(user);
  expect(rowOrder()).toEqual([2, 3, 1]);
  // The parent may keep a higher-priority goal ahead of the dragged goal.
  rerender(view(false, [visible[1], visible[0], visible[2]]));
  expect(rowOrder()).toEqual([2, 3, 1]);
  finish(true);
  await waitFor(() => expect(rowOrder()).toEqual([2, 1, 3]));
});
it("moves uneven rows by the source height plus the gap, without a blue drop line", async () => {
  const { user } = setup();
  const rows = document.querySelectorAll<HTMLElement>(".ordered-goal");
  const positions = [
    [0, 72],
    [84, 220],
    [232, 312],
  ];
  rows.forEach((row, index) =>
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
      top: positions[index][0],
      bottom: positions[index][1],
    } as DOMRect),
  );
  const handle = screen.getByRole("button", { name: "Reorder Goal 1" });
  await user.pointer({
    keys: "[MouseLeft>]",
    target: handle,
    coords: { x: 8, y: 36 },
  });
  await user.pointer({ target: handle, coords: { x: 8, y: 272 } });
  expect(rows[1].style.transform).toBe("translateY(-84px)");
  expect(rows[2].style.transform).toBe("translateY(-84px)");
  expect(document.querySelector(".drop-target")).toBeNull();
  await user.keyboard("{Escape}");
  expect(reorder).not.toHaveBeenCalled();
});
it("supports the actual row hold gesture when dedicated grips are hidden", async () => {
  const { user } = setup(false, false);
  const title = screen.getByRole("button", { name: "Goal 1" });
  await user.pointer({
    keys: "[MouseLeft>]",
    target: title,
    coords: { x: 60, y: 50 },
  });
  await waitFor(() => expect(document.querySelector(".lifted")).toBeTruthy());
  await user.pointer({ target: title, coords: { x: 60, y: 250 } });
  await user.pointer({ keys: "[/MouseLeft]", target: title });
  expect(reorder).toHaveBeenCalledWith([2, 99, 3, 1]);
  expect(titleClick).not.toHaveBeenCalled();
});
it("animates rows into their new slots and respects reduced motion", async () => {
  let finish!: (saved: boolean) => void;
  reorder.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { user } = setup();
  const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
  document.querySelectorAll<HTMLElement>(".ordered-goal").forEach((row) => {
    row.animate = animate;
  });
  await dragFirstToLast(user);
  expect(animate).toHaveBeenCalledWith(
    expect.arrayContaining([
      { transform: "translateY(-200px)" },
      { transform: "translateY(0)" },
    ]),
    expect.objectContaining({ duration: 220 }),
  );
  finish(false);
  await waitFor(() => expect(rowOrder()).toEqual([1, 2, 3]));
  animate.mockClear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  await dragFirstToLast(user);
  expect(animate).not.toHaveBeenCalled();
  finish(false);
  await waitFor(() => expect(rowOrder()).toEqual([1, 2, 3]));
});
