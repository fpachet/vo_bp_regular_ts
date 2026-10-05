import type { Melody } from "../music";
export function diagnostics(
  pitches: number[],
  corpus: Melody[],
  ngramOrder = 5,
) {
  const intervals = pitches.slice(1).map((p, i) => p - pitches[i]);
  let longest = 0;
  for (const melody of corpus) {
    const ref = melody.notes.map((n) => n.midi);
    let previous = new Uint16Array(ref.length + 1);
    for (const pitch of pitches) {
      const next = new Uint16Array(ref.length + 1);
      for (let j = 0; j < ref.length; j++)
        if (pitch === ref[j]) {
          next[j + 1] = previous[j] + 1;
          longest = Math.max(longest, next[j + 1]);
        }
      previous = next;
    }
  }
  const grams = new Set(
    corpus.flatMap((m) => {
      const xs = m.notes.map((n) => n.midi);
      return xs
        .slice(0, Math.max(0, xs.length - ngramOrder + 1))
        .map((_, i) => JSON.stringify(xs.slice(i, i + ngramOrder)));
    }),
  );
  return {
    averageAbsoluteInterval:
      intervals.reduce((s, n) => s + Math.abs(n), 0) /
      Math.max(1, intervals.length),
    maximumInterval: Math.max(0, ...intervals.map(Math.abs)),
    range: Math.max(...pitches) - Math.min(...pitches),
    stepwisePercent:
      (100 *
        intervals.filter((n) => Math.abs(n) > 0 && Math.abs(n) <= 2).length) /
      Math.max(1, intervals.length),
    repeatedPercent:
      (100 * intervals.filter((n) => n === 0).length) /
      Math.max(1, intervals.length),
    final: pitches.at(-1),
    ngramOrder,
    copiedNgrams: pitches
      .slice(0, Math.max(0, pitches.length - ngramOrder + 1))
      .filter((_, i) =>
        grams.has(JSON.stringify(pitches.slice(i, i + ngramOrder))),
      ).length,
    longestCopiedNotes: longest,
  };
}
