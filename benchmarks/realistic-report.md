# Realistic workload benchmark report

Measured 2026-10-05, v24.3.0, darwin/arm64. Each workload/runtime runs in a separate process. Timings are the median of three warmed runs (milliseconds). Node uses explicit GC between runs. Python's isolated backward column uses a log recurrence over its compiled product; sampling and optimization use the unmodified Python engine. Optimization includes product construction.

|Workload|Tokens|Runtime|Graph|Product|Log backward|100 warm samples|Optimize|Peak RSS MB|
|---|---:|---|---:|---:|---:|---:|---:|---:|
|alice-full|147988|Node|72.98|35.51|48.91|5.48|73.85|204.72|
|alice-full|147988|Python|119.49|142.99|393.07|17.75|385.01|191.59|
|melody-transposed|7104|Node|38.78|75.71|224.91|15.72|145.21|229.17|
|melody-transposed|7104|Python|149.00|358.88|1481.64|29.51|1542.49|160.06|
|branching-64|30720|Node|22.73|12.64|15.99|2.04|22.27|110.92|
|branching-64|30720|Python|39.48|34.62|102.34|6.20|108.96|61.27|
|branching-256|30720|Node|23.14|41.14|59.71|5.24|75.37|153.75|
|branching-256|30720|Python|39.87|129.10|416.74|27.07|421.48|148.38|

## Reachable products and retained Node memory

|Workload|Unique states|Peak layer states|Layer states|Layer edges|Retained product/inference MB|
|---|---:|---:|---:|---:|---:|
|alice-full|1309|1232|156538|824551|1.20|
|melody-transposed|661|660|83873|4326950|3.83|
|branching-64|584|511|31755|249402|0.76|
|branching-256|584|511|129867|1032570|1.60|

## Before/after optimizations

Same inputs, seeds, process isolation and measurement procedure. Baseline includes the new API guards/backoff but predates cached DFA transitions, compact layer indices and bounded sampling CDF caches. The 100-sample measurement warms the same seeded batch; improvement depends on state reuse.

|Workload|100 samples before ms|After ms|Speedup|Retained MB before|After|
|---|---:|---:|---:|---:|---:|
|alice-full|24.78|5.48|4.52×|9.08|1.20|
|melody-transposed|20.87|15.72|1.33×|7.30|3.83|
|branching-64|5.92|2.04|2.90×|1.60|0.76|
|branching-256|13.17|5.24|2.51×|5.05|1.60|

## Numerical strategy evaluation

A benchmark-only probability-space recurrence was compared with the stable log engine on these ordinary-mass workloads.

|Workload|Log backward ms|Probability prototype ms|
|---|---:|---:|
|alice-full|48.91|31.11|
|melody-transposed|224.91|69.58|
|branching-64|15.99|9.49|
|branching-256|59.71|31.96|

The prototype is faster but has no verified extreme-mass fallback. It remains outside the public API; log inference preserves tiny source/constraint factors and rare long-horizon support.

## Interpretation and limits

- The complete Alice body has 147,988 Unicode code points after Gutenberg wrapper removal. Melody uses 12 materialized transpositions of the reference evaluation corpus and explicit backoff. Synthetic data uses a pinned seed and a branching eight-symbol alphabet. Corpus provenance is in corpora/README.md.
- Both languages agree on log partitions within 1e-9 and on unique states/time-indexed edges for all four workloads.
- Peak RSS includes runtime, corpus, JIT, temporaries and all timed operations; it is not retained product memory. Retained Node memory is a GC-based heap delta while keeping the source, compiled product and inference result alive, before sampling caches fill. Python retained-heap memory is not claimed.
- An order-3 version of the melody workload exceeded the ten-million time-indexed-edge default and raised ResourceLimitError. The measured melody case uses order 2. Limits prevent accidental runaway compilation; they are configurable.
- This is a local comparison, not a universal runtime ranking. No browser performance measurements or million-state scalability claim is made.

Regenerate: `npm run benchmark:realistic -- /path/to/vo_regular_bp` then `node benchmarks/report-realistic.mjs`. Inputs are regenerated from corpora; raw before/after measurements are baseline.json and realistic-results.json.
