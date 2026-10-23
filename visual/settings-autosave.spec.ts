import { test, expect } from "@playwright/test";

test("settings persist controls and clock edits without Save preferences", async ({
  page,
}, info) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:1437")
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto(
    `/visual/surfaces.html?settings-audit&theme=${info.project.name.endsWith("dark") ? "dark" : "light"}`,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save preferences", exact: true }),
  ).toHaveCount(0);
  const stretch = page.getByRole("checkbox", {
    name: "Remind me to stretch",
    exact: true,
  });
  await expect(stretch).toBeEnabled();
  await stretch.setChecked(true);
  await page
    .getByRole("combobox", { name: "Stretch interval", exact: true })
    .selectOption("15");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const time = page.getByLabel("Daily summary time", { exact: true });
  await time.click();
  await time.press("ControlOrMeta+A");
  await page.keyboard.type("0930");
  await time.press("Tab");
  await expect(time).toHaveValue("09:30");
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "Profile", exact: true })
    .click();
  const name = page.getByLabel("Preferred name", { exact: true });
  await name.fill("Autosave audit");
  await name.press("Tab");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Stretch interval", exact: true }),
  ).toHaveValue("15");
  await expect(
    page.getByLabel("Daily summary time", { exact: true }),
  ).toHaveValue("09:30");
  const state = await page.evaluate(
    () =>
      (
        window as unknown as {
          __visual: {
            mutations: Array<{
              command: string;
              args: {
                name?: string;
                avatar?: unknown;
                preferences?: {
                  movement_interval_minutes?: number;
                  summary_minute?: number;
                };
              };
            }>;
            unexpected: string[];
          };
        }
      ).__visual,
  );
  expect(state.unexpected).toEqual([]);
  expect(external).toEqual([]);
  expect(
    state.mutations.some(
      (m) =>
        m.command === "set_core_preferences" &&
        m.args.preferences?.movement_interval_minutes === 15,
    ),
  ).toBe(true);
  expect(
    state.mutations.some(
      (m) =>
        m.command === "set_companion_preferences" &&
        m.args.preferences?.summary_minute === 570,
    ),
  ).toBe(true);
  expect(
    state.mutations.some(
      (m) =>
        m.command === "save_core_identity" &&
        m.args.name === "Autosave audit" &&
        m.args.avatar === null,
    ),
  ).toBe(true);
});
