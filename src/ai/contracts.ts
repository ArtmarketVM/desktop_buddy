import { aiApi } from "./api";
import { coreApi } from "../core/api";
import { analysisInput } from "../core/analysis";
import { invoke } from "@tauri-apps/api/core";

export type GoalAIResult = {
  suggestedTitle?: string;
  suggestedSteps: Array<{ id: string; title: string }>;
  sources: Array<{ title: string; url: string; reason?: string }>;
};
export type GoalProgress = {
  goalId: string;
  activeMinutes: number;
  activities: Array<{
    type: "app" | "browser" | "document";
    title: string;
    durationMinutes: number;
  }>;
};
function goalNumber(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error("Choose a saved goal");
  return Number(value);
}
export async function analyzeGoal(goalId: string): Promise<GoalAIResult> {
  const goal = (await coreApi.snapshot()).goals.find(
    (goal) => goal.id === goalNumber(goalId),
  );
  if (!goal) throw new Error("This goal no longer exists");
  const result =
    goal.analysis?.state === "ready" && goal.analysis.result
      ? goal.analysis.result
      : await aiApi.analyze(analysisInput(goal), true);
  return {
    suggestedTitle: result.improvedTitle,
    suggestedSteps: (result.suggestedSteps ?? []).map((s, index) => ({
      id: `suggestion-${goalId}-${index}`,
      title: s.title,
    })),
    sources: (result.resources ?? []).map((s) => ({
      title: s.title,
      url: s.url,
      reason: s.whyRelevant,
    })),
  };
}
export function getGoalProgress(goalId: string): Promise<GoalProgress> {
  return invoke("get_goal_progress", { goalId: goalNumber(goalId) });
}
export async function sendBuddyMessage(
  message: string,
  context?: { goalId?: string },
): Promise<{ message: string }> {
  return aiApi.send(
    message,
    null,
    context?.goalId ? goalNumber(context.goalId) : null,
  );
}

export type ActivityMatch = {
  goalId: string | null;
  confidence: number;
  reason?: string;
};
export type GoalCompletedEvent = {
  goalId: string;
  completedAt: string;
  activeMinutes: number;
};
export type BrowserActivity = {
  timestamp: string;
  browser: string;
  pageTitle?: string;
  url?: string;
  durationSeconds: number;
};
export async function browserActivities(
  goalId?: string,
): Promise<BrowserActivity[]> {
  return (await aiApi.segments(goalId ? goalNumber(goalId) : null))
    .filter(
      (segment) =>
        segment.domain || /^(chrome|msedge|firefox)\.exe$/i.test(segment.app),
    )
    .map((segment) => ({
      timestamp: segment.startedAt,
      browser: segment.app,
      pageTitle: segment.title ?? undefined,
      url: segment.url ?? undefined,
      durationSeconds: segment.durationSeconds,
    }));
}
