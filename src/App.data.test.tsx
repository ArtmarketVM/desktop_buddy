// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { api } from "./api/tauri";
vi.mock("./api/tauri", () => ({ desktop: false, api: { dashboard: vi.fn() } }));
vi.mock("./updates/useUpdates", () => ({
  useUpdates: () => ({ controller: {}, snapshot: { startup: "ready" } }),
}));
vi.mock("./components/AppShell", () => ({
  pages: [{ id: "focus", label: "Today" }],
  AppShell: ({
    quietMode,
    onQuietMode,
  }: {
    quietMode: boolean;
    onQuietMode: () => void;
  }) => (
    <button aria-pressed={quietMode} onClick={onQuietMode}>
      Quiet mode
    </button>
  ),
}));
vi.mock("./core/Experience", () => ({ Experience: () => null }));
vi.mock("./core/Settings", () => ({ CoreSettings: () => null }));
afterEach(cleanup);
it("keeps browser preview controls reactive without observing desktop resources", () => {
  window.history.replaceState({}, "", "/?preview=workspace");
  render(<App />);
  const quiet = screen.getByRole("button", { name: "Quiet mode" });
  expect(quiet.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(quiet);
  expect(quiet.getAttribute("aria-pressed")).toBe("true");
  expect(api.dashboard).not.toHaveBeenCalled();
});
