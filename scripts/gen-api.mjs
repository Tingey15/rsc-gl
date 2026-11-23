#!/usr/bin/env node
/**
 * Extracts exported interfaces (properties, types, JSDoc) from the TypeScript
 * sources into apps/docs/src/generated/api.json for the API reference pages.
 * Run with `npm run gen:api`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = [
  ['core', 'packages/core/src/types.ts'],
  ['core', 'packages/core/src/types-extra.ts'],
  ['core', 'packages/core/src/series/morph.ts'],
  ['core', 'packages/core/src/plugins/zoom.ts'],
  ['core', 'packages/core/src/plugins/marquee.ts'],
  ['core', 'packages/core/src/plugins/crosshair.ts'],
  ['core', 'packages/core/src/plugins/annotations.ts'],
  ['react', 'packages/react/src/children/components.tsx'],
  ['react', 'packages/react/src/props/common.tsx'],
  ['react', 'packages/react/src/props/charts.tsx'],
  ['core', 'packages/core/src/plugins/toolbar.ts'],
  ['core', 'packages/core/src/series/radial-line.ts'],
  ['core', 'packages/core/src/svg/ssr.ts'],
  ['core', 'packages/core/src/worker/runtime.ts'],
  ['core', 'packages/core/src/worker/host.ts'],
  ['react', 'packages/react/src/GLChart.tsx'],
  ['react', 'packages/react/src/WorkerChart.tsx'],
  ['react', 'packages/react/src/props/trellis.tsx'],
  ['3d', 'packages/three-d/src/chart3d.ts'],
  ['3d', 'packages/three-d/src/layouts3d.ts'],
];

const cleanDoc = (d) =>
  d
    .replace(/^\/\*\*|\*\/$/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ');

/** The JSDoc block directly above `index` (only whitespace in between), or ''. */
function docBefore(src, index) {
  const before = src.slice(0, index).trimEnd();
  if (!before.endsWith('*/')) return '';
  const start = before.lastIndexOf('/**');
  if (start < 0) return '';
  // Reject blocks that are really the end of a different comment.
  const block = before.slice(start);
  if (block.indexOf('*/') !== block.length - 2) return '';
  return cleanDoc(block);
}

function parseInterfaces(src, pkg, file) {
  const out = [];
  const re = /export interface (\w+)(?:<[^>]*>)?(?:\s+extends\s+([^{]+))?\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    // Find the matching closing brace.
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    const body = src.slice(re.lastIndex, i - 1);
    const props = [];
    let doc = '';
    let j = 0;
    let d = 0;
    let start = 0;
    // Walk top-level statements of the body.
    while (j < body.length) {
      if (body.startsWith('/**', j) && d === 0) {
        const end = body.indexOf('*/', j);
        doc = cleanDoc(body.slice(j, end + 2));
        j = end + 2;
        start = j;
        continue;
      }
      if (body.startsWith('//', j) && body[j - 1] !== ':') {
        // Line comment: skip to the end of the line.
        const nl = body.indexOf('\n', j);
        j = nl < 0 ? body.length : nl + 1;
        if (d === 0) start = j;
        continue;
      }
      if (body.startsWith('=>', j)) {
        // Arrow in a function type: not a closing bracket.
        j += 2;
        continue;
      }
      const ch = body[j];
      if (ch === '{' || ch === '(' || ch === '<' || ch === '[') d++;
      else if (ch === '}' || ch === ')' || ch === '>' || ch === ']') d--;
      else if (ch === ';' && d === 0) {
        const stmt = body.slice(start, j).trim();
        const pm = /^(readonly\s+)?(\[[^\]]+\]|[\w$]+)(\?)?\s*:\s*([\s\S]+)$/.exec(stmt);
        if (pm) props.push({ name: pm[2], optional: !!pm[3], type: pm[4].replace(/\s+/g, ' ').trim(), doc });
        doc = '';
        start = j + 1;
      }
      j++;
    }
    out.push({ name: m[1], package: pkg, file, extends: m[2]?.trim() || undefined, doc: docBefore(src, m.index), props });
  }
  return out;
}

const all = [];
for (const [pkg, file] of SOURCES) all.push(...parseInterfaces(readFileSync(join(root, file), 'utf8'), pkg, file));
const target = join(root, 'apps/docs/src/generated/api.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify({ generatedAt: new Date().toISOString(), interfaces: all }, null, 1));
console.log(`api.json: ${all.length} interfaces, ${all.reduce((a, i) => a + i.props.length, 0)} props`);
