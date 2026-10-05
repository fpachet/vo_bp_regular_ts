# Release-candidate validation record

Version 0.2.0-rc.1, validated on 2026-10-05.

- 136 Node tests pass locally and on GitHub CI under Node 20, 22 and 24.
- 79 Python golden fixtures, including 40 randomized variable-order/backoff
  models through order 4, weighted intersections and exhaustive tiny cases.
- Fresh fixture generation from pinned Python commit
  ae05b8799a9698d986afbe2b010194b32aa2c678 passed in CI with Python 3.12.
- Graph continuation probabilities and canonical destinations match Python;
  partitions, conditional probabilities, optima and diagnostics are checked.
- Rare 1,200-symbol horizons, subnormal source probabilities, huge/tiny soft
  factors, weighted intersections, empty horizons, infeasibility and dead ends.
- Seeded reproducibility, JSON round trips, start overrides and resource budgets.
- External packed-package ESM/strict TypeScript consumer passed on Node 20/22/24.
- 12 automated browser cases pass across Chromium and Firefox, using the exact
  Pages static artifact: all five datasets, sampling/optimization in module
  Workers, seed reproducibility, backoff/MAXORDER and malformed custom DFA input.
- Local browser verification of the new seed/backoff controls and reproducible
  novelty generation. Screenshot: playground.png.
- Full Alice corpus, transposed melody and branching synthetic benchmarks agree
  with Python on log partitions within 1e-9 and product counts. Before/after
  timings and memory measurements: benchmarks/realistic-report.md.
- GitHub Pages deployment passed after both browser engines; npm tarball built.

Validated implementation CI:
https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37304787502

Validated Pages deployment:
https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37304787518

The 0.3.0-rc.1 feature milestone adds browser performance measurements,
cumulative-duration meter and WebAudio playback; see feature-results.md.
Remaining limits: no npm registry publication/authentication. Probability-space DP
is a benchmark prototype; the public library retains stable log inference.
The product budgets intentionally stop large requests rather than approximating.


## 0.3.0-rc.1 feature milestone

- 168 tests passed on Node 20, 22 and 24; 91 Python fixtures freshly regenerated
  in CI, including 12 cumulative meter/PAD cases.
- Packed external strict TypeScript consumer passes, including meter/marginal APIs.
- 16 browser checks passed across Chromium/Firefox, including full Alice modes,
  marginals, exact melody duration, WebAudio startup/stop, MIDI downloads and
  cache saturation benchmarks. Linux CI supplies a virtual audio sink; this
  verifies graph startup, not acoustic output from speakers.
- Rich examples run successfully; the independent MIDI parser validates events.
- Realistic TS/Python log partitions agree within 2.3e-14 and product counts match.
- Heap and external array-buffer measurements are now reported separately.
- Local browser inspection confirms full Alice generation and metered playback.
  Screenshot: playground-features.png.

Validated implementation: https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37307941669

Validated deployment: https://github.com/fpachet/vo_bp_regular_ts/actions/runs/37307941667

Performance gains and practical limits: [feature-results.md](feature-results.md).
