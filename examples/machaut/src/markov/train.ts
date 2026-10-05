import { ContextGraph } from "markov-constraints";
import { tokens, intervals, type Melody, type Representation } from "../music";
export interface ModelOptions {
  representation: Representation;
  maxOrder: number;
  backoffWeight: number;
  rhythm?: "quarter" | "corpus";
  includeIntervalAnchor?: boolean;
  metricalStrength?: number;
}
export interface MusicToken {
  pitch: number;
  duration: number;
  anchor?: boolean;
}
export function train(corpus: Melody[], options: ModelOptions) {
  if (!corpus.length) throw new Error("Select at least one corpus piece");
  if (
    !Number.isInteger(options.maxOrder) ||
    options.maxOrder < 1 ||
    options.maxOrder > 10 ||
    !Number.isFinite(options.backoffWeight) ||
    options.backoffWeight < 0 ||
    options.backoffWeight > 1
  )
    throw new Error("Invalid model parameters");
  if (options.rhythm && !["quarter", "corpus"].includes(options.rhythm))
    throw new Error("Unknown rhythm mode");
  if (
    !Number.isFinite(options.metricalStrength ?? 0) ||
    (options.metricalStrength ?? 0) < 0 ||
    (options.metricalStrength ?? 0) > 3
  )
    throw new Error("Metrical strength must be between 0 and 3");
  const rhythmic = options.rhythm === "corpus";
  const tokenTable: MusicToken[] = [];
  const tokenIds = new Map<string, number>();
  const sequences = corpus.map((m) => {
    const includeAnchor =
      rhythmic &&
      options.representation === "intervals" &&
      options.includeIntervalAnchor;
    const pitches = tokens(m, options.representation);
    if (includeAnchor) pitches.unshift(0);
    return pitches.map((pitch, i) => {
      if (!rhythmic) return pitch;
      const anchor = !!includeAnchor && i === 0;
      const index =
        i + (options.representation === "intervals" && !includeAnchor ? 1 : 0);
      const duration = rhythmicDuration(m, index);
      const key = `${anchor ? "anchor" : pitch}:${duration}`;
      let id = tokenIds.get(key);
      if (id === undefined) {
        id = tokenTable.length;
        tokenIds.set(key, id);
        tokenTable.push({
          pitch,
          duration,
          ...(anchor ? { anchor: true } : {}),
        });
      }
      return id;
    });
  });
  const decode = (symbol: number): MusicToken =>
    rhythmic ? tokenTable[symbol] : { pitch: symbol, duration: 1 };
  const graph = ContextGraph.fromBackoffSequences<number>(sequences, {
    maxOrder: options.maxOrder,
    backoffWeight: options.backoffWeight,
  });
  return {
    graph,
    sequences,
    options,
    decode,
    tokenTable,
    anchorDurations: corpus.map((m) => (rhythmic ? rhythmicDuration(m, 0) : 1)),
    stats: {
      pieces: corpus.length,
      notes: corpus.reduce((s, m) => s + m.notes.length, 0),
      vocabulary: graph.alphabet.length,
      durations: [
        ...new Set(
          corpus.flatMap((m) =>
            m.notes.map((_, i) => (rhythmic ? rhythmicDuration(m, i) : 1)),
          ),
        ),
      ].sort((a, b) => a - b),
      intervalVocabulary: [
        ...new Set(corpus.flatMap((m) => intervals(m.notes))),
      ].sort((a, b) => a - b),
      contexts: graph.stateCount,
      edges: graph.edgeCount,
      averageRange:
        corpus.reduce(
          (s, m) =>
            s +
            Math.max(...m.notes.map((n) => n.midi)) -
            Math.min(...m.notes.map((n) => n.midi)),
          0,
        ) / corpus.length,
      ngrams: Array.from({ length: options.maxOrder }, (_, i) => {
        const n = i + 1;
        return {
          order: n,
          count: new Set(
            sequences.flatMap((xs) =>
              xs
                .slice(0, Math.max(0, xs.length - n + 1))
                .map((_, j) => JSON.stringify(xs.slice(j, j + n))),
            ),
          ).size,
        };
      }),
    },
  };
}
export type TrainedModel = ReturnType<typeof train>;
export function logSourceWeight(
  graph: ContextGraph<number>,
  sequence: number[],
): number {
  let state = graph.startState,
    log = 0;
  for (const s of sequence) {
    const e = graph.outgoing(state).find((e) => e.symbol === s);
    if (!e) return -Infinity;
    log += Math.log(e.probability);
    state = e.nextState;
  }
  return log;
}

/** Inter-onset spacing avoids modelling MIDI release articulation as rhythm.
 * The final note has no following onset, so its sounding duration is used.
 * A quarter-note unit of 0.25 is a sixteenth note; source data stays untouched. */
export function rhythmicDuration(m: Melody, index: number): number {
  const n = m.notes[index];
  const spacing = m.notes[index + 1]?.onset - n.onset;
  const duration = Number.isFinite(spacing) ? spacing : n.duration;
  return Math.max(0.25, Math.round(duration * 4) / 4);
}
