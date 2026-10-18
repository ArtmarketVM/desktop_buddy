// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Conversation } from "./Conversation";
import { defaultCompanionView } from "./types";
import { aiApi, defaultAiPreferences } from "../ai/api";
import { coachingApi, type CoachingView } from "../coaching/api";
vi.mock("../api/tauri", () => ({
  desktop: true,
  api: {},
  safeUrl: () => null,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../ai/api", async (original) => ({
  ...(await original<typeof import("../ai/api")>()),
  aiApi: { history: vi.fn(), preferences: vi.fn(), send: vi.fn() },
}));
vi.mock("../coaching/api", () => ({
  coachingApi: { inspect: vi.fn(), reply: vi.fn() },
}));
const fixture: CoachingView = {
  session: {
    id: 9,
    goal_id: 7,
    step_id: null,
    conversation_id: 42,
    revision: 6,
    status: "active",
    step: "execution",
    data: {
      action: { title: "Open the requirements", estimated_seconds: 10 },
      anchor: null,
      revision_count: 0,
      attempt_count: 0,
    },
  },
  target: {
    goal_id: 7,
    title: "Open Cash ISA",
    step_id: null,
    step_title: null,
    revision: 2,
  },
  fresh: true,
  can_remember: true,
  chat_bound: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiApi.history).mockResolvedValue([]);
  vi.mocked(aiApi.preferences).mockResolvedValue(defaultAiPreferences);
  vi.mocked(aiApi.send).mockResolvedValue({ message: "Done", resources: [] });
  vi.mocked(coachingApi.inspect).mockResolvedValue(structuredClone(fixture));
});
afterEach(cleanup);
function show() {
  render(
    <Conversation
      embedded
      view={defaultCompanionView}
      goal={{ id: 99, text: "Unrelated goal", created_at: "2026-10-18T10:00:00Z" }}
      plan={null}
      conversationId={42}
      onChanged={async () => {}}
      onState={() => {}}
    />,
  );
}
it("sends a typed reply with the pinned goal, session revision and explicit memory choice", async () => {
  show();
  await screen.findByText("Coaching · Open Cash ISA");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Remember my reported result" }),
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "I opened the requirements" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(aiApi.send).toHaveBeenCalledWith(
      "I opened the requirements",
      null,
      7,
      42,
      false,
      expect.any(String),
      9,
      6,
      true,
    ),
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Attach text or PDF",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("keeps pause available while awaiting the provider and waits for the next question before another reply", async () => {
  let finish!: (value: { message: string; resources: [] }) => void;
  vi.mocked(aiApi.send).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const paused = {
    ...fixture,
    session: {
      ...fixture.session,
      revision: 7,
      status: "paused" as const,
      step: "paused",
    },
  };
  vi.mocked(coachingApi.reply).mockResolvedValue(paused);
  show();
  await screen.findByText("Coaching · Open Cash ISA");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "I have not done it" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(aiApi.send).toHaveBeenCalledTimes(1));
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(
    true,
  );
  const pause = screen.getByRole("button", { name: "Pause coaching" });
  expect((pause as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(pause);
  await screen.findByRole("button", { name: "Resume coaching" });
  vi.mocked(coachingApi.inspect).mockResolvedValue(paused);
  await act(async () => finish({ message: "Paused", resources: [] }));
  await waitFor(() =>
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(
      false,
    ),
  );
  expect(aiApi.send).toHaveBeenCalledTimes(1);
});
