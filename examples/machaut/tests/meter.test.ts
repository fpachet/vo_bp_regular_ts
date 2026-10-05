import test from "node:test";
import assert from "node:assert/strict";
import { DFA, runBP } from "markov-constraints";
import { note, type Melody } from "../src/music";
import { train } from "../src/markov/train";
import { learnMeter, meterWeight } from "../src/markov/meter";
import { meteredAcceptor } from "../src/generation/ending";
import { generate } from "../src/generation/generate";
const corpus: Melody[] = [1, 2, 3].map((v) => ({
  id: String(v),
  metadata: { id: String(v), title: "Toy" },
  notes: [note(60, v, 0), note(60, 4 - v, v), note(60, 4, 4)],
}));
const model = {
  representation: "absolute" as const,
  rhythm: "corpus" as const,
  maxOrder: 1,
  backoffWeight: 0.25,
};
test("phase priors normalize, smooth unseen phases and reproduce the marginal at missing phases", () => {
  const p = learnMeter(corpus);
  for (const row of p.phases) {
    assert.ok(
      Math.abs(row.probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-12,
    );
    assert.ok(row.probabilities.every((x) => x > 0));
    if (!row.observations)
      p.durations.forEach((d) =>
        assert.ok(Math.abs(meterWeight(p, row.phase * 4, d, 1) - 1) < 1e-12),
      );
  }
  assert.equal(meterWeight(p, 0, 1, 0), 1);
});
test("soft meter with hard ending matches exhaustive sequence weights and conditional probabilities", () => {
  const t = train(corpus, model),
    p = learnMeter(corpus);
  const acceptor = meteredAcceptor(
    new DFA<number>({ startState: 0, transition: () => 0, accept: () => true }),
    t.decode,
    { minDuration: 2, barBeats: 4 },
    false,
    p,
    1,
  );
  const bp = runBP(t.graph, acceptor, { length: 3 });
  let mass = 0;
  const accepted: { seq: number[]; weight: number }[] = [];
  function visit(
    seq: number[],
    context: number,
    onset: number,
    weight: number,
  ) {
    if (seq.length === 3) {
      if (onset % 4 === 0 && t.decode(seq.at(-1)!).duration >= 2) {
        mass += weight;
        accepted.push({ seq, weight });
      }
      return;
    }
    for (const e of t.graph.outgoing(context)) {
      const d = t.decode(e.symbol).duration;
      visit(
        [...seq, e.symbol],
        e.nextState,
        onset + d,
        weight * e.probability * meterWeight(p, (onset * 4) % 16, d, 1),
      );
    }
  }
  visit([], t.graph.startState, 0, 1);
  assert.ok(Math.abs(Math.exp(bp.logPartitionFunction) - mass) < 1e-12);
  for (const x of accepted)
    assert.ok(
      Math.abs(
        Math.exp(bp.logConditionalProbability(x.seq)) - x.weight / mass,
      ) < 1e-12,
    );
});
test("ordinary soft meter ignores hard rules, includes the interval anchor and exports the weight decomposition", () => {
  const opts = {
    model: {
      ...model,
      representation: "intervals" as const,
      metricalStrength: 1,
    },
    constraints: {
      length: 8,
      start: 60,
      final: 64,
      referenceFinal: 60,
      minPitch: 60,
      maxPitch: 64,
      maxSpan: null,
      maxLeap: 7,
      allowedPitchClasses: [0, 4],
      fixed: {},
      forbiddenIntervals: [],
      cadence: null,
      repeat: null,
    },
    ending: { minDuration: 2, barBeats: 4 },
    seed: 123,
    mode: "ordinary" as const,
  };
  const r = generate(corpus, opts);
  assert.equal(r.notes.length, 8);
  assert.ok(r.violations.includes("final"));
  assert.equal(r.explanations.length, 8);
  assert.equal(r.model.includeIntervalAnchor, true);
  assert.ok(
    Math.abs(
      r.logConditionalProbability! -
        (r.logSourceWeight + r.logMetricalWeight - r.logPartitionFunction!),
    ) < 1e-10,
  );
  assert.deepEqual(r.notes, generate(corpus, opts).notes);
  assert.deepEqual(r.notes, r.sampledNotes);
});
test("zero strength preserves existing sequence and weights, invalid strength is rejected", () => {
  const constraints = {
    length: 8,
    start: 60,
    final: 60,
    referenceFinal: 60,
    minPitch: 60,
    maxPitch: 60,
    maxSpan: null,
    maxLeap: 7,
    allowedPitchClasses: [0],
    fixed: {},
    forbiddenIntervals: [],
    cadence: null,
    repeat: null,
  };
  const opts = { model, constraints, seed: 123, mode: "constrained" as const };
  assert.deepEqual(
    generate(corpus, opts).notes,
    generate(corpus, { ...opts, model: { ...model, metricalStrength: 0 } })
      .notes,
  );
  for (const strength of [-1, 4, NaN])
    assert.throws(
      () => train(corpus, { ...model, metricalStrength: strength }),
      /Metrical strength/,
    );
});
