import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TrackingSettings, formatTime, parseTime } from "./TrackingSettings";
import { ActivityTimeline } from "./ActivityTimeline";

describe("tracking preferences", () => {
  it("validates working-hour input and preserves midnight", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("09:00")).toBe(540);
    expect(parseTime("18:00")).toBe(1080);
    expect(formatTime(1439)).toBe("23:59");
    for (const value of ["24:00", "09:60", "9:00", "", "bad"])
      expect(parseTime(value)).toBeNull();
  });
  it("shows defaults, metadata disclosure and an explicit save action", () => {
    const html = renderToStaticMarkup(
      <TrackingSettings onChanged={async () => {}} />,
    );
    expect(html).toContain('value="09:00"');
    expect(html).toContain('value="18:00"');
    expect(html).toContain("5 minutes");
    expect(html).toContain("no page content or full URLs");
    expect(html).toContain("Save tracking settings");
  });
  it("renders legacy activities and new domain metadata without an address", () => {
    const html = renderToStaticMarkup(
      <ActivityTimeline
        activity={[
          {
            timestamp: "2026-10-02T09:00:00Z",
            process_name: "chrome.exe",
            window_title: "Docs",
            idle_seconds: 0,
            active_seconds: 3,
            browser: {
              browser: "chrome",
              page_title: "Docs",
              domain: "example.com",
              source: "address_bar",
            },
            media_playing: true,
          },
          {
            timestamp: "2026-10-02T09:00:03Z",
            process_name: "editor.exe",
            window_title: "Code",
            idle_seconds: 0,
            active_seconds: 3,
          },
        ]}
      />,
    );
    expect(html).toContain("example.com");
    expect(html).toContain("Media playing");
    expect(html).toContain("editor.exe");
  });
});
