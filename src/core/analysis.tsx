import { useState } from "react";
import type { GoalStep } from "../types";
import type { CoreGoal } from "./types";
import { aiApi } from "../ai/api";
import { desktop } from "../api/tauri";

import type { GoalAIResult } from "../ai/contracts";
export type { GoalAIResult, GoalProgress } from "../ai/contracts";
export function adaptGoalAIResult(result: GoalAIResult): GoalAnalysisResult {
  return {
    improvedTitle: result.suggestedTitle,
    suggestedSteps: result.suggestedSteps.map((step) => ({
      title: step.title,
    })),
    resources: result.sources.map((source) => ({
      title: source.title,
      url: source.url,
      whyRelevant: source.reason,
    })),
  };
}

// Provider-independent contract. A caller chooses which user context to share.
export interface GoalAnalysisInput {
  goalId: string;
  title: string;
  description?: string;
  dueAt?: string;
  priority?: "low" | "medium" | "high";
  existingSteps: GoalStep[];
  userContextRef?: string;
}
export interface GoalAnalysisResult {
  improvedTitle?: string;
  estimatedDuration?: string;
  difficulty?: "easy" | "medium" | "hard" | "unknown";
  suggestedSteps?: Array<{ title: string; sourceUrl?: string }>;
  warnings?: Array<{ title: string; detail: string; sourceUrl?: string }>;
  resources?: Array<{ title: string; url: string; whyRelevant?: string }>;
}
export interface GoalEnhancement {
  onImprove?: (input: GoalAnalysisInput) => Promise<GoalAnalysisResult>;
  onResearch?: (input: GoalAnalysisInput) => Promise<GoalAnalysisResult>;
}
export function analysisInput(
  goal: CoreGoal,
  userContextRef?: string,
): GoalAnalysisInput {
  return {
    goalId: String(goal.id),
    title: goal.title,
    description: goal.description || undefined,
    dueAt: goal.due_at || undefined,
    priority: goal.priority || undefined,
    existingSteps: goal.plan.steps.map((step) => ({ ...step })),
    userContextRef,
  };
}
export function safeSource(value?: string): string | undefined {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
function Source({
  url,
  children,
  goalId,
}: {
  url?: string;
  children: React.ReactNode;
  goalId?: number;
}) {
  const safe = safeSource(url);
  return safe ? (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        if (desktop && goalId !== undefined)
          void aiApi.resourceOpened(goalId, safe).catch(() => {});
      }}
    >
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}
export function AnalysisResult({
  result,
  goalId,
  disabled,
  acceptTitle,
  acceptStep,
  acceptSteps,
  capacity = 20,
}: {
  result: GoalAnalysisResult;
  goalId?: number;
  disabled: boolean;
  acceptTitle: (title: string) => void;
  acceptStep: (title: string) => void | Promise<boolean>;
  acceptSteps?: (titles: string[]) => void | Promise<boolean>;
  capacity?: number;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [accepting, setAccepting] = useState(false);
  const candidates = result.suggestedSteps?.slice(0, 5) ?? [];
  const chosen = candidates
    .filter((step) => selected.includes(step.title))
    .map((step) => step.title);
  async function addSuggestions(titles: string[]) {
    if (!acceptSteps) return;
    setAccepting(true);
    try {
      if ((await acceptSteps(titles)) !== false)
        setSelected((previous) =>
          previous.filter((title) => !titles.includes(title)),
        );
    } finally {
      setAccepting(false);
    }
  }
  return (
    <section className="goal-analysis" aria-label="Goal suggestions">
      <p className="helper">Suggestions stay separate until you accept them.</p>
      {result.improvedTitle && (
        <p>
          {result.improvedTitle}{" "}
          <button
            className="text-button"
            disabled={disabled || result.improvedTitle.length > 500}
            onClick={() => acceptTitle(result.improvedTitle!)}
          >
            Use title
          </button>
        </p>
      )}
      {(result.estimatedDuration || result.difficulty) && (
        <p className="helper">
          {[result.estimatedDuration, result.difficulty]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {candidates.map((step, i) => (
        <div className="suggested-step" key={i}>
          {acceptSteps && (
            <input
              type="checkbox"
              aria-label={`Select suggested step: ${step.title}`}
              checked={selected.includes(step.title)}
              disabled={
                disabled ||
                accepting ||
                !step.title.trim() ||
                step.title.length > 500
              }
              onChange={(event) =>
                setSelected((previous) =>
                  event.target.checked
                    ? [...previous, step.title]
                    : previous.filter((title) => title !== step.title),
                )
              }
            />
          )}
          <Source url={step.sourceUrl} goalId={goalId}>
            {step.title}
          </Source>
          <button
            className="text-button"
            disabled={
              disabled ||
              accepting ||
              capacity <= 0 ||
              !step.title.trim() ||
              step.title.length > 500
            }
            onClick={() => acceptStep(step.title)}
          >
            Add step
          </button>
        </div>
      ))}
      {acceptSteps && candidates.length > 0 && (
        <button
          disabled={
            disabled || accepting || !chosen.length || chosen.length > capacity
          }
          onClick={() => void addSuggestions(chosen)}
        >
          {accepting ? "Adding…" : `Add selected steps (${chosen.length})`}
        </button>
      )}
      {acceptSteps && candidates.length > 0 && (
        <button
          className="text-button"
          disabled={
            disabled ||
            accepting ||
            candidates.length > capacity ||
            candidates.some(
              (step) => !step.title.trim() || step.title.length > 500,
            )
          }
          onClick={() =>
            void addSuggestions(candidates.map((step) => step.title))
          }
        >
          Add all steps
        </button>
      )}
      {chosen.length > capacity && (
        <p className="helper">
          Choose up to {capacity} more steps for this goal.
        </p>
      )}
      {result.warnings?.map((warning, i) => (
        <div key={i}>
          <strong>{warning.title}</strong>
          <p>
            {warning.detail}{" "}
            <Source url={warning.sourceUrl} goalId={goalId}>
              {warning.sourceUrl ? "Source" : ""}
            </Source>
          </p>
        </div>
      ))}
      {result.resources?.map((resource, i) => (
        <p key={i}>
          <Source url={resource.url} goalId={goalId}>
            {resource.title}
          </Source>
          {resource.whyRelevant && <small> — {resource.whyRelevant}</small>}
        </p>
      ))}
    </section>
  );
}
