// @vitest-environment jsdom
import { queryClient } from "../data/client";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CoreSettings } from "./Settings";
import { api } from "../api/tauri";
import { serviceStatusApi, type ServiceSnapshot } from "../ai/serviceStatus";
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
    testConnection: vi.fn(),
    providerKey: vi.fn(),
  },
}));
vi.mock("../ai/serviceStatus", () => ({ serviceStatusApi: { read: vi.fn() } }));
vi.mock("./api", () => ({ coreApi: { snapshot: vi.fn() } }));
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
  status: { dnd: false, nebius_configured: true, tavily_configured: true },
  user_settings: defaultUserSettings,
  buddy: { preferences: defaultBuddyPreferences },
} as Dashboard;
let snapshot: ServiceSnapshot;
beforeEach(() => {
  queryClient.invalidate(undefined, true);
  snapshot = {
    configured_model: "test-model",
    services: ["nebius", "tavily"].map((id) => ({
      id: id as "nebius" | "tavily",
      status: "not_checked",
      checked_at: null,
    })),
  };
  vi.mocked(coreApi.snapshot).mockResolvedValue(emptyCore());
  vi.mocked(api.trackingSettings).mockResolvedValue(defaultTrackingSettings);
  vi.mocked(serviceStatusApi.read).mockImplementation(async () =>
    structuredClone(snapshot),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});
async function openSettings(onChanged = vi.fn().mockResolvedValue(undefined)) {
  render(
    <CoreSettings
      data={data}
      onChanged={onChanged}
      onDirty={vi.fn()}
      onUpdates={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "AI" }));
  await waitFor(() => expect(serviceStatusApi.read).toHaveBeenCalledOnce());
  return within(screen.getByRole("region", { name: "Services" }));
}

it("keeps a successful provider check after the temporary receipt disappears, for both keys", async () => {
  const services = await openSettings();
  vi.mocked(api.testConnection).mockImplementation(async (provider) => {
    snapshot.services.find((item) => item.id === provider)!.status = "verified";
    return "Connected";
  });
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(services.getAllByRole("button", { name: "Test" })[0]);
  });
  await act(async () => {
    fireEvent.click(services.getAllByRole("button", { name: "Test" })[1]);
  });
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  expect(services.getAllByRole("status").map((row) => row.textContent)).toEqual(
    ["Connected", "Connected"],
  );
  expect(serviceStatusApi.read).toHaveBeenCalledTimes(3);
});

it("refreshes failed checks and preserves short errors until the next action", async () => {
  const services = await openSettings();
  vi.mocked(api.testConnection).mockImplementation(async () => {
    snapshot.services[0].status = "unavailable";
    throw new Error("Connection failed");
  });
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(services.getAllByRole("button", { name: "Test" })[0]);
  });
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  expect(services.getAllByRole("status")[0].textContent).toBe(
    "Connection failed",
  );
  expect(serviceStatusApi.read).toHaveBeenCalledTimes(2);
});

it("does not relabel a verified key as failed when refreshing the dashboard fails", async () => {
  const services = await openSettings(
    vi.fn().mockRejectedValue(new Error("Dashboard unavailable")),
  );
  vi.mocked(api.testConnection).mockImplementation(async () => {
    snapshot.services[0].status = "verified";
    return "Connected";
  });
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(services.getAllByRole("button", { name: "Test" })[0]);
  });
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  expect(services.getAllByRole("status")[0].textContent).toBe("Connected");
  expect(services.queryByText(/Failed|Dashboard unavailable/)).toBeNull();
});

it("polls local status without probing providers and distinguishes expiry from failure", async () => {
  snapshot.services[0].status = "verified";
  const services = await openSettings();
  await waitFor(() =>
    expect(services.getAllByRole("status")[0].textContent).toBe("Connected"),
  );
  snapshot.services[0].status = "expired";
  await act(async () => {
    fireEvent(window, new Event("focus"));
  });
  await waitFor(() => expect(services.getAllByRole("status")[0].textContent).toBe("Check again"));
  expect(api.testConnection).not.toHaveBeenCalled();
  vi.mocked(serviceStatusApi.read).mockRejectedValue(
    new Error("Local status unavailable"),
  );
  await act(async () => {
    fireEvent(window, new Event("focus"));
  });
  await waitFor(() => expect(services.getAllByRole("status")[0].textContent).toBe("Key saved, not checked yet"));
});
