import type { DomainValue } from '../scales/scales';
import { resolveColor, resolvePalette, rgbaToCss } from '../theme/colors';
import type { BaseSeriesOptions, Datum } from '../types';
import type { LegendShape, NormalizeContext, ResolvedSeries, SeriesPoint } from './types';

const isRow = (v: unknown): v is Datum => typeof v === 'object' && v !== null && !Array.isArray(v);

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.getTime();
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalizes a dimension value: Dates become epoch ms, ISO strings stay strings unless the axis is temporal. */
export function toDomainValue(v: unknown): DomainValue {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' || typeof v === 'string') return v;
  return String(v);
}

export interface NormalizedGroup {
  id: string;
  label: string;
  points: SeriesPoint[];
}

interface NormalizeDefaults {
  dimension: string;
  metric: string;
  /** Axis holding the categories (y for horizontal bars). */
  categoryAxis?: 'x' | 'y';
}

/**
 * Turns any supported data shape into series groups. See {@link BaseSeriesOptions}.
 */
export function normalizeGroups(o: BaseSeriesOptions, ctx: NormalizeContext, defaults: NormalizeDefaults, baseId: string): NormalizedGroup[] {
  const own = o.data;
  const ownRows = own && own.length > 0 && isRow(own[0]) ? (own as Datum[]) : undefined;
  const xDir = defaults.categoryAxis ?? 'x';
  const catAxisId = xDir === 'x' ? o.xAxisId : o.yAxisId;

  // 1. Plain value array aligned with the category axis.
  if (own && !ownRows && !(own.length === 0 && o.metric)) {
    const cats = ctx.axisData(xDir, catAxisId);
    const points: SeriesPoint[] = (own as (number | null)[]).map((v, i) => {
      const x = cats?.[i] ?? i;
      return { key: `${baseId}::${String(x)}`, index: i, x, y: toNumber(v) };
    });
    return [{ id: baseId, label: o.label ?? baseId, points }];
  }

  // 2. dataKey over the dataset.
  if (o.dataKey && ctx.dataset) {
    const cats = ctx.axisData(xDir, catAxisId);
    const points: SeriesPoint[] = ctx.dataset.map((row, i) => {
      const x = cats?.[i] ?? i;
      return { key: `${baseId}::${String(x)}`, index: i, x, y: toNumber(row[o.dataKey!]), datum: row };
    });
    return [{ id: baseId, label: o.label ?? o.dataKey, points }];
  }

  // 3. Long-format rows.
  const rows = ownRows ?? ctx.data ?? [];
  const dim = o.dimension ?? defaults.dimension;
  const metric = o.metric ?? defaults.metric;
  const groupFields = o.groupBy ? (Array.isArray(o.groupBy) ? o.groupBy : [o.groupBy]) : [];
  if (groupFields.length === 0) {
    const points = rows.map((row, i) => {
      const x = toDomainValue(row[dim]);
      return { key: `${baseId}::${String(x)}::${keyOf(row, ctx.idKey)}`, index: i, x, y: toNumber(row[metric]), datum: row } as SeriesPoint;
    });
    dedupeKeys(points);
    return [{ id: baseId, label: o.label ?? metric, points }];
  }
  const groups = new Map<string, NormalizedGroup>();
  rows.forEach((row, i) => {
    const g = groupFields.map((f) => String(row[f] ?? '')).join(' | ');
    let group = groups.get(g);
    if (!group) {
      group = { id: g, label: g, points: [] };
      groups.set(g, group);
    }
    const x = toDomainValue(row[dim]);
    group.points.push({ key: `${g}::${String(x)}`, index: i, x, y: toNumber(row[metric]), datum: row });
  });
  for (const g of groups.values()) dedupeKeys(g.points);
  return [...groups.values()];
}

function keyOf(row: Datum, idKey?: string): string {
  const id = idKey ? row[idKey] : (row.id ?? row.key);
  return id !== undefined ? String(id) : '';
}

/** Duplicate x values within a group get suffixed so keys stay unique. */
function dedupeKeys(points: SeriesPoint[]): void {
  const seen = new Map<string, number>();
  for (const p of points) {
    const n = seen.get(p.key) ?? 0;
    if (n > 0) p.key = `${p.key}#${n}`;
    seen.set(p.key, n + 1);
  }
}

/** Builds resolved series from groups, assigning palette colors in order. */
export function toResolvedSeries<O extends BaseSeriesOptions>(
  o: O,
  groups: NormalizedGroup[],
  ctx: NormalizeContext,
  legendShape: LegendShape,
  extra?: Partial<ResolvedSeries<O>>,
): ResolvedSeries<O>[] {
  const groupPalette = o.colors ? resolvePalette(o.colors, ctx.scheme) : null;
  return groups.map((g, gi) => {
    const css = o.color && groups.length === 1 ? o.color : groupPalette ? groupPalette[gi % groupPalette.length] : ctx.nextColor();
    const color = resolveColor(css, ctx.scheme);
    if (o.colorField) {
      for (const p of g.points) {
        const c = p.datum?.[o.colorField];
        if (typeof c === 'string') p.color = resolveColor(c, ctx.scheme);
      }
    }
    const id = groups.length === 1 && o.id ? o.id : groups.length > 1 && o.id ? `${o.id}:${g.id}` : g.id;
    return {
      id,
      type: o.type,
      label: groups.length === 1 && o.label ? o.label : g.label,
      index: ctx.nextIndex(),
      color,
      colorCss: rgbaToCss(color),
      options: o,
      points: g.points,
      hidden: false,
      xAxisId: o.xAxisId ?? 'x',
      yAxisId: o.yAxisId ?? 'y',
      legendShape,
      ...extra,
    };
  });
}

/**
 * Stacks series that share a stack id. Values are accumulated per x value;
 * positive and negative values stack separately (diverging) unless
 * `offset` is 'none'. 'expand' normalizes each category to 0..1.
 */
export function stackSeries(series: ResolvedSeries[], offset: 'none' | 'diverging' | 'expand' = 'diverging'): void {
  const byStack = new Map<string, ResolvedSeries[]>();
  for (const s of series) {
    if (s.hidden) continue;
    if (!s.stack) {
      for (const p of s.points) {
        p.y0 = 0;
        p.y1 = p.y ?? undefined;
      }
      continue;
    }
    const k = `${s.stack}|${s.xAxisId}|${s.yAxisId}`;
    if (!byStack.has(k)) byStack.set(k, []);
    byStack.get(k)!.push(s);
  }
  for (const group of byStack.values()) {
    const pos = new Map<string, number>();
    const neg = new Map<string, number>();
    for (const s of group) {
      for (const p of s.points) {
        const k = String(p.x);
        const v = p.y ?? 0;
        if (v >= 0 || offset === 'none') {
          const base = pos.get(k) ?? 0;
          p.y0 = base;
          p.y1 = base + v;
          pos.set(k, base + v);
        } else {
          const base = neg.get(k) ?? 0;
          p.y0 = base;
          p.y1 = base + v;
          neg.set(k, base + v);
        }
      }
    }
    if (offset === 'expand') {
      for (const s of group) {
        for (const p of s.points) {
          const k = String(p.x);
          const total = (pos.get(k) ?? 0) - (neg.get(k) ?? 0) || 1;
          p.y0 = (p.y0 ?? 0) / total;
          p.y1 = (p.y1 ?? 0) / total;
        }
      }
    }
  }
}

/** Ordered unique values (first appearance order). */
export function uniqueValues(values: Iterable<DomainValue>): DomainValue[] {
  const seen = new Set<string>();
  const out: DomainValue[] = [];
  for (const v of values) {
    const k = String(v);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}
