import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: () => true,
}));
import { invoke } from "@tauri-apps/api/core";
import { api, safeUrl } from "./tauri";
describe("provider settings commands", () => {
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
