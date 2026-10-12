// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Conversation } from "./Conversation";
import { defaultCompanionView } from "./types";
import { aiApi, defaultAiPreferences } from "../ai/api";
import { coreApi } from "../core/api";
import { recordVoice } from "../core/media";
vi.mock("../api/tauri", () => ({
  desktop: true,
  api: {},
  safeUrl: () => null,
}));
vi.mock("../api/platform", () => ({ isMac: true }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../ai/api", async (original) => ({
  ...(await original<typeof import("../ai/api")>()),
  aiApi: { history: vi.fn(), preferences: vi.fn(), send: vi.fn() },
}));
vi.mock("../core/api", () => ({
  coreApi: { transcribe: vi.fn(), voiceLanguages: vi.fn() },
}));
vi.mock("../core/media", () => ({
  recordVoice: vi.fn(),
  readAttachment: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiApi.history).mockResolvedValue([]);
  vi.mocked(aiApi.preferences).mockResolvedValue(defaultAiPreferences);
  vi.mocked(aiApi.send).mockResolvedValue({ message: "Done", resources: [] });
  vi.mocked(coreApi.voiceLanguages).mockResolvedValue(["en-US"]);
  vi.mocked(coreApi.transcribe).mockResolvedValue("Add an outline step");
  vi.mocked(recordVoice).mockResolvedValue({
    stop: vi.fn().mockResolvedValue("fixture"),
    cancel: vi.fn(),
    setMuted: vi.fn(),
  });
});
afterEach(cleanup);
function show() {
  render(
    <Conversation
      view={defaultCompanionView}
      goal={null}
      plan={null}
      conversationId={42}
      onChanged={async () => {}}
      onState={() => {}}
    />,
  );
}
async function dictate() {
  await userEvent.click(
    screen.getByRole("button", { name: "Start voice recording" }),
  );
  await screen.findByRole("button", { name: "Stop voice recording" });
  await userEvent.click(
    screen.getByRole("button", { name: "Stop voice recording" }),
  );
  await waitFor(() =>
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Add an outline step",
    ),
  );
}
it("routes a locally transcribed message as voice, then an ordinary message as text", async () => {
  show();
  await dictate();
  await userEvent.keyboard("{Enter}");
  await waitFor(() =>
    expect(aiApi.send).toHaveBeenNthCalledWith(
      1,
      "Add an outline step",
      null,
      null,
      42,
      true,
    ),
  );
  await userEvent.type(screen.getByRole("textbox"), "List my goals{Enter}");
  await waitFor(() =>
    expect(aiApi.send).toHaveBeenNthCalledWith(
      2,
      "List my goals",
      null,
      null,
      42,
      false,
    ),
  );
});
it("preserves the input source and chat when a message waits behind another reply", async () => {
  let finish!: (reply: { message: string; resources: [] }) => void;
  vi.mocked(aiApi.send).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  show();
  await dictate();
  await userEvent.keyboard("{Enter}");
  await waitFor(() => expect(aiApi.send).toHaveBeenCalledTimes(1));
  await userEvent.type(screen.getByRole("textbox"), "List my goals{Enter}");
  expect(aiApi.send).toHaveBeenCalledTimes(1);
  await act(async () => finish({ message: "Step added", resources: [] }));
  await waitFor(() =>
    expect(aiApi.send).toHaveBeenNthCalledWith(
      2,
      "List my goals",
      null,
      null,
      42,
      false,
    ),
  );
});

it.each(["", "   "])(
  "does not send an empty transcript (%j) to AI",
  async (transcript) => {
    vi.mocked(coreApi.transcribe).mockResolvedValue(transcript);
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "Start voice recording" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Stop voice recording" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "No speech was recognized",
      ),
    );
    expect(aiApi.send).not.toHaveBeenCalled();
  },
);
it("preserves the typed draft after a local STT failure", async () => {
  vi.mocked(coreApi.transcribe).mockRejectedValue(
    new Error("Local recognition failed"),
  );
  show();
  await userEvent.type(screen.getByRole("textbox"), "Keep this draft");
  await userEvent.click(
    screen.getByRole("button", { name: "Start voice recording" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Stop voice recording" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Local recognition failed",
    ),
  );
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "Keep this draft",
  );
  expect(aiApi.send).not.toHaveBeenCalled();
});
it("explains microphone permission failure and permits typed commands", async () => {
  vi.mocked(recordVoice).mockRejectedValueOnce(
    new DOMException("Denied", "NotAllowedError"),
  );
  show();
  await userEvent.click(
    screen.getByRole("button", { name: "Start voice recording" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Microphone access was denied",
    ),
  );
  expect(coreApi.transcribe).not.toHaveBeenCalled();
  await userEvent.type(screen.getByRole("textbox"), "List goals{Enter}");
  await waitFor(() =>
    expect(aiApi.send).toHaveBeenCalledWith(
      "List goals",
      null,
      null,
      42,
      false,
    ),
  );
});
it("does not start a microphone or cloud fallback if local STT is unsupported", async () => {
  vi.mocked(coreApi.voiceLanguages).mockResolvedValueOnce([]);
  show();
  await userEvent.click(
    screen.getByRole("button", { name: "Start voice recording" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Local speech recognition is unavailable",
    ),
  );
  expect(recordVoice).not.toHaveBeenCalled();
  expect(coreApi.transcribe).not.toHaveBeenCalled();
  expect(aiApi.send).not.toHaveBeenCalled();
});
it("routes raw audio only to local STT and sends only the transcript to the agent", async () => {
  const audio = new Uint8Array([82, 73, 70, 70, 111, 222]);
  vi.mocked(recordVoice).mockResolvedValueOnce({
    stop: vi.fn().mockResolvedValue(audio),
    cancel: vi.fn(),
    setMuted: vi.fn(),
  });
  show();
  await dictate();
  expect(coreApi.transcribe).toHaveBeenCalledWith(audio);
  expect(aiApi.send).not.toHaveBeenCalled();
  await userEvent.keyboard("{Enter}");
  await waitFor(() =>
    expect(aiApi.send).toHaveBeenCalledWith(
      "Add an outline step",
      null,
      null,
      42,
      true,
    ),
  );
  expect(
    vi
      .mocked(aiApi.send)
      .mock.calls[0].every((value: unknown) => !(value instanceof Uint8Array)),
  ).toBe(true);
});
it("discards recognition when the compact voice interface is closed before STT finishes", async () => {
  let complete!: (value: string) => void;
  vi.mocked(coreApi.transcribe).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const onClose = vi.fn();
  const props = {
    view: defaultCompanionView,
    goal: null,
    plan: null,
    compact: true,
    onChanged: async () => {},
    onState: () => {},
    onClose,
  };
  const { rerender } = render(<Conversation {...props} mode="voice" />);
  await waitFor(() => expect(recordVoice).toHaveBeenCalled());
  await userEvent.click(
    screen.getByRole("button", { name: "Stop and transcribe" }),
  );
  await waitFor(() => expect(coreApi.transcribe).toHaveBeenCalled());
  await userEvent.click(screen.getByRole("button", { name: "Close voice" }));
  expect(onClose).toHaveBeenCalled();
  rerender(<Conversation {...props} mode="text" />);
  await act(async () => complete("Delete all goals"));
  expect(aiApi.send).not.toHaveBeenCalled();
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
});
it("rejects oversized speech before compact auto-send instead of executing a truncated command", async () => {
  vi.mocked(coreApi.transcribe).mockResolvedValueOnce(
    "Delete the goal ".repeat(300),
  );
  render(
    <Conversation
      view={defaultCompanionView}
      goal={null}
      plan={null}
      compact
      mode="voice"
      onChanged={async () => {}}
      onState={() => {}}
    />,
  );
  await waitFor(() => expect(recordVoice).toHaveBeenCalled());
  await userEvent.click(
    screen.getByRole("button", { name: "Stop and transcribe" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "transcript is too long",
    ),
  );
  expect(aiApi.send).not.toHaveBeenCalled();
});
