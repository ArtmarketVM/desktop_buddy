import { test, expect } from "@playwright/test";
async function update(
  page: import("@playwright/test").Page,
  notice: boolean,
  long = false,
  chat = false,
) {
  await page.evaluate(
    ([notice, long, chat]) =>
      (
        window as unknown as {
          __setSurfaceState: (n: boolean, l: boolean, c: boolean) => void;
        }
      ).__setSurfaceState(notice, long, chat),
    [notice, long, chat],
  );
}
test("the fixed mascot canvas and SVG survive chat, notices and closing", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 160, height: 152 });
  await page.goto(
    `/visual/surfaces.html?buddy=mascot&theme=${info.project.name.endsWith("dark") ? "dark" : "light"}`,
  );
  const avatar = page.locator(".desktop-character .avatar");
  await expect(avatar).toBeVisible();
  await page.evaluate(() => {
    Object.assign(window, {
      __originalAvatar: document.querySelector(".desktop-character .avatar"),
    });
  });
  const before = await avatar.boundingBox();
  for (const [notice, chat] of [
    [false, true],
    [true, false],
    [false, false],
  ]) {
    await update(page, notice, false, chat);
    await expect
      .poll(() =>
        page.evaluate(() =>
          document
            .querySelector(".desktop-buddy")
            ?.classList.contains("chatting"),
        ),
      )
      .toBe(chat);
    expect(await avatar.boundingBox()).toEqual(before);
    expect(
      await page.evaluate(
        () =>
          document.querySelector(".desktop-character .avatar") ===
          (window as unknown as { __originalAvatar: Element }).__originalAvatar,
      ),
    ).toBe(true);
    await expect(
      page.locator(".companion-chat, .companion-bubble"),
    ).toHaveCount(0);
  }
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
});
test("reminders fit without scrolling and long details move to chat", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 328, height: 240 });
  await page.goto(
    `/visual/surfaces.html?buddy=panel&notification&theme=${info.project.name.endsWith("dark") ? "dark" : "light"}`,
  );
  const card = page.locator(".companion-prompt");
  await expect(card).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  ).toBe(true);
  await update(page, true, true);
  await expect(
    page.getByRole("button", { name: "Details in chat" }),
  ).toBeVisible();
  expect(
    await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  ).toBe(true);
  const bounds = await card.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(240);
  await expect(
    page.locator(".desktop-character, .buddy-action-bar"),
  ).toHaveCount(0);
  await update(page, false, false, true);
  await page.setViewportSize({ width: 320, height: 260 });
  await expect(page.locator(".conversation-composer")).toBeVisible();
  const composer = await page.locator(".conversation-composer").boundingBox();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(260);
});
