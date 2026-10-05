import {
  DFA,
  integer,
  SymbolEncoder,
  type Symbol,
} from "../../core/src/index.js";
import { ResourceLimitError } from "../../core/src/errors.js";
export interface PatternOptions<S extends Symbol> {
  /** Explicit finite alphabet: unknown symbols reject; tables are precompiled. */
  alphabet?: Iterable<S>;
  maxStates?: number;
  maxTransitions?: number;
}
interface Node<S> {
  next: Map<S, number>;
  fail: number;
  output: boolean;
}
/** Trie + failure links. No pattern/prefix scans in a transition. */
export function patternMachine<S extends Symbol>(
  patterns: readonly (readonly S[])[],
  mode: "forbid" | "require" | "suffix",
  options: PatternOptions<S> = {},
): DFA<S> {
  const maxStates = options.maxStates ?? 100000,
    maxTransitions = options.maxTransitions ?? 1000000;
  integer(maxStates, "maxStates");
  integer(maxTransitions, "maxTransitions");
  if (maxStates < 1) throw new ResourceLimitError("pattern states", maxStates);
  if (mode === "forbid" && patterns.some((p) => p.length === 0))
    throw new Error("Empty forbidden pattern");
  const symbols = new SymbolEncoder<S>();
  const nodes: Node<S>[] = [{ next: new Map(), fail: 0, output: false }];
  for (const pattern of patterns) {
    let q = 0;
    for (const symbol of pattern) {
      symbols.encode(symbol);
      let next = nodes[q].next.get(symbol);
      if (next === undefined) {
        if (nodes.length >= maxStates)
          throw new ResourceLimitError("pattern states", maxStates);
        next = nodes.length;
        nodes[q].next.set(symbol, next);
        nodes.push({ next: new Map(), fail: 0, output: false });
      }
      q = next;
    }
    nodes[q].output = true;
  }
  const queue = [...nodes[0].next.values()];
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    nodes[q].output ||= nodes[nodes[q].fail].output;
    for (const [symbol, next] of nodes[q].next) {
      let fail = nodes[q].fail;
      while (fail !== 0 && !nodes[fail].next.has(symbol))
        fail = nodes[fail].fail;
      nodes[next].fail = nodes[fail].next.get(symbol) ?? 0;
      queue.push(next);
    }
  }
  const found = nodes.length;
  function advance(q: number, symbol: S): number {
    while (q !== 0 && !nodes[q].next.has(symbol)) q = nodes[q].fail;
    return nodes[q].next.get(symbol) ?? 0;
  }
  const finish = (next: number): number | null =>
    nodes[next].output
      ? mode === "forbid"
        ? null
        : mode === "require"
          ? found
          : next
      : next;
  let transition: (q: number, symbol: S) => number | null;
  if (options.alphabet !== undefined) {
    const alphabet = new SymbolEncoder<S>();
    for (const symbol of options.alphabet) alphabet.encode(symbol);
    if (nodes.length * alphabet.symbols.length > maxTransitions)
      throw new ResourceLimitError("pattern transitions", maxTransitions);
    const ids = new Map(alphabet.symbols.map((symbol, i) => [symbol, i]));
    const tables = nodes.map((_, q) =>
      Int32Array.from(alphabet.symbols, (s) => finish(advance(q, s)) ?? -1),
    );
    transition = (q, symbol) => {
      const i = ids.get(symbol);
      if (i === undefined) return null;
      if (q === found) return found;
      const next = tables[q]?.[i];
      return next === undefined || next === -1 ? null : next;
    };
  } else {
    const cache: Map<S, number | null>[] = nodes.map(() => new Map());
    let count = 0;
    transition = (q, symbol) => {
      if (q === found) return found;
      if (!Number.isInteger(q) || q < 0 || q >= nodes.length) return null;
      const row = cache[q];
      if (row.has(symbol)) return row.get(symbol)!;
      if (count >= maxTransitions)
        throw new ResourceLimitError("pattern transitions", maxTransitions);
      const next = finish(advance(q, symbol));
      row.set(symbol, next);
      count++;
      return next;
    };
  }
  return new DFA({
    startState: mode === "require" && nodes[0].output ? found : 0,
    transition: (q, s) => transition(Number(q), s),
    accept: (q) =>
      mode === "forbid" ||
      (mode === "require" ? q === found : (nodes[Number(q)]?.output ?? false)),
  });
}
