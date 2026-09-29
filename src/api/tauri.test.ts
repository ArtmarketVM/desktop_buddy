import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: () => true,
}));
import { invoke } from "@tauri-apps/api/core";
import { api, safeUrl } from "./tauri";
describe("provider settings commands", () => {
  it("snoozes and resumes without changing tracking or DND", async () => {
    await api.snooze(true);
    expect(invoke).toHaveBeenLastCalledWith("snooze_buddy", { enabled: true });
    await api.snooze(false);
    expect(invoke).toHaveBeenLastCalledWith("snooze_buddy", { enabled: false });
  });
  it.each([true, false, null])(
    "sends recommendation feedback %s",
    async (helpful) => {
      await api.rateRecommendation(42, helpful);
      expect(invoke).toHaveBeenLastCalledWith("rate_recommendation", {
        id: 42,
        helpful,
      });
    },
  );
  it("saves an explicit provider key through the native boundary", async () => {
    await api.providerKey("nebius", "test-key");
    expect(invoke).toHaveBeenLastCalledWith("set_provider_key", {
      provider: "nebius",
      key: "test-key",
    });
  });
  it("removes a saved key without sending an empty replacement", async () => {
    await api.providerKey("tavily", null);
    expect(invoke).toHaveBeenLastCalledWith("set_provider_key", {
      provider: "tavily",
      key: null,
    });
  });
});
describe("search result URLs", () => {
  it("allows web links", () =>
    expect(safeUrl("https://example.com")).toBe("https://example.com/"));
  it.each(["javascript:alert(1)", "file:///secret", "invalid"])(
    "rejects unsafe URL %s",
    (value) => expect(safeUrl(value)).toBeUndefined(),
  );
});
