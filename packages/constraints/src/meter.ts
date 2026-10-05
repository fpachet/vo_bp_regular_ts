import {
  DFA,
  integer,
  ResourceLimitError,
  type Symbol,
} from "../../core/src/index.js";
export interface CumulativeMeterOptions<S> {
  /** Called before emission with cumulative cost, symbol and 1-based position. */
  predicate?: (total: number, symbol: S, position: number) => boolean;
  maxCost?: number;
  acceptCosts?: ReadonlySet<number> | ((total: number) => boolean);
  endSymbol?: S;
  maxStates?: number;
}
export function cumulativeMeterAcceptor<S extends Symbol>(
  length: number,
  cost: (symbol: S) => number,
  options: CumulativeMeterOptions<S> = {},
): DFA<S> {
  integer(length, "length");
  if (options.maxCost !== undefined) integer(options.maxCost, "maxCost");
  const maxStates = options.maxStates ?? 100000;
  integer(maxStates, "maxStates");
  const states: { position: number; total: number; ended: boolean }[] = [];
  const ids = new Map<string, number>();
  const intern = (position: number, total: number, ended: boolean) => {
    const key = `${position}:${total}:${Number(ended)}`;
    let id = ids.get(key);
    if (id === undefined) {
      if (states.length >= maxStates)
        throw new ResourceLimitError("meter states", maxStates);
      id = states.length;
      ids.set(key, id);
      states.push({ position, total, ended });
    }
    return id;
  };
  const acceptsCost =
    options.acceptCosts === undefined
      ? () => true
      : typeof options.acceptCosts === "function"
        ? options.acceptCosts
        : (total: number) =>
            (options.acceptCosts as ReadonlySet<number>).has(total);
  return new DFA({
    startState: intern(0, 0, false),
    transition: (q, s) => {
      const state = states[Number(q)];
      if (!state) throw new RangeError("Unknown meter state");
      if (state.position >= length || (state.ended && s !== options.endSymbol))
        return null;
      const value = cost(s);
      integer(value, "symbol cost");
      const total = state.total + value;
      integer(total, "cumulative cost");
      if (options.maxCost !== undefined && total > options.maxCost) return null;
      if (
        options.predicate &&
        !options.predicate(state.total, s, state.position + 1)
      )
        return null;
      return intern(
        state.position + 1,
        total,
        state.ended ||
          (options.endSymbol !== undefined && s === options.endSymbol),
      );
    },
    accept: (q) => {
      const state = states[Number(q)];
      return !!state && state.position === length && acceptsCost(state.total);
    },
  });
}
/** Fixed emission horizon with a duration prefix and absorbing zero-cost PAD. */
export function paddedDurationAcceptor<S extends Symbol>(
  total: number,
  options: {
    length: number;
    padSymbol: S;
    duration: (symbol: S) => number;
    allowZeroDurationEvents?: boolean;
    maxStates?: number;
  },
): DFA<S> {
  integer(total, "total");
  integer(options.length, "length");
  const cost = (s: S) => (s === options.padSymbol ? 0 : options.duration(s));
  return cumulativeMeterAcceptor(options.length, cost, {
    maxCost: total,
    acceptCosts: new Set([total]),
    endSymbol: options.padSymbol,
    maxStates: options.maxStates,
    predicate: (current, s) => {
      if (s === options.padSymbol) return current === total;
      if (cost(s) === 0 && !options.allowZeroDurationEvents) return false;
      return current !== total;
    },
  });
}
