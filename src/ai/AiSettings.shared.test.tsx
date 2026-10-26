// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AiSettings } from "./AiSettings";
import { aiApi, defaultAiPreferences } from "./api";
import { queryClient } from "../data/client";
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  aiApi: { preferences: vi.fn(), savePreferences: vi.fn() },
}));
beforeEach(() => {
  queryClient.invalidate(undefined, true);
  vi.mocked(aiApi.preferences).mockResolvedValue(defaultAiPreferences);
  vi.mocked(aiApi.savePreferences).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("shares preference reads and committed updates across consumers", async () => {
  render(
    <>
      <AiSettings compact onChanged={async () => {}} />
      <AiSettings compact onChanged={async () => {}} />
    </>,
  );
  const toggles = screen.getAllByRole("checkbox", { name: /Use AI/ });
  expect((toggles[0] as HTMLInputElement).disabled).toBe(true);
  await waitFor(() =>
    expect((toggles[0] as HTMLInputElement).disabled).toBe(false),
  );
  expect(aiApi.preferences).toHaveBeenCalledOnce();
  fireEvent.click(toggles[0]);
  await waitFor(() =>
    expect((toggles[1] as HTMLInputElement).checked).toBe(false),
  );
  expect(aiApi.savePreferences).toHaveBeenCalledWith({
    ...defaultAiPreferences,
    enabled: false,
  });
});
it("keeps consent controls disabled after a failed initial read and shows a safe message", async () => {
  vi.mocked(aiApi.preferences).mockRejectedValue("private-provider-canary");
  render(<AiSettings compact onChanged={async () => {}} />);
  await screen.findByRole("alert");
  expect(
    (screen.getByRole("checkbox", { name: /Use AI/ }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  expect(document.body.textContent).not.toContain("private-provider-canary");
  expect(
    queryClient
      .getDiagnostics()
      .some((row) => row.detail.includes("private-provider-canary")),
  ).toBe(true);
});

it("requires a separate opt-in for pre-send transcript correction", async () => {
  render(<AiSettings compact onChanged={async () => {}} />);
  const checkbox = screen.getByRole("checkbox", {
    name: /Correct dictated text before editing/,
  }) as HTMLInputElement;
  await waitFor(() => expect(checkbox.disabled).toBe(false));
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox);
  await waitFor(() =>
    expect(aiApi.savePreferences).toHaveBeenCalledWith({
      ...defaultAiPreferences,
      voice_text_cleanup: true,
    }),
  );
});
