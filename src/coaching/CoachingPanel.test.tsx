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
import { coachingApi, type CoachingControl, type CoachingView } from "./api";

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

function fixture(step = "readiness"): CoachingView {
  return {
    session: {
      id: 1,
      goal_id: 7,
      step_id: null,
      conversation_id: 4,
      revision: 0,
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

it("takes explicit structured answers through the complete voluntary flow", async () => {
  let state = fixture();
  vi.mocked(coachingApi.reply).mockImplementation(async (session, control) => {
    expect(session.conversation_id).toBe(4);
    expect(session.revision).toBe(state.session.revision);
    const next = structuredClone(state);
    next.session.revision++;
    if (control.type !== "reply") throw new Error("Expected an explicit reply");
    const reply = control.reply;
    const steps = {
      ready: "barrier",
      barrier: "tiny_action",
      ease: "anchor",
      anchor: "commitment",
      commit: "execution",
      report: "completed",
    };
    next.session.step = steps[reply.type];
    if (reply.type === "anchor") next.session.data.anchor = reply.anchor;
    if (reply.type === "report") next.session.status = "completed";
    state = next;
    return next;
  });
  vi.mocked(coachingApi.propose).mockImplementation(async () => {
    state = structuredClone(state);
    state.session.revision++;
    state.session.step = "feasibility";
    state.session.data.action = {
      title: "Open the proposal document",
      estimated_seconds: 10,
    };
    return state;
  });
  render(<CoachingPanel conversationId={4} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Yes, let’s try" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "It feels too big" }),
  );
  // No provider request is sent before the person asks for a suggestion.
  expect(coachingApi.propose).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole("button", { name: "Suggest a small action" }),
  );
  fireEvent.change(
    await screen.findByRole("combobox", { name: "Ease score" }),
    { target: { value: "8" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
  fireEvent.click(await screen.findByRole("button", { name: "I’ll try it" }));
  const remember = await screen.findByRole("checkbox", {
    name: "Remember my reported result",
  });
  expect((remember as HTMLInputElement).checked).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "I did the small action" }),
  );
  await screen.findByText(/Your goal and checklist stay as they are/);
  const sent = vi.mocked(coachingApi.reply).mock.calls.map((call) => call[1]);
  expect(sent.at(-1)).toEqual({
    type: "reply",
    reply: { type: "report", completed: true, remember: false },
  });
  expect(
    new Set(vi.mocked(coachingApi.reply).mock.calls.map((call) => call[2]))
      .size,
  ).toBe(6);
});

it("requires a selected unfinished goal and explains persistence before starting", async () => {
  vi.mocked(coachingApi.inspect).mockResolvedValue(null);
  const state = fixture();
  const entry = { target: state.target!, conversation_id: 4 };
  vi.mocked(coachingApi.prepare).mockResolvedValue(entry);
  vi.mocked(coachingApi.start).mockResolvedValue(state);
  render(<CoachingPanel conversationId={4} requested />);
  const picker = await screen.findByRole("combobox", { name: "Coaching goal" });
  await screen.findByRole("option", { name: "Write proposal" });
  expect(screen.queryByRole("option", { name: "Completed goal" })).toBeNull();
  expect(coachingApi.start).not.toHaveBeenCalled();
  fireEvent.change(picker, { target: { value: "7" } });
  await screen.findByText(/saved locally, even with Personal Memory off/);
  await waitFor(() =>
    expect(coachingApi.prepare).toHaveBeenCalledWith(7, null),
  );
  const start = screen.getByRole("button", { name: "Start coaching" });
  await waitFor(() =>
    expect((start as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(start);
  await screen.findByRole("button", { name: "Yes, let’s try" });
  expect(coachingApi.start).toHaveBeenCalledWith(entry, expect.any(String));
});

it("preserves the session after a provider failure and offers a bounded manual retry", async () => {
  vi.mocked(coachingApi.inspect).mockResolvedValue(fixture("tiny_action"));
  vi.mocked(coachingApi.propose).mockRejectedValue(
    new Error("Service unavailable"),
  );
  render(<CoachingPanel conversationId={4} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Suggest a small action" }),
  );
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Suggest a small action",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(coachingApi.propose).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Pause coaching" })).toBeTruthy();
});

it("keeps pause available during a provider call and ignores an older returned revision", async () => {
  const initial = fixture("tiny_action");
  vi.mocked(coachingApi.inspect).mockResolvedValue(initial);
  let finish!: (result: CoachingView) => void;
  vi.mocked(coachingApi.propose).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.mocked(coachingApi.reply).mockImplementation(
    async (_session, control: CoachingControl) => {
      expect(control).toEqual({ type: "pause" });
      return {
        ...initial,
        session: {
          ...initial.session,
          revision: 2,
          status: "paused",
          step: "paused",
        },
      };
    },
  );
  render(<CoachingPanel conversationId={4} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Suggest a small action" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Pause coaching" }));
  await screen.findByText(/Coaching is paused/);
  finish({
    ...initial,
    session: { ...initial.session, revision: 1, step: "feasibility" },
  });
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Resume coaching",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(screen.queryByRole("combobox", { name: "Ease score" })).toBeNull();
});

it("allows stopping a changed target and suppresses outcome memory when controls forbid it", async () => {
  vi.mocked(coachingApi.inspect).mockResolvedValue({
    ...fixture("execution"),
    can_remember: false,
  });
  const rendered = render(<CoachingPanel conversationId={4} />);
  await screen.findByText("How did that small action go?");
  expect(screen.queryByRole("checkbox")).toBeNull();
  rendered.unmount();
  vi.mocked(coachingApi.inspect).mockResolvedValue({
    ...fixture("execution"),
    fresh: false,
  });
  render(<CoachingPanel conversationId={4} />);
  await screen.findByText(/This goal or step changed/);
  expect(
    screen.queryByRole("button", { name: "I did the small action" }),
  ).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Stop coaching" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
