import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  ContextGraph,
  compileProduct,
  ProductBPResult,
  mostProbableSequence,
} from "../dist/core/src/index.js";
import { forbiddenSubstringAcceptor } from "../dist/constraints/src/index.js";
import { workloads } from "./workloads.mjs";
writeFileSync("benchmarks/workloads.json", JSON.stringify(workloads));
function measure(fn) {
  fn();
  const xs = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    fn();
    xs.push(performance.now() - t);
  }
  return xs.sort((a, b) => a - b)[2];
}
const ts = workloads.map((w) => {
  const build = () =>
      ContextGraph.fromSequences(w.sequences, { maxOrder: w.order }),
    g = build(),
    a = forbiddenSubstringAcceptor([w.forbidden]),
    options = { length: w.length },
    p = compileProduct(g, a, options),
    bp = new ProductBPResult(p);
  return {
    name: w.name,
    graph: measure(build),
    product: measure(() => compileProduct(g, a, options)),
    backward: measure(() => new ProductBPResult(p)),
    sample: measure(() => bp.sample()),
    sample100: measure(() => bp.sampleMany(100)),
    optimization: measure(() => mostProbableSequence(g, a, options)),
    states: p.productStateCount,
    layerStates: p.timeIndexedProductStateCount,
    edges: p.productEdgeCount,
  };
});
const reference = process.argv[2];
let python = null;
if (reference) {
  const r = spawnSync("python3", ["benchmarks/reference.py", reference], {
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
  python = JSON.parse(r.stdout);
}
writeFileSync(
  "benchmarks/results.json",
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      ts,
      python,
    },
    null,
    2,
  ),
);
let report =
  "# Local benchmark report\n\nMedian of five warmed runs, milliseconds. These small workloads are illustrative, not a general speed claim. Python uses its existing engine for sampling and optimization; its isolated backward column uses a log recurrence to match TypeScript. Optimization includes fresh product construction in both runtimes. No browser performance or memory measurements are claimed.\n\n|Workload|Runtime|Graph|Product|Backward|1 sample|100 samples|Optimize|Unique states|Layer states|Layer edges|\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n";
for (const w of ts) {
  for (const [runtime, row] of [
    ["Node", w],
    ["Python", python?.find((p) => p.name === w.name)],
  ])
    if (row)
      report += `|${w.name}|${runtime}|${["graph", "product", "backward", "sample", "sample100", "optimization"].map((k) => row[k].toFixed(3)).join("|")}|${row.states}|${row.layerStates}|${row.edges}|\n`;
}
report += `\nEnvironment: Node ${process.version}, ${process.platform}/${process.arch}. Regenerate with npm run benchmark -- /path/to/vo_regular_bp. Raw results: results.json. Corpus inputs: workloads.json.\n`;
writeFileSync("benchmarks/report.md", report);
console.log(report);
