// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api/tauri";
import { CompanionSettings } from "./CompanionSettings";
import { defaultCompanionPreferences, defaultCompanionView } from "./types";
vi.mock("../api/tauri", () => ({
  desktop: true,
  api: { companionView: vi.fn(), companionPreferences: vi.fn() },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.companionView).mockResolvedValue(defaultCompanionView);
  vi.mocked(api.companionPreferences).mockResolvedValue(undefined);
});
afterEach(cleanup);
it("shows 18:00 by default and saves the selected summary time in Nudges", async () => {
  render(
    <CompanionSettings
      part="nudges"
      currentPreferences={defaultCompanionPreferences}
      onChanged={async () => {}}
    />,
  );
  const time = screen.getByLabelText("Daily summary time") as HTMLInputElement;
  expect(time.value).toBe("18:00");
  fireEvent.change(time, { target: { value: "19:30" } });
  await waitFor(() =>
    expect(api.companionPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ summary_minute: 1170 }),
    ),
  );
  expect(screen.queryByText("Working hours")).toBeNull();
  expect(screen.queryByText("Working days")).toBeNull();
});
it("saves overnight quiet hours and full quiet weekdays independently", async () => {
  render(
    <CompanionSettings
      part="nudges"
      currentPreferences={{
        ...defaultCompanionPreferences,
        quiet_hours_enabled: true,
        quiet_start_minute: 22 * 60,
        quiet_end_minute: 8 * 60,
      }}
      onChanged={async () => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Quiet hours start"), {
    target: { value: "23:00" },
  });
  await waitFor(() =>
    expect(api.companionPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({
        quiet_start_minute: 1380,
        quiet_end_minute: 480,
      }),
    ),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Sunday" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sunday" }));
  await waitFor(() =>
    expect(api.companionPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ quiet_days: [0], summary_minute: 1080 }),
    ),
  );
});
it("keeps saved quiet hours disabled until the user explicitly enables them", async () => {
  render(
    <CompanionSettings
      part="nudges"
      currentPreferences={defaultCompanionPreferences}
      onChanged={async () => {}}
    />,
  );
  expect(
    (screen.getByLabelText("Quiet hours start") as HTMLInputElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByLabelText("Use quiet hours"));
  await waitFor(() =>
    expect(api.companionPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ quiet_hours_enabled: true }),
    ),
  );
});

it("enables a valid schedule when an older profile disabled quiet hours with equal endpoints", async () => {
  render(
    <CompanionSettings
      part="nudges"
      currentPreferences={{
        ...defaultCompanionPreferences,
        quiet_start_minute: 0,
        quiet_end_minute: 0,
      }}
      onChanged={async () => {}}
    />,
  );
  fireEvent.click(screen.getByLabelText("Use quiet hours"));
  await waitFor(() =>
    expect(api.companionPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        quiet_hours_enabled: true,
        quiet_start_minute: 1140,
        quiet_end_minute: 540,
      }),
    ),
  );
});

it("exposes one fullscreen toggle and saves it independently of quiet settings", async () => {
  render(
    <CompanionSettings
      part="desktop"
      currentPreferences={defaultCompanionPreferences}
      onChanged={async () => {}}
    />,
  );
  expect(
    screen.getAllByLabelText("Hide sumi in full-screen apps"),
  ).toHaveLength(1);
  fireEvent.click(screen.getByLabelText("Hide sumi in full-screen apps"));
  await waitFor(() =>
    expect(api.companionPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        hide_fullscreen: false,
        quiet_hours_enabled: false,
      }),
    ),
  );
  expect(screen.queryByText(/snooze/i)).toBeNull();
});
