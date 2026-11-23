import type { Datum } from '../types';

export interface Facet<T = Datum> {
  value: unknown;
  key: string;
  rows: T[];
}

/** Splits rows into facets by a field (first-appearance order, or sorted). */
export function facetBy<T extends Datum>(rows: ReadonlyArray<T>, field: string, order?: 'data' | 'asc' | 'desc' | unknown[]): Facet<T>[] {
  const map = new Map<string, Facet<T>>();
  for (const r of rows) {
    const v = r[field];
    const k = String(v);
    if (!map.has(k)) map.set(k, { value: v, key: k, rows: [] });
    map.get(k)!.rows.push(r);
  }
  const out = [...map.values()];
  if (Array.isArray(order)) {
    const idx = new Map(order.map((v, i) => [String(v), i]));
    out.sort((a, b) => (idx.get(a.key) ?? 1e9) - (idx.get(b.key) ?? 1e9));
  } else if (order === 'asc' || order === 'desc') {
    out.sort((a, b) => {
      const c = typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : a.key.localeCompare(b.key);
      return order === 'asc' ? c : -c;
    });
  }
  return out;
}

/**
 * Value extent across facets so every panel shares one scale. With
 * `stackBy`, values that share the stack key are summed first (stacked bars).
 */
export function sharedExtent(rows: ReadonlyArray<Datum>, metric: string, opts: { stackBy?: string[]; includeZero?: boolean } = {}): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  if (opts.stackBy?.length) {
    const pos = new Map<string, number>();
    const neg = new Map<string, number>();
    for (const r of rows) {
      const v = Number(r[metric]);
      if (!Number.isFinite(v)) continue;
      const k = opts.stackBy.map((f) => String(r[f])).join('|');
      const m = v >= 0 ? pos : neg;
      m.set(k, (m.get(k) ?? 0) + v);
    }
    for (const v of [...pos.values(), ...neg.values()]) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  } else
    for (const r of rows) {
      const v = Number(r[metric]);
      if (!Number.isFinite(v)) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  if (!Number.isFinite(lo)) return [0, 1];
  if (opts.includeZero !== false) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  return [lo, hi];
}

/** Rounds an extent outward to "nice" numbers so panels share tidy ticks. */
export function niceExtent([lo, hi]: [number, number], ticks = 5): [number, number] {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}
