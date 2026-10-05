export type Symbol = string | number;
export function integer(n: number, name: string): void {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(`${name} must be a nonnegative safe integer`);
}
export class SymbolEncoder<S extends Symbol> {
  readonly symbols: S[] = [];
  private ids = new Map<S, number>();
  encode(s: S): number {
    if (typeof s !== "string" && !(typeof s === "number" && Number.isFinite(s)))
      throw new TypeError("Symbols must be strings or finite numbers");
    let id = this.ids.get(s);
    if (id === undefined) {
      id = this.symbols.length;
      this.ids.set(s, id);
      this.symbols.push(s);
    }
    return id;
  }
}
export interface Edge<S> {
  symbol: S;
  probability: number;
  nextState: number;
}
export interface GraphOptions<S> {
  maxOrder?: number;
  startState?: readonly S[];
}
export interface Distribution<S> {
  context: readonly S[];
  probabilities: ReadonlyMap<S, number>;
}
export class ContextGraph<S extends Symbol = Symbol> {
  readonly encoder = new SymbolEncoder<S>();
  readonly contexts: S[][];
  readonly startState: number;
  readonly maxOrder: number;
  private rows: Edge<S>[][];
  constructor(
    contexts: readonly (readonly S[])[],
    rows: readonly (readonly Edge<S>[])[],
    startState = 0,
    maxOrder = contexts.reduce((n, c) => Math.max(n, c.length), 0),
  ) {
    integer(maxOrder, "maxOrder");
    integer(startState, "startState");
    if (
      !contexts.length ||
      startState >= contexts.length ||
      rows.length !== contexts.length
    )
      throw new RangeError("Invalid graph dimensions");
    const keys = new Set<string>();
    this.contexts = contexts.map((c) => [...c]);
    this.rows = rows.map((row) => row.map((e) => ({ ...e })));
    this.startState = startState;
    this.maxOrder = maxOrder;
    for (const c of contexts) {
      if (c.length > maxOrder) throw new RangeError("Context exceeds maxOrder");
      const key = JSON.stringify(c.map((s) => this.encoder.encode(s)));
      if (keys.has(key)) throw new Error("Duplicate context");
      keys.add(key);
    }
    for (const row of this.rows) {
      let total = 0;
      const seen = new Set<S>();
      for (const e of row) {
        this.encoder.encode(e.symbol);
        integer(e.nextState, "nextState");
        if (
          e.nextState >= contexts.length ||
          !Number.isFinite(e.probability) ||
          e.probability < 0 ||
          seen.has(e.symbol)
        )
          throw new Error("Invalid or duplicate edge");
        total += e.probability;
        seen.add(e.symbol);
      }
      if (row.length && Math.abs(total - 1) > 1e-9)
        throw new Error("Outgoing probabilities must sum to one");
    }
  }
  get alphabet(): readonly S[] {
    return this.encoder.symbols;
  }
  get stateCount(): number {
    return this.contexts.length;
  }
  get edgeCount(): number {
    return this.rows.reduce((n, r) => n + r.length, 0);
  }
  outgoing(id: number): readonly Edge<S>[] {
    return this.rows[id] ?? [];
  }
  static fromProbabilities<S extends Symbol>(
    distributions: readonly Distribution<S>[],
    options: GraphOptions<S> = {},
  ): ContextGraph<S> {
    const enc = new SymbolEncoder<S>();
    const key = (c: readonly S[]) =>
      JSON.stringify(c.map((s) => enc.encode(s)));
    const contexts = distributions.map((d) => [...d.context]);
    const ids = new Map(contexts.map((c, i) => [key(c), i]));
    if (ids.size !== contexts.length) throw new Error("Duplicate context");
    const start = options.startState ?? [];
    let startId = ids.get(key(start));
    if (startId === undefined) {
      startId = contexts.length;
      ids.set(key(start), startId);
      contexts.push([...start]);
    }
    const maxOrder =
      options.maxOrder ?? contexts.reduce((n, c) => Math.max(n, c.length), 0);
    integer(maxOrder, "maxOrder");
    const rows: Edge<S>[][] = contexts.map(() => []);
    distributions.forEach((d, i) => {
      for (const [symbol, p] of d.probabilities) {
        if (!Number.isFinite(p) || p < 0)
          throw new Error("Invalid probability");
        if (!p) continue;
        const candidate = [...d.context, symbol];
        let next = ids.get(key([]));
        for (let k = Math.min(maxOrder, candidate.length); k >= 0; k--) {
          const id = ids.get(key(k ? candidate.slice(-k) : []));
          if (id !== undefined) {
            next = id;
            break;
          }
        }
        if (next === undefined) {
          next = contexts.length;
          ids.set(key([]), next);
          contexts.push([]);
          rows.push([]);
        }
        rows[i].push({ symbol, probability: p, nextState: next });
      }
    });
    return new ContextGraph(contexts, rows, startId, maxOrder);
  }
  static fromCounts<S extends Symbol>(
    counts: readonly {
      context: readonly S[];
      counts: ReadonlyMap<S, number>;
    }[],
    options: GraphOptions<S> = {},
  ): ContextGraph<S> {
    return this.fromProbabilities(
      counts.map((d) => {
        let total = 0;
        for (const n of d.counts.values()) {
          if (!Number.isFinite(n) || n < 0) throw new Error("Invalid count");
          total += n;
        }
        if (!Number.isFinite(total) || total <= 0)
          throw new Error("No positive continuation mass");
        return {
          context: d.context,
          probabilities: new Map([...d.counts].map(([s, n]) => [s, n / total])),
        };
      }),
      options,
    );
  }
  static fromSequences<S extends Symbol>(
    sequences: Iterable<Iterable<S>>,
    options: GraphOptions<S> & { maxOrder: number },
  ): ContextGraph<S> {
    integer(options.maxOrder, "maxOrder");
    const enc = new SymbolEncoder<S>();
    const counts = new Map<string, { context: S[]; counts: Map<S, number> }>();
    for (const sequence of sequences) {
      const tokens = [...sequence];
      for (let i = 0; i < tokens.length; i++)
        for (let k = 0; k <= Math.min(i, options.maxOrder); k++) {
          const context = tokens.slice(i - k, i),
            key = JSON.stringify(context.map((s) => enc.encode(s)));
          let row = counts.get(key);
          if (!row) {
            row = { context, counts: new Map() };
            counts.set(key, row);
          }
          const s = tokens[i];
          row.counts.set(s, (row.counts.get(s) ?? 0) + 1);
        }
    }
    return this.fromCounts([...counts.values()], options);
  }
  probability(sequence: readonly S[]): number {
    let q = this.startState,
      p = 1;
    for (const s of sequence) {
      const e = this.outgoing(q).find((e) => e.symbol === s);
      if (!e) return 0;
      p *= e.probability;
      q = e.nextState;
    }
    return p;
  }
}
export type State = string | number;
export interface Acceptor<S> {
  readonly startState: State;
  nextState(q: State, s: S): State | null;
  isAccepting(q: State): boolean;
  transitionWeight?(q: State, s: S): number;
  logTransitionWeight?(q: State, s: S): number;
}
export class DFA<S extends Symbol = Symbol> implements Acceptor<S> {
  readonly startState: State;
  constructor(
    private spec: {
      startState: State;
      transition: (q: State, s: S) => State | null;
      accept: (q: State) => boolean;
      weight?: (q: State, s: S) => number;
      logWeight?: (q: State, s: S) => number;
    },
  ) {
    this.startState = spec.startState;
  }
  nextState(q: State, s: S): State | null {
    return this.spec.transition(q, s);
  }
  isAccepting(q: State): boolean {
    return this.spec.accept(q);
  }
  transitionWeight(q: State, s: S): number {
    return this.spec.logWeight
      ? Math.exp(this.spec.logWeight(q, s))
      : (this.spec.weight?.(q, s) ?? 1);
  }
  logTransitionWeight(q: State, s: S): number {
    return this.spec.logWeight?.(q, s) ?? Math.log(weight(this, q, s));
  }
  accepts(sequence: readonly S[]): boolean {
    let q = this.startState;
    for (const s of sequence) {
      const r = this.nextState(q, s);
      if (r === null || logTransitionWeight(this, q, s) === -Infinity)
        return false;
      q = r;
    }
    return this.isAccepting(q);
  }
}
export class WeightedDFA<S extends Symbol = Symbol> extends DFA<S> {}
export function weight<S>(a: Acceptor<S>, q: State, s: S): number {
  const w = a.transitionWeight?.(q, s) ?? 1;
  if (!Number.isFinite(w) || w < 0)
    throw new Error("Transition weight must be finite and nonnegative");
  return w;
}

export function logTransitionWeight<S>(a: Acceptor<S>, q: State, s: S): number {
  const w = a.logTransitionWeight?.(q, s) ?? Math.log(weight(a, q, s));
  if (w !== -Infinity && !Number.isFinite(w))
    throw new Error("Invalid log transition weight");
  return w;
}
