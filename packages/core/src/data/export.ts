import type { Formatter } from '../format/format';
import type { LayoutContext, ResolvedSeries } from '../series/types';
import { isTimeScale } from '../scales/scales';

export type DataExportFormat = 'csv' | 'tsv' | 'json' | 'xlsx';
/** Formats returned as text by `serializeRows`. */
export type TextExportFormat = 'csv' | 'tsv' | 'json';

const WIDE_TYPES = new Set(['bar', 'line', 'area']);

const cell = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : v);

/**
 * Tabulates resolved series. Series that share an x axis become one column
 * each (wide format); anything else is listed point by point (long format).
 */
export function exportRows(series: ResolvedSeries[], ctx: LayoutContext | null, _formatter?: Formatter): { columns: string[]; rows: unknown[][] } {
  const visible = series.filter((s) => !s.hidden);
  if (visible.length === 0) return { columns: [], rows: [] };
  const wide = visible.every((s) => WIDE_TYPES.has(s.type)) && new Set(visible.map((s) => s.xAxisId ?? 'x')).size === 1;
  if (wide) {
    const xa = ctx?.xAxis(visible[0].xAxisId);
    const horizontal = visible.some((s) => (s.options as { layout?: string }).layout === 'horizontal');
    const dimAxis = horizontal ? ctx?.yAxis(visible[0].yAxisId) : xa;
    const dimLabel = dimAxis?.options.label;
    const time = !!dimAxis && isTimeScale(dimAxis.scaleType);
    const keys: unknown[] = [];
    const seen = new Map<string, number>();
    for (const s of visible)
      for (const p of s.points) {
        const k = String(p.x instanceof Date ? p.x.getTime() : p.x);
        if (!seen.has(k)) {
          seen.set(k, keys.length);
          keys.push(p.x);
        }
      }
    const rows: unknown[][] = keys.map((k) => [time && (typeof k === 'number' || k instanceof Date) ? new Date(k as number).toISOString() : cell(k)]);
    visible.forEach((s, si) => {
      for (const r of rows) r[si + 1] = null;
      for (const p of s.points) rows[seen.get(String(p.x instanceof Date ? p.x.getTime() : p.x))!][si + 1] = p.y;
    });
    return { columns: [dimLabel ?? (time ? 'Date' : 'Category'), ...visible.map((s) => s.label)], rows };
  }
  const rows: unknown[][] = [];
  for (const s of visible)
    for (const p of s.points) rows.push([s.label, cell(p.label ?? p.x), p.y]);
  return { columns: ['Series', 'Label', 'Value'], rows };
}

const csvCell = (v: unknown, sep: string): string => {
  if (v === null || v === undefined) return '';
  const t = String(v);
  return t.includes(sep) || t.includes('"') || t.includes('\n') ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Serializes rows as CSV, TSV or JSON (use `toXlsx` for spreadsheets). */
export function serializeRows(columns: string[], rows: unknown[][], format: TextExportFormat): string {
  if (format === 'json') return JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null]))), null, 2);
  const sep = format === 'tsv' ? '\t' : ',';
  return [columns, ...rows].map((r) => r.map((v) => csvCell(v, sep)).join(sep)).join('\n');
}
