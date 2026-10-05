import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ContextGraph,
  runBP,
  mostProbableSequence,
} from "../dist/core/src/index.js";
import { cumulativeMeterAcceptor } from "../dist/constraints/src/index.js";
const { cases } = JSON.parse(
  readFileSync(
    process.env.MARKOV_FIXTURES ??
      new URL("../fixtures/python-golden.json", import.meta.url),
  ),
);
for (const f of cases.filter((f) => f.meter))
  test(`Python cumulative meter parity: ${f.name}`, () => {
    const g = new ContextGraph(f.contexts, f.rows, f.startState, f.maxOrder),
      a = cumulativeMeterAcceptor(
        f.length,
        (s) => (s === "PAD" ? 0 : s === "a" ? 1 : 2),
        {
          maxCost: f.meter.total,
          acceptCosts: new Set([f.meter.total]),
          endSymbol: "PAD",
          predicate: (total, s) => s !== "PAD" || total === f.meter.total,
        },
      );
    const bp = runBP(g, a, { length: f.length });
    assert.ok(Math.abs(bp.partitionFunction - f.partition) < 1e-12);
    assert.deepEqual(
      mostProbableSequence(g, a, { length: f.length }).sequence,
      f.best.sequence,
    );
    for (const x of f.accepted)
      assert.ok(
        Math.abs(bp.conditionalProbability(x.sequence) - x.conditional) < 1e-10,
      );
  });
