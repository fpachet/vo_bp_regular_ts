import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

// Standalone static artifact with relative imports for GitHub project Pages.
const output = new URL('../_site/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('../dist/', import.meta.url), new URL('dist/', output), { recursive: true });
await mkdir(new URL('examples/', output), { recursive: true });
await cp(new URL('../examples/datasets.mjs', import.meta.url), new URL('examples/datasets.mjs', output));
for (const file of ['index.html', 'playground.mjs', 'worker.mjs']) {
  const source = await readFile(new URL(`../packages/web/${file}`, import.meta.url), 'utf8');
  await writeFile(new URL(file, output), source.replaceAll('../../dist/', './dist/').replaceAll('../../examples/', './examples/'));
}
await writeFile(new URL('.nojekyll', output), '');
console.log('GitHub Pages artifact ready in _site/');
