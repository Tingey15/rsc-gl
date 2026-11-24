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
export const REMOVED_PROPS = ['renderer', 'UNSAFE_vegaSpec', 'config', 'debug', 's2'];

/** Props renamed on chart components. */
export const RENAMED_PROPS: Record<string, string> = { onVegaViewReady: 'onReady' };

/** Props that change meaning and get a review note. */
const REVIEW_PROPS: Record<string, string> = {
  theme: 'the chart renders its own theme from `colorScheme`; remove `theme` if it was a design-system theme object.',
  onReady: 'renamed from `onVegaViewReady`: the callback now receives the chart engine instance, not a view object.',
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

/** Name of the JSX tag whose opening `<` is at `lt`. */
const tagAt = (src: string, lt: number) => /^[A-Za-z_$][\w$.]*/.exec(src.slice(lt + 1))?.[0] ?? '';

/** Local names bound by imports of `pkg` (`import { Chart, Bar as B }`, `import * as C`, default imports). */
export function importedNames(src: string, pkgs: string[]): Set<string> {
  const names = new Set<string>();
  for (const pkg of pkgs) {
    const re = new RegExp(`import\\s+([^;]*?)\\s+from\\s*['"]${escapeRe(pkg)}(?:/[\\w-]+)?['"]`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const clause = m[1].replace(/^type\s+/, '');
      const named = /\{([^}]*)\}/.exec(clause);
      if (named)
        for (const part of named[1].split(',')) {
          const p = part.trim().replace(/^type\s+/, '');
          if (!p) continue;
          const as = /\sas\s+([\w$]+)$/.exec(p);
          names.add(as ? as[1] : p);
        }
      const star = /\*\s+as\s+([\w$]+)/.exec(clause);
      if (star) names.add(star[1]);
      const def = /^([\w$]+)\s*(?:,|$)/.exec(clause.trim());
      if (def) names.add(def[1]);
    }
  }
  return names;
}

/**
 * Removes `prop=...` and bare boolean `prop` attributes inside JSX opening tags.
 * With `tags`, only tags with one of those names (or `Name.Sub` of them) are touched.
 */
export function removeJsxProp(src: string, prop: string, tags?: Set<string>, rename?: string): { code: string; count: number } {
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
    if (tags && !tags.has(tagAt(src, before).split('.')[0])) continue;
    if (rename) {
      // Keep the value; only the attribute name changes.
      out += src.slice(i, m.index) + m[1] + rename;
      i = m.index + m[0].length;
      count++;
      continue;
    }
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
  // Components imported from the legacy package: only their props are rewritten.
  const tags = importedNames(source, options.from);
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
    const r = removeJsxProp(code, p, tags);
    if (r.count) notes.push(`removed ${r.count}× \`${p}\` (renderer-specific)`);
    code = r.code;
  }
  for (const [p, to] of Object.entries(RENAMED_PROPS)) {
    const r = removeJsxProp(code, p, tags, to);
    if (r.count) notes.push(`renamed ${r.count}× \`${p}\` → \`${to}\``);
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
