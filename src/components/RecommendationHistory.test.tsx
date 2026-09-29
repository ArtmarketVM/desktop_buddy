import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecommendationHistory } from "./RecommendationHistory";
import { Settings } from "./Settings";
import { defaultBuddyPreferences } from "../types";
const noop = async () => {};
describe("recommendation controls", () => {
  it("explains the empty history", () => {
    expect(
      renderToStaticMarkup(
        <RecommendationHistory recommendations={[]} onChanged={noop} />,
      ),
    ).toContain("No recommendations yet");
  });
  it.each([true, false, null])(
    "renders a saved rating %s with its goal",
    (feedback) => {
      const html = renderToStaticMarkup(
        <RecommendationHistory
          onChanged={noop}
          recommendations={[
            {
              id: 1,
              goal_id: 2,
              goal: "Learn Rust",
              title: "Ownership",
              url: "https://example.com",
              reason: "A useful introduction",
              created_at: "2026-09-29T12:00:00Z",
              feedback,
            },
          ]}
        />,
      );
      expect(html).toContain("Learn Rust");
      expect(html).toContain("A useful introduction");
      expect(html).toContain(
        feedback === null
          ? "Not rated"
          : feedback
            ? "Rated helpful"
            : "Rated not helpful",
      );
      expect((html.match(/aria-pressed="true"/g) || []).length).toBe(
        feedback === null ? 0 : 1,
      );
    },
  );
  it("offers supported search intervals with a separate focus-check explanation", () => {
    const html = renderToStaticMarkup(
      <Settings
        preferences={defaultBuddyPreferences}
        retentionDays={0}
        onChanged={noop}
        onHistoryCleared={noop}
      />,
    );
    for (const minutes of [5, 15, 30, 60])
      expect(html).toContain(`At most every ${minutes} minutes`);
    expect(html).toContain("does not change AI focus-check frequency");
  });
});
