import { patternMachine, type PatternOptions } from "./patterns.js";
export type { PatternOptions } from "./patterns.js";
import {
  DFA,
  integer,
  logTransitionWeight,
  type Symbol,
  type State,
  type Acceptor,
} from "../../core/src/index.js";
export function trueAcceptor<S extends Symbol>(): DFA<S> {
  return new DFA({ startState: 0, transition: () => 0, accept: () => true });
}
export function allOf<S extends Symbol>(...acceptors: Acceptor<S>[]): DFA<S> {
  const states: State[][] = [];
  const ids = new Map<string, number>();
  const intern = (s: State[]) => {
    const key = JSON.stringify(s);
    let id = ids.get(key);
    if (id === undefined) {
      id = states.length;
      ids.set(key, id);
      states.push(s);
    }
    return id;
  };
  return new DFA({
    startState: intern(acceptors.map((a) => a.startState)),
    transition: (q, s) => {
      const next: State[] = [];
      for (let i = 0; i < acceptors.length; i++) {
        const r = acceptors[i].nextState(states[Number(q)][i], s);
        if (r === null) return null;
        next.push(r);
      }
      return intern(next);
    },
    accept: (q) =>
      acceptors.every((a, i) => a.isAccepting(states[Number(q)][i])),
    logWeight: (q, s) => {
      let log = 0;
      for (let i = 0; i < acceptors.length; i++) {
        const w = logTransitionWeight(acceptors[i], states[Number(q)][i], s);
        if (w === -Infinity) return -Infinity;
        log += w;
      }
      return log;
    },
  });
}
export function positionalAcceptor<S extends Symbol>(
  length: number,
  allowed: ReadonlyMap<number, Iterable<S>> = new Map(),
): DFA<S> {
  integer(length, "length");
  const sets = new Map<number, Set<S>>();
  for (const [i, s] of allowed) {
    integer(i, "position");
    if (i >= length) throw new RangeError("Position outside horizon");
    sets.set(i, new Set(s));
  }
  return new DFA({
    startState: 0,
    transition: (q, s) =>
      Number(q) < length &&
      (!sets.has(Number(q)) || sets.get(Number(q))!.has(s))
        ? Number(q) + 1
        : null,
    accept: (q) => q === length,
  });
}
export function prefixAcceptor<S extends Symbol>(prefix: readonly S[]): DFA<S> {
  return new DFA({
    startState: 0,
    transition: (q, s) =>
      Number(q) === prefix.length
        ? q
        : prefix[Number(q)] === s
          ? Number(q) + 1
          : null,
    accept: (q) => q === prefix.length,
  });
}
export function forbiddenSubstringAcceptor<S extends Symbol>(
  patterns: readonly (readonly S[])[],
  options: PatternOptions<S> = {},
): DFA<S> {
  return patternMachine(patterns, "forbid", options);
}
/** Require at least one occurrence of this pattern. */
export function requiredSubstringAcceptor<S extends Symbol>(
  pattern: readonly S[],
  options: PatternOptions<S> = {},
): DFA<S> {
  return patternMachine([pattern], "require", options);
}
export function suffixAcceptor<S extends Symbol>(
  suffix: readonly S[],
  options: PatternOptions<S> = {},
): DFA<S> {
  return patternMachine([suffix], "suffix", options);
}
export function maxOrderAcceptor<S extends Symbol>(
  references: Iterable<Iterable<S>>,
  maxOrder: number,
  options: PatternOptions<S> = {},
): DFA<S> {
  integer(maxOrder, "maxOrder");
  const patterns: S[][] = [],
    seen = new Set<string>();
  for (const ref of references) {
    const xs = [...ref];
    for (let i = 0; i + maxOrder < xs.length; i++) {
      const p = xs.slice(i, i + maxOrder + 1),
        key = JSON.stringify(p);
      if (!seen.has(key)) {
        seen.add(key);
        patterns.push(p);
      }
    }
  }
  return forbiddenSubstringAcceptor(patterns, options);
}
/** Per-position class pattern, matching Python meter_acceptor (not cumulative duration). */
export function meterAcceptor<S extends Symbol, C>(
  pattern: readonly (ReadonlySet<C> | null)[],
  classOf: (s: S) => C,
): DFA<S> {
  return new DFA({
    startState: 0,
    transition: (q, s) =>
      Number(q) < pattern.length &&
      (pattern[Number(q)] === null || pattern[Number(q)]!.has(classOf(s)))
        ? Number(q) + 1
        : null,
    accept: (q) => q === pattern.length,
  });
}

/** Accept any listed suffix, useful for alternative terminal motifs. */
export function suffixesAcceptor<S extends Symbol>(
  suffixes: readonly (readonly S[])[],
  options: PatternOptions<S> = {},
): DFA<S> {
  return patternMachine(suffixes, "suffix", options);
}
/** Every occurrence of after requires an earlier occurrence of before. */
export function precedenceAcceptor<S extends Symbol>(
  before: S,
  after: S,
): DFA<S> {
  return new DFA({
    startState: 0,
    transition: (q, s) =>
      s === after && q === 0 ? null : s === before ? 1 : q,
    accept: () => true,
  });
}
export function visitLimitAcceptor<S extends Symbol>(
  symbol: S,
  maximum: number,
): DFA<S> {
  integer(maximum, "maximum");
  return new DFA({
    startState: 0,
    transition: (q, s) =>
      s === symbol ? (Number(q) < maximum ? Number(q) + 1 : null) : q,
    accept: () => true,
  });
}
export * from "./meter.js";
