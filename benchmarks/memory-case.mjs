import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
const root = process.argv[2],
  name = process.argv[3],
  mode = process.argv[4];
const core = await import(pathToFileURL(root + "/core/src/index.js"));
const constraints = await import(
  pathToFileURL(root + "/constraints/src/index.js")
);
let tokens, order, length, limit;
if (name.startsWith("alice")) {
  const raw = readFileSync("benchmarks/corpora/alice.txt", "utf8"),
    text = raw.split(/\*\*\* START OF[^\n]*\n/)[1].split(/\*\*\* END OF/)[0];
  const { tokenizeWords } = await import("../examples/domain-utils.mjs");
  tokens = name === "alice-words" ? tokenizeWords(text) : [...text];
  order = name === "alice-words" ? 1 : 2;
  length = name === "alice-words" ? 8 : 64;
  limit = name === "alice-words" ? 3 : 4;
} else {
  tokens = Array.from({ length: 10000 }, (_, i) =>
    String((i * 7 + i * i) % 16),
  );
  order = 2;
  length = 512;
}
global.gc();
const before = process.memoryUsage(),
  started = performance.now();
const graph = core.ContextGraph.fromSequences([tokens], { maxOrder: order });
const a = limit
  ? constraints.allOf(
      constraints.prefixAcceptor([name === "alice-words" ? "Alice" : "A"]),
      constraints.suffixAcceptor(["."]),
      constraints.maxOrderAcceptor([tokens], limit, {
        maxTransitions: 10000000,
      }),
    )
  : constraints.forbiddenSubstringAcceptor([["0", "0", "0"]]);
const bp = core.runBP(graph, a, {
  length,
  maxProductEdges: 20000000,
  maxDfaTransitions: 10000000,
  ...(mode === "checkpoint"
    ? {
        checkpointInterval: 8,
        maxCachedSamplingEdges: 0,
        pruneDeadStates: true,
      }
    : mode === "pruned"
      ? { pruneDeadStates: true }
      : {}),
});
const constructionMs = performance.now() - started;
global.gc();
const after = process.memoryUsage(),
  storageBeforeSampling = bp.memoryDiagnostics?.();
const sampleStart = performance.now();
const samples = bp.sampleMany(3, core.seededRng(17));
const sample3Ms = performance.now() - sampleStart;
global.gc();
const sampled = process.memoryUsage();
console.log(
  JSON.stringify({
    name,
    mode,
    node: process.version,
    constructionMs,
    sample3Ms,
    logPartition: bp.logPartitionFunction,
    samples,
    states: bp.productStateCount,
    layerStates: bp.timeIndexedProductStateCount,
    heapMiB: (after.heapUsed - before.heapUsed) / 2 ** 20,
    buffersMiB: (after.arrayBuffers - before.arrayBuffers) / 2 ** 20,
    totalMiB:
      (after.heapUsed -
        before.heapUsed +
        after.arrayBuffers -
        before.arrayBuffers) /
      2 ** 20,
    afterSamplingTotalMiB:
      (sampled.heapUsed -
        before.heapUsed +
        sampled.arrayBuffers -
        before.arrayBuffers) /
      2 ** 20,
    peakRSSMiB: process.resourceUsage().maxRSS / 1024,
    storageBeforeSampling,
    storageAfterSampling: bp.memoryDiagnostics?.(),
  }),
);
