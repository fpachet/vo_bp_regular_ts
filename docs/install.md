# Install and use 0.4.0-rc.1

`markov-constraints` has no runtime dependencies. It supports Node 20+, strict
TypeScript, and modern browsers/Workers through ESM. The [npm package](https://www.npmjs.com/package/markov-constraints) is available
as a prerelease:

```sh
npm install markov-constraints@next
```

Pin `npm install markov-constraints@0.4.0-rc.1` for reproducible deployments.
You can also download the exact validated tarball from the
[GitHub prerelease](https://github.com/fpachet/vo_bp_regular_ts/releases/tag/v0.4.0-rc.1)
and install with `npm install ./markov-constraints-0.4.0-rc.1.tgz`.

## Node.js

Save as `example.mjs` and run `node example.mjs`:

```js
import { ContextGraph, runBP, seededRng } from "markov-constraints";
import { prefixAcceptor } from "markov-constraints/constraints";

const graph = ContextGraph.fromSequences(["ABAB", "BABA"], { maxOrder: 1 });
const bp = runBP(graph, prefixAcceptor(["A"]), { length: 8 });
if (bp.feasible) console.log(bp.sample(seededRng(42)).join("")); // ABABABAB
```

Use `.mjs` or set `"type": "module"` in the consuming project's package.json.
There is no CommonJS `require` entry point.

## TypeScript

Declarations are included; no separate `@types` package is needed. Use the same
example in `example.ts`. For Node projects use `module: "NodeNext"` and
`moduleResolution: "NodeNext"`, with `target: "ES2022"`, `strict: true` and
`"type": "module"` in package.json. Browser bundler projects can use
`module: "ESNext"` and `moduleResolution: "Bundler"`.

## Browser and Worker

Install in an ESM browser project and use the same package imports. For expensive
inference, create a module Worker so the interface stays responsive. A Vite-style
bundler resolves the package imports in both files:

```js
// main.js
const worker = new Worker(new URL("./generator.js", import.meta.url), {
  type: "module",
});
worker.onmessage = ({ data }) => console.log(data);
worker.postMessage({ corpus: ["ABAB", "BABA"], length: 8, seed: 42 });
```

```js
// generator.js
import { ContextGraph, runBP, seededRng } from "markov-constraints";
import { prefixAcceptor } from "markov-constraints/constraints";

self.onmessage = ({ data }) => {
  try {
    const graph = ContextGraph.fromSequences(data.corpus, { maxOrder: 1 });
    const bp = runBP(graph, prefixAcceptor(["A"]), { length: data.length });
    self.postMessage({
      sequence: bp.feasible ? bp.sample(seededRng(data.seed)) : null,
    });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
```

Send symbols, options and serialized graph/DFA tables across Workers; callback
functions cannot be structured-cloned. Terminate the Worker to cancel a job.
Serving ESM files over HTTP is required. Browsers do not resolve bare npm imports
without a bundler or an import map.

## Performance choices

Reuse a `runBP` result for repeated sampling; defaults retain backward values and
bounded sampling caches. Optional `pruneDeadStates: true` can reduce retained
memory after compilation. `checkpointInterval: 8` and
`maxCachedSamplingEdges: 0` further reduce backward/cache storage, but sampling
can become dramatically slower. Keep checkpointing off for repeated generation.
See the [memory measurements](memory-results.md) and [API guide](api.md).

## Validate the installed artifact

From the repository, `npm run test:package` validates a newly packed artifact in
an independent project. To test an existing tarball or the registry publication:

```sh
npm run test:package -- /absolute/path/markov-constraints-0.4.0-rc.1.tgz
npm run test:package -- markov-constraints@0.4.0-rc.1
```

Both checks execute the README quick start and typecheck/execute a richer strict
TypeScript consumer. The published version must pass the second check before
the release is reported as available on npm.
