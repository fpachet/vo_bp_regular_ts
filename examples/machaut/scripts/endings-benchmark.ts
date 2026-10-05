import { readFileSync, writeFileSync } from "node:fs";
import { runBP, seededRng } from "markov-constraints";
import { train } from "../src/markov/train";
import { learnMeter } from "../src/markov/meter";
import {
  learnPhraseDurations,
  withPhraseEnding,
  phraseWeight,
} from "../src/markov/phrases";
import { musicalAcceptor } from "../src/constraints/musical";
import { meteredAcceptor } from "../src/generation/ending";
import type { Melody } from "../src/music";
const all = JSON.parse(
  readFileSync(
    new URL("../public/corpus/melodies.json", import.meta.url),
    "utf8",
  ),
) as Melody[];
const corpus = all.filter((m) =>
  ["rondeau", "virelai"].includes(m.metadata.genre ?? ""),
);
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
const t = train(corpus, {
    representation: "absolute",
    rhythm: "corpus",
    maxOrder: 3,
    backoffWeight: 0.25,
  }),
  meter = learnMeter(corpus),
  prior = learnPhraseDurations(corpus);
const rows = [];
for (const strength of [0, 1]) {
  const began = performance.now();
  const body = meteredAcceptor(
    musicalAcceptor("absolute", constraints, (s) => t.decode(s).pitch),
    t.decode,
    { minDuration: 0.25, barBeats: 4 },
    false,
    meter,
    1,
  );
  const w = withPhraseEnding(t.graph, body, t.decode, prior, strength, []);
  const bp = runBP(w.graph, w.dfa, {
    length: 33,
    maxProductStates: 150000,
    maxTimeIndexedStates: 750000,
    maxProductEdges: 40000000,
    maxDfaTransitions: 3000000,
    maxCachedSamplingEdges: 200000,
  });
  const compileMs = performance.now() - began,
    samples = bp.sampleMany(1000, seededRng(12345));
  const histogram: Record<string, number> = {};
  let mean = 0,
    preference = 0;
  for (const path of samples) {
    const d = t.decode(path.at(-2)!).duration;
    histogram[d] = (histogram[d] ?? 0) + 1;
    mean += d;
    preference += Math.log(phraseWeight(prior, d, "terminal", 1));
  }
  const row = {
    strength,
    samples: samples.length,
    finalDurationHistogram: histogram,
    meanFinalDuration: mean / samples.length,
    meanLogEndingPreference: preference / samples.length,
    compileMs,
    productStates: bp.productStateCount,
    timeIndexedEdges: bp.productEdgeCount,
    bufferBytes: bp.memoryDiagnostics().totalBufferBytes,
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}
const report = {
  method:
    "1000 exact conditioned samples per strength from one compiled BP each; identical seeded stream, absolute pitch × duration, order 3, meter strength 1, minimum 0.25 beat, exact 4/4 ending, fixed pitch and cadence. Training-data comparison, not held-out stylistic validation.",
  corpus: {
    allPieces: all.length,
    allNotes: all.reduce((s, m) => s + m.notes.length, 0),
    defaultPieces: corpus.length,
    defaultNotes: corpus.reduce((s, m) => s + m.notes.length, 0),
    originalPilotPieces: 6,
    originalPilotNotes: 427,
  },
  prior,
  rows,
};
writeFileSync(
  new URL("../endings-benchmark-results.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
