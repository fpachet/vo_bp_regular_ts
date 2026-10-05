import { test, expect } from "@playwright/test";

test("Machaut sample playback loads, cancels and reuses instrument", async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await page.locator("#generate").click();
  await expect(page.locator("#play")).toBeEnabled({ timeout: 20000 });
  await page.locator("#play").click();
  await expect(page.locator("#audio-status")).toHaveText("", { timeout: 60000 });
  await page.locator("#stop").click();
  await page.locator("#play").click();
  await expect(page.locator("#audio-status")).toHaveText("");
  await page.locator("#instrument").selectOption("orchestral_harp");
  await page.locator("#play").click();
  await page.locator("#stop").click();
  await expect(page.locator("#play")).toBeEnabled();
  await expect(page.locator("#audio-status")).toHaveText("");
  expect(errors).toEqual([]);
});
