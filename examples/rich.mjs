import { readFileSync, writeFileSync } from "node:fs";
import {
  ContextGraph,
  runBP,
  seededRng,
  mostProbableSequence,
} from "../dist/core/src/index.js";
import {
  allOf,
  prefixAcceptor,
  suffixAcceptor,
  suffixesAcceptor,
  requiredSubstringAcceptor,
  forbiddenSubstringAcceptor,
  maxOrderAcceptor,
  cumulativeMeterAcceptor,
  paddedDurationAcceptor,
  precedenceAcceptor,
  visitLimitAcceptor,
} from "../dist/constraints/src/index.js";
import { datasets, melodyEvents } from "./datasets.mjs";
import {
  tokenizeWords,
  formatWords,
  longestCopiedRun,
  parseEvent,
} from "./domain-utils.mjs";
import { melodyMidi } from "./midi.mjs";
const raw = readFileSync(
  new URL("../benchmarks/corpora/alice.txt", import.meta.url),
  "utf8",
);
const text = raw.split(/\*\*\* START OF[^\n]*\n/)[1].split(/\*\*\* END OF/)[0];
for (const mode of ["characters", "words"]) {
  const tokens = mode === "words" ? tokenizeWords(text) : [...text],
    order = mode === "words" ? 1 : 2,
    length = mode === "words" ? 8 : 64,
    copyLimit = mode === "words" ? 3 : 4;
  const g = ContextGraph.fromSequences([tokens], { maxOrder: order });
  const a = allOf(
    prefixAcceptor(mode === "words" ? ["Alice"] : ["A"]),
    suffixAcceptor(["."]),
    maxOrderAcceptor([tokens], copyLimit, { maxTransitions: 10000000 }),
  );
  const bp = runBP(g, a, {
    length,
    maxProductEdges: 20000000,
    maxDfaTransitions: 10000000,
  });
  if (!bp.feasible) throw new Error(`Text ${mode} infeasible`);
  const xs = bp.sample(seededRng(11));
  console.log(`Full Alice (${mode})`, {
    output: mode === "words" ? formatWords(xs) : xs.join(""),
    longestCopiedRun: longestCopiedRun(xs, [tokens]),
    copyLimit,
    logProbability: bp.logConditionalProbability(xs),
  });
}
const duration = (s) => parseEvent(s).duration;
const meter = allOf(
  paddedDurationAcceptor(16, { length: 12, padSymbol: "PAD", duration }),
  cumulativeMeterAcceptor(12, duration, {
    maxCost: 16,
    acceptCosts: new Set([16]),
    endSymbol: "PAD",
    predicate: (total, s) => s === "PAD" || (total % 4) + duration(s) <= 4,
  }),
);
const melody = ContextGraph.fromBackoffSequences(melodyEvents, {
  maxOrder: 1,
  backoffWeight: 0.25,
});
const bp = runBP(
  melody,
  allOf(prefixAcceptor(["60:1"]), suffixAcceptor(["PAD"]), meter),
  { length: 12 },
);
const song = bp.sample(seededRng(9));
writeFileSync(
  new URL("./melody-example.mid", import.meta.url),
  melodyMidi(song),
);
console.log("Metered melody", {
  sequence: song,
  duration: song.reduce((n, s) => n + duration(s), 0),
  midi: "examples/melody-example.mid",
});
const dna = ContextGraph.fromBackoffSequences(datasets.dna.sequences, {
  maxOrder: 1,
});
const dnaConstraint = allOf(
  prefixAcceptor([..."ATG"]),
  suffixesAcceptor(["TAA", "TAG", "TGA"].map((s) => [...s])),
  requiredSubstringAcceptor([..."CG"]),
  forbiddenSubstringAcceptor([[..."GAATTC"]]),
);
console.log(
  "DNA",
  runBP(dna, dnaConstraint, { length: 24 }).sample(seededRng(7)).join(""),
);
const journeys = ContextGraph.fromBackoffSequences(
  datasets.journeys.sequences,
  { maxOrder: 1 },
);
const rules = allOf(
  prefixAcceptor(["Home"]),
  suffixAcceptor(["Purchase"]),
  precedenceAcceptor("Cart", "Checkout"),
  visitLimitAcceptor("Search", 2),
  visitLimitAcceptor("Purchase", 1),
);
console.log(
  "Journey",
  runBP(journeys, rules, { length: 8 }).sample(seededRng(3)),
);
