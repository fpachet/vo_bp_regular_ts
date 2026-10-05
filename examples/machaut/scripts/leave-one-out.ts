import { readFileSync, writeFileSync } from "node:fs";
import { seededRng } from "markov-constraints";
import { tokens, type Melody, type Representation } from "../src/music";
import { train, logSourceWeight } from "../src/markov/train";
const corpus = JSON.parse(
  readFileSync(
    new URL("../public/corpus/pilot-melodies.json", import.meta.url),
    "utf8",
  ),
) as Melody[];
const rows = corpus.flatMap((held, i) =>
  (["absolute", "intervals", "relative"] as Representation[]).map(
    (representation) => {
      const model = train(
        corpus.filter((_, j) => j !== i),
        { representation, maxOrder: 3, backoffWeight: 0.25 },
      );
      const sequence = tokens(held, representation),
        rng = seededRng(100 + i),
        shuffled = sequence.slice();
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
      }
      let state = model.graph.startState;
      const generated: number[] = [];
      for (let j = 0; j < sequence.length; j++) {
        const row = model.graph.outgoing(state);
        let sum = 0;
        const u = rng(),
          e = row.find((e) => (sum += e.probability) > u) ?? row.at(-1)!;
        generated.push(e.symbol);
        state = e.nextState;
      }
      const score = (xs: number[]) => {
        const logWeight = logSourceWeight(model.graph, xs);
        return {
          logWeight: Number.isFinite(logWeight) ? logWeight : null,
          meanLogWeight: Number.isFinite(logWeight)
            ? logWeight / xs.length
            : null,
          supported: Number.isFinite(logWeight),
        };
      };
      return {
        heldOut: held.id,
        representation,
        trainingPieces: corpus.length - 1,
        tokens: sequence.length,
        heldOutScore: score(sequence),
        shuffledScore: score(shuffled),
        generatedScore: score(generated),
      };
    },
  ),
);
writeFileSync(
  "experiment-results.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      library: "markov-constraints@0.4.0-rc.1",
      maxOrder: 3,
      backoffWeight: 0.25,
      seedBase: 100,
      notes:
        "Exploratory pilot only. Relative representation uses each held-out piece’s inferred final; shuffled token sequences are a simple null baseline. Unseen tokens yield unsupported sequences, reported with null scores. No stylistic validity claim.",
      corpus: corpus.map((m) => ({ id: m.id, sha256: m.metadata.sha256 })),
      rows,
    },
    null,
    2,
  ),
);
console.log(
  rows
    .map(
      (r) =>
        `${r.heldOut} ${r.representation}: held-out ${r.heldOutScore.meanLogWeight?.toFixed(3) ?? "unsupported"}; shuffled ${r.shuffledScore.meanLogWeight?.toFixed(3) ?? "unsupported"}`,
    )
    .join("\n"),
);
