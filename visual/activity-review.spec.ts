import { test, expect } from "@playwright/test";

test("Today and Progress omit review controls even with saved review data", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:1437"
      ? route.continue()
      : route.abort(),
  );
  await page.goto(
    `/visual/index.html?review&theme=${info.project.name.endsWith("dark") ? "dark" : "light"}`,
  );
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/pending review/i)).toHaveCount(0);
  await page.getByRole("button", { name: "My progress", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Progress", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".core-workspace:not(.core-settings)")
      .getByText(/pending review|daily summary|work journal/i),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Day", exact: true }).click();
  await expect(
    page
      .locator(".core-workspace:not(.core-settings)")
      .getByText(/pending review|daily summary|work journal/i),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const state = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    unexpected: (window as unknown as { __visual: { unexpected: string[] } })
      .__visual.unexpected,
    reviewRequests: (
      window as unknown as { __visual: { calls: string[] } }
    ).__visual.calls.filter((call) =>
      ["get_activity_review", "get_work_journal"].includes(call),
    ),
  }));
  expect(state.overflow).toBe(false);
  expect(state.unexpected).toEqual([]);
  expect(state.reviewRequests).toEqual([]);
  expect(errors).toEqual([]);
});
