// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InterventionCard } from "./InterventionCard";
import type { Intervention } from "./types";

afterEach(cleanup);
const prompt: Intervention = {
  id: "deadline:12:1792400400:2026-10-20",
  kind: "deadline",
  text: "“Prepare the demo” is past its deadline. Finished, or do it today?",
  confidence: 1,
  goal_id: 12,
  plan_revision: 2,
  step_id: null,
  expires_at: 9999999999,
};
it("preserves completion and Today actions alongside start, snooze and reschedule", () => {
  const respond = vi.fn();
  render(<InterventionCard prompt={prompt} busy={false} respond={respond} />);
  expect(respond).not.toHaveBeenCalled();
  expect(screen.getByText(prompt.text)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Start now" }));
  expect(respond).toHaveBeenLastCalledWith("start");
  fireEvent.click(screen.getByRole("button", { name: "Remind in 1 hour" }));
  expect(respond).toHaveBeenLastCalledWith("snooze");
  fireEvent.click(screen.getByRole("button", { name: "Move deadline 1 day" }));
  expect(respond).toHaveBeenLastCalledWith("reschedule");
  fireEvent.click(screen.getByRole("button", { name: "Do today" }));
  expect(respond).toHaveBeenLastCalledWith("today");
  expect(
    screen.getByTitle("Move to Today and set the deadline to the end of today"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
  expect(respond).toHaveBeenLastCalledWith("accept");
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(respond).toHaveBeenLastCalledWith("ignore");
});
it("disables every choice while a response is being saved", () => {
  const respond = vi.fn();
  render(<InterventionCard prompt={prompt} busy respond={respond} />);
  for (const button of screen.getAllByRole("button")) {
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
  }
  expect(respond).not.toHaveBeenCalled();
});
