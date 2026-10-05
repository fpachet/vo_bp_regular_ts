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
} from "../../dist/constraints/src/index.js";
import { datasets } from "../../examples/datasets.mjs";
self.onmessage = ({ data: input }) => {
  try {
    const d = datasets[input.dataset];
    const convert = (text) =>
      input.dataset === "melody"
        ? text.trim().split(/[ ,]+/).filter(Boolean).map(Number)
        : input.dataset === "journeys"
          ? text
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [...text];
    const graph =
      input.backoffWeight === null
        ? ContextGraph.fromSequences(d.sequences, { maxOrder: input.order })
        : ContextGraph.fromBackoffSequences(d.sequences, {
            maxOrder: input.order,
            backoffWeight: input.backoffWeight,
          });
    const parts = [];
    if (input.prefix) parts.push(prefixAcceptor(convert(input.prefix)));
    if (input.suffix) parts.push(suffixAcceptor(convert(input.suffix)));
    if (input.forbidden)
      parts.push(forbiddenSubstringAcceptor([convert(input.forbidden)]));
    if (input.required)
      parts.push(requiredSubstringAcceptor(convert(input.required)));
    if (input.copyLimit !== null)
      parts.push(maxOrderAcceptor(d.sequences, input.copyLimit));
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
      p = compileProduct(graph, a, { length: input.length }),
      bp = new ProductBPResult(p);
    const best = input.action === "best" ? optimizeProduct(p) : null;
    self.postMessage({
      sequence: best
        ? best.sequence
        : bp.feasible
          ? bp.sample(input.seed === null ? Math.random : seededRng(input.seed))
          : null,
      feasible: bp.feasible,
      logWeight: best?.logWeight,
      diagnostics: {
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
    self.postMessage({ error: e.message });
  }
};
