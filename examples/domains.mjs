import {
  ContextGraph,
  runBP,
  mostProbableSequence,
  DFA,
} from "../dist/core/src/index.js";
import {
  allOf,
  prefixAcceptor,
  suffixAcceptor,
  forbiddenSubstringAcceptor,
  requiredSubstringAcceptor,
  maxOrderAcceptor,
} from "../dist/constraints/src/index.js";
import { datasets } from "./datasets.mjs";
for (const [name, data] of Object.entries(datasets)) {
  const graph = ContextGraph.fromSequences(data.sequences, {
    maxOrder: data.maxOrder,
  });
  const parts = [prefixAcceptor(data.prefix), suffixAcceptor(data.suffix)];
  if (data.forbidden)
    parts.push(forbiddenSubstringAcceptor(data.forbidden.map((s) => [...s])));
  if (data.required) parts.push(requiredSubstringAcceptor(data.required));
  if (data.copyLimit)
    parts.push(maxOrderAcceptor(data.sequences, data.copyLimit));
  // In this dataset, Cart is the only route to Checkout; require Cart explicitly too.
  const constraint = allOf(...parts),
    bp = runBP(graph, constraint, { length: data.length });
  console.log(name, {
    mass: bp.partitionFunction,
    sample: bp.feasible ? bp.sample() : null,
    best: mostProbableSequence(graph, constraint, { length: data.length }),
  });
}
