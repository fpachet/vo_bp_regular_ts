# Release-candidate implementation plan

Status: in progress. Scope: a dependable native TypeScript library, preserving
Python fixed-source semantics. No npm publication until release validation is
complete and registry ownership is established.

1. API hardening: typed errors, reproducible seeded RNG, source/acceptor start
   overrides, explicit product resource budgets, versioned JSON graph and DFA
   serialization, backoff-mixture training, external package/typecheck tests.
2. Scientific validation: random variable-order training and backoff fixtures,
   weighted intersections, long-horizon cases, exhaustive tiny models and Python
   parity. Include a strict-order MAXORDER infeasibility/backoff feasibility case.
3. Realistic profiling: full public-domain text, larger melody data and branching
   synthetic models; construction/inference/sampling/optimization timing, process
   memory and reachable product growth; shared Python/Node inputs.
4. Measured efficiency: preserve the log-space reference, reduce sampling
   allocation, cache DFA symbol transitions when profiling supports it; evaluate
   probability-space computation without sacrificing extreme-mass support.
5. Release preparation: Node version CI, real browser Worker tests, packed-package
   ESM/type checks, API guide, changelog and a reproducible npm release workflow.
6. Report final evidence, performance changes and remaining practical limits.

Progress and measurements will be recorded below as stages complete.

## Progress

- API hardening complete: errors, seeds, JSON snapshots, starts, resource limits,
  and Python-equivalent explicit backoff mixture.
- Scientific checks complete locally: 136 tests, 79 golden fixtures, training
  rows through order 4, weighted intersections and exhaustive tiny distributions.
- Realistic profiling complete: full Alice, transposed melody and branching
  horizons. Python/Node partitions and product counts match. Raw data and report
  are in benchmarks/realistic-report.md.
- Measured optimizations complete: cached DFA calls, compact layer indices and
  bounded sampling CDFs. Warm 100-sample batches improved 1.3–4.5×; retained
  product/inference heap fell 47–87% on these cases. Log inference retained after
  evaluating a faster probability-space prototype without an extreme-mass fallback.
- Release preparation complete locally: 0.2.0-rc.1, API guide, changelog and
  independent packed-package ESM/strict TS consumer check. Seed/backoff controls
  verified in the local browser. Node 20/22/24, fresh Python generation and
  Chromium/Firefox Worker workflows are ready for remote CI verification.
- Next verification: run CI and Pages deployment; resolve any failures before
  declaring the candidate validated. Actual npm publication requires registry
  package-name ownership and authentication; no account setup or publication is
  claimed by this plan.
