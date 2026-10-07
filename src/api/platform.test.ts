import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("uses Mac app rules and shortcuts for the macOS webview", async () => {
  vi.stubGlobal("navigator", {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
  });
  vi.resetModules();
  const platform = await import("./platform");
  const profile = await import("../data/profile");
  expect(platform.isMac).toBe(true);
  expect(platform.credentialStore).toBe("macOS Keychain");
  expect(platform.selectionShortcut).toBe("Command + Option + B");
  expect(
    profile.roleApplications("designer").find((app) => app.name === "Figma")
      ?.process,
  ).toBe("figma");
  expect(
    profile
      .roleApplications("software_engineer")
      .find((app) => app.name === "Visual Studio Code")?.process,
  ).toBe("code");
  expect(profile.applications.some((app) => app.process === "safari")).toBe(
    true,
  );
});

it("preserves Windows rules and shortcuts for the Windows webview", async () => {
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  });
  vi.resetModules();
  const platform = await import("./platform");
  const profile = await import("../data/profile");
  expect(platform.isMac).toBe(false);
  expect(platform.credentialStore).toBe("Windows Credential Manager");
  expect(platform.selectionShortcut).toBe("Ctrl + Alt + B");
  expect(
    profile.roleApplications("designer").find((app) => app.name === "Figma")
      ?.process,
  ).toBe("figma.exe");
});
