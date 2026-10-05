import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenizeWords,
  longestCopiedRun,
  parseEvent,
} from "../examples/domain-utils.mjs";
import { melodyMidi } from "../examples/midi.mjs";
test("Unicode word tokens and copying do not cross training boundaries", () => {
  assert.deepEqual(tokenizeWords("Alice's café, 12!"), [
    "Alice's",
    "café",
    ",",
    "12",
    "!",
  ]);
  assert.equal(
    longestCopiedRun(
      ["b", "c"],
      [
        ["a", "b"],
        ["c", "d"],
      ],
    ),
    1,
  );
  assert.equal(longestCopiedRun(["x", "a", "b", "c"], [["a", "b", "c"]]), 3);
  assert.deepEqual(parseEvent("60:2"), { pitch: 60, duration: 2 });
});
test("MIDI parser verifies pitches, duration, tempo and end marker", () => {
  const bytes = melodyMidi(["60:1", "64:2", "PAD"]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), "MThd");
  assert.equal(view.getUint16(12), 480);
  assert.equal(view.getUint32(18), bytes.length - 22);
  let at = 22,
    time = 0,
    notes = [],
    tempo;
  const variable = () => {
    let n = 0,
      b;
    do {
      b = bytes[at++];
      n = (n << 7) | (b & 127);
    } while (b & 128);
    return n;
  };
  let ended = false;
  while (at < bytes.length) {
    time += variable();
    const status = bytes[at++];
    if (status === 255) {
      const type = bytes[at++],
        length = variable();
      if (type === 81)
        tempo = bytes[at] * 65536 + bytes[at + 1] * 256 + bytes[at + 2];
      if (type === 47) ended = true;
      at += length;
    } else {
      const pitch = bytes[at++],
        velocity = bytes[at++];
      notes.push({ status, pitch, velocity, time });
    }
  }
  assert.equal(tempo, 600000);
  assert.deepEqual(
    notes.map((n) => [n.status, n.pitch, n.time]),
    [
      [144, 60, 0],
      [128, 60, 480],
      [144, 64, 480],
      [128, 64, 1440],
    ],
  );
  assert.equal(ended, true);
});
