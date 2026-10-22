import { test, expect } from "@playwright/test";

test("clock fields keep their separator during digit-only typing and deletion", async ({
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
    `/visual/index.html?theme=${info.project.name.endsWith("dark") ? "dark" : "light"}`,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const time = page.getByLabel("Daily summary time", { exact: true });
  await expect(time).toHaveValue("18:00");
  await time.click();
  await page.keyboard.type("0930");
  await expect(time).toHaveValue("09:30");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await expect(time).toHaveValue("__:__");
  await page.keyboard.type("2359");
  await expect(time).toHaveValue("23:59");
  // Restore the saved value: this fixture is read-only and performs no mutation.
  await time.press("Escape");
  await expect(time).toHaveValue("18:00");
  await page.keyboard.press("Tab");
  await expect(
    page.getByLabel("Quiet hours start", { exact: true }),
  ).toHaveValue("19:00");
  await expect(page.getByLabel("Quiet hours end", { exact: true })).toHaveValue(
    "09:00",
  );
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByTitle("Deadline and expected time", { exact: true })
    .first()
    .click();
  const panel = page.getByRole("dialog", {
    name: "Deadline for Prepare the autumn release",
    exact: true,
  });
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  const deadline = page.getByLabel("Deadline time", { exact: true });
  await deadline.click();
  await page.keyboard.type("1730");
  await expect(deadline).toHaveValue("17:30");
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __visual: { unexpected: string[] } }).__visual
          .unexpected,
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
