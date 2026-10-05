import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DFA, runBP } from "markov-constraints";
import { note, type Melody } from "../src/music";
import { train } from "../src/markov/train";
import { learnMeter } from "../src/markov/meter";
import {
  annotatePhraseEnds,
  estimateFinalRhythm,
  learnPhraseDurations,
  phraseWeight,
  withPhraseEnding,
  END_TOKEN,
} from "../src/markov/phrases";
const corpus: Melody[] = [1, 2].map((d) => ({
  id: String(d),
  metadata: { id: String(d), title: "Toy" },
  notes: [note(60, 0.25, 0), note(62, d, 2), note(60, 3, 2 + d)],
}));
test("expanded sources retain SHA256, original timing, meter evidence and bounded phrase candidates", () => {
  const ms = JSON.parse(
    readFileSync(
      new URL("../public/corpus/melodies.json", import.meta.url),
      "utf8",
    ),
  ) as Melody[];
  assert.equal(ms.length, 23);
  assert.equal(
    ms.reduce((s, m) => s + m.notes.length, 0),
    2879,
  );
  for (const m of ms) {
    const bytes = readFileSync(
      new URL("../public/corpus/" + m.metadata.file, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      m.metadata.sha256,
    );
    assert.deepEqual(m.metadata.phraseEnds, annotatePhraseEnds(m));
    assert.equal(m.metadata.meter?.pickupBeats, null);
    assert.deepEqual(m.metadata.finalRhythm, estimateFinalRhythm(m));
  }
  assert.equal(ms.filter((m) => m.metadata.pilot).length, 6);
  assert.deepEqual(learnMeter(ms).excludedPieces.sort(), ["virel4", "virel5"]);
});
test("silence candidates and repeated literal cadence endings are deduplicated without fabricating labels", () => {
  const m = corpus[0];
  assert.equal(annotatePhraseEnds(m)[0].note, 1);
  const repeated: Melody = {
    ...m,
    notes: [...m.notes, ...m.notes.map((n) => ({ ...n, onset: n.onset + 10 }))],
  };
  const p = learnPhraseDurations([repeated, repeated]);
  assert.ok(p.duplicatesRemoved >= 1);
  assert.equal(p.terminal.observations, 1);
  for (const kind of ["terminal", "internal"] as const) {
    assert.ok(p[kind].probabilities.every((x) => x > 0));
    assert.ok(
      Math.abs(p[kind].probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-12,
    );
  }
});
test("EOF and positional phrase weights match exhaustive enumeration including empty-context fallbacks", () => {
  const t = train(corpus, {
    representation: "absolute",
    rhythm: "corpus",
    maxOrder: 1,
    backoffWeight: 0.25,
  });
  const p = learnPhraseDurations(corpus),
    length = 3,
    positions = [2];
  const wrapped = withPhraseEnding(
    t.graph,
    new DFA<number>({ startState: 0, transition: () => 0, accept: () => true }),
    t.decode,
    p,
    1,
    positions,
  );
  const bp = runBP(wrapped.graph, wrapped.dfa, { length: length + 1 });
  let mass = 0;
  const paths: { seq: number[]; w: number }[] = [];
  function visit(seq: number[], q: number, w: number) {
    if (seq.length === length) {
      const final =
        w * phraseWeight(p, t.decode(seq.at(-1)!).duration, "terminal", 1);
      mass += final;
      paths.push({ seq, w: final });
      return;
    }
    for (const e of t.graph.outgoing(q))
      visit(
        [...seq, e.symbol],
        e.nextState,
        w *
          e.probability *
          (seq.length === 1
            ? phraseWeight(p, t.decode(e.symbol).duration, "internal", 1)
            : 1),
      );
  }
  visit([], t.graph.startState, 1);
  const z =
    bp.logPartitionFunction + (length + 1) * Math.log(2) + wrapped.logScale;
  assert.ok(Math.abs(Math.exp(z) - mass) < 1e-11);
  for (const path of paths)
    assert.ok(
      Math.abs(
        Math.exp(bp.logConditionalProbability([...path.seq, END_TOKEN])) -
          path.w / mass,
      ) < 1e-11,
    );
});

test("EOF release estimates use local evidence and preserve raw MIDI durations", async () => {
  const { estimateFinalRhythm } = await import("../src/markov/phrases");
  const m: Melody = {
    id: "gate",
    metadata: { id: "gate", title: "Gate" },
    notes: [note(60, 1.75, 0), note(62, 1.75, 2), note(60, 1.75, 4)],
  };
  const estimate = estimateFinalRhythm(m);
  assert.equal(estimate.duration, 2);
  assert.equal(estimate.releaseGap, 0.25);
  assert.equal(estimate.observations, 2);
  assert.equal(m.notes[2].duration, 1.75);
  assert.equal(
    estimateFinalRhythm({ ...m, notes: [note(60, 1.75, 0)] }).releaseGap,
    0,
  );
});
test("generation applies EOF and internal weights jointly and reports a reproducible normalized score", async () => {
  const { generate } = await import("../src/generation/generate");
  const constraints = {
    length: 8,
    start: 60,
    final: 60,
    referenceFinal: 60,
    minPitch: 60,
    maxPitch: 62,
    maxSpan: null,
    maxLeap: 2,
    allowedPitchClasses: [0, 2],
    fixed: {},
    forbiddenIntervals: [],
    cadence: null,
    repeat: null,
  };
  const options = {
    model: {
      representation: "absolute" as const,
      rhythm: "corpus" as const,
      maxOrder: 1,
      backoffWeight: 0.25,
      metricalStrength: 1,
      phraseEndStrength: 1,
    },
    constraints,
    phraseEndPositions: [4],
    seed: 123,
    mode: "constrained" as const,
  };
  const r = generate(corpus, options);
  assert.equal(r.notes.length, 8);
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.notes, r.sampledNotes);
  assert.deepEqual(r.notes, generate(corpus, options).notes);
  assert.ok(
    Math.abs(
      r.logConditionalProbability! -
        (r.logSourceWeight +
          r.logMetricalWeight +
          r.logPhraseEndingWeight -
          r.logPartitionFunction!),
    ) < 1e-10,
  );
  assert.ok(
    r.explanations[3].continuations.some((c) => c.phraseEndingWeight !== 1),
  );
  assert.ok(
    r.explanations[7].continuations.some((c) => c.phraseEndingWeight !== 1),
  );
  for (const position of [0, 8, -1])
    assert.throws(
      () => generate(corpus, { ...options, phraseEndPositions: [position] }),
      /Phrase-end positions/,
    );
  const ordinary = generate(corpus, {
    ...options,
    model: {
      ...options.model,
      representation: "intervals",
      metricalStrength: 0,
    },
    mode: "ordinary",
  });
  assert.equal(ordinary.notes.length, 8);
  assert.equal(ordinary.model.includeIntervalAnchor, true);
});
