# API guide — 0.2 release candidate

The package root exports the core; `markov-constraints/constraints` exports DFA
builders. There are no runtime dependencies. ESM is the supported module format;
Node 20+ and modern browsers/Workers are the supported environments.

## Model construction

`ContextGraph.fromSequences(sequences, { maxOrder, startState? })` trains the
strict longest-known-context MLE source. Strings iterate by Unicode code point;
array sequences represent arbitrary string/number tokens.

`ContextGraph.fromBackoffSequences(sequences, { maxOrder, backoffWeight?,
startState? })` matches Python `from_backoff_sequences`. At a context of order K,
it sums normalized suffix distributions with weights `backoffWeight ** (K-k)`
for each known suffix of order k, then normalizes the mixture. Default 0.25;
allowed range [0,1]. Zero selects the strict row for observed contexts. An
unobserved start context can receive support from known suffixes when weight>0.
This is a fixed probabilistic mixture, not a generation-time singleton policy.

`fromCounts([{context, counts: Map}], options?)` and
`fromProbabilities([{context, probabilities: Map}], options?)` supply explicit
rows. Probability rows sum to one within 1e-9; empty rows are dead contexts.
Symbols are strings or finite numbers. Contexts, alphabets and outgoing rows are
read-only by contract; do not mutate a model during inference.

## Serialization

```ts
const snapshot = graph.toJSON();
const restored = ContextGraph.fromJSON(JSON.parse(JSON.stringify(snapshot)));
const table = serializeDFA(constraint, graph.alphabet);
const restoredConstraint = deserializeDFA(JSON.parse(JSON.stringify(table)));
```

Graph schema version 1 contains contexts, rows, numeric startState and maxOrder.
DFA schema version 1 contains alphabet, numeric startState, Boolean accepting
array and transition tuples `[source, symbolIndex, destination, logWeight]`.
Zero-weight/rejected edges are omitted, avoiding nonfinite JSON numbers. Extreme
positive factors are retained as finite logs. DFA state identities are replaced
by integer IDs, and symbols outside the serialized alphabet are rejected.

`serializeDFA` closes the reachable automaton over the explicit alphabet. It
requires finite state behavior; callback DFAs have no automatic finite-state
proof. It defaults to maxStates=100000 and maxTransitions=1000000, and raises
ResourceLimitError on budget exhaustion. Snapshots copy graph/DFA data so later
snapshot mutations do not change the original or restored object.

## Inference options

`runBP(graph, acceptor, options)`, `compileProduct(...)` and
`mostProbableSequence(...)` share these options:

| Option | Default | Meaning |
| --- | --- | --- |
| length | required | Nonnegative integer emission horizon |
| startContext | graph start context | Exact known context before first emission |
| startAcceptorState | acceptor start | Scalar DFA state before first emission |
| maxLength | 100000 | Maximum requested horizon |
| maxProductStates | 100000 | Unique reachable context/DFA pairs |
| maxTimeIndexedStates | 5000000 | Sum of reachable states over layers |
| maxProductEdges | 10000000 | Sum of reachable outgoing edges over time |
| maxDfaTransitions | 1000000 | Cached DFA state/symbol calls, including rejection |
| maxCachedSamplingEdges | 100000 | Lazy cached sampling CDF entries; zero disables |

Overrides exclude the probability of any prefix. Unknown source contexts raise
RangeError. Resource budgets reject compilation rather than silently truncating
the graph or approximating inference. Raise budgets deliberately for larger jobs.

`runBP` results expose partition/log partition, feasibility, conditional sequence
probabilities, samples and product diagnostics. `sample(rng?)` and
`sampleMany(n, rng?)` accept a function returning a finite value in [0,1):

```ts
const rng = seededRng(42);
const samples = result.sampleMany(100, rng);
```

`seededRng` uses a stable Mulberry32 stream with an unsigned 32-bit seed. It is
reproducible within this API, not equivalent to Python's RNG or cryptographic.
Recreate the RNG from the seed to reproduce an entire sample stream.

`InfeasibleError` identifies zero-mass sampling/probability requests.
`ResourceLimitError` carries `resource` and `limit`. Invalid argument types/ranges
use TypeError/RangeError; invalid source probabilities or weights use Error.
Optimization returns a discriminated feasible/infeasible result, not an exception
for zero mass. Malformed or out-of-horizon candidate sequences have probability 0
when the conditioned distribution exists.

## Reuse, performance and numerical guarantees

```ts
const product = compileProduct(graph, constraint, { length: 128 });
const bp = new ProductBPResult(product, { maxCachedSamplingEdges: 100000 });
const optimum = optimizeProduct(product);
```

Product rows and DFA transitions are cached. Backward values remain sparse by
layer; layer indices switch between Maps and compact integer arrays according
to occupancy. Sampling lazily caches bounded cumulative future-mass weights and
uses binary search. Caches belong to a result and are released with it; reuse one
result to amortize inference, and set cache size zero for minimum retained memory.
`cachedSamplingEdgeCount` reports actual cached edge entries.

Inference remains in log space, including constraints whose ordinary mass is
zero or Infinity due to floating-point range. Consult feasible/logPartitionFunction
rather than testing partitionFunction>0. The probability-space prototype in the
benchmark is faster for ordinary masses but is not the public engine: it lacks
a verified fallback for underflow. Computed ties in optimization preserve source
outgoing row order. Conditional exactness and optimality are subject to ordinary
floating-point rounding.

## Installation and release checks

Until published to npm, install the validated tarball produced by `npm pack`.
`npm run test:package` packs into a temporary directory, installs offline into an
independent project, typechecks a strict TS consumer and executes its ESM output.

`npm run test:browser` builds the deployable static artifact and tests Chromium
and Firefox, including module Workers. Install browsers first with
`npx playwright install chromium firefox`. GitHub CI runs Node 20/22/24 tests,
external package checks and both browser engines. The Pages workflow also gates
deployment on browser checks.

The manual **Prepare npm release artifact** workflow creates a tested tarball.
For an actual npm release, confirm package-name ownership, registry authentication
and the intended dist-tag; then publish the tarball with `npm publish <tarball>
--tag next --access public`. No npm publication or credentials are configured by
this repository automatically.
