import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { textGoals, wav, readAttachment } from "./media";
import { DaySummary } from "./Progress";
import { CoreOnboarding } from "./Onboarding";
import { defaultUserSettings } from "../types";
import {
  duration,
  deadlineISO,
  localDeadline,
  emptyCore,
  type CoreGoal,
} from "./types";
import {
  AnalysisResult,
  analysisInput,
  safeSource,
  adaptGoalAIResult,
} from "./analysis";
import { moveGoal } from "./GoalOrder";
import { GoalRow } from "./Goals";
import { goalLink } from "../../browser-extension/link.mjs";

describe("core daily flow boundaries", () => {
  it("uses minutes and hours while preserving local deadline round trips", () => {
    expect([0, 1, 59, 60, 3600, 3660].map(duration)).toEqual([
      "0m",
      "<1m",
      "<1m",
      "1m",
      "1h 0m",
      "1h 1m",
    ]);
    const local = "2026-10-10T17:30";
    expect(localDeadline(deadlineISO(local))).toBe(local);
    expect(deadlineISO("")).toBeNull();
    expect(() => deadlineISO("nonsense")).toThrow();
  });
  it("exposes direct goal actions and a provider-independent analysis contract", () => {
    const goal: CoreGoal = {
      id: 4,
      title: "Ship",
      status: "open",
      area_id: 1,
      focused_seconds: 5,
      due_at: "2026-10-10T12:00:00Z",
      priority: "high",
      plan: {
        goal_id: 4,
        revision: 2,
        done_when: "",
        steps: [{ id: "a", text: "Build", done: false }],
        current_step: null,
      },
    };
    const html = renderToStaticMarkup(
      createElement(GoalRow, {
        goal,
        snapshot: emptyCore(),
        busy: false,
        run: async () => true,
        edit: () => {},
      }),
    );
    expect(html).toContain("Add step");
    expect(html).toContain("More actions for Ship");
    expect(html).toContain("high priority");
    expect(html).toContain("Improve goal");
    expect(html).not.toContain("5s");
    const input = analysisInput(goal);
    expect(input.goalId).toBe("4");
    expect(input.dueAt).toBe(goal.due_at);
    input.existingSteps[0].text = "Changed";
    expect(goal.plan.steps[0].text).toBe("Build");
  });
  it("renders analysis as proposals and rejects unsafe source URLs", () => {
    expect(safeSource("javascript:alert(1)")).toBeUndefined();
    expect(safeSource("https://user:secret@example.com")).toBeUndefined();
    const html = renderToStaticMarkup(
      createElement(AnalysisResult, {
        result: {
          improvedTitle: "Ship safely",
          suggestedSteps: [
            { title: "Verify", sourceUrl: "https://example.com/docs" },
          ],
          warnings: [
            {
              title: "Check",
              detail: "<script>untrusted</script>",
              sourceUrl: "javascript:alert(1)",
            },
          ],
        },
        disabled: false,
        acceptTitle: () => {},
        acceptStep: () => {},
      }),
    );
    expect(html).toContain("Use title");
    expect(html).toContain("Add step");
    expect(html).toContain("https://example.com/docs");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
  });
  it("encodes selected text without giving it control over the destination", () => {
    const url = new URL(goalLink("Goal &text=Other #secret"));
    expect(url.host).toBe("goal");
    expect(url.searchParams.get("text")).toBe("Goal &text=Other #secret");
    expect(url.searchParams.size).toBe(1);
    expect(() => goalLink("x".repeat(4001))).toThrow();
  });
  it("preserves each explicitly entered goal and rejects silent truncation", () => {
    expect(
      textGoals("- Ship release\n2. Read notes\n\n• Take a walk").map(
        (goal) => goal.title,
      ),
    ).toEqual(["Ship release", "Read notes", "Take a walk"]);
    expect(() => textGoals("x".repeat(501))).toThrow();
    expect(() => textGoals(Array(21).fill("Goal").join("\n"))).toThrow();
  });
  it("encodes bounded mono PCM with correct signed sample clipping", () => {
    const bytes = wav(new Float32Array([-2, 0, 2]), 16000);
    const view = new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    expect(view.getUint32(24, true)).toBe(16000);
    expect([44, 46, 48].map((offset) => view.getInt16(offset, true))).toEqual([
      -32768, 0, 32767,
    ]);
  });
  it("rejects oversized and unsupported attachments before reading them", async () => {
    const arrayBuffer = vi.fn();
    await expect(
      readAttachment({
        size: 15_000_001,
        type: "application/pdf",
        name: "large.pdf",
        arrayBuffer,
      } as unknown as File),
    ).rejects.toThrow("15 MB");
    await expect(
      readAttachment({
        size: 1,
        type: "image/svg+xml",
        name: "vector.svg",
        arrayBuffer,
      } as unknown as File),
    ).rejects.toThrow("Choose a PDF");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it("shows completed intentions and goal time in a positive daily summary", () => {
    const html = renderToStaticMarkup(
      createElement(DaySummary, {
        day: {
          day: "2026-10-02",
          completed: ["Ship release"],
          goals: [
            {
              goal_id: 1,
              title: "Ship release",
              area: "Work",
              seconds: 7200,
              tracked_seconds: 5400,
              relevant_seconds: 1800,
            },
          ],
        },
        unfinished: 1,
      }),
    );
    expect(html).toContain("Ship release");
    expect(html).toContain("Work · 30m");
    expect(html).toContain("tomorrow");
    expect(html).not.toContain("process_name");
  });
  it("starts onboarding with a name and no required role or email", () => {
    const html = renderToStaticMarkup(
      createElement(CoreOnboarding, {
        initial: defaultUserSettings,
        onChanged: async () => {},
        onDirty: () => {},
      }),
    );
    expect(html).toContain("Your name");
    expect(html).toContain("Email (optional)");
    expect(html).toContain('type="email"');
    expect(html).not.toMatch(/type="email"[^>]*required/);
    expect(html).toContain("1 OF 3");
    expect(html).not.toContain("professional role");
  });
  it("moves goals in both directions without losing hidden goals", () => {
    expect(moveGoal([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
    expect(moveGoal([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(moveGoal([1, 2], 99, 1)).toEqual([1, 2]);
    expect(moveGoal([1, 2], 1, 1)).toEqual([1, 2]);
  });
  it("adapts the agreed Developer 2 contract without discarding sources", () => {
    expect(
      adaptGoalAIResult({
        suggestedTitle: "Ship safely",
        suggestedSteps: [{ id: "a", title: "Review" }],
        sources: [
          {
            title: "Official docs",
            url: "https://example.com",
            reason: "Release checklist",
          },
        ],
      }),
    ).toEqual({
      improvedTitle: "Ship safely",
      suggestedSteps: [{ title: "Review" }],
      resources: [
        {
          title: "Official docs",
          url: "https://example.com",
          whyRelevant: "Release checklist",
        },
      ],
    });
  });
});
