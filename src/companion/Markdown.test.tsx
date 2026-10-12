import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, repairMarkdown } from "./Markdown";

describe("Markdown", () => {
  it("renders headings, bold text, lists and code blocks", () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={
          "## Plan\n\nStart with **one** step.\n\n- First\n- Second\n\n1. Do this\n2. Then that\n\n```\ncopy me\n```"
        }
      />,
    );
    expect(html).toContain("<h3>Plan</h3>");
    expect(html).toContain("<strong>one</strong>");
    expect(html.match(/<ul>.*?<\/ul>/)?.[0].match(/<li>/g)).toHaveLength(2);
    expect(html.match(/<ol>.*?<\/ol>/)?.[0].match(/<li>/g)).toHaveLength(2);
    expect(html).toContain("<pre><code>copy me</code></pre>");
    expect(html).toContain("Copy");
  });
  it("never injects raw html", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"<img src=x onerror=alert(1)>"} />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("puts line breaks back into a reply that came back on one line", () => {
    const flat =
      "You are tasked with implementing inline editing for goal titles and step texts on the Today screen. Follow these specifications exactly and produce clean code with tests.## OverviewGoal: allow users to click a title and edit it in place.## Requirements1. **UI Design** - Render each title as a label.2. **Behavior** - Save on Enter or blur and cancel on Escape.";
    const fixed = repairMarkdown(flat);
    expect(fixed).toContain("tests.\n\n## Overview");
    expect(fixed).toContain("\n\n## Requirements");
    expect(fixed).toContain("\n1. **UI Design**");
    expect(fixed).toContain("\n2. **Behavior**");
    expect(repairMarkdown("Short reply.")).toBe("Short reply.");
  });
});

describe("message parts", () => {
  it("shows relative times and a compact sources list", async () => {
    const { relativeTime, Sources } = await import("./MessageParts");
    const now = Date.parse("2026-10-12T12:00:00Z");
    expect(relativeTime("2026-10-12T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-12T11:37:00Z", now)).toBe("23 minutes ago");
    expect(relativeTime("2026-10-12T09:00:00Z", now)).toBe("3 hours ago");
    const html = renderToStaticMarkup(
      <Sources
        disabled={false}
        onOpen={() => {}}
        resources={[
          {
            title: "Underdog",
            url: "https://www.underdog.io/jobs",
            whyRelevant: "Matches you with startups",
          },
        ]}
      />,
    );
    expect(html).toContain("Sources");
    expect(html).toContain("underdog.io");
    expect(html).toContain("Underdog");
  });
});
