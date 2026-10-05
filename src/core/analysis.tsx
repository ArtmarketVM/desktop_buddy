import type { GoalStep } from "../types";
import type { CoreGoal } from "./types";

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
}: {
  url?: string;
  children: React.ReactNode;
}) {
  const safe = safeSource(url);
  return safe ? (
    <a href={safe} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}
export function AnalysisResult({
  result,
  disabled,
  acceptTitle,
  acceptStep,
}: {
  result: GoalAnalysisResult;
  disabled: boolean;
  acceptTitle: (title: string) => void;
  acceptStep: (title: string) => void;
}) {
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
        <div className="suggested-step" key={i}>
          <Source url={step.sourceUrl}>{step.title}</Source>
          <button
            className="text-button"
            disabled={disabled || !step.title.trim() || step.title.length > 500}
            onClick={() => acceptStep(step.title)}
          >
            Add step
          </button>
        </div>
      ))}
      {result.warnings?.map((warning, i) => (
        <div key={i}>
          <strong>{warning.title}</strong>
          <p>
            {warning.detail}{" "}
            <Source url={warning.sourceUrl}>
              {warning.sourceUrl ? "Source" : ""}
            </Source>
          </p>
        </div>
      ))}
      {result.resources?.map((resource, i) => (
        <p key={i}>
          <Source url={resource.url}>{resource.title}</Source>
          {resource.whyRelevant && <small> — {resource.whyRelevant}</small>}
        </p>
      ))}
    </section>
  );
}
