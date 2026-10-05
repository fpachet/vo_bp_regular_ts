import {
  ContextGraph,
  DFA,
  compileProduct,
  ProductBPResult,
  optimizeProduct,
  seededRng,
} from "../../dist/core/src/index.js";
import {
  allOf,
  prefixAcceptor,
  suffixAcceptor,
  forbiddenSubstringAcceptor,
  requiredSubstringAcceptor,
  positionalAcceptor,
  maxOrderAcceptor,
  suffixesAcceptor,
  paddedDurationAcceptor,
  cumulativeMeterAcceptor,
  precedenceAcceptor,
  visitLimitAcceptor,
} from "../../dist/constraints/src/index.js";
import { datasets, melodyEvents } from "../../examples/datasets.mjs";
import {
  tokenizeWords,
  longestCopiedRun,
  parseEvent,
} from "../../examples/domain-utils.mjs";
self.onmessage = async ({ data: input }) => {
  const started = performance.now();
  try {
    let d = datasets[input.dataset];
    if (input.dataset === "text" && input.fullText) {
      const response = await fetch(
        new URL("../../benchmarks/corpora/alice.txt", import.meta.url),
      );
      if (!response.ok) throw new Error("Alice corpus could not be loaded");
      const raw = await response.text();
      const text = raw
        .split(/\*\*\* START OF[^\n]*\n/)[1]
        .split(/\*\*\* END OF/)[0];
      d = {
        ...d,
        sequences: [input.wordMode ? tokenizeWords(text) : [...text]],
      };
    }
    if (input.dataset === "melody" && input.meter)
      d = { ...d, sequences: melodyEvents };
    const convert = (text) =>
      input.dataset === "text" && input.wordMode
        ? tokenizeWords(text)
        : input.dataset === "melody" && input.meter
          ? text.trim().split(/[ ,]+/).filter(Boolean)
          : input.dataset === "melody"
            ? text.trim().split(/[ ,]+/).filter(Boolean).map(Number)
            : input.dataset === "journeys"
              ? text
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [...text];
    const trainingStart = performance.now();
    const graph =
      input.backoffWeight === null
        ? ContextGraph.fromSequences(d.sequences, { maxOrder: input.order })
        : ContextGraph.fromBackoffSequences(d.sequences, {
            maxOrder: input.order,
            backoffWeight: input.backoffWeight,
          });
    const trained = performance.now();
    const parts = [];
    if (input.dataset === "melody" && input.meter) {
      const duration = (s) => parseEvent(s).duration;
      parts.push(
        paddedDurationAcceptor(input.totalDuration, {
          length: input.length,
          padSymbol: "PAD",
          duration,
        }),
        cumulativeMeterAcceptor(input.length, duration, {
          maxCost: input.totalDuration,
          acceptCosts: new Set([input.totalDuration]),
          endSymbol: "PAD",
          predicate: (total, s) =>
            s === "PAD" || (total % 4) + duration(s) <= 4,
        }),
      );
    }
    if (input.dataset === "dna" && input.domainRules)
      parts.push(suffixesAcceptor(["TAA", "TAG", "TGA"].map((s) => [...s])));
    if (input.dataset === "journeys" && input.domainRules)
      parts.push(
        precedenceAcceptor("Cart", "Checkout"),
        visitLimitAcceptor("Search", 2),
        visitLimitAcceptor("Purchase", 1),
      );
    if (input.prefix) parts.push(prefixAcceptor(convert(input.prefix)));
    if (input.suffix && !(input.dataset === "dna" && input.domainRules))
      parts.push(suffixAcceptor(convert(input.suffix)));
    if (input.forbidden)
      parts.push(forbiddenSubstringAcceptor([convert(input.forbidden)]));
    if (input.required)
      parts.push(requiredSubstringAcceptor(convert(input.required)));
    if (input.copyLimit !== null)
      parts.push(
        maxOrderAcceptor(d.sequences, input.copyLimit, {
          maxTransitions: input.fullText && input.wordMode ? 10000000 : 1000000,
        }),
      );
    if (input.positionSymbol)
      parts.push(
        positionalAcceptor(
          input.length,
          new Map([[input.position, convert(input.positionSymbol)]]),
        ),
      );
    if (input.custom.trim()) {
      const table = JSON.parse(input.custom);
      parts.push(
        new DFA({
          startState: table.startState,
          transition: (q, s) => table.transitions[q]?.[s] ?? null,
          accept: (q) => table.accepting.includes(q),
        }),
      );
    }
    const a = allOf(...parts),
      p = compileProduct(graph, a, {
        length: input.length,
        pruneDeadStates: input.prune || input.lowMemory,
        maxProductEdges: 20000000,
        maxDfaTransitions:
          input.fullText && input.wordMode ? 10000000 : 1000000,
      }),
      bp = new ProductBPResult(
        p,
        input.lowMemory
          ? { checkpointInterval: 8, maxCachedSamplingEdges: 0 }
          : {},
      );
    const inferred = performance.now();
    const best = input.action === "best" ? optimizeProduct(p) : null;
    const sequence = best
      ? best.sequence
      : bp.feasible
        ? bp.sample(input.seed === null ? Math.random : seededRng(input.seed))
        : null;
    const sampled = performance.now();
    const marginals =
      input.marginals && bp.feasible
        ? bp
            .marginals()
            .symbolProbabilities.map((row) =>
              [...row].sort((a, b) => b[1] - a[1]).slice(0, 12),
            )
        : null;
    const marginalized = performance.now();
    let samplingBench;
    if (input.action === "benchmark" && bp.feasible) {
      samplingBench = [];
      for (const cap of [0, 256, 100000]) {
        const fresh = new ProductBPResult(p, { maxCachedSamplingEdges: cap });
        const cold = performance.now();
        fresh.sample(seededRng(17));
        const coldMs = performance.now() - cold;
        const warm = performance.now();
        for (let batch = 0; batch < 5; batch++)
          fresh.sampleMany(100, seededRng(100 + batch));
        samplingBench.push({
          cap,
          coldMs,
          warm500Ms: performance.now() - warm,
          cachedEdges: fresh.cachedSamplingEdgeCount,
        });
      }
    }
    self.postMessage({
      sequence,
      marginals,
      samplingBench,
      trainingPreview: d.sequences[0]
        .slice(0, 400)
        .join(
          input.wordMode ||
            input.dataset === "melody" ||
            input.dataset === "journeys"
            ? " "
            : "",
        ),
      feasible: bp.feasible,
      logWeight: best?.logWeight,
      diagnostics: {
        "Inference buffers MiB (excludes model/Maps)":
          bp.memoryDiagnostics().totalBufferBytes / 2 ** 20,
        "Training tokens": d.sequences.reduce((n, s) => n + s.length, 0),
        "Training ms": trained - trainingStart,
        "Constraint/product/backward ms": inferred - trained,
        "Sample/optimization ms": sampled - inferred,
        "Marginals ms": marginalized - sampled,
        "Total ms": performance.now() - started,
        "Sequence log weight": sequence
          ? bp.logSequenceWeight(sequence)
          : -Infinity,
        "Conditional probability": sequence
          ? bp.conditionalProbability(sequence)
          : 0,
        "Log conditional probability": sequence
          ? bp.logConditionalProbability(sequence)
          : -Infinity,
        "Longest copied run": sequence
          ? longestCopiedRun(sequence, d.sequences)
          : 0,
        "Source states": graph.stateCount,
        "Source edges": graph.edgeCount,
        "Reachable constraint states": p.reachableAcceptorStateCount,
        "Unique product states": p.productStateCount,
        "Time-indexed product states": p.timeIndexedProductStateCount,
        "Time-indexed product edges": p.productEdgeCount,
        "Constrained mass": bp.partitionFunction,
        "Log constrained mass": bp.logPartitionFunction,
      },
    });
  } catch (e) {
    self.postMessage({
      error:
        e.message +
        (e.resource
          ? ". Reduce length/order or disable constraints to fit the resource budget."
          : ". Check symbols against the training alphabet and check duration/length constraints."),
    });
  }
};
