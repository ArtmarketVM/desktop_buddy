import { test, expect, type Page } from "@playwright/test";
import { NOW } from "./fixtures";

async function open(page: Page, theme: string, extra = "") {
  // Pause JS timers as well as Date: the avatar gallery advances SVG frames
  // from setInterval, which reduced motion and CSS overrides alone cannot stop.
  await page.clock.install({ time: new Date(Date.parse(NOW) - 1000) });
  await page.clock.pauseAt(new Date(NOW));
  const external: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:1437")
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto(`/visual/index.html?theme=${theme}${extra}`);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((globalThis as unknown as { isTauri: boolean }).isTauri),
      ),
    )
    .toBe(true);
  await expect(page.locator("#root")).not.toBeEmpty();
  // Shared queries batch reads on a 20 ms timer. Drain initial subscriptions
  // without advancing the 500 ms avatar animation or long fallback intervals.
  await page.clock.runFor(100);
  return async () => {
    await page.evaluate(async () => {
      await document.fonts.load('400 14px "Instrument Sans"');
      await document.fonts.load('500 14px "Instrument Sans"');
      await document.fonts.load('400 8px "Silkscreen"');
      await document.fonts.ready;
    });
    await page.addStyleTag({
      content:
        "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }",
    });
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText(/available in the desktop app/i)).toHaveCount(
      0,
    );
    const state = await page.evaluate(
      () =>
        (
          window as unknown as {
            __visual: { calls: string[]; unexpected: string[] };
          }
        ).__visual,
    );
    expect(state.calls).toContain("get_dashboard");
    expect(state.unexpected).toEqual([]);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  };
}

const screens = [
  { name: "today", page: "Today" },
  { name: "progress", page: "My progress" },
  { name: "goals", page: "All goals" },
  { name: "chats", page: "Chats" },
  { name: "settings-general", page: "Settings", tab: "General" },
  { name: "settings-ai", page: "Settings", tab: "AI" },
  { name: "settings-privacy", page: "Settings", tab: "Privacy" },
];

for (const screen of screens) {
  test(screen.name, async ({ page }, info) => {
    const ready = await open(
      page,
      info.project.name.endsWith("dark") ? "dark" : "light",
    );
    await expect(
      page.getByRole("button", { name: "Collapse sidebar", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: screen.page, exact: true }).click();
    await page.clock.runFor(100);
    if (screen.tab)
      await page
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("button", { name: screen.tab, exact: true })
        .click();
    await page.clock.runFor(100);
    if (["today", "goals"].includes(screen.name))
      await expect(
        page
          .getByRole("button", {
            name: "More actions for Prepare the autumn release",
            exact: true,
          })
          .first(),
      ).toBeVisible();
    if (screen.name === "chats")
      await expect(
        page.getByText("A calm start to the day", { exact: true }).first(),
      ).toBeVisible();
    await ready();
    await expect(page).toHaveScreenshot(`${screen.name}.png`);
  });
}

test("buddy", async ({ page }, info) => {
  const ready = await open(
    page,
    info.project.name.endsWith("dark") ? "dark" : "light",
    "&buddy",
  );
  await expect(page.locator(".desktop-buddy.chatting")).toBeVisible();
  await expect(
    page.getByText("Help me choose a small next step.", { exact: true }),
  ).toBeVisible();
  await ready();
  await expect(page).toHaveScreenshot("buddy.png");
});

test("collapsed-sidebar", async ({ page }, info) => {
  test.skip(
    !info.project.name.startsWith("wide"),
    "The sidebar variant adds only two captures.",
  );
  const ready = await open(
    page,
    info.project.name.endsWith("dark") ? "dark" : "light",
    "&collapsed",
  );
  await expect(
    page.getByRole("button", { name: "Expand sidebar", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", {
        name: "More actions for Prepare the autumn release",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await ready();
  await expect(page).toHaveScreenshot("collapsed-sidebar.png");
});
