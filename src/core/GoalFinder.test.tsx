// @vitest-environment jsdom
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalBrowser, GoalFinder, matchGoals, recentGoals } from "./GoalFinder";
import { emptyCore, type CoreGoal, type CoreSnapshot } from "./types";

function goal(
  id: number,
  title: string,
  steps: string[] = [],
  focused = 0,
): CoreGoal {
  return {
    id,
    title,
    status: "open",
    area_id: 1,
    focused_seconds: focused,
    plan: {
      steps: steps.map((text, i) => ({ id: `s${i}`, text, done: false })),
    } as CoreGoal["plan"],
  } as CoreGoal;
}
const snapshot: CoreSnapshot = {
  ...emptyCore(),
  day_mode: "plan",
  today: [3],
  carryover: [2],
  goals: [
    goal(1, "Update the desktop buddy app", ["Fix chat sending"], 900),
    goal(2, "Publish a website from html", [], 0),
    goal(3, "Already on today", [], 0),
    goal(4, "Write to 3 partners", ["Draft the email"], 60),
  ],
};

describe("goal finder", () => {
  afterEach(cleanup);
  it("matches every word across title and steps and skips Today goals", () => {
    expect(matchGoals(snapshot, "chat sending").map((g) => g.id)).toEqual([1]);
    expect(matchGoals(snapshot, "today")).toEqual([]);
    expect(matchGoals(snapshot, "").map((g) => g.id)).toEqual([1, 2, 4]);
  });
  it("lists unfinished goals first, then the most focused", () => {
    expect(recentGoals(snapshot).map((g) => g.id)).toEqual([2, 1, 4]);
  });
  it("adds the highlighted match on Enter and creates when nothing matches", async () => {
    const addToToday = vi.fn().mockResolvedValue(true);
    const create = vi.fn().mockResolvedValue(true);
    render(
      <GoalFinder
        snapshot={snapshot}
        disabled={false}
        showRecent={false}
        create={create}
        addToToday={addToToday}
        dismissCarryover={vi.fn().mockResolvedValue(true)}
      />,
    );
    const input = screen.getByLabelText(
      "Search or add a goal",
    ) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "partners" } });
    expect(
      screen.getByRole("option", { name: /Write to 3 partners/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add to Today" })).toBeTruthy();
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(addToToday).toHaveBeenCalledWith(4);
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "Learn the koto" } });
    expect(
      screen.getByRole("option", { name: /Create “Learn the koto”/ }),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(create).toHaveBeenCalledWith("Learn the koto", expect.any(String));
  });
  it("pages the browser eight at a time and searches", () => {
    const many: CoreSnapshot = {
      ...snapshot,
      today: [],
      carryover: [],
      goals: Array.from({ length: 19 }, (_, i) =>
        goal(i + 1, `Goal number ${i + 1}`),
      ),
    };
    const toggle = vi.fn().mockResolvedValue(true);
    render(
      <GoalBrowser snapshot={many} disabled={false} toggleToday={toggle} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Choose goals/ }));
    expect(screen.getAllByRole("option")).toHaveLength(8);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("2 / 3")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search goals"), {
      target: { value: "number 19" },
    });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.click(
      screen
        .getByRole("option", { name: /Goal number 19/ })
        .querySelector("button")!,
    );
    expect(toggle).toHaveBeenCalledWith(19, true);
  });
});
