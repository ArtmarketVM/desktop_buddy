import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopBuddy } from "./DesktopBuddy";
import type { BuddyView } from "../types";
import { defaultCompanionView } from "../companion/types";
import { defaultUserSettings } from "../types";
import { defaultBuddyPreferences } from "../types";
const view: BuddyView = {
  preferences: { ...defaultBuddyPreferences, suggestions_only: false },
  suggestion: null,
  decision: null,
  snoozed_until: null,
  quiet_reason: null,
};
const noop = () => {};
describe("desktop companion", () => {
  it("renders a draggable compact character without a resource card", () => {
    const html = renderToStaticMarkup(
      <DesktopBuddy view={view} onDismiss={noop} onDnd={noop} />,
    );
    expect(html).toContain("Open sumi mini chat");
    expect(html).toContain("drag to move");
    expect(html).not.toContain("Open resource");
    expect(html).not.toContain("Workspace");
  });
  it("shows a sourced suggestion with dismiss and DND controls", () => {
    const html = renderToStaticMarkup(
      <DesktopBuddy
        view={{
          ...view,
          suggestion: {
            id: 1,
            title: "Rust guide",
            url: "https://example.com",
            reason:
              "Learn ownership.\nTry this: Apply the borrowing example to your function.",
          },
        }}
        onDismiss={noop}
        onDnd={noop}
      />,
    );
    expect(html).toContain("Rust guide");
    expect(html).toContain("Learn ownership");
    expect(html).toContain(
      "Try this: Apply the borrowing example to your function.",
    );
    expect(html).toContain("Open resource");
    expect(html).toContain("Do not disturb");
    expect(html).toContain("Not now · 1 hour");
  });
});

it("shows an actionable check-in without revealing a hidden character", () => {
  const html = renderToStaticMarkup(
    <DesktopBuddy
      view={{
        ...view,
        avatar: { ...defaultUserSettings.profile.avatar, visible: false },
        companion: {
          ...defaultCompanionView,
          intervention: {
            id: "checkin",
            kind: "midday",
            text: "Want help with the next step?",
            confidence: 1,
            goal_id: null,
            plan_revision: null,
            step_id: null,
            expires_at: 9999999999,
          },
        },
      }}
      onDismiss={noop}
      onDnd={noop}
    />,
  );
  expect(html).toContain("Want help with the next step?");
  expect(html).toContain("Ask sumi");
  expect(html).not.toContain("desktop-character");
  expect(html).not.toContain("buddy-action-bar");
});
it("keeps an idle hidden character completely absent", () => {
  const html = renderToStaticMarkup(
    <DesktopBuddy
      view={{
        ...view,
        avatar: { ...defaultUserSettings.profile.avatar, visible: false },
      }}
      onDismiss={noop}
      onDnd={noop}
    />,
  );
  expect(html).toBe("");
});
