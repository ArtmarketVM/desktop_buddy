// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarAiServices } from "./SidebarAiServices";
import { serviceStatusApi, type ServiceSnapshot } from "../ai/serviceStatus";
import { api } from "../api/tauri";
vi.mock("../api/tauri", () => ({
  desktop: true,
  api: { testConnection: vi.fn() },
}));
vi.mock("../ai/serviceStatus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai/serviceStatus")>()),
  serviceStatusApi: { read: vi.fn() },
}));
const fixture: ServiceSnapshot = {
  configured_model: "nvidia/nemotron-3-super-120b-a12b",
  configured_response_model: "Qwen/Qwen3.5-397B-A17B",
  services: ["nebius", "nvidia", "tavily"].map((id) => ({
    id: id as "nebius" | "nvidia" | "tavily",
    status: "not_checked",
    checked_at: null,
  })),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(serviceStatusApi.read).mockResolvedValue(fixture);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("mounting reads local metadata without calling providers or claiming health from a key", async () => {
  render(<SidebarAiServices />);
  await screen.findByRole("button", { name: "NVIDIA Nemotron: Not checked" });
  expect(api.testConnection).not.toHaveBeenCalled();
  expect(document.querySelectorAll(".service-verified")).toHaveLength(0);
});
it("hover details explain the cloud model and preserve configured-model provenance", async () => {
  const user = userEvent.setup();
  render(<SidebarAiServices />);
  await user.hover(
    await screen.findByRole("button", { name: "NVIDIA Nemotron: Not checked" }),
  );
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip.textContent).toContain(
    "Runs through Nebius, not on this computer",
  );
  expect(tooltip.textContent).toContain(
    "Configured model: nvidia/nemotron-3-super-120b-a12b",
  );
  expect(tooltip.textContent).toContain(
    "Configured response model: Qwen/Qwen3.5-397B-A17B",
  );
  expect(tooltip.textContent).toContain("generation is checked separately");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
});
it("only an explicit check invokes both authentication probes and refreshes status", async () => {
  const user = userEvent.setup();
  render(<SidebarAiServices />);
  await screen.findByRole("button", { name: "NVIDIA Nemotron: Not checked" });
  vi.mocked(serviceStatusApi.read).mockResolvedValue({
    ...fixture,
    services: fixture.services.map((s) => ({
      ...s,
      status: "verified",
      checked_at: new Date().toISOString(),
    })),
  });
  await user.click(
    screen.getByRole("button", { name: "Check AI connections" }),
  );
  await screen.findByRole("button", { name: "NVIDIA Nemotron: Model listed" });
  expect(api.testConnection).toHaveBeenCalledTimes(2);
  expect(api.testConnection).toHaveBeenCalledWith("nebius");
  expect(api.testConnection).toHaveBeenCalledWith("tavily");
  expect(screen.getByRole("status").textContent).toContain("refreshed");
});
it("a failed probe still refreshes status and never treats failure as success", async () => {
  const user = userEvent.setup();
  render(<SidebarAiServices />);
  await screen.findByRole("button", { name: "NVIDIA Nemotron: Not checked" });
  vi.mocked(api.testConnection).mockRejectedValue(
    new Error("Private provider response"),
  );
  vi.mocked(serviceStatusApi.read).mockResolvedValue({
    ...fixture,
    services: fixture.services.map((s) => ({ ...s, status: "unavailable" })),
  });
  await user.click(
    screen.getByRole("button", { name: "Check AI connections" }),
  );
  await screen.findByRole("button", {
    name: "Nebius: Could not verify access",
  });
  expect(document.body.textContent).not.toContain("Private provider response");
  expect(document.querySelectorAll(".service-verified")).toHaveLength(0);
});
it("offline immediately overrides a previously verified connection", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.mocked(serviceStatusApi.read).mockResolvedValue({
    ...fixture,
    services: fixture.services.map((s) => ({ ...s, status: "verified" })),
  });
  render(<SidebarAiServices />);
  await screen.findByRole("button", { name: "Nebius: Connected" });
  online.mockReturnValue(false);
  fireEvent(window, new Event("offline"));
  await screen.findByRole("button", { name: "Nebius: Offline" });
  expect(
    (
      screen.getByRole("button", {
        name: "Check AI connections",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("status read failure clears green rather than retaining a successful connection", async () => {
  vi.mocked(serviceStatusApi.read).mockResolvedValue({
    ...fixture,
    services: fixture.services.map((s) => ({ ...s, status: "verified" })),
  });
  render(<SidebarAiServices />);
  await screen.findByRole("button", { name: "Nebius: Connected" });
  vi.mocked(serviceStatusApi.read).mockRejectedValue(new Error("Unavailable"));
  fireEvent(window, new Event("focus"));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Nebius: Not checked" }),
    ).toBeTruthy(),
  );
});
it("onboarding performs no diagnostics or provider requests", () => {
  render(<SidebarAiServices enabled={false} />);
  expect(serviceStatusApi.read).not.toHaveBeenCalled();
  expect(api.testConnection).not.toHaveBeenCalled();
});
