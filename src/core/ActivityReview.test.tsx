// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActivityReview } from "./ActivityReview";
import { invoke } from "../data/ipc";
import type { ActivityReviewData } from "./activityReviewTypes";
import type { CoreGoal } from "./types";

const fixture = vi.hoisted(() => ({
  data: {
    pending_seconds: 0,
    pending_summary_count: 0,
    blocks: [],
    summaries: [],
  } as ActivityReviewData,
  refresh: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("../data/resources", () => ({
  activityReviewQuery: { refresh: fixture.refresh },
}));
vi.mock("../data/useQuery", () => ({
  useQuery: () => ({ data: fixture.data, error: "" }),
}));
vi.mock("../data/client", () => ({
  queryClient: {
    invalidate: vi.fn(),
    recordError: (_: string, error: unknown) => String(error),
  },
}));
vi.mock("../data/ipc", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.data = {
    pending_seconds: 720,
    pending_summary_count: 0,
    summaries: [],
    blocks: [
      {
        key: "proposal:organize an event",
        period_id: 7,
        day: "2026-10-21",
        started_at: "2026-10-21T12:00:00Z",
        ended_at: "2026-10-21T12:20:00Z",
        seconds: 720,
        apps: "Telegram,Browser",
        title: "Event planning",
        description: "Discussing the event and researching venues",
        proposed_title: "Organize an event",
        reason: "Related work outside the listed goals",
        status: "pending",
        goal_id: null,
        goal_title: null,
        evidence_ids: [14],
        finalized: false,
      },
    ],
  };
});
afterEach(cleanup);
const goals = [
  { id: 3, title: "Prepare presentation", status: "open" },
] as CoreGoal[];

it("assigns saved measured activity to a chosen goal without creating or completing another", async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  render(<ActivityReview goals={goals} onChanged={changed} />);
  fireEvent.click(screen.getByRole("button", { name: /pending review/ }));
  expect(
    screen.getByText("Discussing the event and researching venues"),
  ).toBeTruthy();
  fireEvent.change(
    screen.getByRole("combobox", { name: "Assign activity to goal" }),
    { target: { value: "3" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Assign to goal" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("review_activity", {
      periodId: 7,
      key: "proposal:organize an event",
      action: "assign",
      goalId: 3,
      title: "Organize an event",
    }),
  );
  expect(changed).toHaveBeenCalledOnce();
});

it("adds an open goal with the reviewed title and leaves completion separate", async () => {
  render(<ActivityReview goals={goals} onChanged={async () => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /pending review/ }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "New goal for activity" }),
    { target: { value: "Plan the event" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Add goal to Today" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("review_activity", {
      periodId: 7,
      key: "proposal:organize an event",
      action: "create",
      goalId: null,
      title: "Plan the event",
    }),
  );
  expect(screen.queryByText("Add completed")).toBeNull();
});

it("loads only the retained screenshot on request and handles summary cleanup", async () => {
  vi.mocked(invoke).mockRejectedValueOnce(new Error("Evidence deleted"));
  render(<ActivityReview goals={goals} onChanged={async () => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /pending review/ }));
  expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Screenshot 1" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "deleted after the daily summary",
    ),
  );
  expect(invoke).toHaveBeenCalledWith("get_activity_evidence", { id: 14 });
});

it("shows that evidence is retained while a daily summary is pending", () => {
  fixture.data.pending_summary_count = 1;
  render(<ActivityReview goals={goals} onChanged={async () => {}} />);
  expect(screen.getByRole("status").textContent).toContain(
    "context remains saved",
  );
});

it("pages pending blocks without losing the saved activity", () => {
  const original = fixture.data.blocks[0];
  fixture.data.blocks = Array.from({ length: 12 }, (_, index) => ({
    ...original,
    key: `context-${index}`,
    description: `Saved work ${index}`,
    evidence_ids: [],
  }));
  render(<ActivityReview goals={goals} onChanged={async () => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /pending review/ }));
  expect(screen.getByText("Saved work 0")).toBeTruthy();
  expect(screen.queryByText("Saved work 11")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "2" }));
  expect(screen.getByText("Saved work 11")).toBeTruthy();
  expect(screen.queryByText("Saved work 0")).toBeNull();
});
