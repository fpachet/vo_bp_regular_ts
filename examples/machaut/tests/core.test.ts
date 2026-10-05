import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ToneMidi from "@tonejs/midi";
import { loadMidi, midiVoices } from "../src/corpus/midi";
import { loadMusicXML } from "../src/corpus/musicxml";
import { note, tokens, type Melody, type Representation } from "../src/music";
import { train, rhythmicDuration } from "../src/markov/train";
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
test("expanded source corpus has 23 parsed voices with preserved positive timing", () => {
  const data = JSON.parse(
    readFileSync(
      new URL("../public/corpus/melodies.json", import.meta.url),
      "utf8",
    ),
  ) as Melody[];
  assert.equal(data.length, 23);
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
      new URL("../public/corpus/pilot-melodies.json", import.meta.url),
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

test("rhythm quantizes inter-onset spacing rather than MIDI release articulation", () => {
  const m: Melody = {
    id: "timing",
    metadata: { id: "timing", title: "Timing" },
    notes: [note(60, 0.83, 0), note(62, 0.49, 1), note(64, 1.49, 1.5)],
  };
  assert.deepEqual(
    m.notes.map((_, i) => rhythmicDuration(m, i)),
    [1, 0.5, 1.5],
  );
  const trained = train([m], {
    representation: "intervals",
    maxOrder: 1,
    backoffWeight: 0.25,
    rhythm: "corpus",
  });
  assert.deepEqual(trained.sequences[0].map(trained.decode), [
    { pitch: 2, duration: 0.5 },
    { pitch: 2, duration: 1.5 },
  ]);
  assert.deepEqual(trained.anchorDurations, [1]);
});
for (const rep of ["absolute", "relative", "intervals"] as const) {
  test(`${rep}: learned joint rhythm preserves constraints, timing, probabilities and exports`, () => {
    const source = JSON.parse(
      readFileSync(
        new URL("../public/corpus/pilot-melodies.json", import.meta.url),
        "utf8",
      ),
    ) as Melody[];
    const opts: GenerationOptions = {
      model: {
        representation: rep,
        rhythm: "corpus",
        maxOrder: 3,
        backoffWeight: 0.25,
      },
      seed: 12345,
      mode: "constrained",
      constraints: {
        ...c,
        length: 32,
        start: null,
        final: 74,
        referenceFinal: 74,
        minPitch: 62,
        maxPitch: 86,
        maxSpan: null,
        maxLeap: 7,
        allowedPitchClasses: [0, 2, 4, 5, 7, 9, 11],
        fixed: {},
        cadence: {
          finalPitch: 74,
          allowedPenultimateIntervals: [-2, -1, 1, 2],
        },
      },
    };
    const r = generate(source, opts);
    assert.deepEqual(generate(source, opts).notes, r.notes);
    assert.deepEqual(r.violations, []);
    assert.ok(new Set(r.notes.map((n) => n.duration)).size > 1);
    assert.ok(r.notes.every((n) => r.stats.durations.includes(n.duration)));
    for (let i = 1; i < r.notes.length; i++)
      assert.equal(
        r.notes[i].onset,
        r.notes[i - 1].onset + r.notes[i - 1].duration,
      );
    for (const ex of r.explanations) {
      assert.ok(
        Math.abs(
          ex.continuations.reduce((s, t) => s + t.conditionedProbability, 0) -
            1,
        ) < 1e-10,
      );
      const index = ex.position - 1,
        n = r.notes[index];
      const pitch =
        rep === "intervals"
          ? n.midi - r.notes[index - 1].midi
          : rep === "relative"
            ? n.midi - 74
            : n.midi;
      assert.ok(
        r.tokenTable.some(
          (t) => t.pitch === pitch && t.duration === n.duration,
        ),
      );
    }
    const xml = exportMusicXML(r.notes);
    const midi = loadMidi(exportMidi(r.notes), { id: "round", title: "Round" });
    const loaded = loadMusicXML(xml, { id: "round", title: "Round" });
    assert.deepEqual(loaded.notes, r.notes);
    assert.deepEqual(midi.notes, r.notes);
  });
}
test("dotted notation and tied segments retain original note indices", () => {
  const notes = [note(60, 1.5, 0), note(62, 5.5, 1.5), note(64, 0.25, 7)];
  const indices: (number | null)[] = [];
  const xml = exportMusicXML(notes, "Rhythm", indices);
  assert.ok(xml.includes("<type>quarter</type><dot/>"));
  assert.ok(indices.filter((i) => i === 1).length > 1);
  assert.deepEqual(
    loadMusicXML(xml, { id: "round", title: "Round" }).notes,
    notes,
  );
  assert.equal(indices.length, (xml.match(/<note>/g) ?? []).length);
});

for (const rep of ["absolute", "relative", "intervals"] as const) {
  test(`${rep}: joint rhythm retains positional repeat/cadence and ordinary sampling`, () => {
    const source = corpus.map((m) => {
      let onset = 0;
      return {
        ...m,
        notes: m.notes.map((n, i) => {
          const duration = [0.5, 1, 1.5][i % 3];
          const result = note(n.midi, duration, onset);
          onset += duration;
          return result;
        }),
      };
    });
    const opts = options(rep);
    opts.model.rhythm = "corpus";
    opts.constraints = {
      ...c,
      fixed: {},
      repeat: { from: 0, to: 5, count: 3 },
      cadence: {
        finalPitch: 60,
        lastNIntervals: [
          [-2, 0],
          [0, 0],
        ],
      },
    };
    const r = generate(source, opts);
    assert.deepEqual(r.violations, []);
    assert.ok(r.notes.every((n) => [0.5, 1, 1.5].includes(n.duration)));
    const ordinary = generate(source, { ...opts, mode: "ordinary" });
    assert.equal(ordinary.logPartitionFunction, null);
    assert.ok(ordinary.notes.every((n) => [0.5, 1, 1.5].includes(n.duration)));
  });
}

for (const rep of ["absolute", "relative", "intervals"] as const) {
  test(`${rep}: exact metered final duration is sampled, reproducible and exported unchanged`, () => {
    const source = corpus.map((m) => {
      let onset = 0;
      return {
        ...m,
        notes: m.notes.map((n, i) => {
          const duration = [0.5, 1, 2, 3][i % 4];
          const result = note(n.midi, duration, onset);
          onset += duration;
          return result;
        }),
      };
    });
    const opts = options(rep);
    opts.model = { ...opts.model, rhythm: "corpus", maxOrder: 1 };
    opts.ending = { minDuration: 2, barBeats: 4 };
    const r = generate(source, opts);
    assert.deepEqual(r.notes, r.sampledNotes);
    assert.equal(r.endingAdjustment, null);
    assert.deepEqual(r.violations, []);
    assert.deepEqual(generate(source, opts).notes, r.notes);
    const last = r.notes.at(-1)!;
    assert.ok(last.duration >= 2);
    assert.equal((last.onset + last.duration) % 4, 0);
    assert.ok(r.notes.every((n) => [0.5, 1, 2, 3].includes(n.duration)));
    for (const ex of r.explanations)
      assert.ok(
        Math.abs(
          ex.continuations.reduce((s, t) => s + t.conditionedProbability, 0) -
            1,
        ) < 1e-10,
      );
    if (rep === "intervals") {
      assert.equal(r.explanations[0].position, 1);
      assert.equal(r.anchorDurationProbability, null);
      assert.match(r.anchorDurationSemantics!, /jointly/);
    }
    const xml = exportMusicXML(r.notes);
    assert.ok(!xml.includes("<rest/>"));
    assert.deepEqual(
      loadMusicXML(xml, { id: "round", title: "Round" }).notes,
      r.notes,
    );
    assert.deepEqual(
      loadMidi(exportMidi(r.notes), { id: "round", title: "Round" }).notes,
      r.notes,
    );
  });
}
test("meter/final-position conditioning matches exhaustive weighted enumeration", () => {
  const source = [1, 2].map((duration) => ({
    ...melody(Array(8).fill(60)),
    notes: Array.from({ length: 8 }, (_, i) =>
      note(60, duration, i * duration),
    ),
  }));
  const opts = options("absolute");
  opts.model = {
    representation: "absolute",
    rhythm: "corpus",
    maxOrder: 1,
    backoffWeight: 0.25,
  };
  opts.constraints = {
    ...c,
    minPitch: 60,
    maxPitch: 60,
    maxSpan: null,
    fixed: {},
    cadence: null,
  };
  opts.ending = { minDuration: 2, barBeats: 4 };
  const t = train(source, opts.model);
  let mass = 0;
  for (let mask = 0; mask < 256; mask++) {
    const sequence = Array.from({ length: 8 }, (_, i) => (mask >> i) & 1);
    const ds = sequence.map((s) => t.decode(s).duration);
    if (ds.at(-1)! >= 2 && ds.reduce((a, b) => a + b, 0) % 4 === 0)
      mass += t.graph.probability(sequence);
  }
  const r = generate(source, opts);
  assert.ok(Math.abs(Math.exp(r.logPartitionFunction!) - mass) < 1e-12);
});
test("unsupported long quarter-note ending is infeasible; ordinary output is never extended", () => {
  const opts = options("absolute");
  opts.ending = { minDuration: 2, barBeats: 4 };
  assert.throws(() => generate(corpus, opts), /No melody/);
  const r = generate(corpus, { ...opts, mode: "ordinary" });
  assert.ok(r.notes.every((n) => n.duration === 1));
  assert.ok(r.violations.includes("final duration"));
});

test("interval opening duration participates in meter conditioning", () => {
  const source = [1, 2].map((first) => {
    let onset = 0;
    return {
      ...melody(Array(8).fill(60)),
      notes: Array.from({ length: 8 }, (_, i) => {
        const n = note(60, i === 0 ? first : 2, onset);
        onset += n.duration;
        return n;
      }),
    };
  });
  const opts = options("intervals");
  opts.model = {
    representation: "intervals",
    rhythm: "corpus",
    maxOrder: 1,
    backoffWeight: 0.25,
  };
  opts.constraints = {
    ...c,
    minPitch: 60,
    maxPitch: 60,
    maxSpan: null,
    fixed: {},
    cadence: null,
  };
  opts.ending = { minDuration: 2, barBeats: 4 };
  for (const seed of [0, 1, 2, 3]) {
    const r = generate(source, { ...opts, seed });
    assert.equal(r.notes[0].duration, 2);
    const rejected = r.explanations[0].continuations.find(
      (t) => t.duration === 1,
    );
    assert.equal(rejected?.conditionedProbability, 0);
    assert.equal(r.notes.at(-1)!.onset + r.notes.at(-1)!.duration, 16);
  }
});

test("repeat look-ahead preserves the independently enumerated language", () => {
  const constraints = {
    ...c,
    fixed: { "7": [62] },
    repeat: { from: 0, to: 5, count: 3 },
  };
  const dfa = musicalAcceptor("absolute", constraints);
  for (let code = 0; code < 3 ** 8; code++) {
    let value = code;
    const pitches = Array.from({ length: 8 }, () => {
      const p = [60, 62, 64][value % 3];
      value = Math.floor(value / 3);
      return p;
    });
    assert.equal(
      dfa.accepts(pitches),
      constraintViolations(pitches, constraints).length === 0,
    );
  }
});

test("cached generation preserves complete results and invalidates corpus/model changes", async () => {
  const { GenerationCache } = await import("../src/generation/cache");
  const cache = new GenerationCache();
  const settings = options("absolute");
  const stable = (r: ReturnType<typeof generate>) => {
    const { timings, elapsedMs, ...rest } = r;
    return rest;
  };
  assert.equal(generate(corpus, settings, cache).timings.modelReused, false);
  for (const seed of [123, 456]) {
    const changed = { ...settings, seed };
    const cached = generate(structuredClone(corpus), changed, cache);
    assert.equal(cached.timings.modelReused, true);
    assert.deepEqual(stable(cached), stable(generate(corpus, changed)));
  }
  const relaxed = { ...settings, constraints: { ...settings.constraints, maxLeap: 4 } };
  assert.equal(generate(corpus, relaxed, cache).timings.modelReused, true);
  assert.deepEqual(stable(generate(corpus, relaxed, cache)), stable(generate(corpus, relaxed)));
  const changedModel = { ...settings, model: { ...settings.model, maxOrder: 2 } };
  assert.equal(generate(corpus, changedModel, cache).timings.modelReused, false);
  const edited = structuredClone(corpus);
  edited[0].notes[0].duration = 2;
  assert.equal(generate(edited, changedModel, cache).timings.modelReused, false);
  const anchored = cache.prepare(corpus, { ...settings.model, rhythm: "corpus", representation: "intervals", includeIntervalAnchor: false });
  const next = cache.prepare(corpus, { ...settings.model, rhythm: "corpus", representation: "intervals", includeIntervalAnchor: true });
  assert.equal(anchored.reused, false);
  assert.equal(next.reused, false);
  assert.notEqual(anchored.trained, next.trained);
});
