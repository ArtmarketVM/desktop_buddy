// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CoachingPanel } from "./CoachingPanel";
import { coachingApi, type CoachingView } from "./api";
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../core/api", () => ({
  coreApi: {
    snapshot: vi.fn().mockResolvedValue({
      goals: [
        { id: 7, title: "Write proposal", status: "open" },
        { id: 8, title: "Completed goal", status: "completed" },
      ],
    }),
  },
}));
vi.mock("./api", () => ({
  coachingApi: {
    inspect: vi.fn(),
    prepare: vi.fn(),
    start: vi.fn(),
    reply: vi.fn(),
    propose: vi.fn(),
  },
}));
export function fixture(step = "barrier"): CoachingView {
  return {
    session: {
      id: 1,
      goal_id: 7,
      step_id: null,
      conversation_id: 4,
      revision: 1,
      status: "active",
      step,
      data: { action: null, anchor: null, revision_count: 0, attempt_count: 0 },
    },
    target: {
      goal_id: 7,
      title: "Write proposal",
      step_id: null,
      step_title: null,
      revision: 1,
    },
    fresh: true,
    can_remember: true,
    chat_bound: true,
  };
}
beforeEach(() => {
  vi.mocked(coachingApi.inspect).mockResolvedValue(fixture());
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("pins the goal and leaves coaching questions in the transcript", async () => {
  const changed = vi.fn();
  render(<CoachingPanel conversationId={4} onChange={changed} />);
  await screen.findByText("Coaching · Write proposal");
  expect(screen.getByText(/Reply in the message box/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "It feels too big" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Ease score" })).toBeNull();
  expect(coachingApi.propose).not.toHaveBeenCalled();
  await waitFor(() => expect(changed).toHaveBeenCalledWith(fixture()));
});
it("keeps blocked conversations goal-bound until explicit exit", async () => {
  const state = fixture("blocked");
  state.session.status = "blocked";
  vi.mocked(coachingApi.inspect).mockResolvedValue(state);
  vi.mocked(coachingApi.reply).mockResolvedValue({
    ...state,
    chat_bound: false,
    session: { ...state.session, revision: 2 },
  });
  render(<CoachingPanel conversationId={4} />);
  await screen.findByText(/external blocker/);
  expect(screen.queryByRole("button", { name: "Help me start" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Exit coaching" }));
  await screen.findByRole("button", { name: "Help me start" });
  expect(coachingApi.reply).toHaveBeenCalledWith(
    state.session,
    { type: "stop" },
    expect.any(String),
  );
});
it("pauses and resumes without requiring another form response", async () => {
  const state = fixture();
  vi.mocked(coachingApi.reply)
    .mockResolvedValueOnce({
      ...state,
      session: {
        ...state.session,
        status: "paused",
        step: "paused",
        revision: 2,
      },
    })
    .mockResolvedValueOnce({
      ...state,
      session: { ...state.session, revision: 3 },
    });
  render(<CoachingPanel conversationId={4} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Pause coaching" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Resume coaching" }),
  );
  await screen.findByRole("button", { name: "Pause coaching" });
  expect(vi.mocked(coachingApi.reply).mock.calls.map((c) => c[1])).toEqual([
    { type: "pause" },
    { type: "resume" },
  ]);
});
it("requires a selected unfinished goal and explains the dedicated chat before starting", async () => {
  vi.mocked(coachingApi.inspect).mockResolvedValue(null);
  const state = fixture();
  const entry = { target: state.target!, conversation_id: 4 };
  vi.mocked(coachingApi.prepare).mockResolvedValue(entry);
  vi.mocked(coachingApi.start).mockResolvedValue(state);
  render(<CoachingPanel conversationId={4} requested />);
  const picker = await screen.findByRole("combobox", { name: "Coaching goal" });
  await screen.findByRole("option", { name: "Write proposal" });
  expect(screen.queryByRole("option", { name: "Completed goal" })).toBeNull();
  fireEvent.change(picker, { target: { value: "7" } });
  await screen.findByText(/Open a coaching chat for this goal/);
  await screen.findByText(/saved locally, even with Personal Memory off/);
  const start = screen.getByRole("button", { name: "Start coaching" });
  await waitFor(() =>
    expect((start as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(start);
  await screen.findByText("Coaching · Write proposal");
  expect(coachingApi.start).toHaveBeenCalledWith(entry, expect.any(String));
});
it("keeps remembering a result an explicit unchecked option", async () => {
  vi.mocked(coachingApi.inspect).mockResolvedValue(fixture("execution"));
  const remember = vi.fn();
  render(<CoachingPanel conversationId={4} onRememberChange={remember} />);
  const checkbox = await screen.findByRole("checkbox", {
    name: "Remember my reported result",
  });
  expect((checkbox as HTMLInputElement).checked).toBe(false);
  fireEvent.click(checkbox);
  expect(remember).toHaveBeenLastCalledWith(true);
  expect(coachingApi.reply).not.toHaveBeenCalled();
});
it("allows exit from stale context and prevents resuming it", async () => {
  const state = fixture("paused");
  state.fresh = false;
  state.session.status = "paused";
  vi.mocked(coachingApi.inspect).mockResolvedValue(state);
  render(<CoachingPanel conversationId={4} />);
  await screen.findByText(/This goal or step changed/);
  expect(
    (
      screen.getByRole("button", {
        name: "Resume coaching",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Exit coaching" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
