import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanionChat } from "./CompanionChat";
import { InterventionCard } from "./InterventionCard";
import { defaultCompanionView, type Intervention } from "./types";
describe("companion interaction boundary", () => {
  it("exposes manual text, voice and selected-text actions without making a goal", () => {
    const html = renderToStaticMarkup(
      <CompanionChat
        view={{
          ...defaultCompanionView,
          intent: "selection",
          seed: "<script>send deck</script>",
          shortcut_available: true,
        }}
        goal={null}
        plan={null}
        onChanged={async () => {}}
        onState={() => {}}
      />,
    );
    expect(html).toContain("Your message or task");
    expect(html).toContain("Start voice recording");
    expect(html).toContain("Explain");
    expect(html).toContain("Save for later");
    expect(html).toContain("Enter to send");
    expect(html).toContain("Attach text or PDF");
    expect(html).toContain('role="log"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Share this context");
  });
  it("requires confirmation for a suspected completion and offers an explicit refusal", () => {
    const prompt: Intervention = {
      id: "signal",
      kind: "completion",
      text: "Send deck",
      confidence: 0.95,
      goal_id: 1,
      plan_revision: 2,
      step_id: "step",
      expires_at: 99999999,
    };
    const html = renderToStaticMarkup(
      <InterventionCard prompt={prompt} busy={false} respond={() => {}} />,
    );
    expect(html).toContain("Yes, mark complete");
    expect(html).toContain("Not yet");
    expect(html).toContain("Nothing changes until you confirm");
    expect(html).not.toContain("BUDDY · YOUR CHOICE");
  });
  it("shows completion reviews in the main chat without requiring the desktop popup", () => {
    const html = renderToStaticMarkup(
      <CompanionChat
        view={{
          ...defaultCompanionView,
          intervention: {
            id: "receipt",
            kind: "goal_completion",
            text: "Dashboard published",
            confidence: 0.98,
            goal_id: 1,
            plan_revision: 1,
            step_id: null,
            expires_at: 99999999,
          },
        }}
        goal={null}
        plan={null}
        onChanged={async () => {}}
        onState={() => {}}
        embedded
      />,
    );
    expect(html).toContain("Yes, complete goal");
    expect(html).toContain("Dashboard published");
  });
  it("offers a separate, explicit confirmation for completing an entire goal", () => {
    const html = renderToStaticMarkup(
      <InterventionCard
        prompt={{
          id: "goal-receipt",
          kind: "goal_completion",
          text: "Dashboard published",
          confidence: 0.98,
          goal_id: 1,
          plan_revision: 2,
          step_id: null,
          expires_at: 99999999,
        }}
        busy={false}
        respond={() => {}}
      />,
    );
    expect(html).toContain("Yes, complete goal");
    expect(html).toContain("Not yet");
    expect(html).toContain("Nothing changes until you confirm");
  });
});

describe("contextual research consent", () => {
  const prompt: Intervention = {
    id: "research-offer",
    kind: "research",
    text: "It looks like information may be missing for this step. Search the web?",
    confidence: 0.8,
    goal_id: 1,
    plan_revision: 2,
    step_id: "step-0",
    expires_at: 99999999,
  };
  it("states the provider and requires an explicit search choice with a refusal", () => {
    const html = renderToStaticMarkup(
      <InterventionCard prompt={prompt} busy={false} respond={() => {}} />,
    );
    expect(html).toContain("Find information for this step?");
    expect(html).toContain("Search the web");
    expect(html).toContain("Not now");
    expect(html).toContain("Chat");
    expect(html).not.toContain("Yes, mark complete");
  });
  it("prevents duplicate approval clicks while a response is pending", () => {
    const html = renderToStaticMarkup(
      <InterventionCard prompt={prompt} busy respond={() => {}} />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});
