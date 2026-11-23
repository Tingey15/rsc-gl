/**
 * Structural equality for chart options with two twists:
 *  - functions are treated as equal (callbacks are refreshed separately so
 *    inline handlers don't trigger relayouts / animations)
 *  - large arrays and typed arrays are compared by reference only, so huge
 *    datasets never cost a deep walk per render
 */
const LARGE = 2000;

export function optionsEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (typeof a === 'function' && typeof b === 'function') return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return Number.isNaN(a) && Number.isNaN(b);
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) return false;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (depth > 12) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    if (a.length > LARGE) return false;
    for (let i = 0; i < a.length; i++) if (!optionsEqual(a[i], b[i], depth + 1)) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  // React elements / DOM nodes: compare by identity only.
  if ('$$typeof' in (a as object) || (typeof Node !== 'undefined' && a instanceof Node)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!optionsEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth + 1)) return false;
  }
  return true;
}
