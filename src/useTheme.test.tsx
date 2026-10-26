// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTheme } from "./useTheme";

function systemAppearance(dark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: dark,
    addEventListener: vi.fn((_event: string, listener: () => void) =>
      listeners.add(listener),
    ),
    removeEventListener: vi.fn((_event: string, listener: () => void) =>
      listeners.delete(listener),
    ),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  return {
    media,
    change: (next: boolean) =>
      act(() => {
        media.matches = next;
        listeners.forEach((listener) => listener());
      }),
  };
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

it("uses the computer's appearance on first render, including profiles with an old light cache", () => {
  localStorage.setItem("buddy-theme", "light");
  systemAppearance(true);
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("buddy-follow-system-theme")).toBe("true");
});

it("updates both ways while running and does not turn an automatic change into a manual preference", () => {
  const system = systemAppearance(false);
  const { result, unmount } = renderHook(() =>
    useTheme({ theme: "light", follow_system_theme: true }),
  );
  system.change(true);
  expect(result.current.theme).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("buddy-theme")).toBe("light");
  expect(localStorage.getItem("buddy-follow-system-theme")).toBe("true");
  system.change(false);
  expect(result.current.theme).toBe("light");
  unmount();
  expect(system.media.removeEventListener).toHaveBeenCalledWith(
    "change",
    expect.any(Function),
  );
});

it("respects a manual override and immediately follows the current computer appearance when re-enabled", () => {
  const system = systemAppearance(true);
  const { result, rerender } = renderHook(
    ({ follow }) => useTheme({ theme: "light", follow_system_theme: follow }),
    {
      initialProps: { follow: false },
    },
  );
  expect(result.current.theme).toBe("light");
  system.change(false);
  system.change(true);
  expect(result.current.theme).toBe("light");
  rerender({ follow: true });
  expect(result.current.theme).toBe("dark");
});

it("keeps the sidebar's manual choice until automatic mode is chosen again", () => {
  const system = systemAppearance(false);
  const { result } = renderHook(() => useTheme());
  act(() => result.current.setTheme("dark"));
  expect(localStorage.getItem("buddy-follow-system-theme")).toBe("false");
  system.change(true);
  system.change(false);
  expect(result.current.theme).toBe("dark");
});
