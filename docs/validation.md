# Validation record

Validated on 2026-10-05, Node 24.3.0, macOS arm64.

- Strict TypeScript compilation and 44 Node tests pass.
- 37 golden fixtures generated from the unmodified adjacent Python checkout;
  reference commit and random seed recorded in fixtures/python-golden.json.
- Python checks its DP partition and maximum against independent enumeration.
- TypeScript compares partition, log partition, optimum and diagnostics against
  Python, and every sequence probability for feasible tiny exhaustive fixtures.
- Constraint constructors independently checked against string predicates;
  sampling frequencies checked with a deterministic RNG and a fixed tolerance.
- Rare 1,200-symbol horizon, subnormal source probabilities, huge/tiny soft
  weights, weighted intersections, infeasibility, dead ends and empty horizons.
- All five Node domain examples ran successfully.
- Built tarball extracted into a temporary consumer directory: package root and
  constraints subpath imports successfully inferred and sampled there.
- Browser UI verified through the in-app browser: toy exact sample, global
  optimum, and text with MAXORDER; module Worker completed and diagnostics
  displayed. Screenshot: playground.png. Mobile layout visually inspected.
- Node/Python warmed benchmark measurements recorded in benchmarks/report.md.

No npm publication, browser timing benchmark, cumulative-meter engine or
WebAudio playback is claimed. The Alice corpus is a short public-domain excerpt,
not a full-book scalability evaluation.
