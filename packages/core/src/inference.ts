import {
  type Symbol,
  type State,
  type Acceptor,
  ContextGraph,
  integer,
  logTransitionWeight,
} from "./model.js";
import { InfeasibleError, ResourceLimitError } from "./errors.js";
export interface InferenceOptions<S extends Symbol = Symbol> {
  length: number;
  startContext?: readonly S[];
  startAcceptorState?: State;
  maxProductStates?: number;
  maxTimeIndexedStates?: number;
  maxProductEdges?: number;
  maxLength?: number;
  maxDfaTransitions?: number;
  maxCachedSamplingEdges?: number;
}
const NEG = -Infinity;
export function logAdd(a: number, b: number): number {
  if (a === NEG) return b;
  if (b === NEG) return a;
  const m = Math.max(a, b);
  return m + Math.log1p(Math.exp(Math.min(a, b) - m));
}
interface ProductEdge<S> {
  symbol: S;
  next: number;
  logWeight: number;
}
/** Sparse horizon-reachable product; rows are shared across time layers. */
export class CompiledProduct<S extends Symbol> {
  readonly states: { context: number; acceptor: State }[] = [];
  readonly rows: ProductEdge<S>[][] = [];
  readonly layers: number[][] = [[0]];
  productEdgeCount = 0;
  constructor(
    readonly graph: ContextGraph<S>,
    readonly acceptor: Acceptor<S>,
    readonly length: number,
    options: Omit<InferenceOptions<S>, "length"> = {},
  ) {
    integer(length, "length");
    const maxStates = options.maxProductStates ?? 100000;
    const maxLayerStates = options.maxTimeIndexedStates ?? 5000000;
    const maxEdges = options.maxProductEdges ?? 10000000;
    const maxLength = options.maxLength ?? 100000;
    for (const [name, n] of Object.entries({
      maxStates,
      maxLayerStates,
      maxEdges,
      maxLength,
    }))
      integer(n, name);
    if (length > maxLength) throw new ResourceLimitError("horizon", maxLength);
    if (maxLayerStates < 1)
      throw new ResourceLimitError("time-indexed states", maxLayerStates);
    let layerStateCount = 1;
    const maxDfaTransitions = options.maxDfaTransitions ?? 1000000;
    integer(maxDfaTransitions, "maxDfaTransitions");
    const transitionCache = new Map<
      State,
      Map<S, { next: State; logWeight: number } | null>
    >();
    let cachedTransitions = 0;
    const transition = (q: State, s: S) => {
      let row = transitionCache.get(q);
      if (!row) {
        row = new Map();
        transitionCache.set(q, row);
      }
      if (row.has(s)) return row.get(s)!;
      if (cachedTransitions >= maxDfaTransitions)
        throw new ResourceLimitError("DFA transitions", maxDfaTransitions);
      const next = acceptor.nextState(q, s);
      const value =
        next === null
          ? null
          : { next, logWeight: logTransitionWeight(acceptor, q, s) };
      row.set(s, value);
      cachedTransitions++;
      return value;
    };
    const dfaIds = new Map<State, number>();
    const pairs = new Map<string, number>();
    const intern = (c: number, q: State) => {
      if (
        q === null ||
        !(
          typeof q === "string" ||
          (typeof q === "number" && Number.isFinite(q))
        )
      )
        throw new TypeError("DFA states must be strings or finite numbers");
      let d = dfaIds.get(q);
      if (d === undefined) {
        d = dfaIds.size;
        dfaIds.set(q, d);
      }
      const k = `${c}:${d}`;
      let id = pairs.get(k);
      if (id === undefined) {
        if (this.states.length >= maxStates)
          throw new ResourceLimitError("unique states", maxStates);
        id = this.states.length;
        pairs.set(k, id);
        this.states.push({ context: c, acceptor: q });
      }
      return id;
    };
    const context =
      options.startContext === undefined
        ? graph.startState
        : graph.contextId(options.startContext);
    intern(context, options.startAcceptorState ?? acceptor.startState);
    for (let t = 0; t < length; t++) {
      const next = new Set<number>();
      for (const id of this.layers[t]) {
        if (!this.rows[id]) {
          const { context, acceptor: q } = this.states[id];
          const row: ProductEdge<S>[] = [];
          for (const e of graph.outgoing(context)) {
            const cached = transition(q, e.symbol);
            if (cached === null) continue;
            const r = cached.next,
              w = cached.logWeight;
            if (w === NEG || e.probability === 0) continue;
            row.push({
              symbol: e.symbol,
              next: intern(e.nextState, r),
              logWeight: Math.log(e.probability) + w,
            });
          }
          this.rows[id] = row;
        }
        this.productEdgeCount += this.rows[id].length;
        if (this.productEdgeCount > maxEdges)
          throw new ResourceLimitError("time-indexed edges", maxEdges);
        for (const e of this.rows[id]) next.add(e.next);
      }
      layerStateCount += next.size;
      if (layerStateCount > maxLayerStates)
        throw new ResourceLimitError("time-indexed states", maxLayerStates);
      this.layers.push([...next]);
    }
  }
  get productStateCount(): number {
    return this.states.length;
  }
  get timeIndexedProductStateCount(): number {
    return this.layers.reduce((n, l) => n + l.length, 0);
  }
  get reachableAcceptorStateCount(): number {
    return new Set(this.states.map((s) => s.acceptor)).size;
  }
}
export function compileProduct<S extends Symbol>(
  g: ContextGraph<S>,
  a: Acceptor<S>,
  options: InferenceOptions<S>,
): CompiledProduct<S> {
  return new CompiledProduct(g, a, options.length, options);
}
/** Backward log sum-product, followed by normalized future-mass sampling. */
export class ProductBPResult<S extends Symbol> {
  readonly logBetas: Float64Array[] = [];
  private indices: (Map<number, number> | Int32Array)[];
  private samplingRows: Map<
    number,
    { cumulative: Float64Array; total: number }
  >[] = [];
  private samplingEdges = 0;
  private maxSamplingEdges: number;
  get cachedSamplingEdgeCount(): number {
    return this.samplingEdges;
  }
  constructor(
    readonly product: CompiledProduct<S>,
    options: { maxCachedSamplingEdges?: number } = {},
  ) {
    this.maxSamplingEdges = options.maxCachedSamplingEdges ?? 100000;
    integer(this.maxSamplingEdges, "maxCachedSamplingEdges");
    this.indices = product.layers.map((l) => {
      if (l.length * 4 < product.states.length)
        return new Map(l.map((id, i) => [id, i]));
      const ids = new Int32Array(product.states.length).fill(-1);
      l.forEach((id, i) => {
        ids[id] = i;
      });
      return ids;
    });
    const n = product.length;
    this.logBetas[n] = Float64Array.from(product.layers[n], (id) =>
      product.acceptor.isAccepting(product.states[id].acceptor) ? 0 : NEG,
    );
    for (let t = n - 1; t >= 0; t--)
      this.logBetas[t] = Float64Array.from(product.layers[t], (id) => {
        let b = NEG;
        for (const e of product.rows[id])
          b = logAdd(b, e.logWeight + this.beta(t + 1, e.next));
        return b;
      });
  }
  private beta(t: number, id: number): number {
    const row = this.indices[t],
      i = row instanceof Map ? row.get(id) : row[id];
    return i === undefined || i < 0 ? NEG : this.logBetas[t][i];
  }
  get logPartitionFunction(): number {
    return this.logBetas[0][0];
  }
  get partitionFunction(): number {
    return Math.exp(this.logPartitionFunction);
  }
  get feasible(): boolean {
    return this.logPartitionFunction !== NEG;
  }
  get productStateCount(): number {
    return this.product.productStateCount;
  }
  get productEdgeCount(): number {
    return this.product.productEdgeCount;
  }
  get timeIndexedProductStateCount(): number {
    return this.product.timeIndexedProductStateCount;
  }
  private requireFeasible(): void {
    if (!this.feasible) throw new InfeasibleError();
  }
  sample(rng: () => number = Math.random): S[] {
    this.requireFeasible();
    let id = 0;
    const sequence: S[] = [];
    for (let t = 0; t < this.product.length; t++) {
      const row = this.product.rows[id];
      let cached = this.samplingRows[t]?.get(id);
      if (!cached) {
        let max = NEG;
        for (const e of row)
          max = Math.max(max, e.logWeight + this.beta(t + 1, e.next));
        const cumulative = new Float64Array(row.length);
        let total = 0;
        for (let i = 0; i < row.length; i++) {
          const e = row[i];
          total += Math.exp(e.logWeight + this.beta(t + 1, e.next) - max);
          cumulative[i] = total;
        }
        cached = { cumulative, total };
        if (this.samplingEdges + row.length <= this.maxSamplingEdges) {
          (this.samplingRows[t] ??= new Map()).set(id, cached);
          this.samplingEdges += row.length;
        }
      }
      const u = rng();
      if (!Number.isFinite(u) || u < 0 || u >= 1)
        throw new RangeError("rng must return a number in [0,1)");
      // Strict upper bound skips zero-mass edges, including leading zeroes.
      const target = u * cached.total;
      let low = 0,
        high = row.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (cached.cumulative[middle] > target) high = middle;
        else low = middle + 1;
      }
      let choice = low;
      if (choice === row.length) {
        choice = row.length - 1;
        while (
          choice > 0 &&
          cached.cumulative[choice] === cached.cumulative[choice - 1]
        )
          choice--;
      }
      const e = row[choice];
      sequence.push(e.symbol);
      id = e.next;
    }
    return sequence;
  }
  sampleMany(n: number, rng: () => number = Math.random): S[][] {
    integer(n, "sample count");
    this.requireFeasible();
    return Array.from({ length: n }, () => this.sample(rng));
  }
  logConditionalProbability(sequence: readonly S[]): number {
    this.requireFeasible();
    if (sequence.length !== this.product.length) return NEG;
    let id = 0,
      p = 0;
    for (const s of sequence) {
      const e = this.product.rows[id]?.find((e) => e.symbol === s);
      if (!e) return NEG;
      p += e.logWeight;
      id = e.next;
    }
    return this.product.acceptor.isAccepting(this.product.states[id].acceptor)
      ? Math.min(0, p - this.logPartitionFunction)
      : NEG;
  }
  /** Unnormalized log weight on the compiled product (no conditioning division). */
  logSequenceWeight(sequence: readonly S[]): number {
    if (sequence.length !== this.product.length) return NEG;
    let id = 0,
      value = 0;
    for (const symbol of sequence) {
      const edge = this.product.rows[id]?.find((e) => e.symbol === symbol);
      if (!edge) return NEG;
      value += edge.logWeight;
      id = edge.next;
    }
    return this.product.acceptor.isAccepting(this.product.states[id].acceptor)
      ? value
      : NEG;
  }
  /** Exact symbol marginals and expected source-edge counts, computed on demand.
   * Only the current forward layer is retained; beta tables are reused.
   */
  marginals(options: { maxEdgeRecords?: number } = {}): MarginalResult<S> {
    this.requireFeasible();
    const maxRecords = options.maxEdgeRecords ?? 1000000;
    integer(maxRecords, "maxEdgeRecords");
    const symbolProbabilities: Map<S, number>[] = [];
    const edgeLogs = new Map<number, Map<S, number>>();
    let records = 0;
    let alpha = new Map<number, number>([[0, 0]]);
    for (let t = 0; t < this.product.length; t++) {
      const nextAlpha = new Map<number, number>(),
        symbols = new Map<S, number>();
      for (const [id, forward] of alpha)
        for (const edge of this.product.rows[id]) {
          const next = forward + edge.logWeight;
          nextAlpha.set(
            edge.next,
            logAdd(nextAlpha.get(edge.next) ?? NEG, next),
          );
          const mass =
            next + this.beta(t + 1, edge.next) - this.logPartitionFunction;
          if (mass === NEG) continue;
          symbols.set(
            edge.symbol,
            logAdd(symbols.get(edge.symbol) ?? NEG, mass),
          );
          const context = this.product.states[id].context;
          let row = edgeLogs.get(context);
          if (!row) {
            row = new Map();
            edgeLogs.set(context, row);
          }
          if (!row.has(edge.symbol)) {
            if (records >= maxRecords)
              throw new ResourceLimitError("marginal edge records", maxRecords);
            records++;
          }
          row.set(edge.symbol, logAdd(row.get(edge.symbol) ?? NEG, mass));
        }
      symbolProbabilities.push(
        new Map([...symbols].map(([symbol, log]) => [symbol, Math.exp(log)])),
      );
      alpha = nextAlpha;
    }
    const expectedTransitions: ExpectedTransition<S>[] = [];
    for (const [context, row] of edgeLogs)
      for (const [symbol, log] of row) {
        const edge = this.product.graph
          .outgoing(context)
          .find((e) => e.symbol === symbol)!;
        expectedTransitions.push({
          contextState: context,
          symbol,
          nextContextState: edge.nextState,
          expectedCount: Math.exp(log),
        });
      }
    return { symbolProbabilities, expectedTransitions };
  }
  conditionalProbability(sequence: readonly S[]): number {
    return Math.exp(this.logConditionalProbability(sequence));
  }
}
export function runBP<S extends Symbol>(
  g: ContextGraph<S>,
  a: Acceptor<S>,
  options: InferenceOptions<S>,
): ProductBPResult<S> {
  return new ProductBPResult(compileProduct(g, a, options), options);
}
export type Optimum<S> =
  | { feasible: true; sequence: S[]; logWeight: number }
  | { feasible: false; sequence: null; logWeight: number };
export function optimizeProduct<S extends Symbol>(
  p: CompiledProduct<S>,
): Optimum<S> {
  let scores = new Map(
    p.layers[p.length].map((id) => [
      id,
      p.acceptor.isAccepting(p.states[id].acceptor) ? 0 : NEG,
    ]),
  );
  const choices: Map<number, ProductEdge<S>>[] = [];
  for (let t = p.length - 1; t >= 0; t--) {
    const now = new Map<number, number>();
    choices[t] = new Map();
    for (const id of p.layers[t]) {
      let best = NEG;
      for (const e of p.rows[id]) {
        const score = e.logWeight + (scores.get(e.next) ?? NEG);
        if (score > best) {
          best = score;
          choices[t].set(id, e);
        }
      }
      now.set(id, best);
    }
    scores = now;
  }
  const logWeight = scores.get(0) ?? NEG;
  if (logWeight === NEG) return { feasible: false, sequence: null, logWeight };
  let id = 0;
  const sequence: S[] = [];
  for (let t = 0; t < p.length; t++) {
    const e = choices[t].get(id)!;
    sequence.push(e.symbol);
    id = e.next;
  }
  return { feasible: true, sequence, logWeight };
}
export function mostProbableSequence<S extends Symbol>(
  g: ContextGraph<S>,
  a: Acceptor<S>,
  options: InferenceOptions<S>,
): Optimum<S> {
  return optimizeProduct(compileProduct(g, a, options));
}

export interface ExpectedTransition<S> {
  contextState: number;
  symbol: S;
  nextContextState: number;
  expectedCount: number;
}
export interface MarginalResult<S> {
  symbolProbabilities: Map<S, number>[];
  expectedTransitions: ExpectedTransition<S>[];
}
