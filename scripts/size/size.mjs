/**
 * Bundle-size report: bundles typical app entry points (react externalized,
 * minified) and prints the initial download vs code loaded on demand.
 * Run with `npm run size`; `node modules.mjs <entry>` lists the largest modules.
 */
import { rolldown } from 'rolldown';
import { gzipSync } from 'node:zlib';
const entries = ['bar', 'line', 'four', 'all', 'core-webgl2', 'core-webgpu', 'bar3d', 'globe3d'];
const out = {};
for (const e of entries) {
  const b = await rolldown({ input: `./${e}.js`, external: [/^react($|\/)/, /^react-dom($|\/)/], resolve: { conditionNames: ['@rsc-gl/source', 'import', 'module', 'default'] }, logLevel: 'silent' });
  const { output } = await b.generate({ format: 'esm', minify: true });
  const chunks = output.filter((o) => o.type === 'chunk');
  const byName = new Map(chunks.map((c) => [c.fileName, c]));
  // Initial = the entry plus every chunk it imports statically; the rest loads on demand.
  const initial = new Set();
  const walk = (c) => {
    if (initial.has(c.fileName)) return;
    initial.add(c.fileName);
    for (const i of c.imports) if (byName.has(i)) walk(byName.get(i));
  };
  walk(chunks.find((c) => c.isEntry));
  const join = (list) => list.map((c) => c.code).join('\n');
  const entry = join(chunks.filter((c) => initial.has(c.fileName)));
  const lazy = join(chunks.filter((c) => !initial.has(c.fileName)));
  out[e] = { initialMin: (entry.length / 1024).toFixed(1), initialGzip: (gzipSync(entry).length / 1024).toFixed(1), onDemandGzip: lazy ? (gzipSync(lazy).length / 1024).toFixed(1) : '0' };
}
console.log(JSON.stringify(out));
