import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ContextGraph,
  DFA,
  runBP,
  mostProbableSequence,
} from "../dist/core/src/index.js";
import * as C from "../dist/constraints/src/index.js";
const close = (a, b, tol = 1e-10) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const iid = () =>
  ContextGraph.fromCounts(
    [
      {
        context: [],
        counts: new Map([
          ["a", 1],
          ["b", 1],
        ]),
      },
    ],
    { maxOrder: 0 },
  );
const fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/python-golden.json", import.meta.url)),
);
for (const f of fixtures.cases)
  test(`Python golden: ${f.name}`, () => {
    const graph = new ContextGraph(
      f.contexts,
      f.rows,
      f.startState,
      f.maxOrder,
    );
    const a = new DFA({
      startState: 0,
      transition: (q, s) => f.dfa.transitions[q][s] ?? null,
      accept: (q) => f.dfa.accepting[q],
      weight: (q, s) => f.dfa.weights[q][s] ?? 1,
    });
    const bp = runBP(graph, a, { length: f.length });
    close(bp.partitionFunction, f.partition);
    assert.equal(
      bp.logPartitionFunction === -Infinity,
      f.logPartition === null,
    );
    if (f.logPartition !== null) close(bp.logPartitionFunction, f.logPartition);
    const best = mostProbableSequence(graph, a, { length: f.length });
    assert.equal(best.feasible, f.best.feasible);
    assert.deepEqual(best.sequence, f.best.sequence);
    if (best.feasible) close(best.logWeight, f.best.logWeight);
    assert.equal(bp.productEdgeCount, f.productEdgeCount);
    assert.equal(bp.productStateCount, f.productStateCount);
    for (const x of f.accepted)
      close(bp.conditionalProbability(x.sequence), x.conditional);
    if (f.exhaustive && bp.feasible) {
      const expected = new Map(
        f.accepted.map((x) => [JSON.stringify(x.sequence), x.conditional]),
      );
      let words = [[]];
      for (let i = 0; i < f.length; i++)
        words = words.flatMap((xs) => f.alphabet.map((s) => [...xs, s]));
      for (const xs of words)
        close(
          bp.conditionalProbability(xs),
          expected.get(JSON.stringify(xs)) ?? 0,
        );
    }
    if (bp.feasible) {
      for (const xs of bp.sampleMany(30)) {
        assert.ok(a.accepts(xs));
        assert.ok(bp.conditionalProbability(xs) > 0);
      }
    } else {
      assert.throws(() => bp.sample(), /zero mass/);
      assert.throws(() => bp.conditionalProbability([]), /zero mass/);
    }
  });
test("training graph matches every Python row", () => {
  const f = fixtures.cases.find((f) => f.name === "trained-forbidden");
  const g = ContextGraph.fromSequences(
    ["ABRACADABRA", "BANANA", "BARBARA", "CABANA"],
    { maxOrder: 2 },
  );
  assert.equal(g.stateCount, f.contexts.length);
  for (let i = 0; i < f.contexts.length; i++) {
    const j = g.contexts.findIndex(
      (c) => JSON.stringify(c) === JSON.stringify(f.contexts[i]),
    );
    assert.ok(j >= 0);
    const actual = g.outgoing(j);
    assert.equal(actual.length, f.rows[i].length);
    for (const e of f.rows[i]) {
      const edge = actual.find((x) => x.symbol === e.symbol);
      close(edge.probability, e.probability);
      assert.deepEqual(g.contexts[edge.nextState], f.contexts[e.nextState]);
    }
  }
});
function words(n) {
  return n === 0
    ? [[]]
    : words(n - 1).flatMap((x) => ["a", "b"].map((s) => [...x, s]));
}
test("builders independently enumerated including overlaps", () => {
  const n = 6;
  const tests = [
    [C.prefixAcceptor(["a", "b"]), (s) => s.startsWith("ab")],
    [C.suffixAcceptor(["a", "b", "a"]), (s) => s.endsWith("aba")],
    [C.requiredSubstringAcceptor(["a", "b", "a"]), (s) => s.includes("aba")],
    [
      C.forbiddenSubstringAcceptor([
        ["a", "b", "a"],
        ["b", "b"],
      ]),
      (s) => !s.includes("aba") && !s.includes("bb"),
    ],
    [
      C.maxOrderAcceptor(["abba"], 1),
      (s) => !["ab", "bb", "ba"].some((p) => s.includes(p)),
    ],
    [
      C.positionalAcceptor(
        n,
        new Map([
          [1, ["a"]],
          [5, ["b"]],
        ]),
      ),
      (s) => s[1] === "a" && s[5] === "b",
    ],
    [
      C.meterAcceptor(
        Array.from({ length: n }, (_, i) => new Set([i % 2])),
        (s) => (s === "a" ? 0 : 1),
      ),
      (s) => s === "ababab",
    ],
  ];
  for (const [a, predicate] of tests) {
    const accepted = words(n).filter((xs) => predicate(xs.join("")));
    for (const xs of words(n))
      assert.equal(a.accepts(xs), predicate(xs.join("")));
    const bp = runBP(iid(), a, { length: n });
    close(bp.partitionFunction, accepted.length / 2 ** n);
    for (const xs of accepted)
      close(bp.conditionalProbability(xs), 1 / accepted.length);
  }
  const a = C.allOf(
    C.prefixAcceptor(["a"]),
    C.suffixAcceptor(["b"]),
    C.requiredSubstringAcceptor(["b", "a"]),
  );
  for (const xs of words(n)) {
    const s = xs.join("");
    assert.equal(
      a.accepts(xs),
      s.startsWith("a") && s.endsWith("b") && s.includes("ba"),
    );
  }
  assert.ok(C.requiredSubstringAcceptor([]).accepts([]));
  assert.ok(C.suffixAcceptor([]).accepts([]));
  assert.throws(() => C.forbiddenSubstringAcceptor([[]]));
});
test("stable tiny and huge weighted mass", () => {
  for (const w of [1e-300, 1e300]) {
    const a = new DFA({
      startState: 0,
      transition: () => 0,
      accept: () => true,
      weight: () => w,
    });
    const bp = runBP(iid(), a, { length: 20 });
    close(bp.logPartitionFunction, 20 * Math.log(w));
    close(bp.conditionalProbability(Array(20).fill("a")), 2 ** -20);
    assert.equal(bp.sample().length, 20);
  }
  const g = ContextGraph.fromProbabilities([
    {
      context: [],
      probabilities: new Map([
        ["a", Number.MIN_VALUE],
        ["b", 1],
      ]),
    },
  ]);
  const bp = runBP(
    g,
    new DFA({
      startState: 0,
      transition: () => 0,
      accept: () => true,
      weight: (q, s) => (s === "a" ? 0.5 : 0),
    }),
    { length: 1 },
  );
  assert.ok(bp.feasible);
  assert.deepEqual(bp.sample(), ["a"]);
});
test("sampling distribution, RNG boundaries and ties", () => {
  const g = ContextGraph.fromCounts([
    {
      context: [],
      counts: new Map([
        ["a", 3],
        ["b", 1],
      ]),
    },
  ]);
  const bp = runBP(g, C.trueAcceptor(), { length: 1 });
  let state = 9;
  const rng = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const xs = bp.sampleMany(20000, rng);
  assert.ok(
    Math.abs(xs.filter((x) => x[0] === "a").length / xs.length - 0.75) < 0.015,
  );
  assert.deepEqual(
    bp.sample(() => 0),
    ["a"],
  );
  assert.deepEqual(
    bp.sample(() => 1 - Number.EPSILON),
    ["b"],
  );
  assert.throws(() => bp.sample(() => 1));
  assert.deepEqual(
    mostProbableSequence(iid(), C.trueAcceptor(), { length: 2 }).sequence,
    ["a", "a"],
  );
});
test("validation and dead ends", () => {
  assert.throws(() => ContextGraph.fromSequences(["ab"], { maxOrder: -1 }));
  assert.throws(() => runBP(iid(), C.trueAcceptor(), { length: 1.5 }));
  assert.throws(() => C.positionalAcceptor(1, new Map([[1, ["a"]]])));
  assert.throws(() =>
    ContextGraph.fromCounts([{ context: [], counts: new Map([["a", -1]]) }]),
  );
  const g = new ContextGraph(
    [[], ["a"]],
    [[{ symbol: "a", probability: 1, nextState: 1 }], []],
  );
  assert.equal(runBP(g, C.trueAcceptor(), { length: 2 }).feasible, false);
  assert.throws(() =>
    runBP(
      iid(),
      new DFA({
        startState: 0,
        transition: () => 0,
        accept: () => true,
        weight: () => NaN,
      }),
      { length: 1 },
    ),
  );
});
test("intersection retains extreme weighted support", () => {
  for (const w of [1e-300, 1e300]) {
    const a = new DFA({
      startState: 0,
      transition: () => 0,
      accept: () => true,
      weight: () => w,
    });
    const both = C.allOf(a, a);
    const bp = runBP(iid(), both, { length: 4 });
    assert.ok(bp.feasible);
    close(bp.logPartitionFunction, 8 * Math.log(w));
    close(bp.conditionalProbability(["a", "b", "a", "b"]), 1 / 16);
    assert.equal(bp.sample().length, 4);
  }
});
test("explicit nonempty start may transition into empty dead context", () => {
  const g = ContextGraph.fromProbabilities(
    [{ context: ["a"], probabilities: new Map([["b", 1]]) }],
    { startState: ["a"] },
  );
  assert.equal(g.probability(["b"]), 1);
  assert.equal(g.probability(["b", "b"]), 0);
});
