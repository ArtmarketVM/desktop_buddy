import { test, expect } from "@playwright/test";

test("progress segments share a baseline, contrast with the canvas and open goal details", async ({
  page,
}, info) => {
  await page.goto(
    `/visual/index.html?theme=${info.project.name.endsWith("dark") ? "dark" : "light"}`,
  );
  await page.getByRole("button", { name: "My progress", exact: true }).click();
  const title = await page
    .getByRole("heading", { name: "My progress", exact: true })
    .boundingBox();
  const period = await page
    .getByRole("tablist", { name: "Period", exact: true })
    .boundingBox();
  const dates = await page
    .getByRole("group", { name: "Choose period", exact: true })
    .boundingBox();
  expect(Math.abs(period!.x - title!.x)).toBeLessThan(1);
  if (Math.abs(dates!.y - period!.y) < 2)
    expect(dates!.x).toBeGreaterThan(period!.x + period!.width);
  else {
    expect(dates!.y).toBeGreaterThan(period!.y);
    expect(Math.abs(dates!.x - title!.x)).toBeLessThan(1);
  }
  const chart = page.getByLabel("Focused time", { exact: true });
  const segments = chart.getByRole("button");
  await expect(segments).toHaveCount(3);
  const colours = await segments.evaluateAll((items) =>
    items.map((item) => getComputedStyle(item).backgroundColor),
  );
  expect(new Set(colours).size).toBe(3);
  const pixels = await segments.evaluateAll((items) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    return items.map((item) => {
      context.fillStyle = getComputedStyle(item).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    });
  });
  expect(pixels[0]).toEqual([108, 95, 255, 255]);
  for (let index = 1; index < pixels.length; index++) {
    expect(pixels[index][0]).toBeGreaterThan(pixels[index - 1][0]);
    expect(pixels[index][1]).toBeGreaterThan(pixels[index - 1][1]);
    expect(pixels[index][2]).toBe(255);
  }
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
  // Unfinished indicators must not inherit the global empty-state panel padding.
  const indicators = page.locator(".progress-list .done-box");
  await expect(indicators).toHaveCount(2);
  for (const indicator of await indicators.all()) {
    const geometry = await indicator.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        padding: style.padding,
      };
    });
    expect(geometry).toEqual({ width: 14, height: 14, padding: "0px" });
  }
  const unfinished = page.locator(".progress-list .done-box.is-open");
  await expect(unfinished).toHaveCount(1);
  await expect(unfinished).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(unfinished).toHaveCSS("border-top-style", "solid");
  // Fractional borders round to device pixels in Chromium at scale 1.
  expect(
    await unfinished.evaluate((element) =>
      parseFloat(getComputedStyle(element).borderTopWidth),
    ),
  ).toBeGreaterThanOrEqual(1);
  await page.screenshot({
    path: info.outputPath("progress-step-indicators.png"),
  });
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
