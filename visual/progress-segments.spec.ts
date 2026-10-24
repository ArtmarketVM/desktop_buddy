import { test, expect } from "@playwright/test";

test("progress segments share a baseline, contrast with the canvas and open goal details", async ({
  page,
}, info) => {
  await page.goto(
    `/visual/index.html?theme=${info.project.name.endsWith("dark") ? "dark" : "light"}`,
  );
  await page.getByRole("button", { name: "My progress", exact: true }).click();
  const chart = page.getByLabel("Focused time", { exact: true });
  const segments = chart.getByRole("button");
  await expect(segments).toHaveCount(3);
  const colours = await segments.evaluateAll((items) =>
    items.map((item) => getComputedStyle(item).backgroundColor),
  );
  expect(new Set(colours).size).toBe(3);
  const contrast = await segments.evaluateAll((items) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--canvas)";
    items[0].parentElement!.append(probe);
    const canvas = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return items.map(
      (item) => getComputedStyle(item).backgroundColor !== canvas,
    );
  });
  expect(contrast.every(Boolean)).toBe(true);
  for (const segment of await segments.all()) {
    await segment.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator("strong")).toHaveCount(1);
  }
  await segments.first().focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", {
      name: "Prepare the autumn release",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Review the final changes", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await page.getByRole("tab", { name: "Day", exact: true }).click();
  await expect(segments).toHaveCount(2);
  const geometry = await chart
    .locator(".stack-bar:not(:empty)")
    .evaluateAll((items) =>
      items.map((item) => ({
        bottom: item.getBoundingClientRect().bottom,
        height: item.getBoundingClientRect().height,
      })),
    );
  expect(Math.abs(geometry[0].bottom - geometry[1].bottom)).toBeLessThan(1);
  expect(geometry.every((item) => item.height <= 110.1)).toBe(true);
  expect(
    await segments.evaluateAll((items) =>
      items.map((item) => getComputedStyle(item).backgroundColor),
    ),
  ).toEqual(colours.slice(0, 2));
  await page.screenshot({ path: info.outputPath("progress-segments.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
