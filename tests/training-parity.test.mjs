import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ContextGraph } from "../dist/core/src/index.js";
const { cases } = JSON.parse(
  readFileSync(
    process.env.MARKOV_FIXTURES ??
      new URL("../fixtures/python-golden.json", import.meta.url),
  ),
);
for (const f of cases.filter((f) => f.training))
  test(`Python training parity: ${f.name}`, () => {
    const { sequences, maxOrder, backoffWeight } = f.training;
    const graph =
      backoffWeight === null
        ? ContextGraph.fromSequences(sequences, { maxOrder })
        : ContextGraph.fromBackoffSequences(sequences, {
            maxOrder,
            backoffWeight,
          });
    assert.equal(graph.stateCount, f.contexts.length);
    for (let i = 0; i < f.contexts.length; i++) {
      const id = graph.contextId(f.contexts[i]);
      const row = graph.outgoing(id);
      assert.equal(row.length, f.rows[i].length);
      for (const expected of f.rows[i]) {
        const edge = row.find((e) => e.symbol === expected.symbol);
        assert.ok(edge);
        assert.ok(Math.abs(edge.probability - expected.probability) < 1e-12);
        assert.deepEqual(
          graph.contexts[edge.nextState],
          f.contexts[expected.nextState],
        );
      }
    }
  });
