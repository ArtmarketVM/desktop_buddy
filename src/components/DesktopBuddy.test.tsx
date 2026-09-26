import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopBuddy } from "./DesktopBuddy";
import type { BuddyView } from "../types";
const view: BuddyView = {
  preferences: { suggestions_only: false, proactive: false },
  suggestion: null,
  decision: null,
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
            title: "Rust guide",
            url: "https://example.com",
            reason: "Learn ownership",
          },
        }}
        onDismiss={noop}
        onDnd={noop}
      />,
    );
    expect(html).toContain("Rust guide");
    expect(html).toContain("Learn ownership");
    expect(html).toContain("Open resource");
    expect(html).toContain("Do not disturb");
  });
});
