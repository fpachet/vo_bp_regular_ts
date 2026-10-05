import {
  DFA,
  type Symbol,
  type State,
  type Acceptor,
  SymbolEncoder,
  integer,
  logTransitionWeight,
} from "./model.js";
import { ResourceLimitError } from "./errors.js";
export interface SerializedDFA<S extends Symbol = Symbol> {
  version: 1;
  alphabet: S[];
  startState: number;
  accepting: boolean[];
  /** [source, symbolIndex, destination, logWeight]; rejected edges are omitted. */
  transitions: [number, number, number, number][];
}
/** Materialize a finite callback DFA over an explicit alphabet. */
export function serializeDFA<S extends Symbol>(
  acceptor: Acceptor<S>,
  alphabet: Iterable<S>,
  options: { maxStates?: number; maxTransitions?: number } = {},
): SerializedDFA<S> {
  const maxStates = options.maxStates ?? 100000,
    maxTransitions = options.maxTransitions ?? 1000000;
  integer(maxStates, "maxStates");
  integer(maxTransitions, "maxTransitions");
  const encoder = new SymbolEncoder<S>();
  for (const s of alphabet) encoder.encode(s);
  const states: State[] = [];
  const ids = new Map<State, number>();
  const intern = (q: State) => {
    if (!(
      typeof q === "string" ||
      (typeof q === "number" && Number.isFinite(q))
    ))
      throw new TypeError("DFA states must be strings or finite numbers");
    let id = ids.get(q);
    if (id === undefined) {
      if (states.length >= maxStates)
        throw new ResourceLimitError("DFA states", maxStates);
      id = states.length;
      ids.set(q, id);
      states.push(q);
    }
    return id;
  };
  intern(acceptor.startState);
  const transitions: SerializedDFA<S>["transitions"] = [];
  for (let source = 0; source < states.length; source++)
    for (let symbol = 0; symbol < encoder.symbols.length; symbol++) {
      const s = encoder.symbols[symbol],
        next = acceptor.nextState(states[source], s);
      if (next === null) continue;
      const w = logTransitionWeight(acceptor, states[source], s);
      if (w === -Infinity) continue;
      if (transitions.length >= maxTransitions)
        throw new ResourceLimitError("DFA transitions", maxTransitions);
      transitions.push([source, symbol, intern(next), w]);
    }
  return {
    version: 1,
    alphabet: [...encoder.symbols],
    startState: 0,
    accepting: states.map((q) => acceptor.isAccepting(q)),
    transitions,
  };
}
/** Restore a data-only DFA with integer states; callback identity is not retained. */
export function deserializeDFA<S extends Symbol>(
  data: SerializedDFA<S>,
): DFA<S> {
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.alphabet) ||
    !Array.isArray(data.accepting) ||
    !data.accepting.length ||
    !data.accepting.every((x) => typeof x === "boolean") ||
    !Array.isArray(data.transitions)
  )
    throw new TypeError("Invalid version 1 DFA snapshot");
  integer(data.startState, "startState");
  if (data.startState >= data.accepting.length)
    throw new RangeError("Unknown DFA start");
  const encoder = new SymbolEncoder<S>();
  for (const s of data.alphabet) encoder.encode(s);
  if (encoder.symbols.length !== data.alphabet.length)
    throw new TypeError("Duplicate alphabet symbol");
  const rows: Map<S, { next: number; logWeight: number }>[] =
    data.accepting.map(() => new Map());
  for (const transition of data.transitions) {
    if (!Array.isArray(transition) || transition.length !== 4)
      throw new TypeError("Invalid DFA transition");
    const [source, symbol, next, w] = transition;
    integer(source, "source");
    integer(symbol, "symbol");
    integer(next, "next");
    if (
      source >= rows.length ||
      next >= rows.length ||
      symbol >= data.alphabet.length ||
      !Number.isFinite(w) ||
      rows[source].has(data.alphabet[symbol])
    )
      throw new TypeError("Invalid or duplicate DFA transition");
    rows[source].set(data.alphabet[symbol], { next, logWeight: w });
  }
  const accepting = [...data.accepting];
  return new DFA({
    startState: data.startState,
    transition: (q, s) => rows[Number(q)]?.get(s)?.next ?? null,
    accept: (q) => accepting[Number(q)] ?? false,
    logWeight: (q, s) => rows[Number(q)]?.get(s)?.logWeight ?? -Infinity,
  });
}
