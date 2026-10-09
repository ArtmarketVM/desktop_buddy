import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrackingStatus } from "./TrackingStatus";
import { DaySummary } from "./Progress";
import type { Dashboard } from "../types";

const dashboard: Pick<Dashboard, "status" | "goal_matching" | "goal"> = {
  status: {
    tracking: false,
    ai_enabled: false,
    dnd: false,
    demo: false,
    mock_ai: false,
    nebius_configured: false,
    tavily_configured: false,
  },
  goal: { id: 1, text: "Build dashboard", created_at: "2026-10-08T00:00:00Z" },
};
const render = (value = dashboard) =>
  renderToStaticMarkup(
    createElement(TrackingStatus, { dashboard: value, onSettings: () => {} }),
  );

describe("goal activity collection status", () => {
  it("shows a paused collector even when a goal is selected", () => {
    const html = render();
    expect(html).toContain("Activity tracking is paused");
    expect(html).toContain("Set up activity tracking");
    expect(html).not.toContain("tracking is on");
  });
  it("shows permission failures before claiming collection is running", () => {
    const html = render({
      ...dashboard,
      status: {
        ...dashboard.status,
        tracking: true,
        tracking_error: "Allow Desktop Buddy in Accessibility settings",
      },
    });
    expect(html).toContain("tracking is blocked");
    expect(html).toContain("Accessibility settings");
    expect(html).not.toContain("tracking is on");
  });
  it("does not claim a selected goal is being tracked while AI is uncertain", () => {
    const html = render({
      ...dashboard,
      status: { ...dashboard.status, tracking: true },
      goal_matching: {
        enabled: true,
        goal_id: null,
        confidence: null,
        reason: "No confident match",
      },
    });
    expect(html).toContain("awaiting a goal match");
    expect(html).toContain("No confident match");
    expect(html).not.toContain("tracking is on");
  });
  it("shows active collection with explicit completion controls", () => {
    expect(
      render({
        ...dashboard,
        status: { ...dashboard.status, tracking: true },
      }),
    ).toContain("Activity tracking is on · Build dashboard");
    expect(render()).toContain("Mark steps and goals");
  });
  it("does not interpret missing records as a quiet work day", () => {
    const html = renderToStaticMarkup(
      createElement(DaySummary, {
        day: { day: "2026-10-08", completed: [], goals: [] },
      }),
    );
    expect(html).toContain("No recorded activity or completed goals");
    expect(html).not.toContain("quieter day");
  });
});
