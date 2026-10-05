import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  ContextGraph,
  compileProduct,
  ProductBPResult,
  mostProbableSequence,
  seededRng,
} from "../dist/core/src/index.js";
import { forbiddenSubstringAcceptor } from "../dist/constraints/src/index.js";
const workload = JSON.parse(readFileSync(process.argv[2]))[
  Number(process.argv[3])
];
function median(fn) {
  fn();
  const values = [];
  for (let i = 0; i < 3; i++) {
    global.gc?.();
    const start = performance.now();
    fn();
    values.push(performance.now() - start);
  }
  return values.sort((a, b) => a - b)[1];
}
const build = () =>
  workload.backoffWeight === undefined
    ? ContextGraph.fromSequences(workload.sequences, {
        maxOrder: workload.order,
      })
    : ContextGraph.fromBackoffSequences(workload.sequences, {
        maxOrder: workload.order,
        backoffWeight: workload.backoffWeight,
      });
const graphMs = median(build),
  graph = build(),
  acceptor = forbiddenSubstringAcceptor([workload.forbidden]),
  options = { length: workload.length };
global.gc?.();
const before = process.memoryUsage().heapUsed;
const product = compileProduct(graph, acceptor, options),
  bp = new ProductBPResult(product);
global.gc?.();
const retained = (process.memoryUsage().heapUsed - before) / 2 ** 20;
// Evaluate plain probability DP as a benchmark-only prototype. It is not the library engine.
function probabilityPrototype() {
  let values = new Map(
    product.layers[product.length].map((id) => [
      id,
      acceptor.isAccepting(product.states[id].acceptor) ? 1 : 0,
    ]),
  );
  for (let t = product.length - 1; t >= 0; t--) {
    const next = new Map();
    for (const id of product.layers[t]) {
      let sum = 0;
      for (const edge of product.rows[id])
        sum += Math.exp(edge.logWeight) * (values.get(edge.next) ?? 0);
      next.set(id, sum);
    }
    values = next;
  }
  return values.get(0);
}
const prototypeMass = probabilityPrototype();
if (Math.abs(prototypeMass - bp.partitionFunction) > 1e-9)
  throw new Error("Probability prototype mismatch");
const result = {
  name: workload.name,
  tokens: workload.sequences.reduce((n, s) => n + s.length, 0),
  graph: graphMs,
  product: median(() => compileProduct(graph, acceptor, options)),
  backward: median(() => new ProductBPResult(product)),
  probabilityPrototype: median(probabilityPrototype),
  sample: median(() => bp.sample(seededRng(1))),
  sample100: median(() => bp.sampleMany(100, seededRng(1))),
  optimization: median(() => mostProbableSequence(graph, acceptor, options)),
  states: product.productStateCount,
  layerStates: product.timeIndexedProductStateCount,
  peakLayerStates: Math.max(...product.layers.map((l) => l.length)),
  edges: product.productEdgeCount,
  logPartition: bp.logPartitionFunction,
  retainedProductMB: retained,
  peakRSSMB: process.resourceUsage().maxRSS / 1024,
};
console.log(JSON.stringify(result));
