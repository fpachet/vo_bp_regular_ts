import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  ContextGraph,
  compileProduct,
  ProductBPResult,
  seededRng,
} from "../dist/core/src/index.js";
import { forbiddenSubstringAcceptor } from "../dist/constraints/src/index.js";
const alphabet = [..."ABCDEFGHIJKL"];
const graph = ContextGraph.fromBackoffSequences(
  [
    Array.from(
      { length: 3000 },
      (_, i) => alphabet[(i * 7 + i * i) % alphabet.length],
    ),
  ],
  { maxOrder: 2, backoffWeight: 0.2 },
);
const product = compileProduct(
  graph,
  forbiddenSubstringAcceptor([[..."AAA"]]),
  { length: 100 },
);
const rows = [];
function measure(cap) {
  global.gc?.();
  const before = process.memoryUsage();
  const bp = new ProductBPResult(product, { maxCachedSamplingEdges: cap });
  let start = performance.now();
  bp.sample(seededRng(31));
  const coldMs = performance.now() - start;
  start = performance.now();
  for (let batch = 0; batch < 10; batch++)
    bp.sampleMany(100, seededRng(batch + 300));
  const warm1000Ms = performance.now() - start;
  global.gc?.();
  const after = process.memoryUsage();
  return {
    cap,
    coldMs,
    warm1000Ms,
    cachedEdges: bp.cachedSamplingEdgeCount,
    retainedHeapMB: (after.heapUsed - before.heapUsed) / 2 ** 20,
    retainedArrayBuffersMB:
      (after.arrayBuffers - before.arrayBuffers) / 2 ** 20,
  };
}
for (const cap of [0, 256, 100000]) measure(cap);
for (const cap of [0, 256, 100000]) {
  const measurements = Array.from({ length: 3 }, () => measure(cap));
  const row = { cap, cachedEdges: measurements[0].cachedEdges };
  for (const key of [
    "coldMs",
    "warm1000Ms",
    "retainedHeapMB",
    "retainedArrayBuffersMB",
  ])
    row[key] = measurements.map((x) => x[key]).sort((a, b) => a - b)[1];
  rows.push(row);
}
const result = {
  runtime: process.version,
  platform: process.platform,
  seedBatches: 10,
  samples: 1000,
  length: 100,
  rows,
};
writeFileSync(
  new URL("./sampling-results.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
