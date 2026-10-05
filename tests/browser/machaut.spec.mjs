import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
async function visit(page, ...args) {
  await page.goto(...args);
  await page.locator("#status").waitFor();
  await page.locator("details").evaluateAll(items => items.forEach(item => { if (!item.parentElement.closest("details")) item.open = true; }));
}
async function ready(page, fixedSeed = true) {
  await page.locator("#lock-seed").evaluate(field => { field.closest("details").open = true; });
  await page.locator("#lock-seed").setChecked(fixedSeed);
  await page.locator("#generate").click();
  await expect(page.locator("#status")).toContainText("Ready ·", {
    timeout: 20000,
  });
  await expect(page.locator("#score svg")).toBeVisible();
}
async function jsonDownload(page) {
  const download = page.waitForEvent("download");
  await page.locator("#download-json").click();
  const path = await (await download).path();
  return JSON.parse(await readFile(path, "utf8"));
}
test("Machaut: published npm engine, reproducibility, notation, explanations and all exports", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/machaut/corpus/melodies.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await visit(page, "/machaut/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#generate")).toBeDisabled();
  await expect(page.locator("#rhythm")).toBeDisabled();
  await expect(page.locator("#stats")).toContainText("1697");
  await expect(page.locator("#rhythm")).toBeEnabled();
  await ready(page);
  const first = await jsonDownload(page);
  expect(first.library).toEqual({
    name: "markov-constraints",
    version: "0.4.0-rc.1",
  });
  expect(first.notes).toHaveLength(32);
  expect(first.notes.at(-1).midi).toBe(74);
  expect(first.model.representation).toBe("absolute");
  expect(first.model.maxOrder).toBe(2);
  await expect(page.locator("#representation option:checked")).toHaveText(
    "Pitch × duration",
  );
  expect(first.model.rhythm).toBe("corpus");
  expect(first.model.metricalStrength).toBe(0.25);
  expect(first.model.phraseEndStrength).toBe(1);
  expect(first.phraseEndingPrior.terminal.observations).toBe(16);
  expect(first.metricalPrior.phases).toHaveLength(16);
  expect(
    first.explanations[0].continuations.every((c) => c.metricalWeight > 0),
  ).toBe(true);
  expect(first.violations).toEqual([]);
  expect(first.notes).toEqual(first.sampledNotes);
  expect(first.notes.at(-1).duration).toBeGreaterThanOrEqual(0.25);
  expect((first.notes.at(-1).onset + first.notes.at(-1).duration) % 4).toBe(0);
  await page.locator("#score .vf-stavenote").nth(5).click();
  await expect(page.locator("#explanation")).toContainText("Conditioned");
  await ready(page);
  const second = await jsonDownload(page);
  expect(second.notes).toEqual(first.notes);
  for (const [id, signature] of [
    ["download-midi", "MThd"],
    ["download-xml", "<?xml"],
  ]) {
    const promise = page.waitForEvent("download");
    await page.locator("#" + id).click();
    const bytes = await readFile(await (await promise).path());
    expect(bytes.toString("utf8", 0, signature.length)).toBe(signature);
  }
  await page.locator("#play").click();
  await page.locator("#stop").click();
  expect(errors).toEqual([]);
});
test("Machaut: representations, phrase conditions, ordinary comparison, infeasibility and cancellation", async ({
  page,
}) => {
  await visit(page, "/machaut/");
  await expect(page.locator("#status")).toContainText("ready");
  await page.locator("#rhythm").selectOption("quarter");
  await page
    .getByText("Phrase, pitch-set & cadence controls", { exact: true })
    .click();
  await page.locator("#phrase-example").click();
  for (const representation of ["absolute", "relative", "intervals"]) {
    await page.locator("#representation").selectOption(representation);
    await ready(page);
    const r = await jsonDownload(page);
    expect(r.notes[7].midi).toBe(69);
    expect(r.notes[15].midi).toBe(74);
    expect(r.violations).toEqual([]);
  }
  await page.locator("#representation").selectOption("absolute");
  await page.locator("#final").selectOption("37");
  await page.locator("#generate").click();
  await expect(page.locator("#status")).toContainText("No melody");
  await page.locator("#mode").selectOption("ordinary");
  await ready(page);
  expect((await jsonDownload(page)).violations).toContain("final");
  await page.locator("#mode").selectOption("constrained");
  await page.locator("#final").selectOption("74");
  await page.locator("#order").fill("10");
  await page.locator("#length").fill("128");
  await page.locator("#repeat").check();
  await page.locator("#generate").click();
  await page.locator("#cancel").click();
  await expect(page.locator("#status")).toHaveText("Generation cancelled.");
  await expect(page.locator("#generate")).toBeEnabled();
});
test("Machaut: exact opening repeat works in the browser", async ({ page }) => {
  await visit(page, "/machaut/");
  await expect(page.locator("#status")).toContainText("ready");
  await page.locator("#repertoire").selectOption("pilot");
  await page.locator("#representation").selectOption("intervals");
  await page.locator("#order").fill("1");
  await page.locator("#length").fill("8");
  await page.locator("#cadence").uncheck();
  await page.locator("#repeat").check();
  await ready(page);
  const r = await jsonDownload(page);
  expect(r.notes.slice(0, 3).map((n) => n.midi)).toEqual(
    r.notes.slice(-3).map((n) => n.midi),
  );
  expect(r.violations).toEqual([]);
});
test("Machaut corpus page: local voices, score preview, MIDI/MusicXML imports and reusable snapshot", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await visit(page, "/machaut/corpus/");
  await expect(page.locator("#corpus-table tbody tr")).toHaveCount(23);
  await page
    .getByRole("button", { name: "Dous viaire gracieus", exact: true })
    .click();
  await expect(page.locator("#score svg")).toBeVisible({ timeout: 20000 });
  for (const file of ["midi/machrond5.MID", "musicxml/machrond1.musicxml"]) {
    await page
      .locator("#import-file")
      .setInputFiles(resolve("examples/machaut/public/corpus", file));
    await expect(page.locator("#import-add")).toBeEnabled();
    await page.locator("#import-add").click();
    await expect(page.locator("#status")).toContainText("Added");
  }
  await expect(page.locator("#corpus-table tbody tr")).toHaveCount(25);
  const promise = page.waitForEvent("download");
  await page.locator("#snapshot").click();
  const path = await (await promise).path();
  const snapshot = JSON.parse(await readFile(path, "utf8"));
  expect(snapshot.melodies).toHaveLength(25);
  await page.getByRole("link", { name: "Generate", exact: true }).click();
  await expect(page.locator("#status")).toContainText("ready");
  await page.getByText("Model settings", { exact: true }).click();
  await page.locator("#snapshot-file").setInputFiles(path);
  await expect(page.locator("#status")).toHaveText("Imported corpus snapshot.");
  await page.locator("#repertoire").selectOption("all");
  await page.locator("#order").fill("1");
  await ready(page);
  expect((await jsonDownload(page)).corpus).toHaveLength(25);
  expect(errors).toEqual([]);
});

test("Machaut: learned durations, tied score explanations, playback and export", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await visit(page, "/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await page.locator("#repertoire").selectOption("pilot");
  await page.locator("#rhythm").selectOption("corpus");
  await page.locator("#order").fill("1");
  for (const representation of ["intervals", "absolute", "relative"]) {
    await page.locator("#representation").selectOption(representation);
    await ready(page);
    const r = await jsonDownload(page);
    expect(r.model.rhythm).toBe("corpus");
    expect(r.endingSemantics).toContain("conditioning");
    expect(r.endingAdjustment).toBeNull();
    expect(r.notes.at(-1).duration).toBeGreaterThanOrEqual(0.25);
    expect((r.notes.at(-1).onset + r.notes.at(-1).duration) % 4).toBe(0);
    expect(r.notes).toEqual(r.sampledNotes);
    expect(r.violations).toEqual([]);
    expect(new Set(r.notes.map((n) => n.duration)).size).toBeGreaterThan(1);
    await expect(page.locator("#score-subtitle")).toContainText(
      "learned rhythm",
    );
    const glyph = page
      .locator('#score [aria-label^="Explain score note 6 "]')
      .first();
    await expect(glyph).toBeVisible();
    await glyph.click();
    await expect(page.locator("#explanation")).toContainText("Note 6:");
    await expect(page.locator("#explanation")).toContainText("Spacing / rest");
    const download = page.waitForEvent("download");
    await page.locator("#download-xml").click();
    const xml = await readFile(await (await download).path(), "utf8");
    expect(xml).toContain("<duration>");
    expect(xml.includes("<rest/>")).toBe(r.rests.length > 0);
    for (const rest of r.rests) {
      expect(r.notes[rest.afterNote - 1].onset + r.notes[rest.afterNote - 1].duration).toBe(rest.onset);
      expect(rest.onset + rest.duration).toBe(r.notes[rest.afterNote].onset);
    }
    const finalGlyph = page
      .locator('#score [aria-label^="Explain score note 32 "]')
      .last();
    await finalGlyph.click();
    await expect(page.locator("#explanation")).toContainText(`Note 32:`);
    await page.locator("#play").click();
    await page.locator("#stop").click();
  }
  expect(errors).toEqual([]);
});

test("Machaut: quarter-note mode disables incompatible long-ending condition", async ({
  page,
}) => {
  await visit(page, "/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await page.locator("#rhythm").selectOption("quarter");
  await expect(page.locator("#hold-ending")).toBeDisabled();
  await ready(page);
  const r = await jsonDownload(page);
  expect(r.endingAdjustment).toBeNull();
  expect(r.notes).toEqual(r.sampledNotes);
  expect(r.notes.every((n) => n.duration === 1)).toBe(true);
});

test("Machaut: generated ending duration stays sampled and reproducible", async ({
  page,
}) => {
  await visit(page, "/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await page.locator("#repertoire").selectOption("pilot");
  await page.locator("#order").fill("1");
  await ready(page);
  const first = await jsonDownload(page);
  await ready(page);
  const second = await jsonDownload(page);
  expect(second.notes).toEqual(first.notes);
  expect(first.notes).toEqual(first.sampledNotes);
  expect((first.notes.at(-1).onset + first.notes.at(-1).duration) % 4).toBe(0);
});

test("Machaut: learned meter can be disabled and remains reproducible", async ({
  page,
}) => {
  await visit(page, "/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await page.locator("#metrical-strength").fill("0");
  await page.locator("#phrase-strength").fill("0");
  await ready(page);
  const first = await jsonDownload(page);
  expect(first.metricalPrior).toBeNull();
  expect(first.logMetricalWeight).toBe(0);
  await ready(page);
  expect((await jsonDownload(page)).notes).toEqual(first.notes);
  await page.locator("#rhythm").selectOption("quarter");
  await expect(page.locator("#metrical-strength")).toBeDisabled();
  await expect(page.locator("#representation option:checked")).toHaveText(
    "Absolute pitch",
  );
  await page.locator("#rhythm").selectOption("corpus");
  await expect(page.locator("#representation option:checked")).toHaveText(
    "Pitch × duration",
  );
  await expect(page.locator("#order")).toHaveValue("2");
});

test("Machaut: Generate changes the seed by default; fixed seed replays the melody", async ({
  page,
}) => {
  await visit(page, "/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await expect(page.locator("#lock-seed")).not.toBeChecked();
  const initial = await page.locator("#seed").inputValue();
  await ready(page, false);
  const first = await jsonDownload(page);
  expect(String(first.seed)).not.toBe(initial);
  await expect(page.locator("#seed")).toHaveValue(String(first.seed));
  await ready(page, false);
  const second = await jsonDownload(page);
  expect(second.seed).not.toBe(first.seed);
  await page.locator("#seed").fill(String(first.seed));
  await ready(page);
  const replay = await jsonDownload(page);
  expect(replay.seed).toBe(first.seed);
  expect(replay.notes).toEqual(first.notes);
});

test("Machaut: internal phrase durations and repertoire groups are recorded", async ({
  page,
}) => {
  await visit(page, "/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await page.locator("#repertoire").selectOption("pilot");
  await page.locator("#order").fill("1");
  await page.locator("#length").fill("8");
  await page.locator("#phrase-ends").fill("4");
  await ready(page);
  const r = await jsonDownload(page);
  expect(r.phraseEndPositions).toEqual([4]);
  expect(r.phraseEndingPrior.terminal.observations).toBe(6);
  expect(
    r.explanations[3].continuations.some((c) => c.phraseEndingWeight !== 1),
  ).toBe(true);
  expect(r.notes).toEqual(r.sampledNotes);
  await page.locator("#repertoire").selectOption("ballade");
  await expect(page.locator("#stats")).toContainText("719");
  await page.locator("#repertoire").selectOption("motet");
  await expect(page.locator("#stats")).toContainText("285");
});

test("Machaut: persistent worker reuses model and invalidates model changes", async ({ page }) => {
  await visit(page, "/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await ready(page);
  expect((await jsonDownload(page)).timings.modelReused).toBe(false);
  await ready(page);
  expect((await jsonDownload(page)).timings.modelReused).toBe(true);
  await page.locator("#order").fill("1");
  await ready(page);
  expect((await jsonDownload(page)).timings.modelReused).toBe(false);
});

test("Machaut: reused notation redraws on resize and retains note interaction", async ({ page }) => {
  await visit(page, "/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await ready(page);
  await expect(page.locator("#notation-time")).toContainText("Notation");
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator('#score [aria-label^="Explain score note 1 "]')).toBeVisible();
  await page.waitForTimeout(250);
  await page.locator('#score [aria-label^="Explain score note 1 "]').first().click();
  await expect(page.locator("#explanation")).toContainText("Note 1:");
  await ready(page);
  await expect(page.locator('#score [aria-label^="Explain score note 2 "]')).toBeVisible();
  await page.locator('#score [aria-label^="Explain score note 2 "]').first().press("Enter");
  await expect(page.locator("#explanation")).toContainText("Note 2:");
});

 test("Machaut: simple first view keeps model settings collapsed", async ({ page }) => {
  await page.goto("/machaut/");
  await expect(page.locator("#generate")).toBeEnabled();
  await expect(page.locator("#order")).toBeHidden();
  await expect(page.locator("#length")).toBeVisible();
  await page.getByText("Model settings", { exact: true }).click();
  await expect(page.locator("#order")).toBeVisible();
});
