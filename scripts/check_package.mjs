import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
const temp = mkdtempSync(join(tmpdir(), "markov-consumer-"));
try {
  const packed = execFileSync(
    "npm",
    [
      "pack",
      "--json",
      "--pack-destination",
      temp,
      "--cache",
      join(temp, "cache"),
    ],
    { encoding: "utf8" },
  );
  const [info] = JSON.parse(
    packed.slice(
      packed.indexOf("[{") >= 0 ? packed.indexOf("[{") : packed.indexOf("[\n"),
    ),
  );
  writeFileSync(
    join(temp, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--package-lock=false",
      "--cache",
      join(temp, "cache"),
      join(temp, info.filename),
    ],
    { cwd: temp, stdio: "pipe" },
  );
  writeFileSync(
    join(temp, "consumer.ts"),
    `
import {ContextGraph,runBP,mostProbableSequence,seededRng,serializeDFA,deserializeDFA} from 'markov-constraints';
import {allOf,prefixAcceptor,maxOrderAcceptor,paddedDurationAcceptor} from 'markov-constraints/constraints';
const corpus=['abab'];
const graph=ContextGraph.fromBackoffSequences(corpus,{maxOrder:1,backoffWeight:.25});
const restored=ContextGraph.fromJSON(JSON.parse(JSON.stringify(graph.toJSON())));
const constraint=allOf(prefixAcceptor(['a']),maxOrderAcceptor(corpus,1),paddedDurationAcceptor(5,{length:5,padSymbol:'PAD',duration:(symbol:string)=>symbol==='a'?1:2}));
const dfa=deserializeDFA(serializeDFA(constraint,graph.alphabet));
const result=runBP(restored,dfa,{length:5});
if(!result.feasible||result.sample(seededRng(42))[0]!=='a')throw new Error('Consumer inference failed');
const marginals=result.marginals();
if(marginals.symbolProbabilities.length!==5||Math.abs(marginals.expectedTransitions.reduce((n,e)=>n+e.expectedCount,0)-5)>1e-10)throw new Error('Consumer marginals failed');
const best=mostProbableSequence(graph,constraint,{length:5});
if(!best.feasible||best.sequence.length!==5)throw new Error('Consumer optimization failed');
console.log('Packed ESM exports and strict external TypeScript consumer passed.');
`,
  );
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/typescript/bin/tsc"),
      "--strict",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--lib",
      "ES2022,DOM",
      "consumer.ts",
    ],
    { cwd: temp, stdio: "inherit" },
  );
  execFileSync(process.execPath, ["consumer.js"], {
    cwd: temp,
    stdio: "inherit",
  });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
