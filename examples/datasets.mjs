// Text excerpt: Lewis Carroll, Alice's Adventures in Wonderland (1865), chapter I.
export const alice =
  "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, and what is the use of a book, thought Alice, without pictures or conversation?";
export const datasets = {
  toy: {
    sequences: ["ABRACADABRA", "BANANA", "BARBARA", "CABANA"].map((s) => [
      ...s,
    ]),
    maxOrder: 2,
    length: 12,
    prefix: ["B"],
    suffix: ["A"],
    forbidden: ["BRA"],
  },
  text: {
    sequences: [[...alice]],
    maxOrder: 1,
    length: 80,
    prefix: ["A"],
    suffix: ["?"],
    copyLimit: 4,
  },
  melody: {
    sequences: [
      [60, 62, 64, 65, 67, 65, 64, 62, 60],
      [60, 64, 67, 69, 67, 64, 62, 60],
    ],
    maxOrder: 1,
    length: 16,
    prefix: [60],
    suffix: [60],
  },
  dna: {
    sequences: [
      "ATGACGTTACGATGCGTTAACGTAGCTGA",
      "ATGCCGATACGTTAGGATGACTAA",
    ].map((s) => [...s]),
    maxOrder: 1,
    length: 24,
    prefix: [..."ATG"],
    suffix: [..."TAA"],
    forbidden: ["GAATTC"],
  },
  journeys: {
    sequences: [
      ["Home", "Search", "Product", "Cart", "Checkout", "Purchase"],
      ["Home", "Product", "Search", "Product", "Cart", "Checkout", "Purchase"],
      ["Home", "Search", "Home", "Product", "Cart", "Checkout", "Purchase"],
    ],
    maxOrder: 1,
    length: 8,
    prefix: ["Home"],
    suffix: ["Purchase"],
    required: ["Cart"],
  },
};

export const melodyEvents=[
 ['60:1','62:1','64:2','65:1','67:1','65:2','64:1','62:1','60:2','PAD','PAD','PAD'],
 ['60:1','64:1','67:2','69:1','67:1','64:2','62:1','60:1','60:2','PAD','PAD','PAD']
];
