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
