// @vitest-environment jsdom
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalFinder, browseGoals, matchGoals, recentGoals } from "./GoalFinder";
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
  it("lists every saved goal when the empty field is focused", () => {
    expect(browseGoals(snapshot).map((g) => g.id)).toEqual([2, 1, 4]);
    render(
      <GoalFinder
        snapshot={snapshot}
        disabled={false}
        showRecent={false}
        create={vi.fn()}
        addToToday={vi.fn().mockResolvedValue(true)}
      />,
    );
    fireEvent.focus(screen.getByLabelText("Search or add a goal"));
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByText(/Saved goals · 3/)).toBeTruthy();
  });
});
