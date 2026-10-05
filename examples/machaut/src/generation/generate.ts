import {
  DFA,
  runBP,
  seededRng,
  type ProductBPResult,
} from "markov-constraints";
import { note, pitchName, type Melody } from "../music";
import { train, type ModelOptions, logSourceWeight } from "../markov/train";
import {
  musicalAcceptor,
  initialPitch,
  constraintViolations,
  type MusicalConstraints,
} from "../constraints/musical";
import { diagnostics } from "./diagnostics";
import {
  meteredAcceptor,
  endingViolations,
  type EndingOptions,
} from "./ending";
import { learnMeter, meterWeight, meterSummary } from "../markov/meter";
import {
  learnPhraseDurations,
  phraseWeight,
  withPhraseEnding,
} from "../markov/phrases";
export interface GenerationOptions {
  model: ModelOptions;
  ending?: EndingOptions | null;
  phraseEndPositions?: number[];
  constraints: MusicalConstraints;
  seed: number;
  mode: "constrained" | "ordinary";
}
export interface NoteExplanation {
  position: number;
  pitch: number;
  context: number[];
  contextLabels: string[];
  duration: number;
  sampledDuration: number;
  continuations: {
    token: number;
    pitch: number;
    duration: number;
    sourceProbability: number;
    metricalWeight: number;
    phraseEndingWeight: number;
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
  const strength =
    options.model.rhythm === "corpus"
      ? (options.model.metricalStrength ?? 0)
      : 0;
  const phraseStrength =
    options.model.rhythm === "corpus"
      ? (options.model.phraseEndStrength ?? 0)
      : 0;
  const phrasePrior = phraseStrength ? learnPhraseDurations(corpus) : undefined;
  const phrasePositions = [...new Set(options.phraseEndPositions ?? [])].sort(
    (a, b) => a - b,
  );
  if (
    phrasePositions.some(
      (p) => !Number.isInteger(p) || p < 1 || p >= options.constraints.length,
    )
  )
    throw new Error(
      "Phrase-end positions must be one-based internal note positions",
    );
  const prior = strength ? learnMeter(corpus) : undefined;
  const includeAnchor =
    (strength > 0 ||
      phraseStrength > 0 ||
      (!!options.ending && options.mode === "constrained")) &&
    options.model.rhythm === "corpus" &&
    options.model.representation === "intervals";
  const effectiveModel = {
    ...options.model,
    includeIntervalAnchor: includeAnchor,
  };
  const began = performance.now(),
    trained = train(corpus, effectiveModel),
    rng = seededRng(options.seed),
    c = options.constraints,
    rep = options.model.representation;
  const horizon =
    rep === "intervals" && !includeAnchor ? c.length - 1 : c.length;
  const pitchDfa =
    options.mode === "ordinary"
      ? new DFA<number>({
          startState: 0,
          transition: () => 0,
          accept: () => true,
        })
      : musicalAcceptor(rep, c, (s) => trained.decode(s).pitch);
  const hardEnding = options.mode === "constrained" ? options.ending : null;
  const dfa =
    hardEnding || prior || phrasePrior
      ? meteredAcceptor(
          pitchDfa,
          trained.decode,
          hardEnding ?? null,
          includeAnchor,
          prior,
          strength,
        )
      : pitchDfa;
  const wrapped = phrasePrior
    ? withPhraseEnding(
        trained.graph,
        dfa,
        trained.decode,
        phrasePrior,
        phraseStrength,
        phrasePositions,
      )
    : null;
  let inferenceSequence: number[] = [];
  let bp: ProductBPResult<number> | undefined,
    sequence: number[] = [];
  if (options.mode === "constrained" || prior || phrasePrior) {
    bp = runBP(wrapped?.graph ?? trained.graph, wrapped?.dfa ?? dfa, {
      length: horizon + (wrapped ? 1 : 0),
      maxProductStates: 150000,
      maxTimeIndexedStates: 750000,
      maxProductEdges:
        options.ending || prior || phrasePrior ? 40000000 : 3000000,
      maxDfaTransitions: 3000000,
    });
    if (!bp.feasible)
      throw new Error(
        "No melody satisfies these constraints under the model. Widen the range, simplify fixed notes/cadence, relax the final duration/meter, or increase backoff.",
      );
    inferenceSequence = bp.sample(rng);
    sequence = wrapped ? inferenceSequence.slice(0, -1) : inferenceSequence;
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
  const offset = rep === "intervals" && !includeAnchor ? 1 : 0;
  const pitches = offset ? [previous] : [];
  for (const symbol of sequence) {
    const decoded = trained.decode(symbol);
    const s = decoded.pitch;
    const p = decoded.anchor
      ? initialPitch(c)
      : rep === "intervals"
        ? previous + s
        : rep === "relative"
          ? c.referenceFinal + s
          : s;
    pitches.push(p);
    previous = p;
  }
  const anchorDuration =
    options.model.rhythm === "corpus" && offset === 1
      ? trained.anchorDurations[
          Math.floor(rng() * trained.anchorDurations.length)
        ]
      : 1;
  const durations = sequence.map((s) => trained.decode(s).duration);
  if (offset) durations.unshift(anchorDuration);
  let onset = 0;
  const sampledNotes = pitches.map((p, i) => {
    const n = note(p, durations[i], onset);
    onset += n.duration;
    return n;
  });
  const notes = sampledNotes;
  const violations = [
    ...constraintViolations(pitches, c),
    ...endingViolations(notes, options.ending),
  ];
  if (options.mode === "constrained" && violations.length)
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
      const decoded = trained.decode(e.symbol);
      const p = decoded.anchor
        ? initialPitch(c)
        : rep === "intervals"
          ? previous + decoded.pitch
          : rep === "relative"
            ? c.referenceFinal + decoded.pitch
            : decoded.pitch;
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
        duration: decoded.duration,
        sourceProbability: e.probability,
        metricalWeight: prior
          ? meterWeight(
              prior,
              Math.round(notes[t + offset].onset * 4) % 16,
              decoded.duration,
              strength,
            )
          : 1,
        phraseEndingWeight:
          phrasePrior &&
          (t + offset + 1 === c.length ||
            phrasePositions.includes(t + offset + 1))
            ? phraseWeight(
                phrasePrior,
                decoded.duration,
                t + offset + 1 === c.length ? "terminal" : "internal",
                phraseStrength,
              )
            : 1,
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
      position: t + offset + 1,
      pitch: pitches[t + offset],
      context,
      duration: notes[t + offset].duration,
      sampledDuration: sampledNotes[t + offset].duration,
      contextLabels: context.map((s) => {
        const d = trained.decode(s);
        return `${d.anchor ? "anchor" : rep === "absolute" ? pitchName(d.pitch) : `${d.pitch > 0 ? "+" : ""}${d.pitch}`}${options.model.rhythm === "corpus" ? ` / ${d.duration} beats` : ""}`;
      }),
      continuations,
    });
    const chosen = trained.graph
      .outgoing(contextId)
      .find((e) => e.symbol === sequence[t])!;
    contextId = chosen.nextState;
    if (bp) productId = productRow!.find((e) => e.symbol === sequence[t])!.next;
    previous = pitches[t + offset];
  }
  return {
    schemaVersion: 1,
    library: { name: "markov-constraints", version: "0.4.0-rc.1" },
    model: {
      type: "variable-order-markov",
      ...effectiveModel,
      backoffSemantics:
        "Fixed geometric mixture of observed suffix distributions, including order zero",
    },
    corpus: corpus.map((m) => ({
      id: m.id,
      sha256: m.metadata.sha256 ?? null,
      notes: m.notes.map((n) => [n.midi, n.duration, n.onset]),
      selectedVoice: m.metadata.selectedVoice,
      final: m.metadata.final,
      meter: m.metadata.meter,
      phraseEnds: m.metadata.phraseEnds,
      finalRhythm: m.metadata.finalRhythm,
    })),
    constraints: c,
    seed: options.seed,
    mode: options.mode,
    rhythm:
      options.model.rhythm === "corpus"
        ? "Joint pitch/duration tokens; inter-onset spacing rounded to 0.25 quarter-note units; final source note uses documented release-pattern estimate when available, otherwise sounding duration; no rests generated"
        : "Equal quarter notes",
    tokenTable: trained.tokenTable,
    anchorDuration: rep === "intervals" ? notes[0].duration : null,
    anchorDurationProbability:
      rep === "intervals" && !includeAnchor
        ? trained.anchorDurations.filter((d) => d === anchorDuration).length /
          trained.anchorDurations.length
        : null,
    anchorDurationSemantics:
      rep === "intervals" && options.model.rhythm === "corpus"
        ? includeAnchor
          ? "Opening duration token participates jointly in the full melody distribution and meter"
          : "Independent empirical sample of source opening durations, after conditioned interval sampling"
        : null,
    anchor: rep === "intervals" ? initialPitch(c) : null,
    notes,
    sampledNotes,
    ending: options.ending ?? null,
    endingAdjustment: null,
    endingSemantics: options.ending
      ? options.mode === "constrained"
        ? "Joint meter and terminal-duration conditioning; no post-generation modification"
        : "Requested meter and final duration ignored in ordinary mode; violations reported"
      : null,
    phraseEndingPrior: phrasePrior ?? null,
    phraseEndPositions: phrasePositions,
    phraseEndingSemantics: phrasePrior
      ? "Joint weighted source model; smoothed EOF prior at last note and internal candidate prior at specified positions; no duration replacement"
      : null,
    metricalPrior: prior ?? null,
    metricalSummary: meterSummary(notes),
    metricalSemantics: prior
      ? "Fixed-horizon globally normalized source probability times phase/duration likelihood-ratio potentials; ordinary mode retains these soft model weights but ignores hard musical constraints"
      : null,
    stats: trained.stats,
    diagnostics: diagnostics(pitches, corpus, options.model.maxOrder),
    violations,
    explanations,
    logSourceWeight: logSourceWeight(trained.graph, sequence),
    logMetricalWeight: prior
      ? sequence.reduce(
          (sum, symbol, t) =>
            sum +
            Math.log(
              meterWeight(
                prior,
                Math.round(notes[t + offset].onset * 4) % 16,
                trained.decode(symbol).duration,
                strength,
              ),
            ),
          0,
        )
      : 0,
    logPhraseEndingWeight: phrasePrior
      ? notes.reduce(
          (sum, n, i) =>
            sum +
            (i === notes.length - 1 || phrasePositions.includes(i + 1)
              ? Math.log(
                  phraseWeight(
                    phrasePrior,
                    n.duration,
                    i === notes.length - 1 ? "terminal" : "internal",
                    phraseStrength,
                  ),
                )
              : 0),
          0,
        )
      : 0,
    logPartitionFunction: bp
      ? bp.logPartitionFunction +
        (wrapped ? (horizon + 1) * Math.log(2) + wrapped.logScale : 0)
      : null,
    logConditionalProbability:
      bp?.logConditionalProbability(inferenceSequence) ?? null,
    productStates: bp?.productStateCount ?? 0,
    productEdges: bp?.productEdgeCount ?? 0,
    bufferBytes: bp?.memoryDiagnostics().totalBufferBytes ?? 0,
    elapsedMs: performance.now() - began,
  };
}
export type GenerationResult = ReturnType<typeof generate>;
