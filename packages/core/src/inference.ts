import {
  type Symbol,
  type State,
  type Acceptor,
  ContextGraph,
  integer,
  logTransitionWeight,
} from "./model.js";
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
  ) {
    integer(length, "length");
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
        id = this.states.length;
        pairs.set(k, id);
        this.states.push({ context: c, acceptor: q });
      }
      return id;
    };
    intern(graph.startState, acceptor.startState);
    for (let t = 0; t < length; t++) {
      const next = new Set<number>();
      for (const id of this.layers[t]) {
        if (!this.rows[id]) {
          const { context, acceptor: q } = this.states[id];
          const row: ProductEdge<S>[] = [];
          for (const e of graph.outgoing(context)) {
            const r = acceptor.nextState(q, e.symbol);
            if (r === null) continue;
            const w = logTransitionWeight(acceptor, q, e.symbol);
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
        for (const e of this.rows[id]) next.add(e.next);
      }
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
  options: { length: number },
): CompiledProduct<S> {
  return new CompiledProduct(g, a, options.length);
}
/** Backward log sum-product, followed by normalized future-mass sampling. */
export class ProductBPResult<S extends Symbol> {
  readonly logBetas: Float64Array[] = [];
  private indices: Map<number, number>[];
  constructor(readonly product: CompiledProduct<S>) {
    this.indices = product.layers.map(
      (l) => new Map(l.map((id, i) => [id, i])),
    );
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
    const i = this.indices[t].get(id);
    return i === undefined ? NEG : this.logBetas[t][i];
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
    if (!this.feasible) throw new Error("Constraint has zero mass");
  }
  sample(rng: () => number = Math.random): S[] {
    this.requireFeasible();
    let id = 0;
    const sequence: S[] = [];
    for (let t = 0; t < this.product.length; t++) {
      const row = this.product.rows[id],
        scores = row.map((e) => e.logWeight + this.beta(t + 1, e.next));
      const max = scores.reduce((m, s) => Math.max(m, s), NEG);
      const ws = scores.map((s) => Math.exp(s - max)),
        sum = ws.reduce((a, b) => a + b, 0);
      const u = rng();
      if (!Number.isFinite(u) || u < 0 || u >= 1)
        throw new RangeError("rng must return a number in [0,1)");
      let remaining = u * sum;
      let choice = 0;
      for (let i = 0; i < ws.length; i++) if (ws[i] > 0) choice = i;
      for (let i = 0; i < ws.length; i++) {
        remaining -= ws[i];
        if (ws[i] > 0 && remaining < 0) {
          choice = i;
          break;
        }
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
  conditionalProbability(sequence: readonly S[]): number {
    return Math.exp(this.logConditionalProbability(sequence));
  }
}
export function runBP<S extends Symbol>(
  g: ContextGraph<S>,
  a: Acceptor<S>,
  options: { length: number },
): ProductBPResult<S> {
  return new ProductBPResult(compileProduct(g, a, options));
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
  options: { length: number },
): Optimum<S> {
  return optimizeProduct(compileProduct(g, a, options));
}
