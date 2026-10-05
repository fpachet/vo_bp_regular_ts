import { readFileSync, writeFileSync } from "node:fs";
const baseline = JSON.parse(readFileSync("benchmarks/baseline.json")),
  current = JSON.parse(readFileSync("benchmarks/realistic-results.json"));
let report = `# Realistic workload benchmark report\n\nMeasured ${current.date.slice(0, 10)}, ${current.node}, ${current.platform}/${current.architecture}. Each workload/runtime runs in a separate process. Timings are the median of three warmed runs (milliseconds). Node uses explicit GC between runs. Python's isolated backward column uses a log recurrence over its compiled product; sampling and optimization use the unmodified Python engine. Optimization includes product construction.\n\n|Workload|Tokens|Runtime|Graph|Product|Log backward|100 warm samples|Optimize|Peak RSS MB|\n|---|---:|---|---:|---:|---:|---:|---:|---:|\n`;
for (const row of current.ts)
  for (const [name, r] of [
    ["Node", row],
    ["Python", current.python.find((p) => p.name === row.name)],
  ])
    if (r)
      report += `|${r.name}|${r.tokens}|${name}|${["graph", "product", "backward", "sample100", "optimization", "peakRSSMB"].map((k) => r[k].toFixed(2)).join("|")}|\n`;
report +=
  "\n## Reachable products and retained Node memory\n\n|Workload|Unique states|Peak layer states|Layer states|Layer edges|Retained product/inference MB|\n|---|---:|---:|---:|---:|---:|\n";
for (const r of current.ts)
  report += `|${r.name}|${r.states}|${r.peakLayerStates}|${r.layerStates}|${r.edges}|${r.retainedProductMB.toFixed(2)}|\n`;
report +=
  "\n## Before/after optimizations\n\nSame inputs, seeds, process isolation and measurement procedure. Baseline includes the new API guards/backoff but predates cached DFA transitions, compact layer indices and bounded sampling CDF caches. The 100-sample measurement warms the same seeded batch; improvement depends on state reuse.\n\n|Workload|100 samples before ms|After ms|Speedup|Retained MB before|After|\n|---|---:|---:|---:|---:|---:|\n";
for (const after of current.ts) {
  const before = baseline.ts.find((r) => r.name === after.name);
  report += `|${after.name}|${before.sample100.toFixed(2)}|${after.sample100.toFixed(2)}|${(before.sample100 / after.sample100).toFixed(2)}×|${before.retainedProductMB.toFixed(2)}|${after.retainedProductMB.toFixed(2)}|\n`;
}
report +=
  "\n## Numerical strategy evaluation\n\nA benchmark-only probability-space recurrence was compared with the stable log engine on these ordinary-mass workloads.\n\n|Workload|Log backward ms|Probability prototype ms|\n|---|---:|---:|\n";
for (const r of current.ts)
  report += `|${r.name}|${r.backward.toFixed(2)}|${r.probabilityPrototype.toFixed(2)}|\n`;
report +=
  "\nThe prototype is faster but has no verified extreme-mass fallback. It remains outside the public API; log inference preserves tiny source/constraint factors and rare long-horizon support.\n\n## Interpretation and limits\n\n- The complete Alice body has 147,988 Unicode code points after Gutenberg wrapper removal. Melody uses 12 materialized transpositions of the reference evaluation corpus and explicit backoff. Synthetic data uses a pinned seed and a branching eight-symbol alphabet. Corpus provenance is in corpora/README.md.\n- Both languages agree on log partitions within 1e-9 and on unique states/time-indexed edges for all four workloads.\n- Peak RSS includes runtime, corpus, JIT, temporaries and all timed operations; it is not retained product memory. Retained Node memory is a GC-based heap delta while keeping the source, compiled product and inference result alive, before sampling caches fill. Python retained-heap memory is not claimed.\n- An order-3 version of the melody workload exceeded the ten-million time-indexed-edge default and raised ResourceLimitError. The measured melody case uses order 2. Limits prevent accidental runaway compilation; they are configurable.\n- This is a local comparison, not a universal runtime ranking. No browser performance measurements or million-state scalability claim is made.\n\nRegenerate: `npm run benchmark:realistic -- /path/to/vo_regular_bp` then `node benchmarks/report-realistic.mjs`. Inputs are regenerated from corpora; raw before/after measurements are baseline.json and realistic-results.json.\n";
writeFileSync("benchmarks/realistic-report.md", report);
console.log("Wrote benchmarks/realistic-report.md");
