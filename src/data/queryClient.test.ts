import { afterEach, expect, it, vi } from "vitest";
import { DATA_ERROR, QueryClient } from "./queryClient";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => vi.useRealTimers());
it("deduplicates overlapping consumers and explicit refreshes", async () => {
  const client = new QueryClient();
  const pending = deferred<number>();
  const load = vi.fn(() => pending.promise);
  const a = client.query("a", ["dashboard"], 0, load);
  const b = client.query("a", ["dashboard"], 0, load);
  expect(a).toBe(b);
  const first = a.refresh();
  const second = b.refresh();
  await Promise.resolve();
  expect(load).toHaveBeenCalledOnce();
  pending.resolve(7);
  expect(await first).toBe(7);
  expect(await second).toBe(7);
});
it("discards an in-flight response invalidated by a committed mutation, then coalesces invalidations", async () => {
  const client = new QueryClient();
  const old = deferred<number>();
  const latest = deferred<number>();
  const load = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(latest.promise);
  const query = client.query("a", ["workspace"], 0, load);
  const promise = query.refresh();
  await Promise.resolve();
  client.invalidate(["workspace"]);
  client.invalidate(["workspace"]);
  old.resolve(1);
  await Promise.resolve();
  await Promise.resolve();
  expect(query.getSnapshot().data).toBe(0);
  latest.resolve(2);
  expect(await promise).toBe(2);
  expect(load).toHaveBeenCalledTimes(2);
  expect(query.getSnapshot().data).toBe(2);
});
it("keeps distinct date/period/goal entries and invalidates every affected key only", async () => {
  const client = new QueryClient();
  const a = client.query(
    'snapshot:["2026-10-20","day"]',
    ["workspace"],
    0,
    async () => 1,
  );
  const b = client.query(
    'snapshot:["2026-10-20","week"]',
    ["workspace"],
    0,
    async () => 2,
  );
  const history = client.query("history:[7]", ["chats"], 0, async () => 3);
  await Promise.all([a.refresh(), b.refresh(), history.refresh()]);
  client.invalidate(["workspace"], true);
  expect(a.getSnapshot().ready).toBe(false);
  expect(b.getSnapshot().ready).toBe(false);
  expect(history.getSnapshot().data).toBe(3);
});
it("keeps the last successful value on failure, sanitizes the UI and recovers", async () => {
  const client = new QueryClient();
  const load = vi
    .fn()
    .mockResolvedValueOnce(1)
    .mockRejectedValueOnce("provider detail: api_key=secret")
    .mockResolvedValueOnce(2);
  const query = client.query("a", ["dashboard"], 0, load);
  await query.refresh();
  await expect(query.refresh()).rejects.toBeTruthy();
  expect(query.getSnapshot()).toMatchObject({
    data: 1,
    error: DATA_ERROR,
    loading: false,
    ready: true,
  });
  expect(client.getDiagnostics()[0].detail).toContain("provider detail:");
  expect(JSON.stringify(client.getDiagnostics())).not.toContain("=secret");
  await query.refresh();
  expect(query.getSnapshot()).toMatchObject({ data: 2, error: "" });
});
it("owns one bridge through Strict Mode resubscriptions, cleans up and stops polling after unmount", async () => {
  vi.useFakeTimers();
  const disconnect = vi.fn();
  const connect = vi.fn(() => disconnect);
  const client = new QueryClient(connect);
  const load = vi.fn().mockResolvedValue(1);
  const query = client.query("a", ["dashboard"], 0, load, 1000);
  const a = query.subscribe(() => {});
  a();
  const b = query.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(20);
  expect(connect).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledOnce();
  b();
  await vi.advanceTimersByTimeAsync(0);
  expect(disconnect).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(load).toHaveBeenCalledOnce();
});
it("shares fallback polling and skips hidden reads until visibility invalidation", async () => {
  vi.useFakeTimers();
  let visible = true;
  const client = new QueryClient(undefined, () => visible);
  const load = vi.fn().mockResolvedValue(1);
  const query = client.query("a", ["dashboard"], 0, load, 1000);
  const a = query.subscribe(() => {});
  const b = query.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(20);
  expect(load).toHaveBeenCalledOnce();
  visible = false;
  await vi.advanceTimersByTimeAsync(2000);
  expect(load).toHaveBeenCalledOnce();
  visible = true;
  client.invalidate();
  await vi.advanceTimersByTimeAsync(20);
  expect(load).toHaveBeenCalledTimes(2);
  a();
  b();
  await vi.advanceTimersByTimeAsync(0);
});
it("does not notify unmounted consumers when an uncancellable IPC completes", async () => {
  vi.useFakeTimers();
  const client = new QueryClient();
  const pending = deferred<number>();
  const query = client.query("a", ["dashboard"], 0, () => pending.promise);
  const notify = vi.fn();
  const stop = query.subscribe(notify);
  await vi.advanceTimersByTimeAsync(20);
  stop();
  notify.mockClear();
  pending.resolve(2);
  await vi.advanceTimersByTimeAsync(0);
  expect(notify).not.toHaveBeenCalled();
});
it("a local appearance patch cannot be overwritten by an older dashboard read", async () => {
  const client = new QueryClient();
  const old = deferred<number>();
  const query = client.query("a", ["dashboard"], 0, () => old.promise);
  const pending = query.refresh();
  await Promise.resolve();
  query.setData(5);
  old.resolve(1);
  expect(await pending).toBe(5);
  expect(query.getSnapshot().data).toBe(5);
});

it("discards a failed old read after an authoritative local patch", async () => {
  const client = new QueryClient();
  const old = deferred<number>();
  const query = client.query("a", ["dashboard"], 0, () => old.promise);
  const pending = query.refresh();
  await Promise.resolve();
  query.setData(5);
  old.reject("old failure");
  expect(await pending).toBe(5);
  expect(query.getSnapshot().error).toBe("");
  expect(client.getDiagnostics()).toEqual([]);
});
