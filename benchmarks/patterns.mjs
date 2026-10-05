import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { forbiddenSubstringAcceptor } from "../dist/constraints/src/index.js";
import { legacyForbidden } from "./legacy-pattern.mjs";
const text = readFileSync("benchmarks/corpora/alice.txt", "utf8");
const unique = new Map();
for (let i = 0; i + 5 <= text.length; i++) {
  const p = [...text.slice(i, i + 5)];
  unique.set(JSON.stringify(p), p);
}
const alphabet = [...new Set([...text])];
let state = 739;
const stream = Array.from({ length: 2000 }, () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return alphabet[state % alphabet.length];
});
function median(fn) {
  fn();
  const times = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[1];
}
function walk(a) {
  let q = a.startState;
  const flags = [];
  for (const s of stream) {
    const next = a.nextState(q, s);
    flags.push(next === null);
    q = next ?? a.startState;
  }
  return JSON.stringify(flags);
}
const rows = [];
for (const count of [100, 1000, 5000]) {
  const patterns = [...unique.values()].slice(0, count);
  const legacy = legacyForbidden(patterns),
    sparse = forbiddenSubstringAcceptor(patterns),
    dense = forbiddenSubstringAcceptor(patterns, {
      alphabet,
      maxTransitions: 5000000,
    });
  const trace = walk(legacy);
  if (walk(sparse) !== trace || walk(dense) !== trace)
    throw new Error("Automaton trace mismatch");
  const cold = (a) => {
    const start = performance.now();
    walk(a);
    return performance.now() - start;
  };
  const sparseColdWalk = cold(forbiddenSubstringAcceptor(patterns));
  const row = {
    sparseColdWalk,
    patterns: patterns.length,
    legacyBuild: median(() => legacyForbidden(patterns)),
    sparseBuild: median(() => forbiddenSubstringAcceptor(patterns)),
    denseBuild: median(() =>
      forbiddenSubstringAcceptor(patterns, {
        alphabet,
        maxTransitions: 5000000,
      }),
    ),
    legacyWalk: median(() => walk(legacy)),
    sparseWalk: median(() => walk(sparse)),
    denseWalk: median(() => walk(dense)),
  };
  rows.push(row);
  console.log(row);
}
writeFileSync(
  "benchmarks/pattern-results.json",
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      streamLength: stream.length,
      rows,
    },
    null,
    2,
  ) + "\n",
);
