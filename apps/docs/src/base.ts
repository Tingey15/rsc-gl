/**
 * Where the site is served from: '' locally, '/rsc-gl' on GitHub Pages (set by
 * DOCS_BASE at build time). Routes are written as '/path'; these helpers add and
 * remove the prefix at the edges (links, history, reading the URL).
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** '/benchmark' → '/rsc-gl/benchmark' (other hrefs are returned unchanged). */
export const withBase = (path: string) => (path.startsWith('/') && !path.startsWith('//') ? `${BASE}${path}` : path);

/** '/rsc-gl/benchmark' → '/benchmark'. */
export const stripBase = (path: string) => (BASE && (path === BASE || path.startsWith(`${BASE}/`)) ? path.slice(BASE.length) || '/' : path);
