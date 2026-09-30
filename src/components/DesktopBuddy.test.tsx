import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopBuddy } from "./DesktopBuddy";
import type { BuddyView } from "../types";
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
    expect(html).toContain("Drag Buddy to move");
    expect(html).not.toContain("Open resource");
    expect(html).toContain("Workspace");
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
