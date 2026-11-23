/**
 * Source-to-source migration for declarative chart code.
 *
 * - Rewrites imports from the given legacy package names (and their
 *   sub-paths such as `/rc` or `/alpha`) to `@rsc-gl/react`.
 * - Removes props that only applied to the old renderer.
 * - Leaves `// TODO(rsc-gl)` notes where manual review is needed.
 *
 * Works on .js/.jsx/.ts/.tsx text without a parser: props are removed with a
 * small balanced-brace scanner, which handles nested objects and strings.
 */

export interface TransformOptions {
  /** Legacy package names whose imports should be rewritten. */
  from: string[];
  /** Target package. */
  to?: string;
}

export interface TransformResult {
  code: string;
  changed: boolean;
  notes: string[];
}

/** Props removed from chart components (renderer-specific). */
export const REMOVED_PROPS = ['renderer', 'UNSAFE_vegaSpec', 'config', 'onVegaViewReady', 'debug', 's2'];

/** Props that change meaning and get a review note. */
const REVIEW_PROPS: Record<string, string> = {
  theme: 'the chart renders its own theme from `colorScheme`; remove `theme` if it was a design-system theme object.',
  UNSAFE_highlightBy: 'use `highlightBy` on ChartTooltip / ChartPopover.',
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Finds the end index (exclusive) of a JSX attribute value starting at `i`. */
function valueEnd(src: string, i: number): number {
  const c = src[i];
  if (c === '"' || c === "'") {
    const j = src.indexOf(c, i + 1);
    return j < 0 ? src.length : j + 1;
  }
  if (c !== '{') return i;
  let depth = 0;
  let quote: string | null = null;
  for (let k = i; k < src.length; k++) {
    const ch = src[k];
    if (quote) {
      if (ch === '\\') k++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return k + 1;
    }
  }
  return src.length;
}

/** Removes `prop=...` and bare boolean `prop` attributes inside JSX opening tags. */
export function removeJsxProp(src: string, prop: string): { code: string; count: number } {
  let count = 0;
  let out = '';
  let i = 0;
  const re = new RegExp(`(\\s)${escapeRe(prop)}(?=\\s*=|\\s|/>|>)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Only inside a JSX tag: the last unmatched '<' before this point must be after the last '>'.
    const before = src.lastIndexOf('<', m.index);
    const closed = src.lastIndexOf('>', m.index);
    if (before < 0 || closed > before) continue;
    let end = m.index + m[0].length;
    const eq = /^\s*=\s*/.exec(src.slice(end));
    if (eq) end = valueEnd(src, end + eq[0].length);
    out += src.slice(i, m.index);
    i = end;
    re.lastIndex = end;
    count++;
  }
  return { code: out + src.slice(i), count };
}

export function transform(source: string, options: TransformOptions): TransformResult {
  const to = options.to ?? '@rsc-gl/react';
  const notes: string[] = [];
  let code = source;
  for (const pkg of options.from) {
    const re = new RegExp(`(from\\s*['"])${escapeRe(pkg)}(?:/(?:rc|alpha|beta|lab))?(['"])`, 'g');
    code = code.replace(re, (_m, a: string, b: string) => {
      notes.push(`import from "${pkg}" → "${to}"`);
      return `${a}${to}${b}`;
    });
    const req = new RegExp(`(require\\(\\s*['"])${escapeRe(pkg)}(?:/(?:rc|alpha|beta|lab))?(['"]\\s*\\))`, 'g');
    code = code.replace(req, (_m, a: string, b: string) => `${a}${to}${b}`);
  }
  if (code === source) return { code, changed: false, notes };
  for (const p of REMOVED_PROPS) {
    const r = removeJsxProp(code, p);
    if (r.count) notes.push(`removed ${r.count}× \`${p}\` (renderer-specific)`);
    code = r.code;
  }
  for (const [p, why] of Object.entries(REVIEW_PROPS)) {
    if (new RegExp(`\\s${escapeRe(p)}\\s*=`).test(code)) {
      notes.push(`review \`${p}\`: ${why}`);
      code = `// TODO(rsc-gl): review \`${p}\` - ${why}\n${code}`;
    }
  }
  return { code, changed: true, notes };
}
