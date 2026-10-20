import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./visual",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  // Keep the small matrix within the memory available on hosted Windows runners.
  workers: process.env.CI ? 2 : undefined,
  outputDir: "test-results/visual",
  snapshotPathTemplate: "{testDir}/baselines/{projectName}/{arg}{ext}",
  updateSnapshots: "none",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixels: 0,
    },
  },
  use: {
    baseURL: "http://127.0.0.1:1437",
    browserName: "chromium",
    locale: "en-GB",
    timezoneId: "UTC",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "wide-light",
      use: { viewport: { width: 1280, height: 873 }, colorScheme: "light" },
    },
    {
      name: "wide-dark",
      use: { viewport: { width: 1280, height: 873 }, colorScheme: "dark" },
    },
    {
      name: "narrow-light",
      use: { viewport: { width: 720, height: 873 }, colorScheme: "light" },
    },
    {
      name: "narrow-dark",
      use: { viewport: { width: 720, height: 873 }, colorScheme: "dark" },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 1437",
    url: "http://127.0.0.1:1437/visual/index.html",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
