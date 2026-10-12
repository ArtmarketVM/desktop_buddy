import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./AppShell";
import { readSidebarCollapsed, isSidebarShortcut } from "./sidebar";
import { defaultUserSettings } from "../types";
import type { UpdateSnapshot } from "../updates/controller";

const key = {
  key: "\\",
  code: "Backslash",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
};
afterEach(() => vi.unstubAllGlobals());

describe("sidebar controls", () => {
  it("accepts the platform shortcut, including a non-English keyboard layout", () => {
    expect(isSidebarShortcut({ ...key, metaKey: true }, true)).toBe(true);
    expect(isSidebarShortcut({ ...key, ctrlKey: true }, false)).toBe(true);
    expect(isSidebarShortcut({ ...key, key: "ё", metaKey: true }, true)).toBe(
      true,
    );
    expect(isSidebarShortcut({ ...key, metaKey: true }, false)).toBe(false);
    expect(isSidebarShortcut({ ...key, ctrlKey: true }, true)).toBe(false);
    expect(isSidebarShortcut(key, false)).toBe(false);
    for (const modifier of [
      "altKey",
      "shiftKey",
      "repeat",
      "isComposing",
      "metaKey",
    ])
      expect(
        isSidebarShortcut({ ...key, ctrlKey: true, [modifier]: true }, false),
      ).toBe(false);
  });

  it("keeps navigation available if persisted preferences cannot be read", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Storage disabled");
      },
    });
    expect(readSidebarCollapsed()).toBe(false);
  });

  it.each([false, true])(
    "exposes the saved state and accessible control when collapsed=%s",
    (collapsed) => {
      vi.stubGlobal("localStorage", { getItem: () => String(collapsed) });
      const html = renderToStaticMarkup(
        <AppShell
          page="focus"
          onNavigate={() => {}}
          profile={defaultUserSettings.profile}
          version="test"
          update={{ phase: "idle", info: null } as UpdateSnapshot}
          onUpdates={() => {}}
        >
          <h1>Today</h1>
        </AppShell>,
      );
      expect(html).toContain(`aria-expanded="${!collapsed}"`);
      expect(html).toContain(
        `aria-label="${collapsed ? "Expand" : "Collapse"} sidebar"`,
      );
      expect(html).toContain('aria-controls="workspace-navigation"');
      expect(html).toContain('id="workspace-navigation"');
      expect(html).toContain('aria-label="Today"');
      expect(html).toContain('aria-current="page"');
    },
  );
});
