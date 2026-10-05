# Markov Constraints — TypeScript

**Exact controlled generation for variable-order Markov models.**

Train a variable-order Markov model. Add any regular constraint. Sample exactly—or find the most probable solution.

This native TypeScript library computes the distribution of a finite probabilistic
context model conditioned on an explicit regular language. It runs in Node.js,
modern browsers and Web Workers, with no runtime dependencies. It implements the
scientific core of [vo-regular-bp](https://github.com/fpachet/vo-regular-bp), rather
than its experimental order-stack policies.

## Quick start

```sh
npm install
npm test
npm run examples
```

From this repository, or after installing a locally packed tarball:

```ts
import { ContextGraph, runBP, mostProbableSequence } from 'markov-constraints';
import {
  allOf, prefixAcceptor, suffixAcceptor, forbiddenSubstringAcceptor
} from 'markov-constraints/constraints';

const graph = ContextGraph.fromSequences(
  ['ABRACADABRA', 'BANANA', 'BARBARA', 'CABANA'],
  { maxOrder: 2 }
);
const constraint = allOf(
  prefixAcceptor(['B']),
  suffixAcceptor(['A']),
  forbiddenSubstringAcceptor([['B', 'R', 'A']])
);
const result = runBP(graph, constraint, { length: 12 });
console.log(result.partitionFunction); // 0.08125, up to floating-point rounding
console.log(result.sample());
console.log(result.sampleMany(5));
console.log(mostProbableSequence(graph, constraint, { length: 12 }));
```

The package is ready to pack locally; it has not been published to npm. Run
`npm run build && npm pack` to produce a distributable tarball. The emitted ESM
and declarations expose the root core module and the `/constraints` subpath.

## Model semantics

Symbols are strings or finite numbers. Strings supplied as training sequences
are iterated by Unicode code point. Array sequences permit whole words, event
IDs, pitches or clickstream tokens. Different training sequences never join.
No implicit beginning/end tokens or smoothing are added.

Training counts each token after every observed suffix of orders 0..maxOrder.
Each continuation row is normalized independently. Following an emission, the
source moves to the longest represented suffix within maxOrder. An explicit
context with no outgoing row is a dead end. Context IDs and symbol IDs are
integers internally; the public alphabet contains the original symbols.

Provide explicit distributions with `ContextGraph.fromProbabilities`:

```ts
const graph = ContextGraph.fromProbabilities([
  { context: [], probabilities: new Map([['a', 0.6], ['b', 0.4]]) },
  { context: ['a'], probabilities: new Map([['x', 0.5], ['y', 0.5]]) },
  { context: ['b'], probabilities: new Map([['x', 1]]) }
]);
```

`fromCounts` uses the same rows with a `counts` property and normalizes them.
Both accept `{ maxOrder, startState }`, where startState is a context before
emission. A custom graph can use `new ContextGraph(contexts, rows, startId,
maxOrder)`; row edges contain `{ symbol, probability, nextState }`.

## Regular constraints

Import builders from `markov-constraints/constraints`:

| Builder | Semantics |
| --- | --- |
| `trueAcceptor()` | Accept every finite sequence |
| `positionalAcceptor(n, new Map([[i, allowedSymbols]]))` | Exactly n symbols, zero-based allowed sets |
| `prefixAcceptor(symbols)` | Must start with the supplied prefix |
| `suffixAcceptor(symbols)` | Must end with the supplied suffix |
| `forbiddenSubstringAcceptor(patterns)` | Reject any occurrence of any pattern |
| `requiredSubstringAcceptor(pattern)` | Require at least one occurrence |
| `maxOrderAcceptor(referenceSequences, limit)` | Forbid all reference substrings of length limit+1 |
| `meterAcceptor(pattern, classOf)` | One allowed class Set or null wildcard per position |
| `allOf(...acceptors)` | Intersect languages; multiply transition weights |

Empty prefixes, suffixes and required patterns accept every sequence. Empty
forbidden patterns raise, following Python. An empty forbidden pattern list
accepts everything. MAXORDER does not limit generated repetition itself: it
limits copying from the references. A strict source at order K often cannot
avoid its own training (K+1)-grams; use a lower source order for novelty. The
text example uses order 1 and a copy limit of 4.

`meterAcceptor` matches Python's per-symbol class semantics. It is not a
cumulative duration or bar-fitting engine; callers may encode duration/stress
classes and positional beat requirements.

A custom DFA needs a scalar string/number state, a deterministic transition,
and final acceptance. Returning null rejects the transition:

```ts
const dfa = new DFA<string>({
  startState: 0,
  transition: (state, symbol) => symbol === 'a' ? 1 : state,
  accept: state => state === 1
});
```

Optional `weight(state, symbol)` factors must be finite and nonnegative. Zero
removes support; weights may exceed one. `WeightedDFA` documents these same
semantics. Weighted inference normalizes source probability multiplied by
constraint factors, so its partition function need not be a probability mass.
Intersections sum log factors internally, preserving extremely small products.
Acceptors and models must remain deterministic and unchanged during inference.

## Inference and numerical behavior

```text
variable-order context graph × constraint DFA
                         ↓
              horizon-reachable product
                         ↓
                  backward sum-product
                         ↓
                exact conditional sampling
```

The backward recurrence sums each source probability times its constraint
factor times the downstream mass. Terminal mass is one for accepting states,
zero otherwise. Sampling chooses an edge proportional to that future mass:
this samples `P(x | x satisfies the constraint)` directly. It does not reject
whole unconstrained samples or locally steer a greedy decoder.

`runBP` returns:

- `partitionFunction`, `logPartitionFunction`, `feasible`;
- `sample(rng?)`, `sampleMany(count, rng?)`;
- `conditionalProbability(sequence)`, `logConditionalProbability(sequence)`;
- `productStateCount` (unique pairs), `timeIndexedProductStateCount`;
- `productEdgeCount` (sum over time-indexed outgoing rows).

Supply a random function returning a number in [0,1); default is Math.random.
Sampling streams are not bit-for-bit equivalent to Python's RNG. Conditional
probability returns zero for rejected or wrong-length sequences. Sampling and
conditional probability raise on infeasible models. Optimization returns
`{ feasible: false, sequence: null, logWeight: -Infinity }` on infeasibility.
Zero length is feasible precisely when the initial acceptor state accepts.

Inference always uses stable log-sum-exp. Ordinary partitionFunction may be
zero or Infinity even for a feasible result; consult logPartitionFunction and
feasible. Optimization uses log factors and first outgoing edge wins computed
ties. Exactness is with respect to the supplied model, subject to floating-point
rounding; nearly equal real weights can become ties. Complexity is proportional
to the reachable time-indexed product edges, plus source construction. It does
not allocate the full source × automaton Cartesian product.

For repeated operations on the same product, use `compileProduct`,
`new ProductBPResult(product)` and `optimizeProduct(product)`.

## Greedy is not optimization

For the explicit model above, P(a)=0.60 and P(b)=0.40. Greedy chooses a, but a
splits into ax and ay, each with probability 0.30. The complete sequence bx has
probability 0.40 and is globally optimal. Exact sampling draws ax, ay and bx
with probabilities 0.30, 0.30 and 0.40. These are three different operations.
Global optimization can favor repetitive output; novelty requires an explicit
constraint or a different probabilistic model.

## Examples and browser playground

`npm run examples` runs toy strings, a public-domain Alice excerpt, melody,
DNA and user journeys. The engine knows nothing about these domains.

```sh
npm run build
npm run playground
```

Open [the local playground](http://localhost:8080/packages/web/). It supports
both sampling and optimization, model order and horizon, prefix/suffix,
forbidden/required patterns, positional constraints, MAXORDER, and a custom
DFA JSON table. Generation runs in a fresh module Web Worker and displays
source/product diagnostics. Serve the repository root so emitted ESM imports
are reachable. Melody uses comma-separated MIDI pitches; journeys use
comma-separated tokens. WebAudio playback and graph visualization are future
extensions.

## Validation and benchmarks

`npm test` builds under strict TypeScript and runs Node's test runner. The suite
includes 37 Python-generated cases (30 randomized weighted DFAs), independently
enumerated tiny distributions, training row equivalence, overlapping pattern
checks, optimization ties, sampling frequencies, zero mass, and extreme weights.
A 1,200-symbol rare constraint verifies sampling despite probability underflow.
Comparisons use explicit 1e-10 scaled tolerance, not exact float equality.

```sh
python3 scripts/generate_fixtures.py /path/to/vo_regular_bp
npm test
npm run benchmark -- /path/to/vo_regular_bp
```

Python fixture generation also checks its own DP against exhaustive enumeration;
the JSON pins its reference Git revision. Neither script modifies Python source.
See [architecture](docs/architecture.md), [golden fixtures](fixtures/python-golden.json)
and the [measured benchmark report](benchmarks/report.md). Benchmarks separate
construction, product, log backward DP, sampling and optimization across four
shared workloads. Browser timings and memory measurements are not yet included.

## Scientific origins and related papers

This project continues the Markov Constraints line of work initiated by Pachet
and Roy in 2011. Its immediate algorithmic basis is sparse context-state belief
propagation for a fixed variable-order source and a deterministic regular
acceptor. The following papers provide the foundations and broader context:

1. **François Pachet (2026)**. *Exact Regular-Constrained Variable-Order Markov
   Generation via Sparse Context-State Belief Propagation*. **NeurIPS 2026**.
   [arXiv:2605.07839](https://arxiv.org/abs/2605.07839).
2. **Alexandre Bonlarron, François Pachet, Pierre Roy, Jean-Charles Régin (2026)**.
   *Constraining Generative Models: A Survey from the Constraint Programming
   Perspective*. **IJCAI 2026**, Survey Track, pp. 7777–7786.
   [Proceedings and paper](https://www.ijcai.org/proceedings/2026/864).
3. **François Pachet, Pierre Roy (2026)**. *Comment on “Markov Constraints:
   Steerable Generation of Markov Sequences”*. **Constraints**, Springer, 2026.
4. **François Pachet, Pierre Roy (2026)**. *Markov Constraints and Controlled
   Sequence Generation*. In **Analysis Techniques for Mathematical Physics,
   Geometry, and Music**, Lecture Notes in Mathematics, edited by Nicholas D.
   Alikakos and Cédric Villani, Springer, forthcoming.
5. **François Pachet (2026)**. *Attractive and Repulsive Pattern Control in
   Sequence Generation*. [arXiv:2606.24911](https://arxiv.org/abs/2606.24911).
6. **François Pachet, Pierre Roy (2026)**. *Hidden Biases in Conditioning
   Autoregressive Models*. [arXiv:2604.07855](https://arxiv.org/abs/2604.07855).
7. **François Pachet, Pierre Roy (2011)**. *Markov Constraints: Steerable
   Generation of Markov Sequences*. **Constraints**, Springer, 16, pp. 148–172.
   [Publisher article](https://doi.org/10.1007/s10601-010-9101-4).

The variable-order contribution is the correct sparse context state for regular
conditioning; regular BP itself is established machinery. The survey and related
papers situate controlled generation, weighted pattern control, and the limits of
exact conditioning for general autoregressive models. Listing them does not imply
that every method discussed there is implemented in this library.

## Python companion project

The Python companion, **vo_bp_regular / vo_regular_bp**, is available as
[fpachet/vo-regular-bp](https://github.com/fpachet/vo-regular-bp). It is the reference
implementation used to generate this repository's cross-language golden fixtures,
and contains the broader research and experimentation environment.

This repository, [fpachet/vo_bp_regular_ts](https://github.com/fpachet/vo_bp_regular_ts),
provides a native TypeScript implementation for Node.js, browsers, and Web Workers.
It implements the fixed-source finite-horizon core. Generation-time order policies,
research graph merging, and specialized Python backends are outside version 0.1.

MIT licensed; Python attribution is retained in LICENSE.
