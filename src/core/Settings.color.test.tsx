// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CoreSettings } from "./Settings";
import { api } from "../api/tauri";
import { coreApi } from "./api";
import { emptyCore } from "./types";
import {
  defaultUserSettings,
  defaultBuddyPreferences,
  defaultTrackingSettings,
  type Dashboard,
} from "../types";
vi.mock("../api/tauri", () => ({
  desktop: true,
  api: { trackingSettings: vi.fn(), setAvatarColor: vi.fn() },
}));
vi.mock("./api", () => ({ coreApi: { snapshot: vi.fn(), identity: vi.fn() } }));
vi.mock("../components/MacPermissions", () => ({ MacPermissions: () => null }));
vi.mock("../components/MemorySettings", () => ({ MemorySettings: () => null }));
vi.mock("../components/Settings", () => ({ ProviderKey: () => null }));
vi.mock("../components/PrivacySettings", () => ({
  PrivacySettings: () => null,
}));
vi.mock("../companion/CompanionSettings", () => ({
  CompanionSettings: () => null,
}));
vi.mock("../ai/PersonalAiEngine", () => ({
  PersonalAiEnginePanel: () => null,
}));
vi.mock("../ai/AiSettings", () => ({ AiSettings: () => null }));
vi.mock("./TrackingStatus", () => ({ TrackingStatus: () => null }));
const data = {
  status: { dnd: false },
  user_settings: defaultUserSettings,
  buddy: { preferences: defaultBuddyPreferences },
} as Dashboard;
beforeEach(() => {
  vi.mocked(coreApi.snapshot).mockResolvedValue(emptyCore());
  vi.mocked(api.trackingSettings).mockResolvedValue(defaultTrackingSettings);
  vi.mocked(api.setAvatarColor).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("color autosaves without saving unrelated name drafts", async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  render(
    <CoreSettings
      data={data}
      onChanged={changed}
      onDirty={vi.fn()}
      onUpdates={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Violet" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  fireEvent.change(screen.getByLabelText("Preferred name"), {
    target: { value: "Unsaved name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "General" }));
  fireEvent.click(screen.getByRole("button", { name: "Violet" }));
  expect(
    screen.getByRole("button", { name: "Violet" }).getAttribute("aria-pressed"),
  ).toBe("true");
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(api.setAvatarColor).toHaveBeenCalledWith("#6C5FFF");
  expect(coreApi.identity).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  expect(
    (screen.getByLabelText("Preferred name") as HTMLInputElement).value,
  ).toBe("Unsaved name");
});
it("a rejected color save restores the previous selection and shows the error", async () => {
  vi.mocked(api.setAvatarColor).mockRejectedValue(
    new Error("Could not save color"),
  );
  render(
    <CoreSettings
      data={data}
      onChanged={vi.fn()}
      onDirty={vi.fn()}
      onUpdates={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Violet" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Violet" }));
  await screen.findByText("Error: Could not save color");
  expect(
    screen.getByRole("button", { name: "Matcha" }).getAttribute("aria-pressed"),
  ).toBe("true");
});
it("a dashboard refresh failure does not undo a color already committed", async () => {
  render(
    <CoreSettings
      data={data}
      onChanged={vi.fn().mockRejectedValue(new Error("Dashboard unavailable"))}
      onDirty={vi.fn()}
      onUpdates={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Violet" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Violet" }));
  await screen.findByText("Error: Dashboard unavailable");
  expect(
    screen.getByRole("button", { name: "Violet" }).getAttribute("aria-pressed"),
  ).toBe("true");
});
