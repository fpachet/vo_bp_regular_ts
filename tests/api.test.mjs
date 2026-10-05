import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ContextGraph,
  DFA,
  runBP,
  compileProduct,
  mostProbableSequence,
  seededRng,
  serializeDFA,
  deserializeDFA,
  ResourceLimitError,
  InfeasibleError,
} from "../dist/core/src/index.js";
import {
  trueAcceptor,
  allOf,
  requiredSubstringAcceptor,
  maxOrderAcceptor,
} from "../dist/constraints/src/index.js";
const corpus = ["ABRACADABRA", "BANANA", "BARBARA", "CABANA"];
test("backoff gives MAXORDER positive mass where strict model is infeasible", () => {
  const refs = ["abab"],
    a = maxOrderAcceptor(refs, 1);
  const strict = ContextGraph.fromSequences(refs, { maxOrder: 1 });
  const mixture = ContextGraph.fromBackoffSequences(refs, { maxOrder: 1 });
  assert.equal(runBP(strict, a, { length: 5 }).feasible, false);
  const bp = runBP(mixture, a, { length: 5 });
  assert.ok(bp.feasible);
  for (const xs of bp.sampleMany(50, seededRng(2))) assert.ok(a.accepts(xs));
});
test("backoff 0 equals strict observed model, including one-shot iterables", () => {
  const oneShot = (function* () {
    yield* corpus;
  })();
  const g = ContextGraph.fromBackoffSequences(oneShot, {
    maxOrder: 3,
    backoffWeight: 0,
  });
  const strict = ContextGraph.fromSequences(corpus, { maxOrder: 3 });
  for (const xs of [
    ["B", "A", "N", "A", "N", "A"],
    ["A", "B", "R", "A"],
  ])
    assert.equal(g.probability(xs), strict.probability(xs));
  assert.throws(() =>
    ContextGraph.fromBackoffSequences(corpus, {
      maxOrder: 2,
      backoffWeight: NaN,
    }),
  );
});
test("seeded RNG is repeatable with frozen known values", () => {
  const a = seededRng(123),
    b = seededRng(123);
  assert.deepEqual(
    Array.from({ length: 100 }, a),
    Array.from({ length: 100 }, b),
  );
  assert.equal(seededRng(1)(), 0.6270739405881613);
  assert.throws(() => seededRng(-1));
  assert.throws(() => seededRng(2 ** 32));
});
test("graph JSON roundtrip and snapshot independence", () => {
  const g = ContextGraph.fromBackoffSequences(corpus, { maxOrder: 2 });
  const data = g.toJSON();
  const restored = ContextGraph.fromJSON(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored.toJSON(), data);
  data.rows[0][0].probability = 0;
  assert.notEqual(g.outgoing(0)[0].probability, 0);
  const a = trueAcceptor(),
    opts = { length: 12 };
  assert.deepEqual(
    runBP(g, a, opts).sampleMany(30, seededRng(8)),
    runBP(restored, a, opts).sampleMany(30, seededRng(8)),
  );
  assert.throws(() => ContextGraph.fromJSON({ ...g.toJSON(), version: 2 }));
});
test("DFA JSON roundtrip preserves hard/weighted intersections", () => {
  const a = allOf(
    requiredSubstringAcceptor(["B", "A"]),
    new DFA({
      startState: "q",
      transition: () => "q",
      accept: () => true,
      weight: (q, s) => (s === "A" ? 0.3 : 2),
    }),
  );
  const graph = ContextGraph.fromSequences(corpus, { maxOrder: 1 });
  const data = serializeDFA(a, graph.alphabet),
    b = deserializeDFA(JSON.parse(JSON.stringify(data)));
  const opts = { length: 8 };
  const first = runBP(graph, a, opts),
    second = runBP(graph, b, opts);
  assert.equal(first.logPartitionFunction, second.logPartitionFunction);
  assert.deepEqual(
    first.sampleMany(20, seededRng(9)),
    second.sampleMany(20, seededRng(9)),
  );
  assert.throws(() =>
    deserializeDFA({
      ...data,
      transitions: [...data.transitions, data.transitions[0]],
    }),
  );
  assert.throws(
    () => serializeDFA(a, graph.alphabet, { maxStates: 1 }),
    ResourceLimitError,
  );
  const extreme = allOf(
    ...Array.from(
      { length: 3 },
      () =>
        new DFA({
          startState: 0,
          transition: () => 0,
          accept: () => true,
          weight: () => 1e-300,
        }),
    ),
  );
  assert.equal(
    runBP(
      graph,
      deserializeDFA(
        JSON.parse(JSON.stringify(serializeDFA(extreme, graph.alphabet))),
      ),
      { length: 3 },
    ).logPartitionFunction,
    runBP(graph, extreme, { length: 3 }).logPartitionFunction,
  );
});
test("start overrides choose state before emission without prefix mass", () => {
  const g = ContextGraph.fromSequences(["ababa", "acaca"], { maxOrder: 1 });
  const a = new DFA({
    startState: 0,
    transition: (q, s) => (q === 0 && s === "a" ? 1 : q === 1 ? 1 : null),
    accept: (q) => q === 1,
  });
  const opts = { length: 3, startContext: ["b"], startAcceptorState: 1 };
  const bp = runBP(g, a, opts);
  assert.ok(bp.feasible);
  assert.equal(bp.sample(() => 0)[0], "a");
  assert.ok(mostProbableSequence(g, a, opts).feasible);
  assert.throws(
    () => runBP(g, a, { length: 1, startContext: ["unknown"] }),
    /Unknown start context/,
  );
});
test("product budgets reject before runaway allocation", () => {
  const g = ContextGraph.fromSequences(corpus, { maxOrder: 2 }),
    a = trueAcceptor();
  for (const options of [
    { maxProductStates: 1 },
    { maxProductEdges: 1 },
    { maxTimeIndexedStates: 1 },
    { maxLength: 1 },
  ])
    assert.throws(
      () => compileProduct(g, a, { length: 5, ...options }),
      ResourceLimitError,
    );
  assert.throws(
    () => compileProduct(g, a, { length: 5, maxProductStates: -1 }),
    RangeError,
  );
  assert.throws(
    () =>
      runBP(
        g,
        new DFA({ startState: 0, transition: () => null, accept: () => false }),
        { length: 0 },
      ).sample(),
    InfeasibleError,
  );
});
test("bounded sampling cache preserves stream and zero-mass support", () => {
  const g = ContextGraph.fromBackoffSequences(corpus, { maxOrder: 2 });
  const a = allOf(
    requiredSubstringAcceptor(["B", "A"]),
    maxOrderAcceptor(corpus, 3),
  );
  const cached = runBP(g, a, { length: 12, maxCachedSamplingEdges: 50 }),
    uncached = runBP(g, a, { length: 12, maxCachedSamplingEdges: 0 });
  assert.deepEqual(
    cached.sampleMany(100, seededRng(27)),
    uncached.sampleMany(100, seededRng(27)),
  );
  assert.ok(cached.cachedSamplingEdgeCount <= 50);
  assert.equal(uncached.cachedSamplingEdgeCount, 0);
  const constrained = runBP(
    ContextGraph.fromSequences(["ab"], { maxOrder: 0 }),
    new DFA({
      startState: 0,
      transition: (q, s) => (s === "b" ? 1 : 2),
      accept: (q) => q === 1,
    }),
    { length: 1 },
  );
  assert.deepEqual(
    constrained.sample(() => 0),
    ["b"],
  );
  assert.throws(
    () => compileProduct(g, a, { length: 10, maxDfaTransitions: 1 }),
    ResourceLimitError,
  );
});
