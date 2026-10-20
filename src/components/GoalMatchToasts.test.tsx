// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { coreApi } from "../core/api";
import { emptyCore, type CoreSnapshot } from "../core/types";
import { GoalMatchToasts } from "./GoalMatchToasts";
import { Toasts } from "./Toasts";

const hooks = vi.hoisted(() => ({
  receive: undefined as undefined | ((event: { payload: { goal_id: number; confidence: number; reason: string } }) => void),
  stop: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("../core/api", () => ({ coreApi: { snapshot: vi.fn() } }));
const suggestion = { goal_id: 7, confidence: 0.7, reason: "Related document" };
beforeEach(() => {
  vi.clearAllMocks();
  hooks.receive = undefined;
  vi.mocked(invoke).mockResolvedValue(null);
  vi.mocked(listen).mockImplementation(async (_name, receive) => {
    hooks.receive = receive as (event: { payload: typeof suggestion }) => void;
    return hooks.stop;
  });
  vi.mocked(coreApi.snapshot).mockResolvedValue({
    ...emptyCore(),
    goals: [{ id: 7, title: "Finish onboarding flow", status: "open" }] as CoreSnapshot["goals"],
  });
});
afterEach(cleanup);

it.each([["Yes", "yes"], ["No", "no"], ["Not now", "not_now"]])(
  "shows all three choices and sends %s through the guarded suggestion command",
  async (label, action) => {
    const changed = vi.fn().mockResolvedValue(undefined);
    render(<><Toasts /><GoalMatchToasts onChanged={changed} /></>);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_goal_match_suggestion"));
    act(() => hooks.receive?.({ payload: suggestion }));
    expect(await screen.findByText("Working on Finish onboarding flow?")).toBeTruthy();
    for (const name of ["Yes", "No", "Not now"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(
      "respond_goal_match_suggestion", { goalId: 7, action },
    ));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Yes" })).toBeNull();
    cleanup();
    expect(hooks.stop).toHaveBeenCalledOnce();
  },
);

it("recovers a pending offer when the workspace opens", async () => {
  vi.mocked(invoke).mockResolvedValue(suggestion);
  render(<><Toasts /><GoalMatchToasts onChanged={async () => {}} /></>);
  expect(await screen.findByRole("button", { name: "Not now" })).toBeTruthy();
  expect(listen).toHaveBeenCalledWith("goal_match_suggestion", expect.any(Function));
});

it("shows an expired-suggestion message if the backend rejects a stale acceptance", async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "get_goal_match_suggestion") return suggestion;
    throw new Error("Expired");
  });
  const changed = vi.fn();
  render(<><Toasts /><GoalMatchToasts onChanged={changed} /></>);
  fireEvent.click(await screen.findByRole("button", { name: "Yes" }));
  expect(await screen.findByText("Couldn't confirm that choice. Check your current focus before trying again.")).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
});
