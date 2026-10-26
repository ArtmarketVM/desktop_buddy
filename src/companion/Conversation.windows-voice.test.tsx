// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Conversation } from "./Conversation";
import { defaultCompanionView } from "./types";
import { aiApi, defaultAiPreferences } from "../ai/api";
import { coreApi } from "../core/api";
import { recordVoice } from "../core/media";
vi.mock("../api/platform", () => ({ isMac: false }));
vi.mock("../api/tauri", () => ({
  desktop: true,
  api: {
    voiceInput: vi.fn(() => {
      throw new Error("System dictation must not be used");
    }),
  },
  safeUrl: () => null,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../ai/api", async (original) => ({
  ...(await original<typeof import("../ai/api")>()),
  aiApi: { history: vi.fn(), preferences: vi.fn(), send: vi.fn() },
}));
vi.mock("../core/api", () => ({
  coreApi: {
    transcribe: vi.fn(),
    correctVoiceDraft: vi.fn(),
    voiceLanguages: vi.fn(),
    prepareVoice: vi.fn(async () => {}),
  },
}));
vi.mock("../core/media", () => ({
  recordVoice: vi.fn(),
  readAttachment: vi.fn(),
}));
afterEach(cleanup);
it("uses Windows local WAV transcription and the same agent command after review", async () => {
  vi.mocked(aiApi.history).mockResolvedValue([]);
  vi.mocked(aiApi.preferences).mockResolvedValue(defaultAiPreferences);
  vi.mocked(aiApi.send).mockResolvedValue({
    message: "Created",
    resources: [],
  });
  vi.mocked(coreApi.voiceLanguages).mockResolvedValue(["en-US"]);
  vi.mocked(coreApi.transcribe).mockResolvedValue("Create an interview goal");
  const audio = new Uint8Array([82, 73, 70, 70]);
  vi.mocked(recordVoice).mockResolvedValue({
    stop: vi.fn().mockResolvedValue(audio),
    cancel: vi.fn(),
    setMuted: vi.fn(),
  });
  render(
    <Conversation
      view={defaultCompanionView}
      goal={null}
      plan={null}
      onChanged={async () => {}}
      onState={() => {}}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Start voice recording" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Stop voice recording" }),
  );
  await waitFor(() =>
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Create an interview goal",
    ),
  );
  expect(coreApi.transcribe).toHaveBeenCalledWith(audio);
  expect(aiApi.send).not.toHaveBeenCalled();
  await userEvent.keyboard("{Enter}");
  await waitFor(() =>
    expect(aiApi.send).toHaveBeenCalledWith(
      "Create an interview goal",
      null,
      null,
      null,
      true,
      expect.any(String),
      null,
      null,
      false,
    ),
  );
});
