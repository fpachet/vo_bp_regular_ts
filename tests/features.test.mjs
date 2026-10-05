import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ContextGraph,
  DFA,
  runBP,
  seededRng,
  ResourceLimitError,
} from "../dist/core/src/index.js";
import {
  forbiddenSubstringAcceptor,
  requiredSubstringAcceptor,
  suffixesAcceptor,
  maxOrderAcceptor,
  cumulativeMeterAcceptor,
  paddedDurationAcceptor,
  allOf,
  precedenceAcceptor,
  visitLimitAcceptor,
  trueAcceptor,
} from "../dist/constraints/src/index.js";
const words = (alphabet, n) =>
  n
    ? words(alphabet, n - 1).flatMap((xs) => alphabet.map((s) => [...xs, s]))
    : [[]];
const close = (x, y) =>
  assert.ok(Math.abs(x - y) < 1e-10 * Math.max(1, Math.abs(y)), `${x} != ${y}`);
test("Aho–Corasick sparse/dense agree with independent substring predicates", () => {
  let state = 12;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  for (let j = 0; j < 30; j++) {
    const patterns = Array.from({ length: 5 }, () =>
      Array.from({ length: 1 + Math.floor(rand() * 4) }, () =>
        rand() < 0.5 ? "a" : "b",
      ),
    );
    for (const options of [{}, { alphabet: ["a", "b"] }]) {
      const a = forbiddenSubstringAcceptor(patterns, options);
      for (const xs of words(["a", "b"], 6)) {
        const s = xs.join("");
        assert.equal(
          a.accepts(xs),
          !patterns.some((p) => s.includes(p.join(""))),
        );
      }
    }
  }
  const a = suffixesAcceptor([
    ["a", "b"],
    ["b", "a", "b"],
  ]);
  for (const xs of words(["a", "b"], 5))
    assert.equal(a.accepts(xs), xs.join("").endsWith("ab"));
  assert.equal(suffixesAcceptor([]).accepts([]), false);
  assert.equal(requiredSubstringAcceptor([]).accepts(["x"]), true);
  assert.equal(suffixesAcceptor([[]]).accepts(["x"]), true);
  assert.throws(
    () => forbiddenSubstringAcceptor([["a", "b"]], { maxStates: 1 }),
    ResourceLimitError,
  );
  assert.throws(
    () =>
      forbiddenSubstringAcceptor([["a"]], {
        alphabet: ["a", "b"],
        maxTransitions: 1,
      }),
    ResourceLimitError,
  );
  assert.equal(
    forbiddenSubstringAcceptor([["b", "b"]], { alphabet: ["a", "b"] }).accepts([
      "z",
    ]),
    false,
  );
});
test("cumulative cost predicate uses before-total and 1-based position", () => {
  const a = cumulativeMeterAcceptor(4, (s) => s, {
    maxCost: 6,
    acceptCosts: new Set([6]),
    predicate: (total, s, k) => k !== 2 || total === 1,
  });
  for (const xs of words([1, 2], 4))
    assert.equal(
      a.accepts(xs),
      xs.reduce((a, b) => a + b, 0) === 6 && xs[0] === 1,
    );
  assert.throws(
    () => cumulativeMeterAcceptor(1, () => 0.5).accepts([1]),
    RangeError,
  );
});
test("PAD duration semantics, zero duration and bar boundaries", () => {
  const a = paddedDurationAcceptor(4, {
    length: 4,
    padSymbol: "PAD",
    duration: (s) => (s === "short" ? 1 : 2),
  });
  assert.equal(a.accepts(["long", "long", "PAD", "PAD"]), true);
  assert.equal(a.accepts(["short", "short", "short", "short"]), true);
  assert.equal(a.accepts(["long", "PAD", "long", "PAD"]), false);
  const zero = paddedDurationAcceptor(0, {
    length: 2,
    padSymbol: "PAD",
    duration: () => 1,
  });
  assert.ok(zero.accepts(["PAD", "PAD"]));
  const bars = cumulativeMeterAcceptor(4, (s) => s, {
    maxCost: 8,
    acceptCosts: new Set([8]),
    predicate: (total, s) => (total % 4) + s <= 4,
  });
  assert.ok(bars.accepts([2, 2, 2, 2]));
  assert.equal(bars.accepts([3, 2, 1, 2]), false);
});
test("marginals and source-edge expectations equal exhaustive weighted enumeration", () => {
  const g = ContextGraph.fromBackoffSequences(["abba", "baba"], {
    maxOrder: 2,
  });
  const a = allOf(
    requiredSubstringAcceptor(["a", "b"]),
    new DFA({
      startState: 0,
      transition: () => 0,
      accept: () => true,
      weight: (q, s) => (s === "a" ? 0.2 : 2),
    }),
  );
  const bp = runBP(g, a, { length: 5 }),
    m = bp.marginals();
  const expected = Array.from({ length: 5 }, () => new Map()),
    edges = new Map();
  for (const xs of words(["a", "b"], 5)) {
    const p = bp.conditionalProbability(xs);
    if (!p) continue;
    let context = g.startState;
    for (let t = 0; t < 5; t++) {
      expected[t].set(xs[t], (expected[t].get(xs[t]) ?? 0) + p);
      const key = JSON.stringify([context, xs[t]]);
      edges.set(key, (edges.get(key) ?? 0) + p);
      context = g.outgoing(context).find((e) => e.symbol === xs[t]).nextState;
    }
  }
  for (let t = 0; t < 5; t++) {
    close(
      [...m.symbolProbabilities[t].values()].reduce((a, b) => a + b, 0),
      1,
    );
    for (const [s, p] of expected[t]) close(m.symbolProbabilities[t].get(s), p);
  }
  for (const e of m.expectedTransitions)
    close(
      e.expectedCount,
      edges.get(JSON.stringify([e.contextState, e.symbol])),
    );
  close(
    m.expectedTransitions.reduce((n, e) => n + e.expectedCount, 0),
    5,
  );
  close(
    bp.logSequenceWeight(["a", "b", "a", "b", "a"]) - bp.logPartitionFunction,
    bp.logConditionalProbability(["a", "b", "a", "b", "a"]),
  );
  assert.throws(() => bp.marginals({ maxEdgeRecords: 1 }), ResourceLimitError);
});
test("marginals stay valid at extreme weights and zero horizon", () => {
  const g = ContextGraph.fromSequences(["ab"], { maxOrder: 0 });
  for (const w of [1e-300, 1e300]) {
    const bp = runBP(
      g,
      new DFA({
        startState: 0,
        transition: () => 0,
        accept: () => true,
        weight: () => w,
      }),
      { length: 20 },
    );
    for (const row of bp.marginals().symbolProbabilities) {
      close(row.get("a"), 0.5);
      close(row.get("b"), 0.5);
    }
  }
  assert.deepEqual(runBP(g, trueAcceptor(), { length: 0 }).marginals(), {
    symbolProbabilities: [],
    expectedTransitions: [],
  });
});
test("workflow precedence and visit limits are explicit", () => {
  const a = allOf(
    precedenceAcceptor("Cart", "Checkout"),
    visitLimitAcceptor("Search", 2),
  );
  assert.ok(a.accepts(["Search", "Cart", "Checkout", "Search"]));
  assert.equal(a.accepts(["Checkout", "Cart"]), false);
  assert.equal(a.accepts(["Search", "Search", "Search"]), false);
});
