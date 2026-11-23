#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { transform } from './transform.js';

const USAGE = `Usage: rsc-gl-migrate <path...> --from <legacy-package> [--from <another>] [--dry]

Rewrites imports from the legacy chart package(s) to @rsc-gl/react and removes
renderer-specific props. Use --dry to print the changes without writing.`;

const args = process.argv.slice(2);
const from: string[] = [];
const paths: string[] = [];
let dry = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--from') from.push(args[++i]);
  else if (args[i] === '--dry') dry = true;
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log(USAGE);
    process.exit(0);
  } else paths.push(args[i]);
}
if (!from.length || !paths.length) {
  console.error(USAGE);
  process.exit(1);
}

const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const files: string[] = [];
const walk = (p: string) => {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) if (name !== 'node_modules' && !name.startsWith('.')) walk(join(p, name));
  } else if (EXT.has(extname(p))) files.push(p);
};
paths.forEach(walk);

let changed = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const r = transform(src, { from });
  if (!r.changed) continue;
  changed++;
  console.log(`${dry ? '[dry] ' : ''}${f}`);
  for (const n of r.notes) console.log(`  - ${n}`);
  if (!dry) writeFileSync(f, r.code);
}
console.log(`${changed} file(s) ${dry ? 'would change' : 'changed'} of ${files.length} scanned.`);
