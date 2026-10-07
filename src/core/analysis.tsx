import { useState } from "react";
import type { GoalStep } from "../types";
import type { CoreGoal } from "./types";
import { aiApi } from "../ai/api";
import { desktop } from "../api/tauri";

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
  remainingSteps = 20,
}: {
  result: GoalAnalysisResult;
  goalId?: number;
  disabled: boolean;
  acceptTitle: (title: string) => void;
  acceptStep: (title: string) => void;
  acceptSteps?: (titles: string[]) => void;
  remainingSteps?: number;
}) {
  const [selected, setSelected] = useState<string[]>([]);
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
      {result.suggestedSteps?.map((step, i) => (
        <div className="suggested-step" key={step.title}>
          {acceptSteps && (
            <input
              type="checkbox"
              aria-label={`Select suggested step: ${step.title}`}
              checked={selected.includes(step.title)}
              disabled={disabled}
              onChange={(e) =>
                setSelected((current) =>
                  e.target.checked
                    ? [...current, step.title]
                    : current.filter((t) => t !== step.title),
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
              remainingSteps <= 0 ||
              !step.title.trim() ||
              step.title.length > 500
            }
            onClick={() => acceptStep(step.title)}
          >
            Add step
          </button>
        </div>
      ))}
      {acceptSteps && !!result.suggestedSteps?.length && (
        <div className="goal-actions">
          <button
            className="text-button"
            disabled={
              disabled ||
              selected.filter((t) =>
                result.suggestedSteps?.some((s) => s.title === t),
              ).length > remainingSteps ||
              !selected.some((t) =>
                result.suggestedSteps?.some((s) => s.title === t),
              )
            }
            onClick={() => {
              acceptSteps(
                result
                  .suggestedSteps!.filter((s) => selected.includes(s.title))
                  .map((s) => s.title),
              );
              setSelected([]);
            }}
          >
            Add selected steps
          </button>
          <button
            className="text-button"
            disabled={
              disabled || result.suggestedSteps!.length > remainingSteps
            }
            onClick={() => {
              acceptSteps(result.suggestedSteps!.map((s) => s.title));
              setSelected([]);
            }}
          >
            Add all steps
          </button>
        </div>
      )}
      {remainingSteps < (result.suggestedSteps?.length ?? 0) && (
        <p className="helper">
          Room for {remainingSteps} more steps. Choose fewer suggestions or
          remove an existing step first.
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
