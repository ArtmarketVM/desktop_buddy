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
  quiet_reason: null,
};
const noop = () => {};
describe("desktop companion", () => {
  it("renders a draggable compact character without a resource card", () => {
    const html = renderToStaticMarkup(
      <DesktopBuddy view={view} onDnd={noop} />,
    );
    expect(html).toContain("Open sumi mini chat");
    expect(html).toContain("drag to move");
    expect(html).not.toContain("Open resource");
    expect(html).not.toContain("Workspace");
  });
  it("shows a sourced suggestion with only the shared Quiet mode control", () => {
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
        onDnd={noop}
      />,
    );
    expect(html).toContain("Rust guide");
    expect(html).toContain("Learn ownership");
    expect(html).toContain(
      "Try this: Apply the borrowing example to your function.",
    );
    expect(html).toContain("Open resource");
    expect(html).toContain("Quiet mode");
    expect(html).not.toContain("Not now · 1 hour");
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
            kind: "no_goals",
            text: "Want to plan today?",
            confidence: 1,
            goal_id: null,
            plan_revision: null,
            step_id: null,
            expires_at: 9999999999,
          },
        },
      }}
      onDnd={noop}
    />,
  );
  expect(html).toContain("Want to plan today?");
  expect(html).toContain("Plan today");
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
      onDnd={noop}
    />,
  );
  expect(html).toBe("");
});

it("keeps quiet mode resting with no chat, notification, or legacy suggestion bubbles", () => {
  const html = renderToStaticMarkup(
    <DesktopBuddy
      view={{
        ...view,
        activity_event: "goal_completed",
        activity_revision: 7,
        suggestion: {
          id: 1,
          title: "Should stay hidden",
          url: "https://example.com",
          reason: "Hidden reason",
        },
        companion: {
          ...defaultCompanionView,
          quiet_mode: true,
          chat_open: true,
          state: "attention",
          intervention: {
            id: "schedule:today:summary",
            kind: "end_of_day",
            text: "Here’s what you did today",
            confidence: 1,
            goal_id: null,
            plan_revision: null,
            step_id: null,
            expires_at: 9999999999,
          },
        },
      }}
      onDnd={noop}
    />,
  );
  expect(html).toContain("sumi companion, sleeping");
  expect(html).not.toContain("sumi companion, success");
  expect(html).not.toContain("companion-bubble");
  expect(html).not.toContain("desktop-compact-input");
  expect(html).not.toContain("Should stay hidden");
  expect(html).not.toContain("Here’s what you did today");
});

it("keeps the mascot mounted on its own surface across chat and notification state", () => {
  for (const chat_open of [false, true, false]) {
    const html = renderToStaticMarkup(
      <DesktopBuddy
        surface="mascot"
        view={{ ...view, companion: { ...defaultCompanionView, chat_open } }}
        onDnd={noop}
      />,
    );
    expect(html).toContain('data-surface="mascot"');
    expect(html).toContain("desktop-character");
    expect(html).not.toContain("conversation-composer");
    expect(html).not.toContain('aria-label="sumi mini chat"');
  }
});
it("renders chat controls without any character or toolbar inside the separate panel", () => {
  const html = renderToStaticMarkup(
    <DesktopBuddy
      surface="panel"
      view={{
        ...view,
        companion: { ...defaultCompanionView, chat_open: true },
      }}
      onDnd={noop}
    />,
  );
  expect(html).toContain("conversation-composer");
  expect(html).not.toContain('class="desktop-character"');
  expect(html).not.toContain('class="buddy-action-bar"');
});
