import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRules, DailySummary, duration } from "./ActivityInsights";
import { Settings } from "./Settings";
import { defaultBuddyPreferences } from "../types";
const noop = async () => {};
describe("local activity insights", () => {
  it("shows observed app totals separately from current goal and checklist progress", () => {
    const html = renderToStaticMarkup(
      <DailySummary
        demo={false}
        today={{
          date: "2026-09-30",
          nudges: 2,
          apps: [
            { process_name: "editor.exe", seconds: 180, goal_seconds: 60 },
          ],
        }}
        plan={{
          goal_id: 1,
          revision: 0,
          done_when: "",
          current_step: null,
          steps: [
            { id: "a", text: "Draft", done: true },
            { id: "b", text: "Review", done: false },
          ],
        }}
      />,
    );
    expect(html).toContain("3m");
    expect(html).toContain("1m");
    expect(html).toContain("1 of 2 steps complete");
    expect(html).toContain('value="1"');
    expect(html).toContain('max="2"');
    expect(html).toContain("No historical backfill");
    expect(html).toContain("not a measure of goal completion");
    expect(html).toContain(
      '<details class="inline-details"><summary>How time is tracked</summary>',
    );
    expect(html).not.toMatch(/<details[^>]*\bopen/);
    expect(html.indexOf('class="insight-totals"')).toBeLessThan(
      html.indexOf("<details"),
    );
  });
  it("labels simulated and empty data honestly", () => {
    const html = renderToStaticMarkup(
      <DailySummary
        demo
        today={{ date: "", apps: [], nudges: 0 }}
        plan={null}
      />,
    );
    expect(html).toContain("SIMULATED SESSION");
    expect(html).toContain("No tracked time yet today");
  });
  it("deduplicates process names and exposes explicit and unclassified categories", () => {
    const html = renderToStaticMarkup(
      <AppRules
        goalId={1}
        rules={[{ process_name: "chrome.exe", category: "work" }]}
        processes={["CHROME.EXE", "chrome.exe"]}
        onChanged={noop}
      />,
    );
    expect((html.match(/Category for chrome.exe/g) || []).length).toBe(1);
    for (const text of [
      "Work",
      "Distraction",
      "Neutral",
      "Unclassified",
      "every Chrome tab",
    ])
      expect(html).toContain(text);
    expect(html).toContain('value="work" selected=""');
  });
  it("offers local opt-in and shared card limits", () => {
    const html = renderToStaticMarkup(
      <Settings
        preferences={defaultBuddyPreferences}
        retentionDays={0}
        onChanged={noop}
        onHistoryCleared={noop}
      />,
    );
    expect(html).toContain("Local distraction reminders");
    expect(html).toContain("Daily Buddy card limit");
    expect(html).toContain("No cards");
    expect(html).toContain("No AI or API key needed");
  });
  it("formats time without pretending a partial minute is a full minute", () => {
    expect(duration(0)).toBe("0s");
    expect(duration(59)).toBe("59s");
    expect(duration(61)).toBe("1m");
    expect(duration(3660)).toBe("1h 1m");
  });
  it("keeps AI consent, provider status and snooze controls in Settings", () => {
    const html = renderToStaticMarkup(
      <Settings
        preferences={defaultBuddyPreferences}
        retentionDays={0}
        onChanged={noop}
        onHistoryCleared={noop}
        aiEnabled
        snoozedUntil={Math.floor(Date.now() / 1000) + 3600}
        nebiusConfigured
      />,
    );
    expect(html).toContain("AI check-ins");
    expect(html).toContain("titles to Nebius");
    expect(html).toContain("Resume Buddy");
    expect(html).toContain("Nebius configured");
    expect(html).toContain("Tavily not configured");
    expect(html).not.toContain("Do not disturb");
  });
});
