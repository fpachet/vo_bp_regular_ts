import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ContextGraph,
  DFA,
  compileProduct,
  ProductBPResult,
  runBP,
  optimizeProduct,
  seededRng,
} from "../dist/core/src/index.js";
import {
  forbiddenSubstringAcceptor,
  requiredSubstringAcceptor,
  suffixesAcceptor,
  trueAcceptor,
} from "../dist/constraints/src/index.js";
const close = (a, b) =>
  assert.ok(
    a === b || Math.abs(a - b) < 1e-10 * Math.max(1, Math.abs(b)),
    `${a} != ${b}`,
  );
const { cases } = JSON.parse(
  readFileSync(
    process.env.MARKOV_FIXTURES ??
      new URL("../fixtures/python-golden.json", import.meta.url),
  ),
);
for (const f of cases)
  test(`Memory modes preserve Python distribution: ${f.name}`, () => {
    const graph = new ContextGraph(
        f.contexts,
        f.rows,
        f.startState,
        f.maxOrder,
      ),
      a = new DFA({
        startState: 0,
        transition: (q, s) => f.dfa.transitions[q][s] ?? null,
        accept: (q) => f.dfa.accepting[q],
        weight: (q, s) => f.dfa.weights[q][s] ?? 1,
      });
    const base = runBP(graph, a, { length: f.length });
    for (const options of [
      { checkpointInterval: 1, pruneDeadStates: true },
      { checkpointInterval: 3, maxCachedSamplingEdges: 0 },
      {
        checkpointInterval: 8,
        pruneDeadStates: true,
        maxCachedDfaTransitions: 0,
      },
      { checkpointInterval: f.length + 1, pruneDeadStates: true },
    ]) {
      const bp = runBP(graph, a, { length: f.length, ...options });
      close(bp.logPartitionFunction, base.logPartitionFunction);
      assert.equal(bp.feasible, base.feasible);
      assert.deepEqual(optimizeProduct(bp.product).sequence, f.best.sequence);
      if (bp.feasible) {
        assert.deepEqual(
          bp.sampleMany(8, seededRng(42)),
          base.sampleMany(8, seededRng(42)),
        );
        for (const x of f.accepted)
          close(bp.conditionalProbability(x.sequence), x.conditional);
        const actual = bp.marginals(),
          expected = base.marginals();
        for (let t = 0; t < f.length; t++)
          for (const [s, p] of expected.symbolProbabilities[t])
            close(actual.symbolProbabilities[t].get(s) ?? 0, p);
        const keyed = (xs) =>
          new Map(
            xs.map((e) => [
              JSON.stringify([e.contextState, e.symbol, e.nextContextState]),
              e.expectedCount,
            ]),
          );
        const exp = keyed(expected.expectedTransitions);
        for (const [key, value] of keyed(actual.expectedTransitions))
          close(value, exp.get(key));
      }
    }
  });
test("Sparse cache eviction and disabled caching preserve overlapping languages", () => {
  for (const capacity of [0, 1, 2, 7]) {
    const builders = [
      (opts) =>
        forbiddenSubstringAcceptor(
          [
            ["a", "b", "a"],
            ["b", "b"],
          ],
          opts,
        ),
      (opts) => requiredSubstringAcceptor(["a", "b", "a"], opts),
      (opts) =>
        suffixesAcceptor(
          [
            ["a", "b"],
            ["b", "a"],
          ],
          opts,
        ),
    ];
    for (const build of builders) {
      const baseline = build({}),
        bounded = build({ maxCachedTransitions: capacity });
      for (let n = 0; n < 512; n++) {
        const word = Array.from({ length: 9 }, (_, i) =>
          (n >> i) & 1 ? "a" : "b",
        );
        assert.equal(bounded.accepts(word), baseline.accepts(word));
      }
    }
  }
  assert.throws(
    () => forbiddenSubstringAcceptor([["a"]], { maxCachedTransitions: -1 }),
    RangeError,
  );
});
test("Packed layers and indices share repeated state sets; edge inspection stays compatible", () => {
  const graph = ContextGraph.fromSequences(["abababab"], { maxOrder: 1 }),
    p = compileProduct(graph, trueAcceptor(), { length: 80 }),
    bp = new ProductBPResult(p);
  assert.ok(p.layerIds.every((layer) => layer instanceof Uint32Array));
  assert.ok(bp.memoryDiagnostics().uniqueLayers < 10);
  assert.ok(bp.memoryDiagnostics().indexBytes < 80 * p.states.length * 4);
  const rows = p.rows;
  for (let id = 0; id < p.states.length; id++)
    assert.deepEqual(rows[id], p.row(id));
  assert.deepEqual(
    p.layers,
    p.layerIds.map((layer) => [...layer]),
  );
  assert.equal(bp.logBetas.length, 81);
});
test("Checkpointing bounds retained beta rows and reconstructs inspections exactly", () => {
  const graph = ContextGraph.fromSequences(["abababab"], { maxOrder: 1 }),
    p = compileProduct(graph, trueAcceptor(), { length: 80 }),
    full = new ProductBPResult(p),
    small = new ProductBPResult(p, {
      checkpointInterval: 9,
      maxCachedSamplingEdges: 0,
    });
  assert.equal(small.memoryDiagnostics().storedBackwardLayers, 10);
  assert.ok(
    small.memoryDiagnostics().backwardBytes <
      full.memoryDiagnostics().backwardBytes / 4,
  );
  const rows = small.logBetas;
  assert.deepEqual(rows, full.logBetas);
  assert.deepEqual(
    small.sampleMany(2, seededRng(4)),
    full.sampleMany(2, seededRng(4)),
  );
  assert.throws(
    () => new ProductBPResult(p, { checkpointInterval: 0 }),
    RangeError,
  );
});
test("Exact pruning removes dead branches including zero-mass and zero-length cases", () => {
  const graph = ContextGraph.fromSequences(["aaaa", "bbbb"], { maxOrder: 1 }),
    a = new DFA({
      startState: 0,
      transition: (q, s) => (s === "a" ? 1 : 2),
      accept: (q) => q === 1,
    }),
    full = runBP(graph, a, { length: 20 }),
    small = runBP(graph, a, { length: 20, pruneDeadStates: true });
  close(full.logPartitionFunction, small.logPartitionFunction);
  assert.ok(
    small.timeIndexedProductStateCount < full.timeIndexedProductStateCount,
  );
  assert.ok(small.product.edges.length < full.product.edges.length);
  assert.equal(
    runBP(graph, a, { length: 0, pruneDeadStates: true, checkpointInterval: 8 })
      .feasible,
    false,
  );
  const none = new DFA({
    startState: 0,
    transition: () => 0,
    accept: () => false,
  });
  assert.equal(
    runBP(graph, none, {
      length: 12,
      pruneDeadStates: true,
      checkpointInterval: 8,
    }).feasible,
    false,
  );
});
test("Checkpoint log inference remains stable across long underflow and extreme soft weights", () => {
  const graph = ContextGraph.fromCounts(
      [
        {
          context: [],
          counts: new Map([
            ["a", 1e-300],
            ["b", 1],
          ]),
        },
      ],
      { maxOrder: 0 },
    ),
    onlyA = new DFA({
      startState: 0,
      transition: (q, s) => (s === "a" ? 0 : null),
      accept: () => true,
    });
  const full = runBP(graph, onlyA, { length: 1200 }),
    small = runBP(graph, onlyA, {
      length: 1200,
      checkpointInterval: 17,
      pruneDeadStates: true,
      maxCachedSamplingEdges: 0,
    });
  assert.equal(small.partitionFunction, 0);
  assert.equal(small.feasible, true);
  close(small.logPartitionFunction, full.logPartitionFunction);
  assert.deepEqual(small.sample(seededRng(11)), full.sample(seededRng(11)));
  const weighted = new DFA({
    startState: 0,
    transition: () => 0,
    accept: () => true,
    weight: (q, s) => (s === "a" ? 1e300 : 1e-300),
  });
  const a = runBP(graph, weighted, { length: 20 }),
    b = runBP(graph, weighted, {
      length: 20,
      checkpointInterval: 6,
      pruneDeadStates: true,
    });
  close(a.logPartitionFunction, b.logPartitionFunction);
  assert.deepEqual(a.marginals(), b.marginals());
});
