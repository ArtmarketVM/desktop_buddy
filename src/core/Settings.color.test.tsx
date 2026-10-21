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
import { openUrl } from "@tauri-apps/plugin-opener";
import { queryClient } from "../data/client";
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
  api: {
    trackingSettings: vi.fn(),
    setAvatarColor: vi.fn(),
    saveTrackingSettings: vi.fn(),
    privacyPreview: vi.fn(),
  },
}));
vi.mock("./api", () => ({
  coreApi: { snapshot: vi.fn(), identity: vi.fn(), preferences: vi.fn() },
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../components/MacPermissions", () => ({ MacPermissions: () => null }));
vi.mock("../components/MemorySettings", () => ({ MemorySettings: () => null }));
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
  queryClient.invalidate(undefined, true);
  vi.mocked(coreApi.snapshot).mockResolvedValue(emptyCore());
  vi.mocked(api.trackingSettings).mockResolvedValue(defaultTrackingSettings);
  vi.mocked(api.setAvatarColor).mockResolvedValue(undefined);
  vi.mocked(api.privacyPreview).mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("saves the selected stretch interval instead of using a hard-coded cadence", async () => {
  render(
    <CoreSettings
      data={data}
      onChanged={async () => {}}
      onDirty={vi.fn()}
      onUpdates={vi.fn()}
    />,
  );
  const interval = await screen.findByRole("combobox", {
    name: "Stretch interval",
    hidden: true,
  });
  await waitFor(() =>
    expect((interval as HTMLSelectElement).disabled).toBe(false),
  );
  fireEvent.change(interval, { target: { value: "90" } });
  await waitFor(() =>
    expect(coreApi.preferences).toHaveBeenCalledWith(
      expect.objectContaining({ movement_interval_minutes: 90 }),
    ),
  );
});
it("opens the published privacy policy from the Privacy section", async () => {
  render(
    <CoreSettings
      data={data}
      onChanged={vi.fn()}
      onDirty={vi.fn()}
      onUpdates={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Privacy$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Privacy policy ↗" }));
  expect(openUrl).toHaveBeenCalledWith(
    "https://artmarketvm.github.io/desktop_buddy/docs/privacy.html",
  );
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
  await screen.findByText("Couldn't save that change. Please try again.");
  expect(
    screen.getByRole("button", { name: "Lime" }).getAttribute("aria-pressed"),
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
  await screen.findByText("Couldn't save that change. Please try again.");
  expect(
    screen.getByRole("button", { name: "Violet" }).getAttribute("aria-pressed"),
  ).toBe("true");
});

it("keeps saved preference edits until canonical shared snapshots finish refreshing", async () => {
  const initial = emptyCore();
  vi.mocked(coreApi.snapshot).mockResolvedValue(initial);
  render(
    <CoreSettings
      data={{
        ...data,
        user_settings: {
          ...defaultUserSettings,
          profile: { ...defaultUserSettings.profile, name: "Test user" },
        },
      }}
      onChanged={async () => {}}
      onDirty={vi.fn()}
      onUpdates={vi.fn()}
    />,
  );
  const reminder = screen.getByRole("checkbox", {
    name: "Remind me to stretch",
  }) as HTMLInputElement;
  await waitFor(() => expect(reminder.disabled).toBe(false));
  const next = structuredClone(initial);
  next.preferences.movement_reminders = !reminder.checked;
  let finish!: (value: ReturnType<typeof emptyCore>) => void;
  vi.mocked(coreApi.snapshot).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(reminder);
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(coreApi.preferences).toHaveBeenCalled());
  expect(api.saveTrackingSettings).not.toHaveBeenCalled();
  expect(reminder.checked).toBe(next.preferences.movement_reminders);
  expect(screen.queryByText("Saved")).toBeNull();
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  finish(next);
  await screen.findByText("Saved");
  expect(reminder.checked).toBe(next.preferences.movement_reminders);
});

it("removes the retired working hours and working weekdays controls", async () => {
  render(
    <CoreSettings
      data={data}
      onChanged={async () => {}}
      onDirty={vi.fn()}
      onUpdates={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("group", { name: "Working hours", hidden: true }),
  ).toBeNull();
  expect(
    screen.queryByRole("group", { name: "Working days", hidden: true }),
  ).toBeNull();
  expect(api.trackingSettings).not.toHaveBeenCalled();
});
