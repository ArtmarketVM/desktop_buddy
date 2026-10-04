import { describe, it, expect, vi } from "vitest";
import {
  UpdateController,
  type UpdateInfo,
  type UpdateProgress,
} from "./controller";

const available: UpdateInfo = {
  status: "available",
  current_version: "0.10.0",
  version: "0.11.0",
  notes: null,
};
describe("signed update workflow", () => {
  it("checks and installs only once at startup, keeping editing blocked for restart", async () => {
    const check = vi.fn(async () => available);
    const install = vi.fn(async (_version: string) => {});
    const controller = new UpdateController({ check, install });
    await Promise.all([controller.start(), controller.start()]);
    expect(check).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0][0]).toBe("0.11.0");
    expect(controller.snapshot.startup).toBe("updating");
    expect(controller.snapshot.phase).toBe("installing");
  });
  it("opens installed work when the startup check or download fails", async () => {
    for (const checkFails of [true, false]) {
      const install = vi.fn(async () => {
        throw new Error("signature or network failure");
      });
      const controller = new UpdateController({
        check: async () => {
          if (checkFails) throw new Error("offline");
          return available;
        },
        install,
      });
      await controller.start();
      expect(controller.snapshot.startup).toBe("ready");
      expect(controller.snapshot.phase).toBe("idle");
      expect(controller.snapshot.error).not.toBe("");
      expect(install).toHaveBeenCalledTimes(checkFails ? 0 : 1);
    }
  });
  it("opens an up-to-date installation and only notifies about later releases", async () => {
    const check = vi.fn(async (): Promise<UpdateInfo> => ({
      ...available,
      status: "current",
      version: null,
    }));
    const install = vi.fn();
    const controller = new UpdateController({ check, install });
    await controller.start();
    expect(controller.snapshot.startup).toBe("ready");
    check.mockResolvedValueOnce(available);
    await controller.check();
    expect(controller.snapshot.info?.status).toBe("available");
    expect(install).not.toHaveBeenCalled();
  });
  it("never installs before a successful check or when no release exists", async () => {
    const install = vi.fn();
    const controller = new UpdateController({
      check: async () => ({
        ...available,
        status: "unpublished",
        version: null,
      }),
      install,
    });
    await controller.install();
    await controller.check();
    await controller.install();
    expect(install).not.toHaveBeenCalled();
  });
  it("serializes checks and clears a stale update after a network failure", async () => {
    let resolveCheck!: (info: UpdateInfo) => void;
    const check = vi.fn(
      () =>
        new Promise<UpdateInfo>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const controller = new UpdateController({ check, install: vi.fn() });
    const first = controller.check();
    await controller.check();
    expect(check).toHaveBeenCalledTimes(1);
    resolveCheck(available);
    await first;
    expect(controller.snapshot.info?.status).toBe("available");
    check.mockRejectedValueOnce(new Error("offline"));
    await controller.check();
    expect(controller.snapshot.info).toBeNull();
    expect(controller.snapshot.error).toContain("offline");
    expect(controller.snapshot.phase).toBe("idle");
  });
  it("pins the checked version, handles unknown download sizes, and allows a failed install to retry", async () => {
    let progress!: (value: UpdateProgress) => void;
    let reject!: (error: Error) => void;
    const install = vi.fn((_version: string, notify: typeof progress) => {
      progress = notify;
      return new Promise<void>((_resolve, fail) => {
        reject = fail;
      });
    });
    const controller = new UpdateController({
      check: async () => available,
      install,
    });
    await controller.check();
    const installing = controller.install();
    await controller.check();
    await controller.install();
    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0][0]).toBe("0.11.0");
    progress({ phase: "downloading", downloaded: 50, total: null });
    expect(controller.snapshot.progress).toBeNull();
    progress({ phase: "downloading", downloaded: 50, total: 100 });
    expect(controller.snapshot.progress).toBe(50);
    reject(new Error("invalid signature"));
    await installing;
    expect(controller.snapshot.phase).toBe("idle");
    expect(controller.snapshot.info).toEqual(available);
    const retry = controller.install();
    expect(install).toHaveBeenCalledTimes(2);
    reject(new Error("offline"));
    await retry;
  });
});
