import { test, expect } from "@playwright/test";

test("saved activity review remains usable across workspace sizes", async ({
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
  await page
    .getByRole("button", { name: "12m pending review", exact: true })
    .click();
  const review = page.getByRole("region", {
    name: "Activity review",
    exact: true,
  });
  await expect(
    review.getByText("Possible new goal: Organize a community event", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Assign to goal", exact: true }),
  ).toBeDisabled();
  await expect(
    review.getByRole("button", { name: "Add goal to Today", exact: true }),
  ).toBeEnabled();
  await expect(
    review.getByText(
      "Daily summary pending. Review context remains saved until the summary succeeds.",
      { exact: true },
    ),
  ).toBeVisible();
  await review.screenshot({ path: info.outputPath("activity-review.png") });
  await page.getByRole("button", { name: "My progress", exact: true }).click();
  await page.getByText("Daily summary · 2026-10-19", { exact: false }).click();
  await expect(
    page.getByText("Unresolved activity", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Release notes reviewed (confirmed)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const state = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    unexpected: (window as unknown as { __visual: { unexpected: string[] } })
      .__visual.unexpected,
  }));
  expect(state.overflow).toBe(false);
  expect(state.unexpected).toEqual([]);
  expect(errors).toEqual([]);
});
