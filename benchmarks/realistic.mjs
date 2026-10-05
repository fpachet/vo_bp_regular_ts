import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { realisticWorkloads as workloads } from "./realistic-workloads.mjs";
writeFileSync("benchmarks/realistic-inputs.json", JSON.stringify(workloads));
const output = process.argv[3] ?? "benchmarks/realistic-results.json",
  reference = process.argv[2];
const results = {
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  date: new Date().toISOString(),
  ts: [],
  python: [],
};
for (let i = 0; i < workloads.length; i++) {
  for (const [runtime, cmd, args] of [
    [
      "ts",
      process.execPath,
      [
        "--expose-gc",
        "benchmarks/realistic-node.mjs",
        "benchmarks/realistic-inputs.json",
        String(i),
      ],
    ],
    ...(reference
      ? [
          [
            "python",
            "python3",
            [
              "benchmarks/realistic-python.py",
              reference,
              "benchmarks/realistic-inputs.json",
              String(i),
            ],
          ],
        ]
      : []),
  ]) {
    console.error(`Measuring ${workloads[i].name} (${runtime})…`);
    const result = spawnSync(cmd, args, { encoding: "utf8", timeout: 240000 });
    if (result.status !== 0)
      throw new Error(result.stderr || `Benchmark ${runtime} failed`);
    results[runtime].push(JSON.parse(result.stdout));
    writeFileSync(output, JSON.stringify(results, null, 2) + "\n");
  }
}
for (let i = 0; i < results.python.length; i++) {
  const ts = results.ts[i],
    py = results.python[i];
  if (
    Math.abs(ts.logPartition - py.logPartition) > 1e-9 ||
    ts.states !== py.states ||
    ts.edges !== py.edges
  )
    throw new Error("Cross-language realistic inference mismatch");
}
writeFileSync(output, JSON.stringify(results, null, 2) + "\n");
console.log(`Saved ${output}`);
