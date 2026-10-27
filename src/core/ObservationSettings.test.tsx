// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ObservationSettings } from "./ObservationSettings";
import { defaultCompanionPreferences } from "../companion/types";
import { api } from "../api/tauri";
import { invoke } from "../data/ipc";
vi.mock("../api/tauri", () => ({
  desktop: true,
  api: { companionPreferences: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../data/ipc", () => ({ invoke: vi.fn().mockResolvedValue(false) }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it("new-profile observation features start on and can be disabled independently", async () => {
  render(
    <ObservationSettings
      preferences={defaultCompanionPreferences}
      onChanged={async () => {}}
    />,
  );
  const screenshot = screen.getByRole("checkbox", {
    name: /Use screenshots/,
  }) as HTMLInputElement;
  const completion = screen.getByRole("checkbox", {
    name: /Automatically complete/,
  }) as HTMLInputElement;
  expect(screenshot.checked).toBe(true);
  expect(completion.checked).toBe(true);
  fireEvent.click(screenshot);
  await waitFor(() =>
    expect(api.companionPreferences).toHaveBeenCalledWith({
      ...defaultCompanionPreferences,
      use_screenshots: false,
    }),
  );
  expect(invoke).not.toHaveBeenCalledWith("screenshot_permission", {
    request: true,
  });
});
it("system permission is separate from saved screenshot consent", async () => {
  render(
    <ObservationSettings
      preferences={{ ...defaultCompanionPreferences, use_screenshots: true }}
      onChanged={async () => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Check permission" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("screenshot_permission", {
      request: true,
    }),
  );
  expect(api.companionPreferences).not.toHaveBeenCalled();
});
