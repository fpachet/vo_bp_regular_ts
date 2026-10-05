# Feature completion results · 0.3.0-rc.1

Implemented on 2026-10-05. Reproducible measurements are checked in under
`benchmarks/`; timings are machine/workload specific.

## Functional gains

- Pattern constraints now use Aho–Corasick tries/failure links, sparse transition
  caching and optional finite-alphabet tables. Existing builder signatures remain
  compatible. Overlaps and randomized languages agree with independent predicates.
- Cumulative cost, exact duration and absorbing PAD mirror the Python semantics.
  Twelve additional exhaustive Python cases bring the reference fixture count to 91.
- Forward/backward marginals and expected source transition counts are available
  on demand. Exhaustive distributions, extreme weights and zero-length cases pass.
- Full Alice samples use character or Unicode word/punctuation tokens. Copying is
  measured independently by a suffix automaton. Example seed 11 produces maximum
  copied runs 4 (characters) and 3 (words), matching their respective limits.
- Pitch-duration melody generation respects a 16-beat total, bar boundaries and
  terminal PAD. The example emits a valid format-0 MIDI file. Browser playback uses
  WebAudio. An independent MIDI parser checks note timing, tempo and end markers.
- DNA supports TAA/TAG/TGA endings, required motifs and forbidden motifs. Journeys
  enforce Cart before Checkout, at most two Search visits and one Purchase.
- Playground exposes training previews, sequence log weights/conditioned
  probabilities, position marginals, cancellation and actionable failure guidance.

## Pattern performance

Node v24.3.0, macOS ARM64. 2,000-symbol streams; Alice-derived 5-grams;
construction and warm walks use medians of three measured repetitions after warmup.
`legacy-pattern.mjs` preserves the prior implementation for comparison. Rejected
transition traces match. Times below are milliseconds.

| Patterns | Previous walk | Sparse warm walk | Sparse cold walk | Sparse build | Dense build |
|---:|---:|---:|---:|---:|---:|
| 100 | 2.655 | 0.191 | 0.325 | 0.224 | 4.467 |
| 1,000 | 30.809 | 0.139 | 0.221 | 0.807 | 35.711 |
| 5,000 | 124.318 | 0.114 | 0.319 | 3.167 | 152.199 |

Warm pattern traversal improved approximately **14–1,090×** on these workloads;
first traversal improved approximately **8–390×**. This measures pattern
transitions, not entire inference. Dense tables cost considerably more to build
and are not consistently faster than warmed sparse caching; sparse remains default.
The cold walk is a single observation, so it has lower statistical confidence.

## Sampling and memory

`sampling-results.json` uses a warmed runtime, three repetitions, ten different
seed streams and 1,000 length-100 samples per repetition. Product/BP construction
is outside the sampling timer. Cache capacity is measured in retained edge entries.

| Cache cap | Retained edges | First sample ms | 1,000 varied samples ms | Retained heap MiB | Array buffers MiB |
|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 0.121 | 21.784 | 0.041 | 0.013 |
| 256 | 255 | 0.178 | 21.346 | 0.075 | 0.015 |
| 100,000 | 5,282 | 0.143 | 8.371 | 0.489 | 0.017 |

The larger cache gives **2.6×** faster repeated sampling in this experiment,
while the saturated tiny cache provides little benefit. First samples gain no
consistent advantage. Memory values are GC-assisted deltas, not exact allocation
counts; small inline typed arrays can be accounted for in the JS heap.
`realistic-results.json` now separately records JS heap, external array buffers,
their sum, and peak RSS; prior heap-only reductions should not be read as total
memory reductions.

Browser phase timings and cache benchmarks are exposed directly in the Worker
UI. One local metered-melody check measured 5.5 ms without caching versus 0.7 ms
with the large cache for 500 varied samples. This is an illustrative observation,
not a portable speed guarantee. CI attaches Chromium/Firefox timing records.

## Practical limits

Full-book word MAXORDER is a large regular product: the tested 8-token default
has 44,132 unique product states and 11,271,679 time-indexed edges. A local browser
check took about 3.8 seconds for constraints/product/backward inference plus
1.5 seconds for optional marginals. Larger horizons can hit configured resource
budgets. Cancellation terminates the Worker; no approximation is substituted.
Full Alice is the Gutenberg edition (front matter included, wrapper removed for
training); the complete original corpus/license is shipped with the demo.

The package remains a release candidate. npm registry publication is separate.

Realistic benchmark retained memory after compilation/backward inference (before
filling sampling caches); these workloads use a forbidden-pattern constraint,
rather than the larger full-book MAXORDER demonstration:

| Workload | JS heap MiB | Array buffers MiB | Sum MiB |
|---|---:|---:|---:|
| Full Alice | 2.143 | 1.828 | 3.971 |
| Transposed melody | 3.841 | 0.960 | 4.801 |
| Branching, horizon 64 | 0.765 | 0.380 | 1.145 |
| Branching, horizon 256 | 1.601 | 1.557 | 3.158 |

All four realistic products match the Python reference state/edge counts; log
partition differences are at most 2.3e-14.


Persisted CI browser timings (`benchmarks/browser-results.json`), 500 metered
melody samples of length 12 with five seed streams:

| Browser | No cache ms | Cap 256 ms | Cap 100,000 ms | Large-cache retained edges |
|---|---:|---:|---:|---:|
| Chromium | 15.9 | 7.8 | 2.2 | 1,332 |
| Firefox | 10 | 5 | 2 | 1,332 |

These are single ordered measurements from a shared CI runner, not medians;
JIT/order effects and coarse browser clocks limit comparisons. A recorded zero
for a cold sample means below timer resolution. CI uses a virtual PulseAudio
sink for WebAudio startup checks; it does not assess audible sound quality.

Final validation: 168 Node tests, 91 freshly regenerated Python reference cases,
16 Chromium/Firefox checks and an external strict TypeScript package consumer
(including new meter/marginal exports) passed. The Pages deployment passed and
live metered inference was checked in the published site.
