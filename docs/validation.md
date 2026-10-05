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

Remaining limits: no npm registry publication/authentication, browser performance
benchmark, cumulative-duration meter or WebAudio playback. Probability-space DP
is a benchmark prototype; the public library retains stable log inference.
The product budgets intentionally stop large requests rather than approximating.
