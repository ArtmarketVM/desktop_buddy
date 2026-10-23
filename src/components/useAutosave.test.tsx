// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAutosave } from "./useAutosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("writes toggles immediately and serializes newer edits behind an in-flight save", async () => {
  let finish!: () => void;
  const persist = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useAutosave({ enabled: false, interval: 45 }, persist, async () => {}),
  );
  act(() => result.current.update({ enabled: true, interval: 45 }));
  expect(persist).toHaveBeenCalledTimes(1);
  act(() => result.current.update({ enabled: true, interval: 15 }));
  expect(persist).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
  });
  expect(persist).toHaveBeenLastCalledWith({ enabled: true, interval: 15 });
  expect(result.current.status).toBe("saved");
});
it("debounces text but flushes the latest value when settings unmount", async () => {
  const persist = vi.fn().mockResolvedValue(undefined);
  const { result, unmount } = renderHook(() =>
    useAutosave<string>("A", persist, async () => {}),
  );
  act(() => result.current.update("AB", 350));
  act(() => result.current.update("ABC", 350));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(349);
  });
  expect(persist).not.toHaveBeenCalled();
  unmount();
  expect(persist).toHaveBeenCalledExactlyOnceWith("ABC");
});
it("an error retains the desired value and permits retry without a Save button", async () => {
  const persist = vi
    .fn()
    .mockRejectedValueOnce(new Error("Disk unavailable"))
    .mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useAutosave<boolean>(false, persist, async () => {}),
  );
  await act(async () => result.current.update(true));
  expect(result.current.value).toBe(true);
  expect(result.current.error).toBe("Disk unavailable");
  expect(result.current.status).toBe("error");
  await act(async () => result.current.flush());
  expect(result.current.status).toBe("saved");
  expect(persist).toHaveBeenCalledTimes(2);
});
it("returning a text draft to its saved value cancels the write and pending status", async () => {
  const persist = vi.fn();
  const { result } = renderHook(() =>
    useAutosave<string>("A", persist, async () => {}),
  );
  act(() => result.current.update("B", 350));
  act(() => result.current.update("A", 350));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(persist).not.toHaveBeenCalled();
  expect(result.current.pending).toBe(false);
});
it("a stale shared refresh cannot overwrite the local value while saving", async () => {
  let finish!: () => void;
  const persist = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ initial }) => useAutosave(initial, persist, async () => {}),
    { initialProps: { initial: { enabled: false } } },
  );
  act(() => result.current.update({ enabled: true }));
  rerender({ initial: { enabled: false } });
  expect(result.current.value.enabled).toBe(true);
  await act(async () => finish());
  rerender({ initial: { enabled: true } });
  expect(result.current.value.enabled).toBe(true);
});
it("invalid text is visible and does not persist until corrected", async () => {
  const persist = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useAutosave<string>(
      "Name",
      persist,
      async () => {},
      (next) => (next.trim() ? null : "Enter a name"),
    ),
  );
  await act(async () => result.current.update(""));
  expect(persist).not.toHaveBeenCalled();
  expect(result.current.error).toBe("Enter a name");
  await act(async () => result.current.update("New name"));
  expect(persist).toHaveBeenCalledExactlyOnceWith("New name");
  expect(result.current.pending).toBe(false);
});
