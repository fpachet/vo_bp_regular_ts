import {
  type Symbol,
  type State,
  type Acceptor,
  ContextGraph,
  integer,
  logTransitionWeight,
} from "./model.js";
import { PackedEdges, LayerPool } from "./packed.js";
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
  maxCachedDfaTransitions?: number;
  checkpointInterval?: number;
  pruneDeadStates?: boolean;
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
  readonly edges = new PackedEdges();
  rowStarts = new Uint32Array(0);
  rowCounts = new Uint32Array(0);
  readonly layerIds: Uint32Array[] = [];
  private rowView?: ProductEdge<S>[][];
  private layerView?: number[][];
  /** Compatibility inspection snapshots, materialized only when requested. */
  get rows(): ProductEdge<S>[][] {
    return (this.rowView ??= this.states.map((_, id) => this.row(id)));
  }
  get layers(): number[][] {
    return (this.layerView ??= this.layerIds.map((ids) => Array.from(ids)));
  }
  row(id: number): ProductEdge<S>[] {
    const start = this.rowStarts[id] ?? 0,
      count = this.rowCounts[id] ?? 0;
    return Array.from({ length: count }, (_, i) => ({
      symbol: this.graph.encoder.symbols[this.edges.symbols[start + i]],
      next: this.edges.destinations[start + i],
      logWeight: this.edges.weights[start + i],
    }));
  }
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
    if (maxStates > 0x7fffffff)
      throw new RangeError("maxProductStates exceeds integer storage range");
    const pool = new LayerPool(),
      starts: number[] = [],
      counts: number[] = [];
    this.layerIds.push(pool.intern(Uint32Array.of(0)));
    let layerStateCount = 1;
    const maxDfaTransitions = options.maxDfaTransitions ?? 1000000;
    integer(maxDfaTransitions, "maxDfaTransitions");
    const transitionCache = new Map<
      State,
      Map<S, { next: State; logWeight: number } | null>
    >();
    const cacheCapacity = options.maxCachedDfaTransitions ?? 100000;
    integer(cacheCapacity, "maxCachedDfaTransitions");
    let cachedTransitions = 0,
      cacheEntries = 0;
    const transition = (q: State, s: S) => {
      let row = transitionCache.get(q);
      if (row?.has(s)) return row.get(s)!;
      if (cachedTransitions >= maxDfaTransitions)
        throw new ResourceLimitError("DFA transitions", maxDfaTransitions);
      const next = acceptor.nextState(q, s);
      const value =
        next === null
          ? null
          : { next, logWeight: logTransitionWeight(acceptor, q, s) };
      if (cacheCapacity > 0) {
        if (cacheEntries === cacheCapacity) {
          transitionCache.clear();
          cacheEntries = 0;
          row = undefined;
        }
        if (!row) {
          row = new Map();
          transitionCache.set(q, row);
        }
        row.set(s, value);
        cacheEntries++;
      }
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
      for (const id of this.layerIds[t]) {
        if (counts[id] === undefined) {
          const { context, acceptor: q } = this.states[id];
          starts[id] = this.edges.length;
          for (const e of graph.outgoing(context)) {
            const cached = transition(q, e.symbol);
            if (
              cached === null ||
              cached.logWeight === NEG ||
              e.probability === 0
            )
              continue;
            this.edges.append(
              graph.encoder.encode(e.symbol),
              intern(e.nextState, cached.next),
              Math.log(e.probability) + cached.logWeight,
            );
          }
          counts[id] = this.edges.length - starts[id];
        }
        this.productEdgeCount += counts[id];
        if (this.productEdgeCount > maxEdges)
          throw new ResourceLimitError("time-indexed edges", maxEdges);
        for (let e = starts[id]; e < starts[id] + counts[id]; e++)
          next.add(this.edges.destinations[e]);
      }
      layerStateCount += next.size;
      if (layerStateCount > maxLayerStates)
        throw new ResourceLimitError("time-indexed states", maxLayerStates);
      this.layerIds.push(pool.intern(Uint32Array.from(next)));
    }
    this.rowStarts = Uint32Array.from(this.states, (_, id) => starts[id] ?? 0);
    this.rowCounts = Uint32Array.from(this.states, (_, id) => counts[id] ?? 0);
    this.edges.finish();
    if (options.pruneDeadStates) this.prune(pool);
  }
  private prune(pool: LayerPool): void {
    let alive = new Uint8Array(this.states.length);
    for (const id of this.layerIds[this.length])
      if (this.acceptor.isAccepting(this.states[id].acceptor)) alive[id] = 1;
    const marks = new Uint8Array(this.edges.length);
    this.layerIds[this.length] = pool.intern(
      this.layerIds[this.length].filter((id) => alive[id] !== 0),
    );
    for (let t = this.length - 1; t >= 0; t--) {
      const current = new Uint8Array(this.states.length);
      for (const id of this.layerIds[t])
        for (
          let e = this.rowStarts[id];
          e < this.rowStarts[id] + this.rowCounts[id];
          e++
        )
          if (alive[this.edges.destinations[e]]) {
            current[id] = 1;
            marks[e] = 1;
          }
      this.layerIds[t] = pool.intern(
        this.layerIds[t].filter(
          (id) => current[id] !== 0 || (t === 0 && id === 0),
        ),
      );
      alive = current;
    }
    // Remove edges absent from every feasible time layer, keeping source row order.
    let used = 0;
    for (let id = 0; id < this.states.length; id++) {
      const start = this.rowStarts[id],
        end = start + this.rowCounts[id];
      this.rowStarts[id] = used;
      for (let e = start; e < end; e++)
        if (marks[e]) {
          this.edges.symbols[used] = this.edges.symbols[e];
          this.edges.destinations[used] = this.edges.destinations[e];
          this.edges.weights[used++] = this.edges.weights[e];
        }
      this.rowCounts[id] = used - this.rowStarts[id];
    }
    this.edges.length = used;
    this.edges.finish();
    this.productEdgeCount = 0;
    for (let t = 0; t < this.length; t++)
      for (const id of this.layerIds[t])
        this.productEdgeCount += this.rowCounts[id];
  }
  get productStateCount(): number {
    return this.states.length;
  }
  get timeIndexedProductStateCount(): number {
    return this.layerIds.reduce((n, l) => n + l.length, 0);
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
  private backwardRows: (Float64Array | undefined)[] = [];
  private indices: (Uint32Array | Int32Array)[];
  private interval: number;
  private blockStart = -1;
  private blockRows: Float64Array[] = [];
  private samplingRows: Map<
    number,
    { cumulative: Float64Array; total: number }
  >[] = [];
  private samplingEdges = 0;
  private maxSamplingEdges: number;
  get cachedSamplingEdgeCount(): number {
    return this.samplingEdges;
  }
  /** Inspection materializes all rows in checkpoint mode; inference never calls this getter. */
  get logBetas(): Float64Array[] {
    return Array.from({ length: this.product.length + 1 }, (_, t) =>
      this.backwardAt(t),
    );
  }
  constructor(
    readonly product: CompiledProduct<S>,
    options: {
      maxCachedSamplingEdges?: number;
      checkpointInterval?: number;
    } = {},
  ) {
    this.maxSamplingEdges = options.maxCachedSamplingEdges ?? 100000;
    integer(this.maxSamplingEdges, "maxCachedSamplingEdges");
    this.interval = options.checkpointInterval ?? 1;
    integer(this.interval, "checkpointInterval");
    if (this.interval < 1)
      throw new RangeError("checkpointInterval must be positive");
    const shared = new WeakMap<Uint32Array, Uint32Array | Int32Array>();
    this.indices = product.layerIds.map((layer) => {
      let index = shared.get(layer);
      if (index) return index;
      if (layer.length * 4 < product.states.length) index = layer;
      else {
        index = new Int32Array(product.states.length).fill(-1);
        layer.forEach((id, i) => ((index as Int32Array)[id] = i));
      }
      shared.set(layer, index);
      return index;
    });
    const n = product.length;
    let next: Float64Array = Float64Array.from(product.layerIds[n], (id) =>
      product.acceptor.isAccepting(product.states[id].acceptor) ? 0 : NEG,
    );
    this.backwardRows[n] = next;
    for (let t = n - 1; t >= 0; t--) {
      next = this.computeBackward(t, next);
      if (t % this.interval === 0) this.backwardRows[t] = next;
    }
  }
  private lookup(t: number, id: number): number {
    const index = this.indices[t];
    if (index instanceof Int32Array) return index[id] ?? -1;
    return sortedIndex(index, id);
  }
  private computeBackward(t: number, next: Float64Array): Float64Array {
    const p = this.product,
      edges = p.edges;
    return Float64Array.from(p.layerIds[t], (id) => {
      let value = NEG;
      for (
        let e = p.rowStarts[id];
        e < p.rowStarts[id] + p.rowCounts[id];
        e++
      ) {
        const i = this.lookup(t + 1, edges.destinations[e]);
        value = logAdd(value, edges.weights[e] + (i < 0 ? NEG : next[i]));
      }
      return value;
    });
  }
  private backwardAt(t: number): Float64Array {
    const stored = this.backwardRows[t];
    if (stored) return stored;
    const start = Math.floor(t / this.interval) * this.interval;
    if (start !== this.blockStart) {
      const end = Math.min(start + this.interval, this.product.length);
      let next = this.backwardRows[end]!;
      const rows: Float64Array[] = [];
      for (let k = end - 1; k > start; k--) {
        next = this.computeBackward(k, next);
        rows[k - start] = next;
      }
      this.blockRows = rows;
      this.blockStart = start;
    }
    return this.blockRows[t - start];
  }
  private beta(t: number, id: number): number {
    const row = this.backwardAt(t),
      i = this.lookup(t, id);
    return i < 0 ? NEG : row[i];
  }
  get logPartitionFunction(): number {
    return this.backwardRows[0]?.[0] ?? NEG;
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
  /** Exact retained typed-buffer sizes, excluding graph, Maps and inspection snapshots. */
  memoryDiagnostics() {
    const unique = <T extends ArrayBufferView>(rows: Iterable<T>) =>
      [...new Set(rows)].reduce((n, row) => n + row.byteLength, 0);
    const backward = this.backwardRows.filter((r): r is Float64Array => !!r),
      p = this.product;
    const layers = unique(p.layerIds),
      indices = unique(
        this.indices.filter((r): r is Int32Array => r instanceof Int32Array),
      ),
      betas = unique([...backward, ...this.blockRows.filter(Boolean)]),
      sampling = unique(
        this.samplingRows.flatMap((row) =>
          row ? [...row.values()].map((v) => v.cumulative) : [],
        ),
      );
    return {
      uniqueLayers: new Set(p.layerIds).size,
      storedBackwardLayers: backward.length,
      checkpointInterval: this.interval,
      layerBytes: layers,
      indexBytes: indices,
      backwardBytes: betas,
      edgeBytes:
        p.edges.byteLength + p.rowStarts.byteLength + p.rowCounts.byteLength,
      samplingBytes: sampling,
      totalBufferBytes:
        layers +
        indices +
        betas +
        p.edges.byteLength +
        p.rowStarts.byteLength +
        p.rowCounts.byteLength +
        sampling,
    };
  }
  sample(rng: () => number = Math.random): S[] {
    this.requireFeasible();
    const p = this.product,
      edges = p.edges;
    let id = 0;
    const sequence: S[] = [];
    for (let t = 0; t < p.length; t++) {
      const start = p.rowStarts[id],
        count = p.rowCounts[id];
      let cached = this.samplingRows[t]?.get(id);
      if (!cached) {
        const next = this.backwardAt(t + 1);
        let max = NEG;
        for (let e = start; e < start + count; e++) {
          const i = this.lookup(t + 1, edges.destinations[e]);
          max = Math.max(max, edges.weights[e] + (i < 0 ? NEG : next[i]));
        }
        const cumulative = new Float64Array(count);
        let total = 0;
        for (let j = 0; j < count; j++) {
          const e = start + j,
            i = this.lookup(t + 1, edges.destinations[e]);
          total += Math.exp(edges.weights[e] + (i < 0 ? NEG : next[i]) - max);
          cumulative[j] = total;
        }
        cached = { cumulative, total };
        if (this.samplingEdges + count <= this.maxSamplingEdges) {
          (this.samplingRows[t] ??= new Map()).set(id, cached);
          this.samplingEdges += count;
        }
      }
      const u = rng();
      if (!Number.isFinite(u) || u < 0 || u >= 1)
        throw new RangeError("rng must return a number in [0,1)");
      const target = u * cached.total;
      let low = 0,
        high = count;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (cached.cumulative[middle] > target) high = middle;
        else low = middle + 1;
      }
      let choice = low;
      if (choice === count) {
        choice = count - 1;
        while (
          choice > 0 &&
          cached.cumulative[choice] === cached.cumulative[choice - 1]
        )
          choice--;
      }
      const e = start + choice;
      sequence.push(p.graph.encoder.symbols[edges.symbols[e]]);
      id = edges.destinations[e];
    }
    return sequence;
  }
  sampleMany(n: number, rng: () => number = Math.random): S[][] {
    integer(n, "sample count");
    this.requireFeasible();
    return Array.from({ length: n }, () => this.sample(rng));
  }
  logSequenceWeight(sequence: readonly S[]): number {
    const p = this.product;
    if (sequence.length !== p.length) return NEG;
    let id = 0,
      value = 0;
    for (const symbol of sequence) {
      let found = -1;
      for (let e = p.rowStarts[id]; e < p.rowStarts[id] + p.rowCounts[id]; e++)
        if (p.graph.encoder.symbols[p.edges.symbols[e]] === symbol) {
          found = e;
          break;
        }
      if (found < 0) return NEG;
      value += p.edges.weights[found];
      id = p.edges.destinations[found];
    }
    return p.acceptor.isAccepting(p.states[id].acceptor) ? value : NEG;
  }
  logConditionalProbability(sequence: readonly S[]): number {
    this.requireFeasible();
    return Math.min(
      0,
      this.logSequenceWeight(sequence) - this.logPartitionFunction,
    );
  }
  conditionalProbability(sequence: readonly S[]): number {
    return Math.exp(this.logConditionalProbability(sequence));
  }
  marginals(options: { maxEdgeRecords?: number } = {}): MarginalResult<S> {
    this.requireFeasible();
    const maxRecords = options.maxEdgeRecords ?? 1000000;
    integer(maxRecords, "maxEdgeRecords");
    const p = this.product,
      edges = p.edges,
      symbolProbabilities: Map<S, number>[] = [];
    const edgeLogs = new Map<number, Map<S, number>>();
    let records = 0,
      alpha = new Map<number, number>([[0, 0]]);
    for (let t = 0; t < p.length; t++) {
      const nextAlpha = new Map<number, number>(),
        symbols = new Map<S, number>(),
        nextBeta = this.backwardAt(t + 1);
      for (const [id, forward] of alpha)
        for (
          let e = p.rowStarts[id];
          e < p.rowStarts[id] + p.rowCounts[id];
          e++
        ) {
          const destination = edges.destinations[e],
            i = this.lookup(t + 1, destination);
          if (i < 0 || nextBeta[i] === NEG) continue;
          const next = forward + edges.weights[e],
            symbol = p.graph.encoder.symbols[edges.symbols[e]];
          nextAlpha.set(
            destination,
            logAdd(nextAlpha.get(destination) ?? NEG, next),
          );
          const mass = next + nextBeta[i] - this.logPartitionFunction;
          symbols.set(symbol, logAdd(symbols.get(symbol) ?? NEG, mass));
          const context = p.states[id].context;
          let row = edgeLogs.get(context);
          if (!row) {
            row = new Map();
            edgeLogs.set(context, row);
          }
          if (!row.has(symbol)) {
            if (records >= maxRecords)
              throw new ResourceLimitError("marginal edge records", maxRecords);
            records++;
          }
          row.set(symbol, logAdd(row.get(symbol) ?? NEG, mass));
        }
      symbolProbabilities.push(
        new Map([...symbols].map(([symbol, log]) => [symbol, Math.exp(log)])),
      );
      alpha = nextAlpha;
    }
    const expectedTransitions: ExpectedTransition<S>[] = [];
    for (const [context, row] of edgeLogs)
      for (const [symbol, log] of row) {
        const edge = p.graph
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
}
function sortedIndex(ids: Uint32Array, id: number): number {
  let low = 0,
    high = ids.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ids[middle] < id) low = middle + 1;
    else high = middle;
  }
  return ids[low] === id ? low : -1;
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
  let scores = new Float64Array(p.states.length).fill(NEG);
  for (const id of p.layerIds[p.length])
    if (p.acceptor.isAccepting(p.states[id].acceptor)) scores[id] = 0;
  const choices: Uint32Array[] = [];
  for (let t = p.length - 1; t >= 0; t--) {
    const now = new Float64Array(p.states.length).fill(NEG),
      row = new Uint32Array(p.layerIds[t].length).fill(0xffffffff);
    for (let i = 0; i < p.layerIds[t].length; i++) {
      const id = p.layerIds[t][i];
      let best = NEG;
      for (
        let e = p.rowStarts[id];
        e < p.rowStarts[id] + p.rowCounts[id];
        e++
      ) {
        const score = p.edges.weights[e] + scores[p.edges.destinations[e]];
        if (score > best) {
          best = score;
          row[i] = e;
        }
      }
      now[id] = best;
    }
    choices[t] = row;
    scores = now;
  }
  const logWeight = scores[0];
  if (logWeight === NEG) return { feasible: false, sequence: null, logWeight };
  let id = 0;
  const sequence: S[] = [];
  for (let t = 0; t < p.length; t++) {
    const e = choices[t][sortedIndex(p.layerIds[t], id)];
    sequence.push(p.graph.encoder.symbols[p.edges.symbols[e]]);
    id = p.edges.destinations[e];
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
