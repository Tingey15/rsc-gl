import type { MarkItem } from '../marks/instance-mark';
import type { MeshItem } from '../marks/mesh-mark';
import type { PointAttrs } from '../marks/point-mark';
import { resolveColor, withAlpha } from '../theme/colors';
import type { BaseSeriesOptions } from '../types';
import { formatSeriesValue } from './format-value';
import { GeomRenderer, type GeomHit, type GeomLabel, type GeomLine, type GeomOutput } from './geom-renderer';
import { toNumber, toResolvedSeries } from './normalize';
import type { LayoutContext, ResolvedSeries, SeriesDefinition, SeriesPoint } from './types';
import { minOf, maxOf } from '../data/extent';

export interface RadialLineSeriesOptions extends BaseSeriesOptions {
  type: 'radialLine';
  /** Values, or `{ angle, value }` rows. */
  data?: ReadonlyArray<number | null | { angle: number | string | Date; value: number | null }>;
  /**
   * Angle positions for `data` values: category names (spaced evenly) or
   * numbers / dates (mapped linearly onto the sweep).
   */
  angles?: ReadonlyArray<number | string | Date>;
  /** Numeric angle domain; defaults to the data extent (or [0, 360) for degrees-like data). */
  angleDomain?: [number, number];
  /** Value range of the radius; defaults to [0, max]. */
  radiusDomain?: [number, number];
  /** Inner radius (px or %) — a hole in the middle. */
  innerRadius?: number | string;
  /** Sweep in degrees, clockwise from 12 o'clock. Default 0..360. */
  startAngle?: number;
  endAngle?: number;
  /** Joins the last point to the first. Default: true for categorical angles. */
  closed?: boolean;
  /** Fills between the line and the center. */
  area?: boolean;
  curve?: 'linear' | 'smooth';
  showMarks?: boolean;
  lineWidth?: number;
  /** Concentric grid rings. Default 4. */
  divisions?: number;
  /** Formats the angle labels. */
  angleFormatter?: (angle: number | string | Date) => string;
  /** Explicit spoke positions for numeric angles. */
  angleTickValues?: number[];
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const polar = (cx: number, cy: number, r: number, a: number) => ({ x: cx + Math.sin(a) * r, y: cy - Math.cos(a) * r });

function resolveLength(v: number | string | undefined, ref: number, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === 'number') return v;
  const m = /^(-?[\d.]+)%$/.exec(v.trim());
  return m ? (Number(m[1]) / 100) * ref : Number.parseFloat(v) || fallback;
}

/** Catmull-Rom through screen points (optionally closed). */
function smooth(pts: { x: number; y: number }[], closed: boolean, steps = 8): { x: number; y: number }[] {
  const n = pts.length;
  if (n < 3) return pts;
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out: { x: number; y: number }[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(closed ? pts[0] : pts[n - 1]);
  return out;
}

const niceStep = (span: number, count: number) => {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
};

class RadialLineRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<RadialLineSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    if (!series.length) return {};
    const o0 = series[0].options;
    const pl = ctx.plot;
    const cx = pl.x + pl.width / 2;
    const cy = pl.y + pl.height / 2;
    // Side labels need horizontal room (about five characters).
    const R = Math.max(10, Math.min(pl.width / 2 - 56, pl.height / 2 - 28));
    const r0 = Math.min(R - 4, resolveLength(o0.innerRadius, R, 0));
    const a0 = (o0.startAngle ?? 0) * DEG;
    const a1 = (o0.endAngle ?? 360) * DEG;
    const full = Math.abs(a1 - a0) >= TAU - 1e-6;
    const categorical = series[0].points.some((p) => typeof p.x === 'string');
    const cats = categorical ? [...new Set(series.flatMap((s) => s.points.map((p) => String(p.x))))] : [];
    const nums = categorical ? [] : series.flatMap((s) => s.points.map((p) => (p.x instanceof Date ? p.x.getTime() : Number(p.x))));
    const dom: [number, number] = o0.angleDomain ?? [minOf(nums), maxOf(nums) + (full && nums.length > 1 ? (maxOf(nums) - minOf(nums)) / (new Set(nums).size - 1 || 1) : 0)];
    const angleOf = (x: unknown) => {
      if (categorical) {
        const i = cats.indexOf(String(x));
        const slots = full ? cats.length : Math.max(1, cats.length - 1);
        return a0 + ((a1 - a0) * i) / slots;
      }
      const v = x instanceof Date ? x.getTime() : Number(x);
      return a0 + ((a1 - a0) * (v - dom[0])) / (dom[1] - dom[0] || 1);
    };
    const values = series.flatMap((s) => s.points.map((p) => p.y).filter((v): v is number => v !== null));
    const vmax = o0.radiusDomain?.[1] ?? Math.max(1e-9, maxOf(values));
    const vmin = o0.radiusDomain?.[0] ?? Math.min(0, minOf(values));
    const step = niceStep(vmax - vmin, o0.divisions ?? 4);
    const top = o0.radiusDomain ? vmax : Math.ceil(vmax / step) * step;
    const rOf = (v: number) => r0 + ((R - r0) * (v - vmin)) / (top - vmin || 1);

    const meshes: MeshItem[] = [];
    const lines: GeomLine[] = [];
    const points: MarkItem<PointAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    const grid = resolveColor(ctx.theme.gridColor);
    const lineStyle = (color = grid) => ({ color, width: 1, dash: [] as number[], alternateDash: [] as number[], opacity: 1 });

    // Spoke positions (needed first so ring labels can sit between two spokes).
    const span = dom[1] - dom[0];
    const angleStep = span === 360 ? 45 : span === 24 ? 3 : span === 12 || span === 7 ? 1 : span === 60 ? 5 : niceStep(span, full ? 8 : 6);
    const spokeValues: unknown[] = categorical
      ? cats
      : (o0.angleTickValues ?? (() => {
          const out: number[] = [];
          for (let v = Math.ceil(dom[0] / angleStep) * angleStep; v < dom[1] + (full ? -1e-9 : 1e-9); v += angleStep) out.push(v);
          return out;
        })());
    const labelAngle = spokeValues.length > 1 ? (angleOf(spokeValues[0]) + angleOf(spokeValues[1])) / 2 : a0 + 0.2;
    // Rings with value labels.
    for (let v = vmin + step; v <= top + 1e-9; v += step) {
      const r = rOf(v);
      const steps = 96;
      const ring = Array.from({ length: steps + 1 }, (_, k) => ({ key: `r${k}`, ...polar(cx, cy, r, a0 + ((full ? TAU : a1 - a0) * k) / steps) }));
      lines.push({ key: `ring${v.toFixed(6)}`, points: ring, style: lineStyle() });
      const lp = polar(cx, cy, r, labelAngle);
      labels.push({ text: ctx.formatter.number(v, 'shortNumber'), x: lp.x, y: lp.y, align: 'center', baseline: 'middle', color: ctx.theme.mutedTextColor, font: '400 11px' });
    }
    // Spokes and angle labels.
    spokeValues.forEach((v, i) => {
      const a = angleOf(v);
      const p0 = polar(cx, cy, r0, a);
      const p1 = polar(cx, cy, R, a);
      lines.push({ key: `spoke${i}`, points: [{ key: 'a', ...p0 }, { key: 'b', ...p1 }], style: lineStyle() });
      const lp = polar(cx, cy, R + 14, a);
      const sin = Math.sin(a);
      const text = o0.angleFormatter ? o0.angleFormatter(v as never) : typeof v === 'number' && !categorical && nums.some((n) => n > 1e11) ? new Date(v).toLocaleDateString() : typeof v === 'number' ? ctx.formatter.number(v, 'shortNumber') : String(v);
      labels.push({ text, x: lp.x, y: lp.y, align: Math.abs(sin) < 0.2 ? 'center' : sin > 0 ? 'left' : 'right', baseline: 'middle', font: '600 12px' });
    });

    for (const s of series) {
      const o = s.options;
      // Continuous data that wraps all the way around closes too.
      const covers = !categorical && full && nums.length > 1 && (maxOf(nums) - minOf(nums)) / (dom[1] - dom[0] || 1) > 0.9;
      const closed = o.closed ?? ((categorical && full) || covers);
      const pts = s.points
        .filter((p) => p.y !== null)
        .map((p) => ({ p, a: angleOf(p.x), r: rOf(p.y as number) }))
        .sort((a, b) => (categorical ? 0 : a.a - b.a));
      if (pts.length < 2) continue;
      const screen = pts.map((q) => polar(cx, cy, q.r, q.a));
      const path = o.curve === 'smooth' ? smooth(screen, closed) : closed ? [...screen, screen[0]] : screen;
      if (o.area) {
        // Fan from the inner circle to the path.
        const tri: number[] = [];
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i];
          const b = path[i + 1];
          const ia = Math.atan2(a.x - cx, cy - a.y);
          const ib = Math.atan2(b.x - cx, cy - b.y);
          const ca = polar(cx, cy, r0, ia);
          const cb = polar(cx, cy, r0, ib);
          tri.push(ca.x, ca.y, a.x, a.y, b.x, b.y, ca.x, ca.y, b.x, b.y, cb.x, cb.y);
        }
        const triangles = new Float32Array(tri);
        const enter = new Float32Array(triangles.length);
        for (let i = 0; i < enter.length; i += 2) {
          enter[i] = cx;
          enter[i + 1] = cy;
        }
        meshes.push({ key: `${s.id}|area`, seriesIndex: s.index, dataIndex: -1, triangles, color: withAlpha(s.color, (o.opacity ?? 1) * 0.22), enter });
      }
      lines.push({ key: `${s.id}|line`, points: path.map((q, i) => ({ key: `l${i}`, x: q.x, y: q.y })), style: { color: withAlpha(s.color, o.opacity ?? 1), width: o.lineWidth ?? 2, dash: [], alternateDash: [], opacity: 1 } });
      pts.forEach((q, i) => {
        const key = `${s.id}|${q.p.key}`;
        const at = screen[i];
        if (o.showMarks) {
          const value: PointAttrs = { x: at.x, y: at.y, size: 7, color: s.color, strokeColor: resolveColor(ctx.scheme === 'dark' ? '#1b1b1f' : '#ffffff'), shape: 0 };
          points.push({ key, seriesIndex: s.index, dataIndex: q.p.index, value, enter: { ...value, x: cx, y: cy } });
        }
        hits.push({ kind: 'circle', key, series: s, dataIndex: q.p.index, anchor: at, cx: at.x, cy: at.y, r: 9 });
      });
    }
    return { meshes, lines, points, hits, labels };
  }
}

export const radialLineSeries: SeriesDefinition<RadialLineSeriesOptions> = {
  type: 'radialLine',
  coordinates: 'polar',
  normalize(o, ctx) {
    const raw = (o.data ?? []) as RadialLineSeriesOptions['data'] & unknown[];
    const points: SeriesPoint[] = raw.map((d, i) => {
      if (d && typeof d === 'object') {
        const row = d as { angle: number | string | Date; value: number | null };
        return { key: String(row.angle instanceof Date ? row.angle.getTime() : row.angle), index: i, x: row.angle, y: toNumber(row.value), datum: row as never };
      }
      const x = o.angles?.[i] ?? i;
      return { key: String(x instanceof Date ? x.getTime() : x), index: i, x, y: toNumber(d) };
    });
    return toResolvedSeries(o, [{ id: o.id ?? `radialLine-${ctx.nextIndex()}`, label: o.label ?? 'Series', points }], ctx, 'line');
  },
  formatValue: (s, p, f) => `${p.x instanceof Date ? p.x.toLocaleDateString() : String(p.x)}: ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)}`,
  createRenderer: (d) => new RadialLineRenderer(d),
};
