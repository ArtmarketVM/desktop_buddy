import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mergeSuggestedSteps, GoalRow } from "./Goals";
import { AnalysisResult } from "./analysis";
import { defaultAiPreferences } from "../ai/api";
import { DaySummary } from "./Progress";
import { emptyCore, type CoreGoal } from "./types";
import { activityDay } from "./Timeline";

describe("automatic AI and relevant progress", () => {
  it("deduplicates accepted steps without overwriting completed or user-created steps", () => {
    const existing = [{ id: "existing", text: "Outline", done: true }];
    const merged = mergeSuggestedSteps(existing, [
      " outline ",
      "Draft introduction",
      "Draft introduction",
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(existing[0]);
    expect(merged[1].done).toBe(false);
    expect(
      mergeSuggestedSteps(
        Array.from({ length: 20 }, (_, index) => ({
          id: String(index),
          text: `Step ${index}`,
          done: false,
        })),
        ["Extra"],
      ),
    ).toHaveLength(20);
  });
  it("offers selected and all steps while cloud matching requires opt-in", () => {
    expect(
      defaultAiPreferences.enabled &&
        defaultAiPreferences.share_goal_context &&
        defaultAiPreferences.web_research,
    ).toBe(true);
    expect(defaultAiPreferences.automatic_goal_matching).toBe(false);
    const html = renderToStaticMarkup(
      createElement(AnalysisResult, {
        result: {
          suggestedSteps: [
            { title: "Outline" },
            { title: "Draft" },
            { title: "Review" },
          ],
        },
        disabled: false,
        acceptTitle: () => {},
        acceptStep: () => {},
        acceptSteps: () => {},
      }),
    );
    expect(html).toContain("Add selected steps");
    expect(html).toContain("Add all steps");
    expect(html).toContain("Select suggested step: Outline");
  });
  it("renders automatic suggestions without requiring a focus timer or manual analysis", () => {
    const snapshot = emptyCore();
    const goal: CoreGoal = {
      id: 1,
      title: "Build Buddy",
      status: "open",
      area_id: 1,
      focused_seconds: 0,
      plan: {
        goal_id: 1,
        revision: 0,
        done_when: "",
        steps: [],
        current_step: null,
      },
      analysis: {
        state: "ready",
        message: null,
        result: {
          improvedTitle: "Ship Buddy onboarding",
          suggestedSteps: [
            { title: "Outline" },
            { title: "Draft" },
            { title: "Review" },
          ],
        },
      },
    };
    snapshot.today = [1];
    snapshot.focused_goal_id = 1;
    const html = renderToStaticMarkup(
      createElement(GoalRow, {
        goal,
        snapshot,
        busy: false,
        run: async () => true,
        edit: () => {},
      }),
    );
    expect(html).toContain("Outline");
    expect(html).toContain("Draft");
    expect(html).toContain("Add all");
    expect(html).toContain("Ignore suggestion: Outline");
    expect(html).not.toContain("Ship Buddy onboarding");
    expect(html).not.toContain("Improve / Research");
    expect(html).not.toContain("Focus timer");
    expect(html).not.toContain("Timer running");
    expect(html).not.toContain("Selected goal");
    expect(html).not.toContain("Selected for activity tracking");
  });
  it("does not claim manual or unrelated observed time as relevant progress", () => {
    const html = renderToStaticMarkup(
      createElement(DaySummary, {
        day: {
          day: "2026-10-07",
          completed: ["A step"],
          completed_goals: [],
          goals: [
            {
              goal_id: 1,
              title: "Goal",
              area: "Work",
              seconds: 3600,
              tracked_seconds: 7200,
              relevant_seconds: 0,
            },
          ],
        },
        unfinished: 2,
      }),
    );
    expect(html).not.toContain("wrapped up");
    expect(html).not.toContain("of relevant activity");
    expect(html).toContain("2h 0m of observed activity");
    expect(html).toContain("no work could be confidently matched");
    expect(html).toContain("tomorrow");
  });
  it("shows the local calendar date for activity timestamps", () => {
    expect(activityDay(new Date(2026, 9, 7, 12, 0).toISOString())).toBe(
      "2026-10-07",
    );
  });
});
