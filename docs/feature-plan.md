# Feature and example completion plan

Status: implemented and validated. Browser timing artifact persistence is being finalized.

Version: 0.3.0-rc.1. Results: [feature-results.md](feature-results.md).

1. Replace prefix-scanning substring automata with Aho–Corasick failure links,
   cached sparse transitions and optional bounded finite-alphabet tables. Benchmark
   construction/transition workloads against the previous implementation.
2. Port Python cumulative-cost meter and padded-duration semantics; validate by
   exhaustive tests and freshly generated Python fixtures.
3. Add stable forward/backward symbol marginals and expected source-edge counts;
   check against exhaustive conditioned distributions, including extreme weights.
4. Expand examples: full Alice character/word modes and measured copying; melody
   pitch-duration events, exact meter, WebAudio and MIDI; DNA stop alternatives
   and motifs; journeys with explicit ordering and visit limits.
5. Improve playground: visible training data, clear constraint/model guidance,
   actionable infeasibility messages, sequence weights/probabilities, marginal
   chart and example-specific controls.
6. Measure cold/warm varied-stream sampling, cache saturation, browser timings,
   and typed-array backing memory. Document actual gains and limits.
7. Validate Node/Python parity, packed package and Chromium/Firefox, commit/push,
   deploy and report outcomes. npm registry publication remains separate.
