# Memory optimization results · 0.4.0-rc.1

Implemented 2026-10-05. Baseline: commit `2c8c801` (0.3.0-rc.1).
Raw repetitions and metadata: [memory-results.json](../benchmarks/memory-results.json).

## Changes

- Sparse pattern caches retain at most 100,000 entries by default. Compilation
  caches have the same default bound. At capacity, caches are cleared and
  deterministic transitions recomputed; zero disables caching.
- Product edges use packed symbol/destination integer IDs and Float64 log weights,
  replacing individual edge objects. Growth buffers are trimmed after compilation.
- Sorted integer layers share identical state sets and dense lookup buffers.
  Sparse layers use binary search without separate Maps.
- Optional pruning removes impossible time-layer states and edges absent from
  every accepted path. Original state IDs/metadata are preserved.
- Optional checkpointing stores periodic backward layers and reconstructs one
  block at a time for sampling/marginals. Default inference retains all beta rows.
- Viterbi choices are integer edge-ID buffers, with two rolling score arrays.
- Public row/layer/beta inspection remains available through lazy snapshots.
  Inspection materialization deliberately pays the cost of ordinary arrays.

## Measured retained memory

Node v24.3.0, macOS ARM64. Medians of three fresh processes per configuration,
using GC-assisted deltas after training, constraint compilation and backward DP.
Input corpora/token arrays are prepared before the measured baseline. Values
include retained source/constraint/product/BP heap **plus external array buffers**.
They are not a complete process footprint; peak RSS is reported separately.

| Workload | Previous MiB | Default MiB | Pruning only MiB | Checkpoints + pruning MiB | Default reduction |
|---|---:|---:|---:|---:|---:|
| Alice characters, 64 tokens, copy limit 4 | 88.53 | 41.94 | 42.04 | 34.08 | **53%** |
| Alice words, 8 tokens, copy limit 3 | 440.02 | 92.06 | 76.46 | 75.64 | **79%** |
| Synthetic source, horizon 512 | 0.54 | 0.34 | 0.36 | 0.26 | **37%** |

Word default memory moves from 437.72 MiB of heap plus 2.31 MiB of array buffers
into 34.17 MiB of heap plus 57.89 MiB of buffers. Counting only heap would
exaggerate the improvement. Every repetition matched the previous log partition
within 1e-10 and generated the same three seeded samples.

## Process peak RSS

| Workload | Previous MiB | Default MiB | Pruning only MiB | Checkpoints + pruning MiB |
|---|---:|---:|---:|---:|
| Alice characters | 331.19 | 274.14 | 290.16 | 290.56 |
| Alice words | 1,031.48 | 566.95 | 568.89 | 569.17 |
| Synthetic, horizon 512 | 54.86 | 55.44 | 56.95 | 57.53 |

Default peak RSS falls approximately **17%** for characters and **45%** for
words. Small-workload RSS is dominated by runtime overhead/noise; it does not
improve consistently. Checkpointing/pruning do not reduce compilation peak RSS
in these measurements and can increase it through temporary allocations.

## Runtime tradeoffs

| Workload/configuration | Construction ms | Three samples ms |
|---|---:|---:|
| Characters, previous | 2,031 | 1.53 |
| Characters, default | 1,798 | 1.21 |
| Characters, pruning only | 1,957 | 1.13 |
| Characters, checkpoint + pruning | 1,924 | 1,994 |
| Words, previous | 5,316 | 0.91 |
| Words, default | 5,180 | 0.83 |
| Words, pruning only | 5,115 | 0.71 |
| Words, checkpoint + pruning | 5,035 | 297 |
| Synthetic, previous | 11.12 | 1.12 |
| Synthetic, default | 10.70 | 1.17 |
| Synthetic, checkpoint + pruning | 12.71 | 3.36 |

Construction starts in a fresh runtime; timings include training and constraints.
Samples start with an empty sampling cache. Sub-millisecond results have limited
precision and should not be interpreted as reliable speedup claims. The
checkpoint configuration uses interval 8 and disables the sampling cache.

**Use defaults for repeated generation.** They provide most of the memory savings
without a measured speed penalty on the large examples. Pruning alone saves
another 17% on the word example with ordinary sampling, but gives no retained
memory improvement for characters because viable sets share fewer layers.
Checkpointing saves only another 0.83 MiB beyond pruning for the short word
horizon and makes uncached sampling hundreds of times slower. It is useful when
backward storage dominates a long horizon and memory matters more than latency.

The character checkpoint configuration stores nine beta checkpoints instead of
65 rows. Reconstructed block storage is bounded, but each uncached sample repeats
much of the backward work. No Float32 conversion or approximate pruning is used.

## Reproduction

```sh
mkdir -p /tmp/markov-memory-reference
git archive 2c8c801 | tar -x -C /tmp/markov-memory-reference
node node_modules/typescript/bin/tsc -p /tmp/markov-memory-reference/tsconfig.json
npm run benchmark:memory -- /tmp/markov-memory-reference/dist
```

The runner uses three independent processes per mode and checks partition/sample
agreement before saving results. The synthetic source is deliberately small;
its horizon demonstrates beta/layer sharing, not a large-vocabulary workload.
Use production corpora to select cache and checkpoint settings for an application.


## Validation

264 tests passed on Node 20, 22 and 24. Each of the 91 Python reference cases is
also exercised across four memory configurations, checking partitions, seeded
samples, conditional probabilities, optima and marginals. Long underflow and
extreme soft weights are checked separately. Fresh Python regeneration and the
packed strict TypeScript consumer passed. All 18 Chromium/Firefox checks passed,
including low-memory/pruning controls; the deployed Worker was checked live.

- [Implementation CI](https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37310644699)
- [Pages deployment](https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37310644851)
