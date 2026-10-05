import { runBP, seededRng, type ProductBPResult } from "markov-constraints";
import { note, type Melody } from "../music";
import { train, type ModelOptions, logSourceWeight } from "../markov/train";
import {
  musicalAcceptor,
  initialPitch,
  constraintViolations,
  type MusicalConstraints,
} from "../constraints/musical";
import { diagnostics } from "./diagnostics";
export interface GenerationOptions {
  model: ModelOptions;
  constraints: MusicalConstraints;
  seed: number;
  mode: "constrained" | "ordinary";
}
export interface NoteExplanation {
  position: number;
  pitch: number;
  context: number[];
  continuations: {
    token: number;
    pitch: number;
    sourceProbability: number;
    conditionedProbability: number;
    reason: string;
  }[];
}
function beta(
  bp: ProductBPResult<number>,
  rows: Float64Array[],
  t: number,
  id: number,
) {
  const ids = bp.product.layerIds[t];
  let lo = 0,
    hi = ids.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (ids[mid] === id) return rows[t][mid];
    if (ids[mid] < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -Infinity;
}
export function generate(corpus: Melody[], options: GenerationOptions) {
  if (
    !Number.isInteger(options.seed) ||
    options.seed < 0 ||
    options.seed > 0xffffffff
  )
    throw new Error("Seed must be an unsigned 32-bit integer");
  const began = performance.now(),
    trained = train(corpus, options.model),
    rng = seededRng(options.seed),
    c = options.constraints,
    rep = options.model.representation;
  const horizon = rep === "intervals" ? c.length - 1 : c.length;
  const dfa = musicalAcceptor(rep, c);
  let bp: ProductBPResult<number> | undefined,
    sequence: number[] = [];
  if (options.mode === "constrained") {
    bp = runBP(trained.graph, dfa, {
      length: horizon,
      maxProductStates: 150000,
      maxTimeIndexedStates: 750000,
      maxProductEdges: 3000000,
      maxDfaTransitions: 3000000,
    });
    if (!bp.feasible)
      throw new Error(
        "No melody satisfies these constraints under the model. Widen the range, simplify fixed notes/cadence, or increase backoff.",
      );
    sequence = bp.sample(rng);
  } else {
    let state = trained.graph.startState;
    for (let i = 0; i < horizon; i++) {
      const row = trained.graph.outgoing(state);
      if (!row.length)
        throw new Error("Ordinary sampling reached a source dead end");
      const u = rng();
      let sum = 0;
      const edge = row.find((e) => (sum += e.probability) > u) ?? row.at(-1)!;
      sequence.push(edge.symbol);
      state = edge.nextState;
    }
  }
  let previous = initialPitch(c);
  const pitches = rep === "intervals" ? [previous] : [];
  for (const s of sequence) {
    const p =
      rep === "intervals"
        ? previous + s
        : rep === "relative"
          ? c.referenceFinal + s
          : s;
    pitches.push(p);
    previous = p;
  }
  const notes = pitches.map((p, i) => note(p, 1, i));
  const violations = constraintViolations(pitches, c);
  if (bp && violations.length)
    throw new Error(
      "Internal constraint verification failed: " + violations.join(", "),
    );
  const explanations: NoteExplanation[] = [];
  let productId = 0,
    contextId = trained.graph.startState;
  const rows = bp?.logBetas;
  previous = initialPitch(c);
  for (let t = 0; t < sequence.length; t++) {
    const productRow = bp?.product.row(productId);
    const context = trained.graph.contexts[contextId];
    const continuations = trained.graph.outgoing(contextId).map((e) => {
      const p =
        rep === "intervals"
          ? previous + e.symbol
          : rep === "relative"
            ? c.referenceFinal + e.symbol
            : e.symbol;
      const edge = productRow?.find((edge) => edge.symbol === e.symbol);
      const future = bp && edge ? beta(bp, rows!, t + 1, edge.next) : -Infinity;
      const probability = bp
        ? edge && future !== -Infinity
          ? Math.exp(edge.logWeight + future - beta(bp, rows!, t, productId))
          : 0
        : e.probability;
      return {
        token: e.symbol,
        pitch: p,
        sourceProbability: e.probability,
        conditionedProbability: probability,
        reason: bp
          ? !edge
            ? "Rejected by immediate musical constraints"
            : future === -Infinity
              ? "No accepted future continuation"
              : "Allowed with future conditioning"
          : "Ordinary source probability",
      };
    });
    explanations.push({
      position: t + (rep === "intervals" ? 2 : 1),
      pitch: pitches[t + (rep === "intervals" ? 1 : 0)],
      context,
      continuations,
    });
    const chosen = trained.graph
      .outgoing(contextId)
      .find((e) => e.symbol === sequence[t])!;
    contextId = chosen.nextState;
    if (bp) productId = productRow!.find((e) => e.symbol === sequence[t])!.next;
    previous = pitches[t + (rep === "intervals" ? 1 : 0)];
  }
  return {
    schemaVersion: 1,
    library: { name: "markov-constraints", version: "0.4.0-rc.1" },
    model: {
      type: "variable-order-markov",
      ...options.model,
      backoffSemantics:
        "Fixed geometric mixture of observed suffix distributions, including order zero",
    },
    corpus: corpus.map((m) => ({
      id: m.id,
      sha256: m.metadata.sha256 ?? null,
      notes: m.notes.map((n) => [n.midi, n.duration, n.onset]),
      selectedVoice: m.metadata.selectedVoice,
      final: m.metadata.final,
    })),
    constraints: c,
    seed: options.seed,
    mode: options.mode,
    rhythm:
      "Equal quarter notes; source durations are preserved in corpus inspection only",
    anchor: rep === "intervals" ? initialPitch(c) : null,
    notes,
    stats: trained.stats,
    diagnostics: diagnostics(pitches, corpus, options.model.maxOrder),
    violations,
    explanations,
    logSourceWeight: logSourceWeight(trained.graph, sequence),
    logPartitionFunction: bp?.logPartitionFunction ?? null,
    logConditionalProbability: bp?.logConditionalProbability(sequence) ?? null,
    productStates: bp?.productStateCount ?? 0,
    productEdges: bp?.productEdgeCount ?? 0,
    bufferBytes: bp?.memoryDiagnostics().totalBufferBytes ?? 0,
    elapsedMs: performance.now() - began,
  };
}
export type GenerationResult = ReturnType<typeof generate>;
