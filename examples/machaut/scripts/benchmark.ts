import { readFileSync, writeFileSync } from "node:fs";
import { generate } from "../src/generation/generate";
import type { Melody, Representation } from "../src/music";
const corpus = JSON.parse(
  readFileSync(
    new URL("../public/corpus/pilot-melodies.json", import.meta.url),
    "utf8",
  ),
) as Melody[];
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
const rows = (["absolute", "intervals", "relative"] as Representation[]).map(
  (representation) => {
    const results = Array.from({ length: 3 }, () =>
      generate(corpus, {
        model: { representation, maxOrder: 5, backoffWeight: 0.25 },
        constraints,
        seed: 12345,
        mode: "constrained",
      }),
    );
    if (
      results.some(
        (r) => JSON.stringify(r.notes) !== JSON.stringify(results[0].notes),
      )
    )
      throw new Error("Benchmark determinism failed");
    return {
      representation,
      elapsedMs: results.map((r) => r.elapsedMs),
      medianMs: results.map((r) => r.elapsedMs).sort((a, b) => a - b)[1],
      productStates: results[0].productStates,
      productEdges: results[0].productEdges,
      bufferBytes: results[0].bufferBytes,
      logPartitionFunction: results[0].logPartitionFunction,
      diagnostics: results[0].diagnostics,
      notes: results[0].notes,
    };
  },
);
const report = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  repetitions: 3,
  method:
    "Three builds/inferences in one process per representation; median elapsed training+generation+explanation+diagnostic time. Buffers exclude source, acceptor Maps and object metadata. Not a hardware-independent performance guarantee.",
  constraints,
  rows,
};
writeFileSync("benchmark-results.json", JSON.stringify(report, null, 2) + "\n");
console.log(
  rows
    .map(
      (r) =>
        `${r.representation}: ${r.medianMs.toFixed(1)} ms; ${r.productStates} states; ${(r.bufferBytes / 1048576).toFixed(2)} MiB buffers`,
    )
    .join("\n"),
);
