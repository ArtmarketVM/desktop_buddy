import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GoalPlanner, SavedGoals } from "./GoalPlanner";
import type { GoalPlan } from "../types";
const plan: GoalPlan = {
  goal_id: 1,
  revision: 0,
  done_when: "Export reviewed PDF",
  steps: [{ id: "a", text: "Write draft", done: false }],
  current_step: "a",
};
const noop = async () => {};
describe("goal planning", () => {
  it("shows editable criteria, steps and explicit outcome confirmation", () => {
    const html = renderToStaticMarkup(
      <GoalPlanner
        goal={{ id: 1, text: "Presentation", created_at: "2026-09-29" }}
        plan={plan}
        onChanged={noop}
        onDirty={() => {}}
        aiAvailable={false}
        mock={false}
      />,
    );
    expect(html).toContain("Export reviewed PDF");
    expect(html).toContain("Write draft");
    expect(html).toContain("Working on this");
    expect(html).toContain("Save plan");
    expect(html).toContain("no activity history");
    expect(html).toContain("I confirm the goal");
    expect(html).toMatch(/<button disabled="">Complete goal/);
  });
  it("distinguishes deferred from completed goals", () => {
    const html = renderToStaticMarkup(
      <SavedGoals
        goals={[
          { id: 1, text: "Later", status: "deferred" },
          { id: 2, text: "Finished", status: "completed" },
        ]}
        onChanged={noop}
        locked={false}
      />,
    );
    expect(html).toContain("Deferred");
    expect(html).toMatch(/<details[^>]*aria-label="Saved goals"/);
    expect(html).not.toMatch(/<details[^>]*\bopen/);
    expect(html).toContain("<summary>Saved goals");
    expect(html).toContain("Completed");
    expect((html.match(/Resume goal/g) || []).length).toBe(1);
  });
});
