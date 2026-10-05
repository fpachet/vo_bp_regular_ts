import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPerformance } from "../src/audio/performance";

test("performance preserves pitches, onset order and symbolic notes, with bounded articulation", () => {
  const notes = [60, 64, 62].map((midi, i) => Object.freeze({ midi, pitchClass: midi % 12, onset: i, duration: 1 }));
  const before = JSON.stringify(notes);
  const played = renderPerformance(notes, 120);
  assert.deepEqual(played.map(n => n.midi), [60, 64, 62]);
  assert.deepEqual(played.map(n => n.onset), [0, 0.5, 1]);
  assert.equal(played[0].duration, 0.48);
  assert.equal(played[2].duration, 0.575);
  assert.ok(played.every(n => n.duration > 0 && n.velocity >= 70 && n.velocity <= 77));
  assert.equal(JSON.stringify(notes), before);
  assert.deepEqual(renderPerformance(notes, 120), played);
});

test("natural performance can be disabled; tempo scales seconds and rejects invalid input", () => {
  const notes = [{ midi: 60, pitchClass: 0, onset: 2, duration: 1 }];
  assert.deepEqual(renderPerformance(notes, 60, false), [{ midi: 60, onset: 2, duration: 1, velocity: 75 }]);
  assert.deepEqual(renderPerformance([], 96), []);
  assert.throws(() => renderPerformance(notes, 0));
  assert.throws(() => renderPerformance(notes, NaN));
});

test("articulation follows instrument and beat positions, with bounded phrase breaths", () => {
  const notes = [0, 0.5, 1, 2].map(onset => ({ midi: 60, pitchClass: 0, onset, duration: 0.5 }));
  const recorder = renderPerformance(notes, 60, true, "recorder", [2]);
  const harp = renderPerformance(notes, 60, true, "orchestral_harp", [2]);
  assert.equal(recorder[0].velocity, 77);
  assert.equal(recorder[1].velocity, 71);
  assert.equal(recorder[1].duration, 0.44);
  assert.equal(harp[1].duration, 0.5);
  assert.equal(renderPerformance(notes, 60, true, "fiddle")[0].duration, 0.495);
  assert.equal(renderPerformance(notes, 60, true, "church_organ")[0].duration, 0.49);
  assert.deepEqual(renderPerformance(notes, 60, false, "choir_aahs", [2]), renderPerformance(notes, 60, false));
  const rested = structuredClone(notes);
  rested[2].onset = 1.5;
  assert.equal(renderPerformance(rested, 60, true, "recorder", [2])[1].duration, 0.48);
  assert.ok(recorder.every(n => n.duration > 0));
  assert.deepEqual(recorder.map(n => n.onset), notes.map(n => n.onset));
});
