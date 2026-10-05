import { test, expect } from "@playwright/test";

test("Machaut sample playback loads, cancels and reuses instrument", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    window.sampleStarts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.sampleStarts++;
      return start.apply(this, args);
    };
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await page.locator("#generate").click();
  await expect(page.locator("#play")).toBeEnabled({ timeout: 20000 });
  await page.locator("#play").click();
  await expect(page.locator("#audio-status")).toHaveText("", { timeout: 60000 });
  await page.locator("#stop").click();
  const stoppedStarts = await page.evaluate(() => window.sampleStarts);
  // Queued samples must not start even while the muted context keeps running.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.sampleStarts)).toBe(stoppedStarts);
  await page.locator("#play").click();
  await expect(page.locator("#audio-status")).toHaveText("");
  await page.locator("#instrument").selectOption("orchestral_harp");
  await page.locator("#play").click();
  await page.locator("#stop").click();
  await expect(page.locator("#play")).toBeEnabled();
  await expect(page.locator("#audio-status")).toHaveText("");
  expect(errors).toEqual([]);
});
