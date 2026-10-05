import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const baseline = process.argv[2];
if (!baseline)
  throw new Error(
    "Pass the baseline dist directory (see docs/memory-results.md)",
  );
const measurements = [];
for (const name of ["alice-characters", "alice-words", "branching"])
  for (const mode of ["baseline", "default", "pruned", "checkpoint"]) {
    const rows = [];
    for (let repetition = 0; repetition < 3; repetition++) {
      const root = mode === "baseline" ? resolve(baseline) : resolve("dist");
      const child = spawnSync(
        process.execPath,
        ["--expose-gc", "benchmarks/memory-case.mjs", root, name, mode],
        { encoding: "utf8", timeout: 180000 },
      );
      if (child.status !== 0)
        throw new Error(
          child.stderr || `Memory benchmark failed ${name}/${mode}`,
        );
      rows.push(JSON.parse(child.stdout));
    }
    const row = { name, mode, repetitions: rows, median: {} };
    for (const key of [
      "constructionMs",
      "sample3Ms",
      "heapMiB",
      "buffersMiB",
      "totalMiB",
      "afterSamplingTotalMiB",
      "peakRSSMiB",
    ])
      row.median[key] = rows.map((r) => r[key]).sort((a, b) => a - b)[1];
    const reference = measurements.find(
      (r) => r.name === name && r.mode === "baseline",
    );
    if (reference)
      for (const r of rows) {
        assert.ok(
          Math.abs(r.logPartition - reference.repetitions[0].logPartition) <
            1e-10,
        );
        assert.deepEqual(r.samples, reference.repetitions[0].samples);
      }
    measurements.push(row);
    writeFileSync(
      "benchmarks/memory-results.json",
      JSON.stringify(
        {
          baselineCommit: "2c8c801",
          node: process.version,
          platform: process.platform,
          architecture: process.arch,
          date: new Date().toISOString(),
          measurements,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(name, mode, row.median);
  }
