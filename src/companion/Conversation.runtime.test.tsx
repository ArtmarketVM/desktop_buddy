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
vi.mock("../core/api", () => ({ coreApi: { transcribe: vi.fn() } }));
vi.mock("../core/media", () => ({
  recordVoice: vi.fn(),
  readAttachment: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiApi.history).mockResolvedValue([]);
  vi.mocked(aiApi.preferences).mockResolvedValue(defaultAiPreferences);
  vi.mocked(aiApi.send).mockResolvedValue({ message: "Done", resources: [] });
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
