import { test, expect, type Locator, type Page } from "@playwright/test";
async function fits(page: Page, panel: Locator) {
  await expect(panel).toBeVisible();
  await expect
    .poll(async () => {
      const b = await panel.boundingBox(),
        size = page.viewportSize()!;
      return (
        !!b &&
        b.x >= 11 &&
        b.y >= 11 &&
        b.x + b.width <= size.width - 11 &&
        b.y + b.height <= size.height - 11
      );
    })
    .toBe(true);
  const done = panel.getByRole("button", { name: "Done", exact: true });
  await expect(done).toBeVisible();
  const b = (await done.boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height - 11);
}
test("the last Due Today goal keeps its calendar, fields and Done reachable and saves changes", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name.startsWith("narrow") ? 720 : 1280,
    height: 600,
  });
  await page.clock.install({ time: new Date("2026-10-22T10:00:00Z") });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:1437"
      ? route.continue()
      : route.abort(),
  );
  await page.goto(
    `/visual/surfaces.html?many-goals&theme=${info.project.name.endsWith("dark") ? "dark" : "light"}`,
  );
  const row = page
    .getByRole("textbox", { name: "Goal title: Calendar goal 40", exact: true })
    .locator("xpath=ancestor::article");
  await row.evaluate((el) => el.scrollIntoView({ block: "end" }));
  const trigger = row.getByTitle("Deadline and expected time", { exact: true });
  await trigger.click();
  const panel = page.getByRole("dialog", {
    name: "Deadline for Calendar goal 40",
    exact: true,
  });
  await fits(page, panel);
  const anchor = (await trigger.boundingBox())!,
    popup = (await panel.boundingBox())!;
  expect(popup.y).toBeLessThan(anchor.y);
  await page.setViewportSize({
    width: page.viewportSize()!.width,
    height: 420,
  });
  await fits(page, panel);
  await panel.getByRole("button", { name: "Next month", exact: true }).click();
  await panel
    .getByRole("button", { name: "Sun Nov 15 2026", exact: true })
    .click();
  const time = panel.getByLabel("Deadline time", { exact: true });
  await time.click();
  await page.keyboard.type("0930");
  await page.keyboard.press("Enter");
  await expect(time).toHaveValue("09:30");
  const estimate = panel.getByLabel("Estimated minutes", { exact: true });
  await estimate.fill("45");
  await estimate.press("Tab");
  await fits(page, panel);
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(panel).toHaveCount(0);
  const result = await page.evaluate(
    () =>
      (
        window as unknown as {
          __visual: {
            mutations: Array<{
              command: string;
              args: { details?: { due_at: string }; minutes?: number };
            }>;
            unexpected: string[];
          };
        }
      ).__visual,
  );
  expect(result.unexpected).toEqual([]);
  expect(
    result.mutations.some(
      (m) =>
        m.command === "save_core_goal" &&
        m.args.details?.due_at === "2026-11-15T09:30:00.000Z",
    ),
  ).toBe(true);
  expect(
    result.mutations.some(
      (m) => m.command === "set_core_goal_estimate" && m.args.minutes === 45,
    ),
  ).toBe(true);
  // Reopening reads the saved clock and estimate from the synthetic backend.
  await trigger.click();
  await expect(panel.getByLabel("Deadline time", { exact: true })).toHaveValue(
    "09:30",
  );
  await expect(
    panel.getByLabel("Estimated minutes", { exact: true }),
  ).toHaveValue("45");
  await panel.getByLabel("Deadline time", { exact: true }).press("Escape");
  await expect(panel).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __visual: { unexpected: string[] } }).__visual
          .unexpected,
    ),
  ).toEqual([]);
});
