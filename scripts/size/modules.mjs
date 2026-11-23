import { rolldown } from 'rolldown';
const e = process.argv[2];
const b = await rolldown({ input: `./${e}.js`, external: [/^react($|\/)/, /^react-dom($|\/)/], resolve: { conditionNames: ['@rsc-gl/source', 'import', 'module', 'default'] }, logLevel: 'silent' });
const { output } = await b.generate({ format: 'esm', minify: false });
const short = (k) => k.split(/[\\/]/).slice(-3).join('/');
const mods = Object.entries(output[0].modules)
  .map(([k, v]) => [short(k), v.renderedLength])
  .filter((m) => m[1] > 0)
  .sort((a, b) => b[1] - a[1]);
console.log(mods.slice(0, 45).map((m) => `${(m[1] / 1024).toFixed(1).padStart(6)}K ${m[0]}`).join('\n'));
