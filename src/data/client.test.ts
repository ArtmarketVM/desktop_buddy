// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { queryClient } from "./client";
import type { EventCallback } from "@tauri-apps/api/event";
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
let callbacks: Map<string, EventCallback<unknown>>;
let unlisten: ReturnType<typeof vi.fn<() => void>>;
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  queryClient.invalidate(undefined, true);
  callbacks = new Map();
  unlisten = vi.fn();
  vi.mocked(listen).mockImplementation(async (name, callback) => {
    callbacks.set(name, callback as EventCallback<unknown>);
    return unlisten;
  });
});
afterEach(async () => {
  cleanup?.();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("shares one bridge, routes resource events, and refreshes after missed events on focus", async () => {
  const load = vi.fn().mockResolvedValue(1);
  const query = queryClient.query("bridge-test", ["workspace"], 0, load);
  const a = query.subscribe(() => {});
  const b = query.subscribe(() => {});
  cleanup = () => {
    a();
    b();
  };
  await vi.advanceTimersByTimeAsync(20);
  expect(load).toHaveBeenCalledOnce();
  expect(
    vi
      .mocked(listen)
      .mock.calls.filter(([name]) => name === "buddy://data-changed"),
  ).toHaveLength(1);
  callbacks.get("buddy://data-changed")!({
    payload: { resources: ["services"] },
  } as never);
  await vi.advanceTimersByTimeAsync(20);
  expect(load).toHaveBeenCalledOnce();
  callbacks.get("buddy://event")!({ payload: { type: "activity" } } as never);
  await vi.advanceTimersByTimeAsync(20);
  expect(load).toHaveBeenCalledOnce();
  callbacks.get("buddy://data-changed")!({
    payload: { resources: ["workspace"] },
  } as never);
  callbacks.get("buddy://goal-analysis")!({ payload: 1 } as never);
  await vi.advanceTimersByTimeAsync(20);
  expect(load).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(20);
  expect(load).toHaveBeenCalledTimes(3);
  cleanup();
  cleanup = undefined;
  await vi.advanceTimersByTimeAsync(0);
  expect(unlisten).toHaveBeenCalledTimes(callbacks.size);
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(load).toHaveBeenCalledTimes(3);
});
it("disposes late listener registrations and ignores their callbacks after unmount", async () => {
  const resolutions: Array<() => void> = [];
  vi.mocked(listen).mockImplementation((name, callback) => {
    callbacks.set(name, callback as EventCallback<unknown>);
    return new Promise((resolve) => resolutions.push(() => resolve(unlisten)));
  });
  const load = vi.fn().mockResolvedValue(1);
  const query = queryClient.query("late-registration", ["dashboard"], 0, load);
  const stop = query.subscribe(() => {});
  stop();
  await vi.advanceTimersByTimeAsync(0);
  resolutions.forEach((resolve) => resolve());
  await vi.advanceTimersByTimeAsync(20);
  expect(unlisten).toHaveBeenCalledTimes(resolutions.length);
  callbacks.get("buddy://data-changed")!({
    payload: { resources: ["dashboard"] },
  } as never);
  await vi.advanceTimersByTimeAsync(20);
  expect(load).not.toHaveBeenCalled();
});
it("reset events discard cached personal data before the next IPC can complete", async () => {
  const query = queryClient.query(
    "reset-chat",
    ["chats"],
    [] as string[],
    async () => ["old message"],
  );
  await query.refresh();
  cleanup = query.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(20);
  callbacks.get("buddy://data-changed")!({
    payload: { resources: ["chats"], reset: true },
  } as never);
  expect(query.getSnapshot().data).toEqual([]);
  expect(query.getSnapshot().ready).toBe(false);
});
