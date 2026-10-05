import { test, expect } from "@playwright/test";
// Test the exact deployed static artifact, including module Worker imports.
for (const dataset of ["toy", "text", "melody", "dna", "journeys"])
  test(`${dataset}: exact Worker sampling and optimization`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.getByLabel("Dataset", { exact: true }).selectOption(dataset);
    for (const action of ["Sample exactly", "Find most probable"]) {
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(page.locator("#status")).toHaveText("Completed.");
      await expect(page.locator("#output")).not.toHaveText("Infeasible");
      await expect(page.locator("#diagnostics")).toContainText(
        "Log constrained mass",
      );
    }
    expect(errors).toEqual([]);
  });
test("seed reproducibility, backoff/MAXORDER, custom DFA and errors", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Seed", { exact: true }).fill("42");
  await page
    .getByRole("button", { name: "Sample exactly", exact: true })
    .click();
  await expect(page.locator("#status")).toHaveText("Completed.");
  const first = await page.locator("#output").innerText();
  await page
    .getByRole("button", { name: "Sample exactly", exact: true })
    .click();
  await expect(page.locator("#status")).toHaveText("Completed.");
  await expect(page.locator("#output")).toHaveText(first);
  await page.getByLabel("Backoff mixture weight", { exact: true }).fill("0.25");
  await page
    .getByLabel("MAXORDER · maximum copied substring length", { exact: true })
    .fill("2");
  await page
    .getByRole("button", { name: "Sample exactly", exact: true })
    .click();
  await expect(page.locator("#status")).toHaveText("Completed.");
  await page
    .getByLabel("Custom DFA · JSON table", { exact: true })
    .fill("{invalid");
  await page
    .getByRole("button", { name: "Sample exactly", exact: true })
    .click();
  await expect(page.locator("#status")).not.toHaveText("Completed.");
  await expect(
    page.getByRole("button", { name: "Sample exactly", exact: true }),
  ).toBeEnabled();
});

test("metered melody, playback, MIDI and browser benchmark", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.locator("#dataset").selectOption("melody");
  await page.locator("#meter").check();
  await page.locator("#sample").click();
  await expect(page.locator("#status")).toHaveText("Completed.");
  const sequence = (await page.locator("#output").innerText())
    .trim()
    .split(" ");
  expect(
    sequence.reduce(
      (n, s) => n + (s === "PAD" ? 0 : Number(s.split(":")[1])),
      0,
    ),
  ).toBe(16);
  expect(sequence.at(-1)).toBe("PAD");
  await page.locator("#play").click();
  await expect(page.locator("#audioStatus")).toHaveText("Playing.");
  await page.locator("#stop").click();
  await expect(page.locator("#audioStatus")).toHaveText("Stopped.");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#midi").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("markov-melody.mid");
  await page.locator("#benchmark").click();
  await expect(page.locator("#status")).toHaveText("Completed.");
  const rows = JSON.parse(await page.locator("#samplingBenchmark").innerText());
  expect(rows.map((r) => r.cap)).toEqual([0, 256, 100000]);
  expect(rows[1].cachedEdges).toBeLessThanOrEqual(256);
  expect(rows[2].cachedEdges).toBeGreaterThan(256);
  await testInfo.attach("browser-performance", {
    body: JSON.stringify(
      {
        browser: testInfo.project.name,
        sampling: rows,
        diagnostics: await page.locator("#diagnostics").innerText(),
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await expect(page.locator("#marginalChart")).toContainText("100.00%");
});
test("full Alice characters and words with copying limits", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.locator("#dataset").selectOption("text");
  await page.locator("#fullText").check();
  await page.locator("#sample").click();
  await expect(page.locator("#status")).toHaveText("Completed.", {
    timeout: 60000,
  });
  await expect(page.locator("#diagnostics")).toContainText("Training tokens");
  await page.locator("#wordMode").check();
  await page.locator("#sample").click();
  await expect(page.locator("#status")).toHaveText("Completed.", {
    timeout: 60000,
  });
  await expect(page.locator("#output")).toContainText("Alice");
});
