import { readFileSync } from "node:fs";
const raw = readFileSync(
  new URL("./corpora/alice.txt", import.meta.url),
  "utf8",
);
const text = raw.split(/\*\*\* START OF[^\n]*\n/)[1]?.split(/\*\*\* END OF/)[0];
if (!text) throw new Error("Missing Gutenberg corpus markers");
const pitches = readFileSync(
  new URL("./corpora/bach-pitches.txt", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ")
  .trim()
  .split(/\s+/)
  .map(Number);
let state = 12345;
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 2 ** 32;
};
const synthetic = Array.from({ length: 60 }, () =>
  Array.from({ length: 512 }, () => String(Math.floor(random() * 8))),
);
export const realisticWorkloads = [
  {
    name: "alice-full",
    sequences: [[...text]],
    order: 2,
    length: 128,
    forbidden: [..."Alice"],
  },
  {
    name: "melody-transposed",
    sequences: Array.from({ length: 12 }, (_, k) => pitches.map((p) => p + k)),
    order: 2,
    length: 128,
    forbidden: [60, 64, 67],
    backoffWeight: 0.1,
  },
  ...[64, 256].map((length) => ({
    name: `branching-${length}`,
    sequences: synthetic,
    order: 3,
    length,
    forbidden: ["0", "1", "2"],
  })),
];
