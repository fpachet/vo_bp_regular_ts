import { parseEvent } from "./domain-utils.mjs";
const variable = (value) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x0fffffff)
    throw new RangeError("MIDI delta outside 28-bit range");
  const bytes = [value & 127];
  while ((value >>>= 7) > 0) bytes.unshift((value & 127) | 128);
  return bytes;
};
const be32 = (n) => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
/** Standard MIDI File format 0, single track, quarter-note tempo, no dependencies. */
export function melodyMidi(
  sequence,
  { bpm = 100, ticksPerQuarter = 480, unitsPerQuarter = 1 } = {},
) {
  if (
    !Number.isFinite(bpm) ||
    bpm <= 0 ||
    !Number.isInteger(ticksPerQuarter) ||
    ticksPerQuarter < 1 ||
    ticksPerQuarter > 32767 ||
    !Number.isInteger(unitsPerQuarter) ||
    unitsPerQuarter < 1
  )
    throw new RangeError("Invalid MIDI timing");
  const tempo = Math.round(60000000 / bpm);
  if (tempo < 1 || tempo > 0xffffff)
    throw new RangeError("MIDI tempo outside 24-bit range");
  const track = [
    0,
    0xff,
    0x51,
    3,
    (tempo >>> 16) & 255,
    (tempo >>> 8) & 255,
    tempo & 255,
  ];
  for (const token of sequence) {
    const event =
      typeof token === "number"
        ? { pitch: token, duration: 1 }
        : parseEvent(token);
    if (event.pitch === null) continue;
    if (!Number.isInteger(event.pitch) || event.pitch < 0 || event.pitch > 127)
      throw new RangeError("Invalid MIDI pitch");
    const ticks = (event.duration * ticksPerQuarter) / unitsPerQuarter;
    if (!Number.isInteger(ticks))
      throw new RangeError(
        "Duration cannot be represented at this MIDI resolution",
      );
    track.push(
      0,
      0x90,
      event.pitch,
      90,
      ...variable(ticks),
      0x80,
      event.pitch,
      0,
    );
  }
  track.push(0, 0xff, 0x2f, 0);
  return Uint8Array.from([
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    (ticksPerQuarter >>> 8) & 255,
    ticksPerQuarter & 255,
    0x4d,
    0x54,
    0x72,
    0x6b,
    ...be32(track.length),
    ...track,
  ]);
}
