import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ToneMidi from "@tonejs/midi";
import { loadMidi, midiVoices } from "../src/corpus/midi";
import { loadMusicXML } from "../src/corpus/musicxml";
import { note, tokens, type Melody, type Representation } from "../src/music";
import { train } from "../src/markov/train";
import {
  musicalAcceptor,
  constraintViolations,
  type MusicalConstraints,
} from "../src/constraints/musical";
import { generate, type GenerationOptions } from "../src/generation/generate";
import { exportMidi, exportMusicXML } from "../src/export/formats";
import { diagnostics } from "../src/generation/diagnostics";
const melody = (pitches: number[]): Melody => ({
  id: "test",
  metadata: { id: "test", title: "Test", final: 60 },
  notes: pitches.map((p, i) => note(p, 1, i)),
});
const c: MusicalConstraints = {
  length: 8,
  start: 60,
  final: 60,
  referenceFinal: 60,
  minPitch: 60,
  maxPitch: 64,
  maxSpan: 4,
  maxLeap: 2,
  allowedPitchClasses: [0, 2, 4],
  fixed: { "4": [62] },
  forbiddenIntervals: [],
  cadence: { finalPitch: 60, allowedPenultimateIntervals: [0, 2] },
  repeat: null,
};
const corpus = [
  melody([60, 62, 64, 62, 60, 62, 60, 60]),
  melody([60, 60, 62, 62, 64, 62, 60, 60]),
];
const options = (rep: Representation): GenerationOptions => ({
  model: { representation: rep, maxOrder: 3, backoffWeight: 0.25 },
  constraints: c,
  mode: "constrained",
  seed: 123,
});
test("actual source corpus has six parsed voices with preserved positive timing", () => {
  const data = JSON.parse(
    readFileSync(
      new URL("../public/corpus/melodies.json", import.meta.url),
      "utf8",
    ),
  ) as Melody[];
  assert.equal(data.length, 6);
  for (const m of data) {
    const bytes = new Uint8Array(
      readFileSync(
        new URL(`../public/corpus/${m.metadata.file}`, import.meta.url),
      ),
    );
    const loaded = loadMidi(
      bytes,
      m.metadata,
      Number(m.metadata.selectedVoice),
    );
    assert.deepEqual(loaded.notes, m.notes);
    assert.ok(m.notes.length > 20);
  }
});
test("MIDI track selection, simultaneous notes, timing and overlapping sustain extraction", () => {
  const midi = new ToneMidi.Midi();
  midi.addTrack().addNote({ midi: 48, ticks: 0, durationTicks: 960 });
  const upper = midi.addTrack();
  upper.addNote({ midi: 72, ticks: 0, durationTicks: 960 });
  upper.addNote({ midi: 76, ticks: 0, durationTicks: 480 });
  upper.addNote({ midi: 74, ticks: 480, durationTicks: 480 });
  const m = loadMidi(midi.toArray(), { id: "poly", title: "Poly" });
  assert.equal(m.metadata.selectedVoice, 1);
  assert.deepEqual(
    m.notes.map((n) => n.midi),
    [76, 74],
  );
  assert.deepEqual(
    m.notes.map((n) => n.onset),
    [0, 1],
  );
  assert.deepEqual(
    m.notes.map((n) => n.duration),
    [1, 1],
  );
  assert.equal(midiVoices(midi.toArray()).length, 2);
});
test("training counts and geometric backoff are explicit and inspectable", () => {
  const m = melody([60, 62, 64, 60, 62, 65]);
  const t = train([m], {
    representation: "absolute",
    maxOrder: 1,
    backoffWeight: 0,
  });
  const id = t.graph.contexts.findIndex((q) => q.length === 1 && q[0] === 62);
  assert.deepEqual(
    t.graph.outgoing(id).map((e) => [e.symbol, e.probability]),
    [
      [64, 0.5],
      [65, 0.5],
    ],
  );
  const back = train([m], {
    representation: "absolute",
    maxOrder: 3,
    backoffWeight: 0.25,
  });
  assert.ok(
    back.graph
      .outgoing(
        back.graph.contexts.findIndex((q) => JSON.stringify(q) === "[60,62]"),
      )
      .some((e) => e.symbol === 60),
  );
});
for (const rep of ["absolute", "intervals", "relative"] as Representation[]) {
  test(`${rep}: generated constraints, exact reproducibility and explanation probabilities`, () => {
    for (let seed = 0; seed < 12; seed++) {
      const result = generate(corpus, { ...options(rep), seed });
      assert.deepEqual(result.violations, []);
      assert.equal(result.notes.length, 8);
      assert.deepEqual(
        generate(corpus, { ...options(rep), seed }).notes,
        result.notes,
      );
      for (const explanation of result.explanations)
        assert.ok(
          Math.abs(
            explanation.continuations.reduce(
              (s, e) => s + e.conditionedProbability,
              0,
            ) - 1,
          ) < 1e-10,
        );
    }
  });
  test(`${rep}: exact repeated opening and explicit interval cadence`, () => {
    const constraints = {
      ...c,
      fixed: {},
      repeat: { from: 0, to: 6, count: 2 },
      cadence: { finalPitch: 60, lastNIntervals: [[-2, 0]] },
    };
    const result = generate(corpus, { ...options(rep), constraints });
    assert.deepEqual(
      result.notes.slice(0, 2).map((n) => n.midi),
      result.notes.slice(6).map((n) => n.midi),
    );
    assert.deepEqual(
      result.notes
        .slice(-3)
        .map((n, i, a) => (i ? n.midi - a[i - 1].midi : 0))
        .slice(1),
      [-2, 0],
    );
  });
}
test("acceptor matches independent melody checks under exhaustive tiny enumeration", () => {
  const constraints = {
    ...c,
    fixed: {},
    repeat: { from: 0, to: 6, count: 2 },
    cadence: null,
  };
  const dfa = musicalAcceptor("absolute", constraints);
  for (let mask = 0; mask < 3 ** 8; mask++) {
    let m = mask;
    const xs = Array.from({ length: 8 }, () => {
      const v = [60, 62, 64][m % 3];
      m = Math.floor(m / 3);
      return v;
    });
    let q = dfa.startState;
    let rejected = false;
    for (const x of xs) {
      const next = dfa.nextState(q, x);
      if (next === null) {
        rejected = true;
        break;
      }
      q = next;
    }
    assert.equal(
      !rejected && dfa.isAccepting(q),
      constraintViolations(xs, constraints).length === 0,
    );
  }
});
test("infeasible constraints are reported, ordinary mode does not silently enforce them", () => {
  assert.throws(
    () =>
      generate(corpus, {
        ...options("absolute"),
        constraints: { ...c, final: 61 },
      }),
    /No melody/,
  );
  const ordinary = generate(corpus, {
    ...options("absolute"),
    mode: "ordinary",
    constraints: { ...c, final: 61 },
  });
  assert.ok(ordinary.violations.includes("final"));
});
test("MIDI and MusicXML round-trip pitch, rests, long tied notes and fractional durations", () => {
  const notes = [note(60, 5.5, 0), note(63, 0.5, 6), note(74, 1, 6.5)];
  const m = { id: "rt", title: "A & B <C>" };
  for (const restored of [
    loadMidi(exportMidi(notes, 110), m),
    loadMusicXML(exportMusicXML(notes, m.title), m),
  ]) {
    assert.equal(restored.notes.length, notes.length);
    for (let i = 0; i < notes.length; i++) {
      assert.equal(restored.notes[i].midi, notes[i].midi);
      assert.ok(
        Math.abs(restored.notes[i].duration - notes[i].duration) < 1 / 480,
      );
      assert.ok(Math.abs(restored.notes[i].onset - notes[i].onset) < 1 / 480);
    }
  }
});
test("copy diagnostics never join separate source pieces", () => {
  assert.equal(
    diagnostics([60, 62, 64, 65], [melody([60, 62]), melody([64, 65])], 2)
      .longestCopiedNotes,
    2,
  );
});

test("compact acceptor preserves pre-optimization partitions and exact seeded corpus samples", () => {
  const before = JSON.parse(
    readFileSync(new URL("../benchmark-before.json", import.meta.url), "utf8"),
  );
  const real = JSON.parse(
    readFileSync(
      new URL("../public/corpus/melodies.json", import.meta.url),
      "utf8",
    ),
  ) as Melody[];
  for (const row of before.rows) {
    const r = generate(real, {
      model: {
        representation: row.representation,
        maxOrder: 5,
        backoffWeight: 0.25,
      },
      constraints: before.constraints,
      seed: 12345,
      mode: "constrained",
    });
    assert.deepEqual(r.notes, row.notes);
    assert.ok(
      Math.abs(r.logPartitionFunction! - row.logPartitionFunction) < 1e-10,
    );
    assert.ok(r.productStates < row.productStates / 10);
  }
  const long = generate(real, {
    model: { representation: "intervals", maxOrder: 5, backoffWeight: 0.25 },
    constraints: { ...before.constraints, length: 128 },
    seed: 12345,
    mode: "constrained",
  });
  assert.equal(long.notes.length, 128);
  assert.deepEqual(long.violations, []);
});
test("span, signed forbidden intervals and earlier versus terminal constraints combine", () => {
  for (const representation of [
    "absolute",
    "intervals",
    "relative",
  ] as Representation[]) {
    const constraints = {
      ...c,
      maxSpan: 2,
      forbiddenIntervals: [-2],
      fixed: { "3": [60], "8": [60] },
      cadence: null,
    };
    const r = generate(corpus, { ...options(representation), constraints });
    assert.deepEqual(r.violations, []);
    assert.ok(r.notes.every((n) => n.midi === 60));
  }
});

test("unseen start context falls back to observed suffix distributions in the published engine", async () => {
  const { ContextGraph } = await import("markov-constraints");
  const graph = ContextGraph.fromBackoffSequences<number>(
    [[60, 62, 64, 60, 62, 65]],
    { maxOrder: 3, backoffWeight: 0.25, startState: [61, 60, 62] },
  );
  const row = graph.outgoing(graph.startState);
  assert.ok(row.some((e) => e.symbol === 64));
  assert.ok(row.some((e) => e.symbol === 65));
  assert.ok(Math.abs(row.reduce((s, e) => s + e.probability, 0) - 1) < 1e-10);
});
