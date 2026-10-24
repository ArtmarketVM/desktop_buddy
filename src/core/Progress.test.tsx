// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Progress } from "./Progress";
import { emptyCore, type CoreSnapshot, type ProgressPeriod } from "./types";

afterEach(cleanup);
function fixture(): CoreSnapshot {
  const snapshot = emptyCore();
  snapshot.date = "2026-10-24";
  snapshot.summary = {
    day: snapshot.date,
    completed: [],
    goals: [
      {
        goal_id: 7,
        title: "Write the pitch",
        area: "",
        seconds: 120,
        relevant_seconds: 120,
      },
      {
        goal_id: 3,
        title: "Reply to customers",
        area: "",
        seconds: 60,
        relevant_seconds: 60,
      },
    ],
  };
  snapshot.week = [snapshot.summary];
  snapshot.goals = snapshot.summary.goals.map((goal) => ({
    id: goal.goal_id,
    title: goal.title,
    status: "open",
    area_id: 1,
    focused_seconds: 0,
    plan: {
      goal_id: goal.goal_id,
      revision: 1,
      done_when: "Done",
      current_step: null,
      steps: [{ id: "draft", text: "Draft a reply", done: false }],
    },
  }));
  snapshot.hourly = [
    { hour: 9, goal_id: 7, seconds: 120 },
    { hour: 9, goal_id: 3, seconds: 60 },
  ];
  return snapshot;
}
function view(snapshot: CoreSnapshot, period: ProgressPeriod = "week") {
  return (
    <Progress
      snapshot={snapshot}
      period={period}
      anchor={null}
      busy={false}
      onWeek={vi.fn()}
      onPeriod={vi.fn()}
    />
  );
}
function segments() {
  return within(screen.getByLabelText("Focused time")).getAllByRole("button");
}

it("shows details for one segment and opens that goal, including by keyboard focus", () => {
  render(view(fixture()));
  const [emails, pitch] = segments();
  expect(emails.getAttribute("aria-label")).toBe(
    "Reply to customers · Sat · 1m",
  );
  fireEvent.mouseEnter(emails);
  expect(screen.getByRole("tooltip").textContent).toBe(
    "Reply to customersSat · 1m",
  );
  expect(screen.getByRole("tooltip").textContent).not.toContain("pitch");
  fireEvent.mouseLeave(emails);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(pitch);
  expect(screen.getByRole("tooltip").textContent).toContain("Write the pitch");
  expect(pitch.getAttribute("aria-describedby")).toBe(
    screen.getByRole("tooltip").id,
  );
  fireEvent.blur(pitch);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.click(emails);
  expect(
    screen.getByRole("heading", { name: "Reply to customers" }),
  ).toBeTruthy();
  expect(screen.getByText("Draft a reply")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Progress" }));
  expect(segments()).toHaveLength(2);
});

it("keeps colours and stack order tied to goal IDs across dates, ranks and periods", () => {
  const snapshot = fixture();
  const { rerender } = render(view(snapshot));
  const before = segments().map((segment) =>
    segment.style.getPropertyValue("--bar-color"),
  );
  expect(new Set(before).size).toBe(2);
  expect(before.every((color) => color.startsWith("light-dark("))).toBe(true);
  const next = structuredClone(snapshot);
  next.summary.goals.reverse();
  next.summary.goals[0].relevant_seconds = 900;
  next.week = [next.summary];
  rerender(view(next));
  expect(
    segments().map((segment) => segment.style.getPropertyValue("--bar-color")),
  ).toEqual(before);
  expect(segments()[0].getAttribute("aria-label")).toContain(
    "Reply to customers",
  );
  rerender(view(next, "day"));
  expect(
    segments().map((segment) => segment.style.getPropertyValue("--bar-color")),
  ).toEqual(before);
  expect(segments()[0].getAttribute("aria-label")).toContain("09:00");
});

it("opens historical goals even when they are absent from today's goal list", () => {
  const snapshot = fixture();
  snapshot.goals = [];
  render(view(snapshot));
  fireEvent.click(segments()[0]);
  expect(
    screen.getByRole("heading", { name: "Reply to customers" }),
  ).toBeTruthy();
  expect(screen.getByText("Other work on this goal")).toBeTruthy();
});

it("does not render daily summary, pending review or work journal controls", () => {
  render(view(fixture(), "day"));
  expect(
    screen.queryByText(/daily summary|pending review|work journal/i),
  ).toBeNull();
});

it("keeps more than six goals distinguishable and a crowded stack inside the plot", () => {
  const snapshot = fixture();
  snapshot.summary.goals = Array.from({ length: 10 }, (_, index) => ({
    goal_id: index + 1,
    title: `Goal ${index + 1}`,
    area: "",
    seconds: 1,
    relevant_seconds: 1,
  }));
  snapshot.week = [snapshot.summary];
  render(view(snapshot));
  const buttons = segments();
  expect(buttons).toHaveLength(10);
  expect(
    new Set(
      buttons.map((button) => button.style.getPropertyValue("--bar-color")),
    ).size,
  ).toBe(10);
  const gaps = parseFloat(buttons[0].parentElement!.style.gap) * 9;
  expect(
    buttons.reduce(
      (sum, button) => sum + parseFloat(button.style.height),
      gaps,
    ),
  ).toBeLessThanOrEqual(110.01);
});
