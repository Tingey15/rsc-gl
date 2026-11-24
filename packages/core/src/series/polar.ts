import { chord as d3chord, type ChordGroup } from 'd3-chord';
import { hierarchy, partition } from 'd3-hierarchy';
import earcut from 'earcut';
import type { ArcAttrs } from '../marks/arc-mark';
import type { MarkItem } from '../marks/instance-mark';
import type { MeshItem } from '../marks/mesh-mark';
import type { PointAttrs } from '../marks/point-mark';
import { contrastText, resolveColor, rgbaToCss, withAlpha, type RGBA } from '../theme/colors';
import type { ChordSeriesOptions, RadarSeriesOptions, RadialBarSeriesOptions, SunburstSeriesOptions, TreemapNode } from '../types-extra';
import { rowsOf } from './cartesian-extra';
import { formatSeriesValue } from './format-value';
import { GeomRenderer, type GeomHit, type GeomLabel, type GeomLine, type GeomOutput } from './geom-renderer';
import { toNumber, toResolvedSeries } from './normalize';
import type { LayoutContext, LegendEntry, NormalizeContext, ResolvedSeries, SeriesDefinition, SeriesPoint } from './types';
import { maxOf } from '../data/extent';

const TAU = Math.PI * 2;
const polar = (cx: number, cy: number, r: number, a: number) => ({ x: cx + Math.sin(a) * r, y: cy - Math.cos(a) * r });

function resolveLength(v: number | string | undefined, ref: number, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === 'number') return v;
  const m = /^(-?[\d.]+)%$/.exec(v.trim());
  return m ? (Number(m[1]) / 100) * ref : Number.parseFloat(v) || fallback;
}

function itemSeries<O extends { type: string; id?: string; label?: string; color?: string }>(o: O, ctx: NormalizeContext, points: SeriesPoint[], prefix: string): ResolvedSeries<never>[] {
  const color = resolveColor(o.color ?? '#888', ctx.scheme);
  return [{ id: o.id ?? `${prefix}-0`, type: o.type, label: o.label ?? prefix, index: ctx.nextIndex(), color, colorCss: rgbaToCss(color), options: o as never, points, hidden: false, xAxisId: 'x', yAxisId: 'y', legendShape: 'circle' }];
}

const itemLegend = (series: ResolvedSeries[]): LegendEntry[] =>
  series.flatMap((s) =>
    s.points.filter((p) => !p.datum?.__noLegend).map((p) => ({ id: String(p.datum?.__id ?? p.key), label: p.label ?? String(p.x), color: rgbaToCss(p.color ?? s.color), shape: 'circle' as const, seriesIndex: s.index, dataIndex: p.index })),
  );

/* ================================================================ radar */

class RadarRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<RadarSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const meshes: MeshItem[] = [];
    const lines: GeomLine[] = [];
    const points: MarkItem<PointAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    if (!series.length) return {};
    const o0 = series[0].options;
    const metrics = o0.metrics ?? series[0].points.map((p) => String(p.x));
    const n = metrics.length;
    if (n < 3) return {};
    const pl = ctx.plot;
    const cx = pl.x + pl.width / 2;
    const cy = pl.y + pl.height / 2;
    const R = Math.max(10, Math.min(pl.width, pl.height) / 2 - 30);
    const maxFor = (m: string) => {
      if (typeof o0.max === 'number') return o0.max;
      if (o0.max && typeof o0.max === 'object' && o0.max[m] !== undefined) return o0.max[m];
      return Math.max(1e-9, maxOf(series.flatMap((s) => s.points.filter((p) => String(p.x) === m).map((p) => p.y ?? 0))));
    };
    const angle = (i: number) => (i / n) * TAU;
    // Grid.
    const divisions = o0.divisions ?? 5;
    const gridColor = resolveColor(ctx.theme.gridColor);
    for (let d = 1; d <= divisions; d++) {
      const r = (R * d) / divisions;
      const steps = o0.shape === 'circular' ? 72 : n;
      const pts = Array.from({ length: steps + 1 }, (_, k) => {
        const q = polar(cx, cy, r, (k / steps) * TAU);
        return { key: `g${d}|${k}`, x: q.x, y: q.y };
      });
      lines.push({ key: `grid${d}`, points: pts, style: { color: gridColor, width: 1, dash: [], alternateDash: [], opacity: 1 } });
    }
    metrics.forEach((m, i) => {
      const q = polar(cx, cy, R, angle(i));
      lines.push({ key: `spoke${i}`, points: [{ key: 'a', x: cx, y: cy }, { key: 'b', x: q.x, y: q.y }], style: { color: gridColor, width: 1, dash: [], alternateDash: [], opacity: 1 } });
      const lq = polar(cx, cy, R + 16, angle(i));
      const sin = Math.sin(angle(i));
      labels.push({ text: m, x: lq.x, y: lq.y, align: Math.abs(sin) < 0.2 ? 'center' : sin > 0 ? 'left' : 'right', font: '600 12px' });
    });
    for (const s of series) {
      const o = s.options;
      const ring = metrics.map((m, i) => {
        const p = s.points.find((pt) => String(pt.x) === m);
        const r = (R * Math.max(0, p?.y ?? 0)) / maxFor(m);
        return { ...polar(cx, cy, r, angle(i)), p };
      });
      if (o.fillArea !== false) {
        const tri = new Float32Array(n * 6);
        ring.forEach((q, i) => {
          const nx = ring[(i + 1) % n];
          tri.set([cx, cy, q.x, q.y, nx.x, nx.y], i * 6);
        });
        const enter = new Float32Array(tri.length);
        for (let i = 0; i < enter.length; i += 2) {
          enter[i] = cx;
          enter[i + 1] = cy;
        }
        meshes.push({ key: `${s.id}|fill`, seriesIndex: s.index, dataIndex: -1, triangles: tri, color: withAlpha(s.color, 0.22), enter });
      }
      lines.push({ key: `${s.id}|line`, points: [...ring, ring[0]].map((q, i) => ({ key: `r${i}`, x: q.x, y: q.y })), style: { color: s.color, width: 2, dash: [], alternateDash: [], opacity: 1 } });
      ring.forEach((q, i) => {
        if (!q.p) return;
        const key = `${s.id}|${q.p.key}`;
        if (o.showMarks !== false) {
          const value: PointAttrs = { x: q.x, y: q.y, size: 7, color: s.color, strokeColor: resolveColor(ctx.scheme === 'dark' ? '#1b1b1f' : '#ffffff'), shape: 0 };
          points.push({ key, seriesIndex: s.index, dataIndex: q.p.index, value, enter: { ...value, x: cx, y: cy } });
        }
        hits.push({ kind: 'circle', key, series: s, dataIndex: q.p.index, anchor: { x: q.x, y: q.y }, cx: q.x, cy: q.y, r: 10 });
        void i;
      });
    }
    return { meshes, lines, points, hits, labels };
  }
}

export const radarSeries: SeriesDefinition<RadarSeriesOptions> = {
  type: 'radar',
  coordinates: 'polar',
  normalize(o, ctx) {
    const metrics = o.metrics ?? [];
    const raw = (o.data ?? []) as unknown[];
    let points: SeriesPoint[];
    if (raw.length && typeof raw[0] === 'object' && raw[0] !== null) {
      // A row with one field per metric.
      const row = raw[0] as Record<string, unknown>;
      points = metrics.map((m, i) => ({ key: m, index: i, x: m, y: toNumber(row[m]), datum: row }));
    } else {
      points = metrics.map((m, i) => ({ key: m, index: i, x: m, y: toNumber(raw[i]) }));
    }
    return toResolvedSeries(o, [{ id: o.id ?? `radar-${ctx.nextIndex()}`, label: o.label ?? 'Series', points }], ctx, 'area');
  },
  formatValue: (s, p, f) => `${p.x}: ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)}`,
  createRenderer: (d) => new RadarRenderer(d),
};

/* ================================================================ sunburst */

class SunburstRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<SunburstSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const arcs: MarkItem<ArcAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const o = s.options;
      const root = s.points[0]?.datum?.__root as ReturnType<typeof hierarchy<TreemapNode>> | undefined;
      if (!root) continue;
      const pl = ctx.plot;
      const cx = pl.x + pl.width / 2;
      const cy = pl.y + pl.height / 2;
      const R = Math.min(pl.width, pl.height) / 2 - 6;
      const r0 = resolveLength(o.innerRadius, R, R * 0.18);
      const laid = partition<TreemapNode>().size([TAU, 1])(root.copy().sum((d) => (d.__hidden ? 0 : d.children?.length ? 0 : (d.value ?? 0))));
      const depth = laid.height || 1;
      const ring = (R - r0) / depth;
      const byKey = new Map(s.points.map((p) => [p.key, p]));
      laid.each((n) => {
        if (n.depth === 0) return;
        const path = n.ancestors().reverse().slice(1).map((a) => a.data.name).join(' / ');
        const p = byKey.get(path);
        if (!p) return;
        const top = n.ancestors().find((a) => a.depth === 1)!;
        const base = byKey.get(top.data.name)?.color ?? s.color;
        const shade = 1 + (n.depth - 1) * 0.16;
        const c: RGBA = [Math.min(1, base[0] * shade), Math.min(1, base[1] * shade), Math.min(1, base[2] * shade), 1];
        const inner = r0 + (n.depth - 1) * ring;
        const outer = inner + ring - 1;
        const value: ArcAttrs = { cx, cy, innerRadius: inner, outerRadius: outer, startAngle: n.x0, endAngle: n.x1, color: c };
        const key = `${s.id}|${path}`;
        arcs.push({ key, seriesIndex: s.index, dataIndex: p.index, value, enter: { ...value, startAngle: 0, endAngle: 0 } });
        const mid = (n.x0 + n.x1) / 2;
        hits.push({ kind: 'arc', key, series: s, dataIndex: p.index, anchor: polar(cx, cy, outer, mid) });
        if (o.showLabels !== false && (n.x1 - n.x0) * ((inner + outer) / 2) > 40 && ring > 16) {
          const q = polar(cx, cy, (inner + outer) / 2, mid);
          labels.push({ text: n.data.name, x: q.x, y: q.y, color: contrastText(c), font: '600 11px', maxWidth: (n.x1 - n.x0) * ((inner + outer) / 2) - 6 });
        }
      });
      const total = laid.value ?? 0;
      labels.push({ text: ctx.formatter.number(total, 'shortNumber'), x: cx, y: cy, font: '800 18px' });
    }
    return { arcs, hits, labels, arcStyle: { padding: 1, cornerRadius: s0(series)?.options.cornerRadius ?? 2, hoverGrow: 0 } };
  }
}

const s0 = <T>(a: T[]): T | undefined => a[0];

export const sunburstSeries: SeriesDefinition<SunburstSeriesOptions> = {
  type: 'sunburst',
  coordinates: 'polar',
  normalize(o, ctx) {
    const rootData: TreemapNode = o.root ?? { name: 'root', children: rowsOf(o, ctx) as TreemapNode[] };
    const mark = (n: TreemapNode, top?: string): TreemapNode => ({ ...n, __hidden: top ? ctx.isHidden(top) : false, children: n.children?.map((c) => mark(c, top ?? c.name)) });
    const root = hierarchy<TreemapNode>({ ...rootData, children: rootData.children?.map((c) => mark(c, c.name)) }).sum((d) => (d.children?.length ? 0 : (d.value ?? 0)));
    const points: SeriesPoint[] = [];
    root.each((n) => {
      if (n.depth === 0) return;
      const path = n.ancestors().reverse().slice(1).map((a) => a.data.name).join(' / ');
      const top = n.depth === 1;
      points.push({
        key: path,
        index: points.length,
        x: path,
        y: n.value ?? 0,
        label: top ? n.data.name : path,
        color: top ? resolveColor(n.data.color ?? ctx.nextColor(), ctx.scheme) : undefined,
        datum: { ...n.data, children: undefined, __id: n.data.name, __noLegend: !top, __root: root },
      });
    });
    return itemSeries(o, ctx, points, 'sunburst');
  },
  legendEntries: itemLegend,
  formatValue: (s, p, f) => `${p.x}: ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)}`,
  createRenderer: (d) => new SunburstRenderer(d),
};

/* ================================================================ chord */

function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const q = polar(cx, cy, r, a0 + ((a1 - a0) * i) / steps);
    out.push(q.x, q.y);
  }
  return out;
}

function quadPoints(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const m = 1 - t;
    out.push(m * m * x0 + 2 * m * t * cx + t * t * x1, m * m * y0 + 2 * m * t * cy + t * t * y1);
  }
  return out;
}

class ChordRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<ChordSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const arcs: MarkItem<ArcAttrs>[] = [];
    const meshes: MeshItem[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const o = s.options;
      const matrix = (s.points[0]?.datum?.__matrix as number[][]) ?? [];
      const groups = s.points.filter((p) => p.datum?.__kind === 'group');
      if (!matrix.length) continue;
      const hiddenIdx = new Set(groups.filter((g) => g.datum?.__hidden).map((g) => g.index));
      const m = matrix.map((row, i) => row.map((v, j) => (hiddenIdx.has(i) || hiddenIdx.has(j) ? 0 : v)));
      const pl = ctx.plot;
      const cx = pl.x + pl.width / 2;
      const cy = pl.y + pl.height / 2;
      const R = Math.min(pl.width, pl.height) / 2 - 34;
      const inner = R - 14;
      const layout = d3chord().padAngle(o.padAngle ?? 0.04).sortSubgroups((a, b) => b - a)(m);
      layout.groups.forEach((g: ChordGroup) => {
        const p = groups[g.index];
        const c = p.color ?? s.color;
        const value: ArcAttrs = { cx, cy, innerRadius: inner, outerRadius: R, startAngle: g.startAngle, endAngle: g.endAngle, color: c };
        const key = `${s.id}|g|${p.key}`;
        arcs.push({ key, seriesIndex: s.index, dataIndex: p.index, value, enter: { ...value, endAngle: g.startAngle } });
        const mid = (g.startAngle + g.endAngle) / 2;
        hits.push({ kind: 'arc', key, series: s, dataIndex: p.index, anchor: polar(cx, cy, R, mid) });
        if (g.endAngle - g.startAngle > 0.08) {
          const q = polar(cx, cy, R + 14, mid);
          const sin = Math.sin(mid);
          labels.push({ text: p.label ?? p.key, x: q.x, y: q.y, align: Math.abs(sin) < 0.25 ? 'center' : sin > 0 ? 'left' : 'right', font: '600 12px' });
        }
      });
      layout.forEach((ch, k) => {
        const S = 10;
        const src = arcPoints(cx, cy, inner, ch.source.startAngle, ch.source.endAngle, S);
        const tgt = arcPoints(cx, cy, inner, ch.target.startAngle, ch.target.endAngle, S);
        const ring = [...src, ...quadPoints(src[src.length - 2], src[src.length - 1], cx, cy, tgt[0], tgt[1], S), ...tgt, ...quadPoints(tgt[tgt.length - 2], tgt[tgt.length - 1], cx, cy, src[0], src[1], S)];
        const idx = earcut(ring);
        const tri = new Float32Array(idx.length * 2);
        idx.forEach((v, i) => {
          tri[i * 2] = ring[v * 2];
          tri[i * 2 + 1] = ring[v * 2 + 1];
        });
        const srcGroup = groups[ch.source.index];
        const p = s.points.find((q) => q.datum?.__kind === 'ribbon' && q.datum.i === ch.source.index && q.datum.j === ch.target.index) ?? srcGroup;
        const key = `${s.id}|r|${ch.source.index}-${ch.target.index}`;
        meshes.push({ key, seriesIndex: s.index, dataIndex: p.index, triangles: tri, color: withAlpha(srcGroup.color ?? s.color, o.ribbonOpacity ?? 0.45) });
        hits.push({ kind: 'mesh', key, series: s, dataIndex: p.index, anchor: { x: cx, y: cy } });
        void k;
      });
    }
    return { arcs, meshes, hits, labels, arcStyle: { padding: 0, hoverGrow: 4 } };
  }
}

export const chordSeries: SeriesDefinition<ChordSeriesOptions> = {
  type: 'chord',
  coordinates: 'polar',
  normalize(o, ctx) {
    const matrix = o.matrix ?? [];
    const names = o.names ?? matrix.map((_, i) => `Group ${i + 1}`);
    const points: SeriesPoint[] = names.map((name, i) => ({
      key: name,
      index: i,
      x: name,
      y: (matrix[i] ?? []).reduce((a, v) => a + v, 0),
      label: name,
      color: resolveColor(ctx.nextColor(), ctx.scheme),
      datum: { __kind: 'group', __id: name, __hidden: ctx.isHidden(name), __matrix: matrix },
    }));
    matrix.forEach((row, i) =>
      row.forEach((v, j) => {
        if (!v) return;
        points.push({ key: `${names[i]}->${names[j]}`, index: points.length, x: `${names[i]} → ${names[j]}`, y: v, label: `${names[i]} → ${names[j]}`, datum: { __kind: 'ribbon', i, j, __noLegend: true } });
      }),
    );
    return itemSeries(o, ctx, points, 'chord');
  },
  legendEntries: itemLegend,
  formatValue: (s, p, f) => `${p.label}: ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)}`,
  createRenderer: (d) => new ChordRenderer(d),
};

/* ================================================================ radial bars (concentric rings) */

class RadialBarRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<RadialBarSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const arcs: MarkItem<ArcAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const o = s.options;
      const pts = s.points.filter((p) => !p.datum?.__hidden);
      if (!pts.length) continue;
      const pl = ctx.plot;
      const cx = pl.x + pl.width / 2;
      const cy = pl.y + pl.height / 2;
      const R = Math.min(pl.width, pl.height) / 2 - 4;
      const r0 = resolveLength(o.innerRadius, R, R * 0.3);
      const band = (R - r0) / pts.length;
      const a0 = ((o.startAngle ?? 0) * Math.PI) / 180;
      const a1 = ((o.endAngle ?? 270) * Math.PI) / 180;
      const max = o.maxValue ?? maxOf(pts.map((p) => p.y ?? 0));
      const track = resolveColor('gray-200', ctx.scheme);
      pts.forEach((p, i) => {
        const outer = R - i * band - 2;
        const inner = outer - band * 0.72;
        const c = p.color ?? s.color;
        const key = `${s.id}|${p.key}`;
        if (o.track !== false) {
          const tv: ArcAttrs = { cx, cy, innerRadius: inner, outerRadius: outer, startAngle: a0, endAngle: a1, color: track };
          arcs.push({ key: `${key}|t`, seriesIndex: -1, dataIndex: -1, value: tv, enter: { ...tv, endAngle: a0 } });
        }
        const end = a0 + (a1 - a0) * Math.min(1, Math.max(0, (p.y ?? 0) / (max || 1)));
        const value: ArcAttrs = { cx, cy, innerRadius: inner, outerRadius: outer, startAngle: a0, endAngle: end, color: c };
        arcs.push({ key, seriesIndex: s.index, dataIndex: p.index, value, enter: { ...value, endAngle: a0 } });
        hits.push({ kind: 'arc', key, series: s, dataIndex: p.index, anchor: polar(cx, cy, outer, end) });
        const lp = polar(cx, cy, (inner + outer) / 2, a0);
        labels.push({ text: `${p.label ?? p.key}  ${formatSeriesValue(s, p.y, ctx.formatter, 'label', p.index)}`, x: lp.x - 8, y: lp.y, align: 'right', font: '600 11px' });
      });
    }
    return { arcs, hits, labels, arcStyle: { padding: 0, cornerRadius: series[0]?.options.cornerRadius ?? 20, hoverGrow: 2 } };
  }
}

export const radialBarSeries: SeriesDefinition<RadialBarSeriesOptions> = {
  type: 'radialBar',
  coordinates: 'polar',
  normalize(o, ctx) {
    const rows = rowsOf(o, ctx);
    const lf = o.dimension ?? 'label';
    const metric = o.metric ?? 'value';
    const points: SeriesPoint[] = rows.map((r, i) => {
      const name = String(r[lf] ?? i);
      return { key: name, index: i, x: name, y: toNumber(r[metric]), label: name, color: resolveColor(typeof r.color === 'string' ? r.color : ctx.nextColor(), ctx.scheme), datum: { ...r, __id: name, __hidden: ctx.isHidden(name) } };
    });
    return itemSeries(o, ctx, points, 'radialBar');
  },
  legendEntries: itemLegend,
  formatValue: (s, p, f) => formatSeriesValue(s, p.y, f, 'tooltip', p.index),
  createRenderer: (d) => new RadialBarRenderer(d),
};
