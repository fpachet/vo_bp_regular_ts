import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// This application intentionally consumes the published npm package, not dist/.
execFileSync("npm", ["--prefix", "examples/machaut", "run", "build"], {
  stdio: "inherit",
});

// Standalone static artifact with relative imports for GitHub project Pages.
const output = new URL("../_site/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("../dist/", import.meta.url), new URL("dist/", output), {
  recursive: true,
});
await mkdir(new URL("examples/", output), { recursive: true });
for (const name of ["datasets.mjs", "domain-utils.mjs", "midi.mjs"])
  await cp(
    new URL(`../examples/${name}`, import.meta.url),
    new URL(`examples/${name}`, output),
  );
await mkdir(new URL("assets/", output), { recursive: true });
await cp(
  new URL("../benchmarks/corpora/alice.txt", import.meta.url),
  new URL("assets/alice.txt", output),
);
for (const file of ["index.html", "playground.mjs", "worker.mjs"]) {
  const source = await readFile(
    new URL(`../packages/web/${file}`, import.meta.url),
    "utf8",
  );
  await writeFile(
    new URL(file, output),
    source
      .replaceAll("../../examples/machaut/build/", "./machaut/")
      .replaceAll("../../dist/", "./dist/")
      .replaceAll("../../examples/", "./examples/")
      .replaceAll("../../benchmarks/corpora/", "./assets/"),
  );
}
await writeFile(new URL(".nojekyll", output), "");
await cp(
  new URL("../examples/machaut/build/", import.meta.url),
  new URL("machaut/", output),
  { recursive: true },
);
console.log("GitHub Pages artifact ready in _site/");
