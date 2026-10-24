import { expect, test } from "@playwright/test";

test("AI settings display the resolved screenshot models without saving an override", async ({
  page,
}, info) => {
  await page.goto(
    `/visual/index.html?theme=${info.project.name.endsWith("dark") ? "dark" : "light"}`,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "AI", exact: true })
    .click();
  const services = page.getByRole("region", { name: "Services", exact: true });
  await expect(
    services.getByRole("textbox", { name: "Vision model", exact: true }),
  ).toHaveValue("moonshotai/Kimi-K3");
  await expect(
    services.getByText(/Image descriptions: nvidia\/Nemotron-3.5-Super-VL/),
  ).toBeVisible();
  const bounds = await services.evaluate((card) => {
    const field = card.querySelector<HTMLInputElement>(
      "input[aria-label='Vision model']",
    )!;
    const rect = field.getBoundingClientRect();
    const area = card.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      cardLeft: area.left,
      cardRight: area.right,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.cardLeft);
  expect(bounds.right).toBeLessThanOrEqual(
    Math.min(bounds.cardRight, page.viewportSize()!.width),
  );
  expect(bounds.width).toBeGreaterThan(180);
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __visual: { calls: string[] } }).__visual.calls,
  );
  expect(calls).not.toContain("set_core_preferences");
  await page.screenshot({ path: info.outputPath("vision-model.png") });
});
