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
