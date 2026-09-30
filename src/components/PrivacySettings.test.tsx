import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivacySettings } from "./PrivacySettings";
import { defaultBuddyPreferences } from "../types";
describe("privacy controls", () => {
  it("explains external data flow and requires confirmation before clearing", () => {
    const html = renderToStaticMarkup(
      <PrivacySettings
        preferences={defaultBuddyPreferences}
        retentionDays={0}
        onChanged={async () => {}}
        onHistoryCleared={async () => {}}
      />,
    );
    expect(html).toContain("Preview AI context locally");
    expect(html).toContain("I understand this cannot be undone.");
    expect(html).toContain('disabled="">Permanently clear local history');
    expect(html).toContain("does not delete remote records");
    expect(html).toContain("10 rated titles and 10 recently offered titles");
  });
});
