// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalRow } from "./Goals";
import { emptyCore, type CoreGoal } from "./types";
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(1),
}));
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
function setup() {
  const snapshot = emptyCore();
  render(
    <>
      <h1>Outside the menus</h1>
      {[1, 2].map((id) => (
        <GoalRow
          key={id}
          goal={goal(id)}
          snapshot={snapshot}
          busy={false}
          run={async (work) => {
            await work();
            return true;
          }}
        />
      ))}
    </>,
  );
  return userEvent.setup();
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("opening another goal menu closes the first, even for a programmatic click", () => {
  setup();
  fireEvent.click(
    screen.getByRole("button", { name: "More actions for Goal 1" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "More actions for Goal 2" }),
  );
  expect(screen.getAllByRole("group", { name: "Goal actions" })).toHaveLength(
    1,
  );
  expect(
    screen
      .getByRole("button", { name: "More actions for Goal 1" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(
    screen
      .getByRole("button", { name: "More actions for Goal 2" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
});
it("a pointer press on a non-focusable background closes the menu", async () => {
  const user = setup();
  await user.click(
    screen.getByRole("button", { name: "More actions for Goal 1" }),
  );
  fireEvent.pointerDown(screen.getByRole("heading"));
  expect(screen.queryByRole("group", { name: "Goal actions" })).toBeNull();
});
it("Escape closes and restores focus to the exact trigger", async () => {
  const user = setup();
  const trigger = screen.getByRole("button", {
    name: "More actions for Goal 2",
  });
  await user.click(trigger);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: /Remove from Today|Add to Today/ }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Delete goal" }),
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("group", { name: "Goal actions" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("clicking inside preserves the menu, and an action closes it and uses the correct goal", async () => {
  const user = setup();
  await user.click(
    screen.getByRole("button", { name: "More actions for Goal 2" }),
  );
  fireEvent.pointerDown(screen.getByRole("group", { name: "Goal actions" }));
  expect(screen.getByRole("group", { name: "Goal actions" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Delete goal" }));
  expect(screen.queryByRole("group", { name: "Goal actions" })).toBeNull();
});
it("moving keyboard focus outside closes the menu", async () => {
  const user = setup();
  await user.click(
    screen.getByRole("button", { name: "More actions for Goal 1" }),
  );
  screen.getByRole("button", { name: "More actions for Goal 2" }).focus();
  await user.keyboard("{Tab}");
  expect(screen.queryByRole("group", { name: "Goal actions" })).toBeNull();
});
