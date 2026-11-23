import type { GpuDevice } from '@rsc-gl/gpu';
import type { MarkItem } from '../marks/instance-mark';
import type { PointAttrs } from '../marks/point-mark';
import type { RectAttrs } from '../marks/rect-mark';
import { isTimeScale, type DomainValue } from '../scales/scales';
import { contrastText, getInterpolator, parseCss, resolveColor, rgbaToCss, withAlpha, type RGBA } from '../theme/colors';
import type { BaseSeriesOptions, Datum, TooltipItem } from '../types';
import type { BoxplotSeriesOptions, CandlestickSeriesOptions, HeatmapSeriesOptions, RangeBarSeriesOptions, WaterfallSeriesOptions } from '../types-extra';
import { formatSeriesValue } from './format-value';
import { GeomRenderer, type GeomHit, type GeomLabel, type GeomLine, type GeomOutput } from './geom-renderer';
import { toDomainValue, toNumber, toResolvedSeries, uniqueValues } from './normalize';
import type { LayoutContext, LegendEntry, NormalizeContext, ResolvedSeries, SeriesDefinition, SeriesPoint } from './types';

/* ---------------------------------------------------------------- helpers */

export const rowsOf = (o: BaseSeriesOptions, ctx: NormalizeContext): Datum[] => {
  const d = o.data as unknown[] | undefined;
  if (d && d.length && typeof d[0] === 'object' && d[0] !== null) return d as Datum[];
  return (ctx.data as Datum[] | undefined) ?? [];
};

const single = <O extends BaseSeriesOptions>(o: O, ctx: NormalizeContext, points: SeriesPoint[], shape: ResolvedSeries['legendShape'], prefix: string) =>
  toResolvedSeries(o, [{ id: o.id ?? `${prefix}-${ctx.nextIndex()}`, label: o.label ?? o.id ?? prefix, points }], ctx, shape);

const rect = (x: number, y: number, width: number, height: number, color: RGBA, radius = 0, corners = 0): RectAttrs => ({ x, y, width, height, color, radius, corners });

/** Category / value axes for vertical or horizontal layouts. */
function axesFor(s: ResolvedSeries, ctx: LayoutContext, horizontal: boolean) {
  const cat = horizontal ? ctx.yAxis(s.yAxisId) : ctx.xAxis(s.xAxisId);
  const val = horizontal ? ctx.xAxis(s.xAxisId) : ctx.yAxis(s.yAxisId);
  return { cat, val };
}

/** Numbers, Dates and ISO date strings to numbers (ms for dates). */
export const numOrDate = (v: unknown): number | null =>
  v instanceof Date ? v.getTime() : typeof v === 'string' && /\d{4}-\d{2}/.test(v) ? Date.parse(v) : toNumber(v);

const looksTemporal = (values: unknown[]) => values.length > 0 && values.every((v) => v instanceof Date || (typeof v === 'string' && !Number.isNaN(Date.parse(v)) && /\d{4}-\d{2}/.test(v)));

/* ================================================================ heatmap */

class HeatmapRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<HeatmapSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const rects: MarkItem<RectAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const xa = ctx.xAxis(s.xAxisId);
      const ya = ctx.yAxis(s.yAxisId);
      if (!xa || !ya) continue;
      const o = s.options;
      const gap = o.cellGap ?? 2;
      const bw = xa.scale.bandwidth() || 10;
      const bh = ya.scale.bandwidth() || 10;
      const colorOf = heatColor(s);
      s.points.forEach((p, i) => {
        if (p.y === null) return;
        const x = xa.scale.map(p.x);
        const y = ya.scale.map(p.label ?? '');
        const c = colorOf(p.y);
        const value = rect(x + gap / 2, y + gap / 2, Math.max(1, bw - gap), Math.max(1, bh - gap), c, o.borderRadius ?? 3, 15);
        const key = `${s.id}|${p.key}`;
        rects.push({ key, seriesIndex: s.index, dataIndex: p.index, value, enter: { ...value, x: x + bw / 2, y: y + bh / 2, width: 0, height: 0 } });
        hits.push({ kind: 'rect', key, series: s, dataIndex: p.index, anchor: { x: x + bw / 2, y: y + bh / 2 } });
        if (o.showValues) labels.push({ text: formatSeriesValue(s, p.y, ctx.formatter, 'label', p.index), x: x + bw / 2, y: y + bh / 2, color: contrastText(c), maxWidth: bw - 4, font: '500 11px' });
        void i;
      });
    }
    return { rects, hits, labels, rectStyle: { hoverGrow: 1.5 } };
  }
}

function heatColor(s: ResolvedSeries<HeatmapSeriesOptions>): (v: number) => RGBA {
  const o = s.options;
  const vals = s.points.map((p) => p.y).filter((v): v is number => v !== null);
  const [lo, hi] = o.colorDomain ?? [Math.min(...vals), Math.max(...vals)];
  if (o.thresholds?.length) {
    const sorted = [...o.thresholds].sort((a, b) => a.value - b.value);
    return (v) => resolveColor((sorted.find((t) => v < t.value) ?? sorted[sorted.length - 1]).color);
  }
  const interp = getInterpolator(o.colorScheme ?? 'viridis') ?? getInterpolator('viridis')!;
  return (v) => parseCss(interp(hi === lo ? 0.5 : Math.min(1, Math.max(0, (v - lo) / (hi - lo)))));
}

export const heatmapSeries: SeriesDefinition<HeatmapSeriesOptions> = {
  type: 'heatmap',
  coordinates: 'cartesian',
  normalize(o, ctx) {
    const raw = (o.data as unknown[] | undefined) ?? ctx.data ?? [];
    const xf = o.xField ?? 'x';
    const yf = o.yField ?? 'y';
    const vf = o.valueField ?? 'value';
    const xCats = ctx.axisData('x', o.xAxisId);
    const yCats = ctx.axisData('y', o.yAxisId);
    const points: SeriesPoint[] = raw.map((r, i) => {
      const t = Array.isArray(r) ? r : null;
      const d = (t ? {} : r) as Datum;
      let x: DomainValue = t ? (t[0] as DomainValue) : toDomainValue(d[xf]);
      let y: DomainValue = t ? (t[1] as DomainValue) : toDomainValue(d[yf]);
      // Tuples reference axis categories by index.
      if (t && typeof x === 'number' && xCats) x = xCats[x] ?? x;
      if (t && typeof y === 'number' && yCats) y = yCats[y] ?? y;
      const v = toNumber(t ? t[2] : d[vf]);
      return { key: `${String(x)}|${String(y)}`, index: i, x, y: v, label: String(y), datum: t ? { x, y, value: v } : d };
    });
    return single(o, ctx, points, 'gradient', 'heatmap');
  },
  requirements(series) {
    const xs: DomainValue[] = [];
    const ys: DomainValue[] = [];
    for (const s of series) for (const p of s.points) {
      xs.push(p.x);
      ys.push(p.label ?? '');
    }
    return { x: { values: uniqueValues(xs), preferredType: 'band', requiresBand: true }, y: { values: uniqueValues(ys), preferredType: 'band', requiresBand: true } };
  },
  legendEntries(series) {
    return series.map((s): LegendEntry => {
      const vals = s.points.map((p) => p.y).filter((v): v is number => v !== null);
      const [lo, hi] = s.options.colorDomain ?? [Math.min(...vals), Math.max(...vals)];
      const c = heatColor(s);
      const stops = Array.from({ length: 7 }, (_, i) => rgbaToCss(c(lo + ((hi - lo) * i) / 6)));
      return { id: s.id, label: s.label, color: stops[3], shape: 'gradient', gradient: stops, min: String(Math.round(lo * 100) / 100), max: String(Math.round(hi * 100) / 100), seriesIndex: s.index };
    });
  },
  formatValue(s, p, f) {
    return `${p.label}: ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)}`;
  },
  createRenderer: (d: GpuDevice) => new HeatmapRenderer(d),
};

/* ================================================================ candlestick */

class CandlestickRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<CandlestickSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const rects: MarkItem<RectAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const xa = ctx.xAxis(s.xAxisId);
      const ya = ctx.yAxis(s.yAxisId);
      if (!xa || !ya) continue;
      const o = s.options;
      const up = resolveColor(o.upColor ?? '#22a884', ctx.scheme);
      const down = resolveColor(o.downColor ?? '#d9475b', ctx.scheme);
      const bw = xa.scale.bandwidth() || Math.max(2, Math.abs(xa.scale.step()) * 0.8) || 6;
      const w = Math.max(1, bw * (o.bodyWidth ?? 0.7));
      const plot = ctx.plot;
      // Volume bars share the x scale and use the bottom of the plot.
      if (o.volume) {
        const vols = s.points.map((p) => toNumber(p.datum?.[o.volume!]) ?? 0);
        const vmax = Math.max(1e-9, ...vols);
        const vh = plot.height * (o.volumeHeight ?? 0.2);
        s.points.forEach((p, i) => {
          const d = p.datum ?? {};
          const op = toNumber(d[o.open ?? 'open']);
          const cl = toNumber(d[o.close ?? 'close']);
          const cx = xa.scale.map(p.x) + (xa.scale.bandwidth() ? bw / 2 : 0);
          const h = (vols[i] / vmax) * vh;
          const color = withAlpha((cl ?? 0) >= (op ?? 0) ? up : down, 0.32);
          const bottom = plot.y + plot.height;
          const bar = rect(cx - w / 2, bottom - h, w, h, color);
          rects.push({ key: `${s.id}|${p.key}|v`, seriesIndex: s.index, dataIndex: p.index, value: bar, enter: { ...bar, y: bottom, height: 0 } });
        });
      }
      for (const p of s.points) {
        const d = p.datum ?? {};
        const op = toNumber(d[o.open ?? 'open']);
        const hi = toNumber(d[o.high ?? 'high']);
        const lo = toNumber(d[o.low ?? 'low']);
        const cl = toNumber(d[o.close ?? 'close']);
        if (op === null || hi === null || lo === null || cl === null) continue;
        const cx = xa.scale.map(p.x) + (xa.scale.bandwidth() ? bw / 2 : 0);
        const color = cl >= op ? up : down;
        const yTop = ya.scale.map(Math.max(op, cl));
        const yBot = ya.scale.map(Math.min(op, cl));
        const mid = (yTop + yBot) / 2;
        const key = `${s.id}|${p.key}`;
        const wickW = o.style === 'ohlc' ? Math.max(1.5, Math.min(2.5, w / 6)) : 1.5;
        const wick = rect(cx - wickW / 2, ya.scale.map(hi), wickW, ya.scale.map(lo) - ya.scale.map(hi), color);
        rects.push({ key: `${key}|w`, seriesIndex: s.index, dataIndex: p.index, value: wick, enter: { ...wick, y: mid, height: 0 } });
        if (o.style === 'ohlc') {
          // Open tick to the left, close tick to the right.
          const t = Math.max(1.5, wickW);
          const openTick = rect(cx - w / 2, ya.scale.map(op) - t / 2, w / 2, t, color);
          const closeTick = rect(cx, ya.scale.map(cl) - t / 2, w / 2, t, color);
          rects.push({ key: `${key}|o`, seriesIndex: s.index, dataIndex: p.index, value: openTick, enter: { ...openTick, width: 0, x: cx } });
          rects.push({ key, seriesIndex: s.index, dataIndex: p.index, value: closeTick, enter: { ...closeTick, width: 0 } });
        } else {
          const body = rect(cx - w / 2, yTop, w, Math.max(1, yBot - yTop), color, Math.min(2, w / 4), 15);
          rects.push({ key, seriesIndex: s.index, dataIndex: p.index, value: body, enter: { ...body, y: mid, height: 0 } });
        }
        hits.push({ kind: 'rect', key, series: s, dataIndex: p.index, anchor: { x: cx, y: ya.scale.map(hi) } });
        hits.push({ kind: 'rect', key: `${key}|w`, series: s, dataIndex: p.index, anchor: { x: cx, y: ya.scale.map(hi) } });
      }
      // Last price: dashed guide across the plot plus a badge at the right edge.
      const last = s.points[s.points.length - 1];
      if (o.lastPrice && last) {
        const lp = typeof o.lastPrice === 'object' ? o.lastPrice : {};
        const d = last.datum ?? {};
        const op = toNumber(d[o.open ?? 'open']) ?? 0;
        const cl = toNumber(d[o.close ?? 'close']);
        if (cl !== null) {
          const y = ya.scale.map(cl);
          const color = lp.color ? resolveColor(lp.color, ctx.scheme) : cl >= op ? up : down;
          const dash = 6;
          for (let x = plot.x, k = 0; x < plot.x + plot.width; x += dash * 2, k++) {
            const seg = rect(x, y - 0.5, Math.min(dash, plot.x + plot.width - x), 1, withAlpha(color, 0.9));
            rects.push({ key: `${s.id}|last|${k}`, seriesIndex: -1, dataIndex: -1, value: seg });
          }
          labels.push({ text: lp.format ? lp.format(cl) : ctx.formatter.number(cl, o.numberFormat ?? ',.2f'), x: plot.x + plot.width - 2, y, align: 'right', baseline: 'middle', color: contrastText(color), background: rgbaToCss(color), font: '600 11px' });
        }
      }
    }
    return { rects, hits, labels };
  }
}

export const candlestickSeries: SeriesDefinition<CandlestickSeriesOptions> = {
  type: 'candlestick',
  coordinates: 'cartesian',
  normalize(o, ctx) {
    const rows = rowsOf(o, ctx);
    const dim = o.dimension ?? 'date';
    const points = rows.map((r, i) => {
      const x = toDomainValue(r[dim]);
      return { key: String(x), index: i, x, y: toNumber(r[o.close ?? 'close']), datum: r } as SeriesPoint;
    });
    return single(o, ctx, points, 'rect', 'candlestick');
  },
  requirements(series) {
    const xs: DomainValue[] = [];
    const ys: number[] = [];
    for (const s of series) for (const p of s.points) {
      xs.push(p.x);
      const o = s.options;
      const hi = toNumber(p.datum?.[o.high ?? 'high']);
      const lo = toNumber(p.datum?.[o.low ?? 'low']);
      if (hi !== null) ys.push(hi);
      if (lo !== null) ys.push(lo);
    }
    // Leave the bottom of the plot to the volume bars.
    const f = series.find((s) => s.options.volume)?.options.volumeHeight ?? (series.some((s) => s.options.volume) ? 0.2 : 0);
    if (f > 0 && ys.length) {
      const lo = Math.min(...ys);
      const hi = Math.max(...ys);
      ys.push(lo - ((hi - lo) * f) / (1 - f));
    }
    return { x: { values: uniqueValues(xs), preferredType: 'band', requiresBand: true }, y: { values: ys, preferredType: 'linear' } };
  },
  formatValue(s, p, f) {
    const o = s.options;
    const v = (k: string) => f.number(Number(p.datum?.[k]), o.numberFormat ?? ',.2f');
    return `O ${v(o.open ?? 'open')}  H ${v(o.high ?? 'high')}  L ${v(o.low ?? 'low')}  C ${v(o.close ?? 'close')}`;
  },
  createRenderer: (d) => new CandlestickRenderer(d),
};

/* ================================================================ range bar / Gantt */

class RangeBarRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<RangeBarSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const rects: MarkItem<RectAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    const groups = series.length;
    series.forEach((s, si) => {
      const o = s.options;
      const horizontal = o.layout === 'horizontal';
      const { cat, val } = axesFor(s, ctx, horizontal);
      if (!cat || !val) return;
      const band = cat.scale.bandwidth() || 12;
      const w = band / groups;
      for (const p of s.points) {
        const d = p.datum ?? {};
        const a = val.scale.map(numOrDate(d[o.start ?? 'start']) ?? 0);
        const b = val.scale.map(numOrDate(d[o.end ?? 'end']) ?? 0);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        const c0 = cat.scale.map(p.x) + si * w;
        const color = p.color ?? s.color;
        const lo = Math.min(a, b);
        const len = Math.abs(b - a);
        const r = o.borderRadius ?? 4;
        const value = horizontal ? rect(lo, c0 + w * 0.1, len, w * 0.8, color, r, 15) : rect(c0 + w * 0.1, lo, w * 0.8, len, color, r, 15);
        const key = `${s.id}|${p.key}`;
        rects.push({ key, seriesIndex: s.index, dataIndex: p.index, value, enter: horizontal ? { ...value, width: 0 } : { ...value, y: lo + len, height: 0 } });
        hits.push({ kind: 'rect', key, series: s, dataIndex: p.index, anchor: horizontal ? { x: lo + len, y: c0 + w / 2 } : { x: c0 + w / 2, y: lo } });
        const prog = o.progressField ? toNumber(d[o.progressField]) : null;
        if (prog !== null && horizontal) {
          const pv = rect(lo, c0 + w * 0.1, len * Math.max(0, Math.min(1, prog)), w * 0.8, withAlpha([1, 1, 1, 1], 0.28), r, 15);
          rects.push({ key: `${key}|p`, seriesIndex: s.index, dataIndex: p.index, value: pv, enter: { ...pv, width: 0 } });
        }
        if (o.showLabels && p.label) labels.push({ text: p.label, x: horizontal ? lo + 6 : c0 + w / 2, y: horizontal ? c0 + w / 2 : lo - 8, align: horizontal ? 'left' : 'center', color: horizontal ? contrastText(color) : undefined, maxWidth: horizontal ? len - 10 : undefined, font: '600 11px' });
      }
    });
    return { rects, hits, labels };
  }
}

export const rangeBarSeries: SeriesDefinition<RangeBarSeriesOptions> = {
  type: 'rangeBar',
  coordinates: 'cartesian',
  normalize(o, ctx) {
    const rows = rowsOf(o, ctx);
    const dim = o.dimension ?? 'category';
    const points = rows.map((r, i) => {
      const x = toDomainValue(r[dim]);
      const p: SeriesPoint = { key: `${String(x)}#${i}`, index: i, x, y: toNumber(r[o.end ?? 'end']), datum: r, label: typeof r.label === 'string' ? r.label : typeof r.name === 'string' ? r.name : undefined };
      if (o.colorField && typeof r[o.colorField] === 'string') p.color = resolveColor(r[o.colorField] as string, ctx.scheme);
      return p;
    });
    return single(o, ctx, points, 'rect', 'rangeBar');
  },
  requirements(series) {
    const horizontal = series.some((s) => s.options.layout === 'horizontal');
    const cats: DomainValue[] = [];
    const vals: number[] = [];
    const rawVals: unknown[] = [];
    for (const s of series) for (const p of s.points) {
      cats.push(p.x);
      for (const k of [s.options.start ?? 'start', s.options.end ?? 'end']) {
        rawVals.push(p.datum?.[k]);
        const v = numOrDate(p.datum?.[k]);
        if (v !== null) vals.push(v);
      }
    }
    const temporal = looksTemporal(rawVals) || series.some((s) => s.options.dimension === 'datetime');
    const cat = { values: uniqueValues(cats), preferredType: 'band' as const, requiresBand: true };
    const val = { values: vals, preferredType: temporal ? ('time' as const) : ('linear' as const) };
    return horizontal ? { x: val, y: cat } : { x: cat, y: val };
  },
  formatValue(s, p, f) {
    const o = s.options;
    const fmt = (v: unknown) => (v instanceof Date || (typeof v === 'string' && !Number.isNaN(Date.parse(v))) ? new Date(v as string).toLocaleDateString(f.locale, { month: 'short', day: 'numeric' }) : f.number(Number(v), o.numberFormat));
    return `${fmt(p.datum?.[o.start ?? 'start'])} – ${fmt(p.datum?.[o.end ?? 'end'])}`;
  },
  createRenderer: (d) => new RangeBarRenderer(d),
};

/* ================================================================ waterfall */

class WaterfallRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<WaterfallSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const rects: MarkItem<RectAttrs>[] = [];
    const hits: GeomHit[] = [];
    const lines: GeomLine[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const xa = ctx.xAxis(s.xAxisId);
      const ya = ctx.yAxis(s.yAxisId);
      if (!xa || !ya) continue;
      const o = s.options;
      const up = resolveColor(o.upColor ?? '#22a884', ctx.scheme);
      const down = resolveColor(o.downColor ?? '#d9475b', ctx.scheme);
      const total = resolveColor(o.totalColor ?? '#3b6fe0', ctx.scheme);
      const bw = xa.scale.bandwidth();
      let prevEnd: { x: number; y: number } | null = null;
      for (const p of s.points) {
        const y0 = ya.scale.map(p.y0 ?? 0);
        const y1 = ya.scale.map(p.y1 ?? 0);
        const x = xa.scale.map(p.x);
        const isTotal = !!(o.totalField && p.datum?.[o.totalField]);
        const color = isTotal ? total : (p.y ?? 0) >= 0 ? up : down;
        const top = Math.min(y0, y1);
        const h = Math.max(1, Math.abs(y1 - y0));
        const value = rect(x, top, bw, h, color, o.borderRadius ?? 3, 15);
        const key = `${s.id}|${p.key}`;
        rects.push({ key, seriesIndex: s.index, dataIndex: p.index, value, enter: { ...value, y: y0, height: 0 } });
        hits.push({ kind: 'rect', key, series: s, dataIndex: p.index, anchor: { x: x + bw / 2, y: top } });
        if (o.connectors !== false && prevEnd) {
          lines.push({
            key: `${key}|c`,
            points: [
              { key: 'a', x: prevEnd.x, y: prevEnd.y },
              { key: 'b', x, y: prevEnd.y },
            ],
            style: { color: withAlpha(resolveColor(ctx.theme.axisColor), 0.9), width: 1, dash: [3, 3], alternateDash: [], opacity: 1 },
          });
        }
        prevEnd = { x: x + bw, y: y1 };
        if (o.showValues) labels.push({ text: `${(p.y ?? 0) > 0 && !isTotal ? '+' : ''}${formatSeriesValue(s, p.y, ctx.formatter, 'label', p.index)}`, x: x + bw / 2, y: top - 9, font: '600 11px' });
      }
    }
    return { rects, hits, lines, labels };
  }
}

export const waterfallSeries: SeriesDefinition<WaterfallSeriesOptions> = {
  type: 'waterfall',
  coordinates: 'cartesian',
  normalize(o, ctx) {
    const rows = rowsOf(o, ctx);
    const dim = o.dimension ?? 'category';
    const metric = o.metric ?? 'value';
    let run = 0;
    const points = rows.map((r, i) => {
      const x = toDomainValue(r[dim]);
      const v = toNumber(r[metric]) ?? 0;
      const isTotal = !!(o.totalField && r[o.totalField]);
      const p: SeriesPoint = { key: String(x), index: i, x, y: isTotal ? run : v, datum: r };
      if (isTotal) {
        p.y0 = 0;
        p.y1 = run;
      } else {
        p.y0 = run;
        run += v;
        p.y1 = run;
      }
      return p;
    });
    return single(o, ctx, points, 'rect', 'waterfall');
  },
  requirements(series) {
    const xs: DomainValue[] = [];
    const ys: number[] = [0];
    for (const s of series) for (const p of s.points) {
      xs.push(p.x);
      ys.push(p.y0 ?? 0, p.y1 ?? 0);
    }
    return { x: { values: uniqueValues(xs), preferredType: 'band', requiresBand: true }, y: { values: ys, preferredType: 'linear', includeZero: true } };
  },
  createRenderer: (d) => new WaterfallRenderer(d),
};

/* ================================================================ boxplot */

interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function boxStats(values: number[], whiskers: 'iqr' | 'minmax' = 'iqr'): BoxStats {
  const v = [...values].sort((a, b) => a - b);
  const q1 = quantile(v, 0.25);
  const q3 = quantile(v, 0.75);
  const iqr = q3 - q1;
  const lo = whiskers === 'iqr' ? q1 - 1.5 * iqr : -Infinity;
  const hi = whiskers === 'iqr' ? q3 + 1.5 * iqr : Infinity;
  const inside = v.filter((x) => x >= lo && x <= hi);
  return { min: inside[0] ?? v[0], q1, median: quantile(v, 0.5), q3, max: inside[inside.length - 1] ?? v[v.length - 1], outliers: v.filter((x) => x < lo || x > hi) };
}

class BoxplotRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<BoxplotSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const rects: MarkItem<RectAttrs>[] = [];
    const points: MarkItem<PointAttrs>[] = [];
    const hits: GeomHit[] = [];
    const n = series.length;
    series.forEach((s, si) => {
      const xa = ctx.xAxis(s.xAxisId);
      const ya = ctx.yAxis(s.yAxisId);
      if (!xa || !ya) return;
      const bw = xa.scale.bandwidth() / n;
      const w = bw * (s.options.boxWidth ?? 0.6);
      for (const p of s.points) {
        const st = p.datum?.__stats as BoxStats | undefined;
        if (!st) continue;
        const cx = xa.scale.map(p.x) + si * bw + bw / 2;
        const y = (v: number) => ya.scale.map(v);
        const mid = y(st.median);
        const key = `${s.id}|${p.key}`;
        const box = rect(cx - w / 2, y(st.q3), w, Math.max(1, y(st.q1) - y(st.q3)), withAlpha(s.color, 0.35), 3, 15);
        const grow = (r: RectAttrs) => ({ ...r, y: mid, height: 0 });
        const stroke = s.color;
        const parts: [string, RectAttrs][] = [
          ['box', box],
          ['med', rect(cx - w / 2, mid - 1, w, 2, stroke)],
          ['wl', rect(cx - 0.75, y(st.q1), 1.5, y(st.min) - y(st.q1), stroke)],
          ['wh', rect(cx - 0.75, y(st.max), 1.5, y(st.q3) - y(st.max), stroke)],
          ['cl', rect(cx - w / 4, y(st.min) - 0.75, w / 2, 1.5, stroke)],
          ['ch', rect(cx - w / 4, y(st.max) - 0.75, w / 2, 1.5, stroke)],
        ];
        for (const [k, r] of parts) rects.push({ key: `${key}|${k}`, seriesIndex: s.index, dataIndex: p.index, value: r, enter: grow(r) });
        hits.push({ kind: 'rect', key: `${key}|box`, series: s, dataIndex: p.index, anchor: { x: cx, y: y(st.max) } });
        if (s.options.showOutliers !== false)
          st.outliers.forEach((v, oi) => {
            const value: PointAttrs = { x: cx, y: y(v), size: 6, color: withAlpha(s.color, 0.2), strokeColor: s.color, shape: 0 };
            points.push({ key: `${key}|o${oi}`, seriesIndex: s.index, dataIndex: p.index, value, enter: { ...value, size: 0 } });
          });
      }
    });
    return { rects, points, hits };
  }
}

export const boxplotSeries: SeriesDefinition<BoxplotSeriesOptions> = {
  type: 'boxplot',
  coordinates: 'cartesian',
  normalize(o, ctx) {
    const rows = rowsOf(o, ctx);
    const dim = o.dimension ?? 'category';
    const metric = o.metric ?? 'value';
    const groups = new Map<string, { x: DomainValue; values: number[]; stats?: BoxStats }>();
    for (const r of rows) {
      const x = toDomainValue(r[dim]);
      const k = String(x);
      if (!groups.has(k)) groups.set(k, { x, values: [] });
      const g = groups.get(k)!;
      // Precomputed stats per row are accepted too.
      if (r.q1 !== undefined && r.median !== undefined) g.stats = { min: Number(r.min), q1: Number(r.q1), median: Number(r.median), q3: Number(r.q3), max: Number(r.max), outliers: (r.outliers as number[]) ?? [] };
      else if (Array.isArray(r[metric])) g.values.push(...(r[metric] as number[]));
      else {
        const v = toNumber(r[metric]);
        if (v !== null) g.values.push(v);
      }
    }
    const points: SeriesPoint[] = [...groups.values()].map((g, i) => {
      const st = g.stats ?? boxStats(g.values, o.whiskers);
      return { key: String(g.x), index: i, x: g.x, y: st.median, datum: { category: g.x, ...st, __stats: st } };
    });
    return single(o, ctx, points, 'rect', 'boxplot');
  },
  requirements(series) {
    const xs: DomainValue[] = [];
    const ys: number[] = [];
    for (const s of series) for (const p of s.points) {
      xs.push(p.x);
      const st = p.datum?.__stats as BoxStats;
      ys.push(st.min, st.max, ...st.outliers);
    }
    return { x: { values: uniqueValues(xs), preferredType: 'band', requiresBand: true }, y: { values: ys, preferredType: 'linear' } };
  },
  formatValue(s, p, f) {
    const st = p.datum?.__stats as BoxStats;
    const n = (v: number) => f.number(v, s.options.numberFormat);
    return `min ${n(st.min)} · Q1 ${n(st.q1)} · med ${n(st.median)} · Q3 ${n(st.q3)} · max ${n(st.max)}`;
  },
  createRenderer: (d) => new BoxplotRenderer(d),
};

/** Shared axis tooltip helper for simple single-value series. */
export function simpleAxisItems(series: ResolvedSeries[], value: unknown, ctx: LayoutContext): TooltipItem[] {
  const out: TooltipItem[] = [];
  for (const s of series) {
    const p = s.points.find((pt) => String(pt.x) === String(value));
    if (!p) continue;
    out.push({ seriesId: s.id, seriesLabel: s.label, dataIndex: p.index, color: s.colorCss, value: p.y, formattedValue: formatSeriesValue(s, p.y, ctx.formatter, 'tooltip', p.index), datum: p.datum });
  }
  return out;
}

export { isTimeScale };
