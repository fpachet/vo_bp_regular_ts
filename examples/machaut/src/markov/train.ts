import { ContextGraph } from "markov-constraints";
import { tokens, intervals, type Melody, type Representation } from "../music";
export interface ModelOptions {
  representation: Representation;
  maxOrder: number;
  backoffWeight: number;
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
  const sequences = corpus.map((m) => tokens(m, options.representation));
  const graph = ContextGraph.fromBackoffSequences<number>(sequences, {
    maxOrder: options.maxOrder,
    backoffWeight: options.backoffWeight,
  });
  return {
    graph,
    sequences,
    options,
    stats: {
      pieces: corpus.length,
      notes: corpus.reduce((s, m) => s + m.notes.length, 0),
      vocabulary: graph.alphabet.length,
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
