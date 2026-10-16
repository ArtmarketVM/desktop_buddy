// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAvatarColorSync } from "./useAvatarColorSync";
import { defaultUserSettings, type Dashboard } from "../types";
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("committed colors update the character and controls without waiting for a dashboard poll", async () => {
  const stop = vi.fn();
  vi.mocked(listen).mockResolvedValue(stop);
  const initial = {
    buddy: {
      avatar: { ...defaultUserSettings.profile.avatar, visible: false },
    },
  } as Dashboard;
  const hook = renderHook(() => {
    const [data, setData] = useState(initial);
    useAvatarColorSync(setData);
    return data;
  });
  await waitFor(() =>
    expect(listen).toHaveBeenCalledWith(
      "buddy://avatar-color",
      expect.any(Function),
    ),
  );
  const receive = vi.mocked(listen).mock.calls[0][1];
  act(() => receive({ payload: "#C9D3D8" } as never));
  expect(hook.result.current.buddy.avatar?.color).toBe("#C9D3D8");
  expect(hook.result.current.buddy.avatar?.visible).toBe(false);
  act(() => receive({ payload: "invalid" } as never));
  expect(hook.result.current.buddy.avatar?.color).toBe("#C9D3D8");
  hook.unmount();
  expect(stop).toHaveBeenCalledOnce();
});
it("a late listener registration is released after unmount", async () => {
  let finish!: (stop: () => void) => void;
  vi.mocked(listen).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const hook = renderHook(() => useAvatarColorSync(vi.fn()));
  hook.unmount();
  const stop = vi.fn();
  await act(async () => finish(stop));
  expect(stop).toHaveBeenCalledOnce();
});
