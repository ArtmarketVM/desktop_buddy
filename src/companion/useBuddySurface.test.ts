// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { afterBuddyPaint } from "./useBuddySurface";
vi.mock("../api/tauri", () => ({ desktop: false, api: {} }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("acknowledges only after two animation frames, and a closed generation cannot reappear", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (work: FrameRequestCallback) => {
    frames.push(work);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const paint = vi.fn();
  const cancel = afterBuddyPaint(paint);
  await Promise.resolve();
  expect(paint).not.toHaveBeenCalled();
  frames.shift()!(0);
  expect(paint).not.toHaveBeenCalled();
  cancel();
  frames.shift()!(16);
  expect(paint).not.toHaveBeenCalled();
  afterBuddyPaint(paint);
  await Promise.resolve();
  frames.shift()!(32);
  frames.shift()!(48);
  expect(paint).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

it("prepares an occluded native webview when animation frames are suspended", async () => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const ready = vi.fn();
  const cancel = afterBuddyPaint(ready);
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(149);
  expect(ready).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(ready).toHaveBeenCalledTimes(1);
  cancel();
  const closed = vi.fn();
  const stop = afterBuddyPaint(closed);
  await Promise.resolve();
  stop();
  await vi.advanceTimersByTimeAsync(500);
  expect(closed).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
