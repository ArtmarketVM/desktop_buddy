// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InterventionCard } from "./InterventionCard";
import { interventionState } from "./interventionPresentation";
import type { Intervention } from "./types";
afterEach(cleanup);
const prompt: Intervention = {
  id: "deadline:12:1999999999:now",
  kind: "deadline",
  text: "Your pitch deck is due now. Are you on it, or do you need to reschedule?",
  confidence: 1,
  goal_id: 12,
  plan_revision: 2,
  step_id: null,
  expires_at: 9999999999,
};

it("answers the deadline question without treating acknowledgement as completion", () => {
  const respond = vi.fn();
  render(<InterventionCard prompt={prompt} busy={false} respond={respond} />);
  expect(screen.queryByRole("button", { name: "Mark complete" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "I’m on it" }));
  expect(respond).toHaveBeenLastCalledWith("on_it");
  const chat = screen.getByRole("button", { name: "Chat" });
  expect(chat.className).toBe("text-button");
  fireEvent.click(chat);
  expect(respond).toHaveBeenLastCalledWith("chat");
});
it("reschedules only after choosing and saving a future date; Cancel makes no request", () => {
  const respond = vi.fn();
  render(<InterventionCard prompt={prompt} busy={false} respond={respond} />);
  fireEvent.click(screen.getByRole("button", { name: "Reschedule" }));
  expect(respond).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("New deadline"), {
    target: { value: "2035-10-22T17:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(respond).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reschedule" }));
  fireEvent.click(screen.getByRole("button", { name: "Save deadline" }));
  expect(respond).toHaveBeenLastCalledWith(
    "reschedule",
    new Date("2035-10-22T17:00").toISOString(),
  );
});
it("keeps an invalid deadline local and disables all actions during saving", () => {
  const respond = vi.fn();
  const view = render(
    <InterventionCard prompt={prompt} busy={false} respond={respond} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Reschedule" }));
  fireEvent.change(screen.getByLabelText("New deadline"), {
    target: { value: "2020-01-01T10:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save deadline" }));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(respond).not.toHaveBeenCalled();
  view.rerender(<InterventionCard prompt={prompt} busy respond={respond} />);
  for (const button of screen.getAllByRole("button"))
    expect((button as HTMLButtonElement).disabled).toBe(true);
});
it("gives every message a secondary Chat action and selects the existing pose by purpose", () => {
  const cases = [
    ["no_goals", "idle"],
    ["deadline", "idle"],
    ["movement", "stretching"],
    ["completion", "attention"],
    ["goal_completion", "attention"],
    ["new_task", "attention"],
    ["unplanned_work", "attention"],
    ["automatic_completion", "success"],
    ["end_of_day", "success"],
  ] as const;
  for (const [kind, state] of cases) {
    const next = { ...prompt, id: kind, kind };
    const view = render(
      <InterventionCard prompt={next} busy={false} respond={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Chat" }).className).toBe(
      "text-button",
    );
    expect(interventionState(next)).toBe(state);
    view.unmount();
  }
});

it("keeps planning Not now as an explicit 30-minute request without a global snooze", () => {
  const respond = vi.fn();
  render(
    <InterventionCard
      prompt={{
        ...prompt,
        id: "schedule:2026-10-21:planning",
        kind: "no_goals",
        text: "Want to plan today?",
      }}
      busy={false}
      respond={respond}
    />,
  );
  expect(
    screen.getByText("Choose Not now for a reminder in 30 minutes."),
  ).toBeTruthy();
  expect(respond).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(respond).toHaveBeenCalledExactlyOnceWith("ignore");
});

it("renders a queued goal match with Yes, No, Not now and secondary Chat", () => {
  const respond = vi.fn();
  render(
    <InterventionCard
      prompt={{
        ...prompt,
        kind: "goal_match",
        text: "Working on the pitch deck?",
      }}
      busy={false}
      respond={respond}
    />,
  );
  for (const [label, action] of [
    ["Yes", "accept"],
    ["No", "no"],
    ["Not now", "ignore"],
    ["Chat", "chat"],
  ] as const) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(respond).toHaveBeenLastCalledWith(action);
  }
  expect(screen.getByRole("button", { name: "Chat" }).className).toBe(
    "text-button",
  );
});
