import { readFileSync, writeFileSync } from "node:fs";
import { generate } from "../src/generation/generate";
import { learnMeter, meterWeight, meterSummary } from "../src/markov/meter";
import { rhythmicDuration } from "../src/markov/train";
import type { Melody } from "../src/music";
const corpus = JSON.parse(
  readFileSync(
    new URL("../public/corpus/pilot-melodies.json", import.meta.url),
    "utf8",
  ),
) as Melody[];
const prior = learnMeter(corpus);
const constraints = {
  length: 32,
  start: null,
  final: 74,
  referenceFinal: 74,
  minPitch: 62,
  maxPitch: 86,
  maxSpan: null,
  maxLeap: 7,
  allowedPitchClasses: [0, 2, 4, 5, 7, 9, 11],
  fixed: {},
  forbiddenIntervals: [],
  cadence: { finalPitch: 74, allowedPenultimateIntervals: [-2, -1, 1, 2] },
  repeat: null,
};
const rows = [];
for (const strength of [0, 1]) {
  const results = Array.from({ length: 40 }, (_, i) =>
    generate(corpus, {
      model: {
        representation: "absolute",
        rhythm: "corpus",
        maxOrder: 1,
        backoffWeight: 0.25,
        metricalStrength: strength,
      },
      constraints,
      ending: { minDuration: 2, barBeats: 4 },
      seed: 12345 + i,
      mode: "constrained",
    }),
  );
  const notes = results.flatMap((r) => r.notes);
  rows.push({
    strength,
    samples: results.length,
    ...meterSummary(notes),
    meanLogMeterPreference:
      notes.reduce(
        (s, n) =>
          s +
          Math.log(
            meterWeight(prior, Math.round(n.onset * 4) % 16, n.duration, 1),
          ),
        0,
      ) / notes.length,
    medianMs: results.map((r) => r.elapsedMs).sort((a, b) => a - b)[20],
    states: results[0].productStates,
    bufferBytes: results[0].bufferBytes,
    firstFinalDurations: results
      .slice(0, 8)
      .map((r) => r.notes.at(-1)!.duration),
  });
}
const source = corpus.flatMap((m) =>
  m.notes.map((n, i) => ({ ...n, duration: rhythmicDuration(m, i) })),
);
const sourceSummary = meterSummary(source);
for (const row of rows)
  Object.assign(row, {
    onsetTotalVariation:
      row.onsetCounts.reduce(
        (sum, n, i) =>
          sum +
          Math.abs(
            n / row.notes - sourceSummary.onsetCounts[i] / sourceSummary.notes,
          ),
        0,
      ) / 2,
  });
const report = {
  node: process.version,
  method:
    "40 seeds 12345..12384 per strength; absolute pitch × duration, order 1, same exact pitch/cadence/ending constraints. Crossing counts include terminal notes; priors trained and evaluated on the same six-piece pilot. Mean log meter preference is log(P(duration|phase)/P(duration)); no claim of held-out stylistic improvement.",
  source: meterSummary(source),
  prior,
  rows,
};
writeFileSync(
  new URL("../meter-benchmark-results.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ source: report.source, rows }, null, 2));
for (const rep of ["intervals", "relative"] as const)
  for (const seed of [12345, 12346]) {
    const r = generate(corpus, {
      model: {
        representation: rep,
        rhythm: "corpus",
        maxOrder: 1,
        backoffWeight: 0.25,
        metricalStrength: 1,
      },
      constraints,
      ending: { minDuration: 2, barBeats: 4 },
      seed,
      mode: "constrained",
    });
    console.log(rep, seed, r.notes.at(-1)!.duration, r.elapsedMs);
  }
