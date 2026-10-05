# Memory optimization plan

Status: complete. Implemented, benchmarked, validated, pushed and deployed.
Results: [memory-results.md](memory-results.md). Baseline: commit 2c8c801, version 0.3.0-rc.1.

1. Bound sparse pattern caches, evicting cached results without changing languages.
2. Pack and deduplicate time-layer state arrays and share their lookup indices.
3. Pack product edges into integer/Float64 buffers while preserving inspection APIs.
4. Add optional backward checkpoints and exact pruning of infeasible layer states.
5. Compare baseline/default/low-memory modes in fresh Node processes on full Alice
   characters/words and a long branching workload. Include heap, array buffers,
   process peak RSS, construction and sampling costs; verify equal partitions.
6. Extend exhaustive/weighted/Python parity and packaged TS/browser checks,
   document measured gains and tradeoffs, commit/push and deploy.
