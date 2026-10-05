import { datasets, alice } from "../examples/datasets.mjs";
export const workloads = [
  {
    name: "toy",
    sequences: datasets.toy.sequences,
    order: 2,
    length: 32,
    forbidden: [..."BRA"],
  },
  {
    name: "text",
    sequences: [[...alice]],
    order: 3,
    length: 120,
    forbidden: [..."Alice"],
  },
  {
    name: "melody",
    sequences: datasets.melody.sequences,
    order: 2,
    length: 64,
    forbidden: [60, 62, 64],
  },
  {
    name: "synthetic",
    sequences: Array.from({ length: 100 }, (_, j) =>
      Array.from({ length: 100 }, (_, i) =>
        String((i * i + 13 * j + 7 * i * j) % 11),
      ),
    ),
    order: 3,
    length: 80,
    forbidden: ["0", "1", "2"],
  },
];
