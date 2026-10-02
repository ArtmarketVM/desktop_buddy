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
    expect(html).toContain("Start Windows voice typing");
    expect(html).toContain("Explain");
    expect(html).toContain("Save for later");
    expect(html).toContain("Ctrl + Alt + B");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Saved locally in your Buddy inbox");
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
  });
});
