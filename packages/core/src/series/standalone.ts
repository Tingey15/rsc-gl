import { hierarchy, treemap, treemapBinary, treemapDice, treemapSlice, treemapSliceDice, treemapSquarify, type HierarchyNode } from 'd3-hierarchy';
import { sankey, sankeyCenter, sankeyJustify, sankeyLeft, sankeyRight, type SankeyLink as D3Link, type SankeyNode as D3Node } from 'd3-sankey';
import type { MarkItem } from '../marks/instance-mark';
import type { MeshItem } from '../marks/mesh-mark';
import type { PointAttrs } from '../marks/point-mark';
import type { RectAttrs } from '../marks/rect-mark';
import { contrastText, resolveColor, rgbaToCss, withAlpha, type RGBA } from '../theme/colors';
import type { ColorInput, Datum } from '../types';
import type { BulletSeriesOptions, FunnelSeriesOptions, SankeySeriesOptions, TreemapNode, TreemapSeriesOptions, VennSeriesOptions } from '../types-extra';
import { rowsOf } from './cartesian-extra';
import { formatSeriesValue } from './format-value';
import { GeomRenderer, type GeomHit, type GeomLabel, type GeomOutput } from './geom-renderer';
import { toNumber } from './normalize';
import type { LayoutContext, LegendEntry, NormalizeContext, ResolvedSeries, SeriesDefinition, SeriesPoint } from './types';
import { minOf, maxOf } from '../data/extent';

const rect = (x: number, y: number, width: number, height: number, color: RGBA, radius = 0): RectAttrs => ({ x, y, width, height, color, radius, corners: 15 });

/** One resolved series whose points are individually colored items (sections, nodes, sets). */
function itemSeries<O extends { type: string; id?: string; label?: string; color?: string }>(o: O, ctx: NormalizeContext, points: SeriesPoint[], shape: ResolvedSeries['legendShape'], prefix: string): ResolvedSeries<never>[] {
  const color = resolveColor(o.color ?? '#888', ctx.scheme);
  return [
    {
      id: o.id ?? `${prefix}-0`,
      type: o.type,
      label: o.label ?? prefix,
      index: ctx.nextIndex(),
      color,
      colorCss: rgbaToCss(color),
      options: o as never,
      points,
      hidden: false,
      xAxisId: 'x',
      yAxisId: 'y',
      legendShape: shape,
    },
  ];
}

const itemLegend = (series: ResolvedSeries[]): LegendEntry[] =>
  series.flatMap((s) =>
    s.points
      .filter((p) => !p.datum?.__noLegend)
      .map((p) => ({ id: String(p.datum?.__id ?? p.key), label: p.label ?? String(p.x), color: rgbaToCss(p.color ?? s.color), shape: 'rect' as const, seriesIndex: s.index, dataIndex: p.index })),
  );

const hiddenOf = (p: SeriesPoint) => !!p.datum?.__hidden;

/* ================================================================ funnel / pyramid */

class FunnelRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<FunnelSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const meshes: MeshItem[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const o = s.options;
      const pts = s.points.filter((p) => !hiddenOf(p) && (p.y ?? 0) > 0);
      if (!pts.length) continue;
      const pl = ctx.plot;
      const horizontal = o.orientation === 'horizontal';
      const len = horizontal ? pl.width : pl.height;
      const breadth = horizontal ? pl.height : pl.width;
      const gap = o.gap ?? 4;
      const max = maxOf(pts.map((p) => p.y ?? 0));
      const total = pts.reduce((a, p) => a + (p.y ?? 0), 0);
      const first = pts[0].y ?? 1;
      const pyramid = o.variant === 'pyramid';
      const n = pts.length;
      const sectionLen = (len - gap * (n - 1)) / n;
      let cursor = 0;
      pts.forEach((p, i) => {
        const v = p.y ?? 0;
        let wTop: number;
        let wBot: number;
        let h: number;
        if (pyramid) {
          // Section height proportional to value; width grows linearly towards the base.
          h = ((len - gap * (n - 1)) * v) / total;
          wTop = breadth * (cursor / len);
          wBot = breadth * ((cursor + h) / len);
        } else {
          h = sectionLen;
          wTop = (breadth * v) / max;
          const next = pts[i + 1]?.y ?? v * 0.65;
          wBot = (breadth * next) / max;
        }
        const mid = breadth / 2;
        const c = p.color ?? s.color;
        const quad = (a0: number, a1: number, b0: number, b1: number) => {
          // a = along the funnel, b = across.
          const P = (al: number, ac: number) => (horizontal ? [pl.x + al, pl.y + ac] : [pl.x + ac, pl.y + al]);
          const tl = P(a0, mid - b0 / 2);
          const tr = P(a0, mid + b0 / 2);
          const br = P(a1, mid + b1 / 2);
          const bl = P(a1, mid - b1 / 2);
          return new Float32Array([...tl, ...tr, ...br, ...tl, ...br, ...bl]);
        };
        const tri = quad(cursor, cursor + h, wTop, wBot);
        const enter = quad(cursor, cursor + h, 0, 0);
        const key = `${s.id}|${p.key}`;
        meshes.push({ key, seriesIndex: s.index, dataIndex: p.index, triangles: tri, color: c, enter });
        const cxy = horizontal ? { x: pl.x + cursor + h / 2, y: pl.y + mid } : { x: pl.x + mid, y: pl.y + cursor + h / 2 };
        hits.push({ kind: 'mesh', key, series: s, dataIndex: p.index, anchor: cxy });
        if (o.sectionLabel !== false) {
          const text =
            o.sectionLabel === 'percent'
              ? ctx.formatter.number(v / first, '.0%')
              : o.sectionLabel === 'label'
                ? (p.label ?? '')
                : `${p.label ?? ''}  ${formatSeriesValue(s, v, ctx.formatter, 'label', p.index)}`;
          labels.push({ text, x: cxy.x, y: cxy.y, color: contrastText(c), font: '600 12px', maxWidth: Math.max(wTop, wBot) - 8 });
        }
        cursor += h + gap;
      });
    }
    return { meshes, hits, labels };
  }
}

export const funnelSeries: SeriesDefinition<FunnelSeriesOptions> = {
  type: 'funnel',
  coordinates: 'polar',
  normalize(o, ctx) {
    const rows = rowsOf(o, ctx);
    const labelField = o.dimension ?? 'label';
    const metric = o.metric ?? 'value';
    const points = rows.map((r, i) => {
      const label = String(r[labelField] ?? r.id ?? i);
      return { key: label, index: i, x: label, y: toNumber(r[metric]), label, datum: { ...r, __id: label, __hidden: ctx.isHidden(label) }, color: resolveColor(typeof r.color === 'string' ? r.color : ctx.nextColor(), ctx.scheme) } as SeriesPoint;
    });
    return itemSeries(o, ctx, points, 'rect', 'funnel');
  },
  legendEntries: itemLegend,
  formatValue: (s, p, f) => formatSeriesValue(s, p.y, f, 'tooltip', p.index),
  createRenderer: (d) => new FunnelRenderer(d),
};

/* ================================================================ treemap */

const TILES = { squarify: treemapSquarify, binary: treemapBinary, slice: treemapSlice, dice: treemapDice, sliceDice: treemapSliceDice };

class TreemapRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<TreemapSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const rects: MarkItem<RectAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const o = s.options;
      const root = s.points[0]?.datum?.__root as HierarchyNode<TreemapNode> | undefined;
      if (!root) continue;
      const pl = ctx.plot;
      const laid = treemap<TreemapNode>()
        .tile(TILES[o.tile ?? 'squarify'])
        .size([pl.width, pl.height])
        .paddingInner(o.padding ?? 2)
        .paddingTop((n) => (n.depth === 1 && (n.children?.length ?? 0) > 0 && o.showLabels !== false ? 18 : 0))
        .round(true)(root.copy().sum((d) => (d.__hidden ? 0 : (d.children?.length ? 0 : (d.value ?? 0)))));
      const maxDepth = o.depth ?? Infinity;
      const leafIndex = new Map(s.points.map((p) => [p.key, p]));
      laid.each((n) => {
        if (n.depth === 0 || n.depth > maxDepth) return;
        const isLeaf = !n.children?.length || n.depth === maxDepth;
        const path = n.ancestors().reverse().slice(1).map((a) => a.data.name).join(' / ');
        const top = n.ancestors().find((a) => a.depth === 1) ?? n;
        const base = resolveColor(top.data.color ?? (leafIndex.get(top.data.name)?.color ? rgbaToCss(leafIndex.get(top.data.name)!.color!) : s.colorCss), ctx.scheme);
        const x = pl.x + n.x0;
        const y = pl.y + n.y0;
        const w = Math.max(0, n.x1 - n.x0);
        const h = Math.max(0, n.y1 - n.y0);
        if (!isLeaf) {
          // Group header band.
          const value = rect(x, y, w, h, withAlpha(base, 0.18), 4);
          rects.push({ key: `g|${path}`, seriesIndex: -1, dataIndex: -1, value, enter: { ...value, width: 0, height: 0, x: x + w / 2, y: y + h / 2 } });
          if (o.showLabels !== false && w > 40) labels.push({ text: n.data.name, x: x + 6, y: y + 9, align: 'left', font: '700 11px', maxWidth: w - 10 });
          return;
        }
        const p = leafIndex.get(path);
        if (!p) return;
        const shade = 1 - (n.depth - 1) * 0.12;
        const c: RGBA = [base[0] * shade, base[1] * shade, base[2] * shade, 0.95];
        const key = `${s.id}|${path}`;
        const value = rect(x, y, w, h, c, 3);
        rects.push({ key, seriesIndex: s.index, dataIndex: p.index, value, enter: { ...value, x: x + w / 2, y: y + h / 2, width: 0, height: 0 } });
        hits.push({ kind: 'rect', key, series: s, dataIndex: p.index, anchor: { x: x + w / 2, y } });
        if (o.showLabels !== false && w > 36 && h > 20) {
          labels.push({ text: n.data.name, x: x + 6, y: y + 12, align: 'left', color: contrastText(c), font: '600 12px', maxWidth: w - 10 });
          if (h > 36) labels.push({ text: formatSeriesValue(s, n.value ?? 0, ctx.formatter, 'label', p.index), x: x + 6, y: y + 28, align: 'left', color: contrastText(c), font: '400 11px', maxWidth: w - 10 });
        }
      });
    }
    return { rects, hits, labels, rectStyle: { hoverGrow: 0 } };
  }
}

export const treemapSeries: SeriesDefinition<TreemapSeriesOptions> = {
  type: 'treemap',
  coordinates: 'polar',
  normalize(o, ctx) {
    const rootData: TreemapNode = o.root ?? { name: 'root', children: (rowsOf(o, ctx) as TreemapNode[]) ?? [] };
    // Mark hidden top-level groups so the layout gives them zero area (animated).
    const mark = (n: TreemapNode, top?: string): TreemapNode => ({ ...n, __hidden: top ? ctx.isHidden(top) : false, children: n.children?.map((c) => mark(c, top ?? c.name)) });
    const marked = { ...rootData, children: rootData.children?.map((c) => mark(c, c.name)) };
    const root = hierarchy<TreemapNode>(marked).sum((d) => (d.children?.length ? 0 : (d.value ?? 0)));
    const points: SeriesPoint[] = [];
    const topColors = new Map<string, RGBA>();
    for (const c of root.children ?? []) topColors.set(c.data.name, resolveColor(c.data.color ?? ctx.nextColor(), ctx.scheme));
    // Top-level groups first (legend), then every node path (tooltips).
    for (const c of root.children ?? []) points.push({ key: c.data.name, index: points.length, x: c.data.name, y: c.value ?? 0, label: c.data.name, color: topColors.get(c.data.name), datum: { ...c.data, __id: c.data.name, __root: root, children: undefined } });
    root.each((n) => {
      if (n.depth < 2 && n.children?.length) return;
      if (n.depth === 0) return;
      const path = n.ancestors().reverse().slice(1).map((a) => a.data.name).join(' / ');
      if (n.depth === 1) return; // already added
      points.push({ key: path, index: points.length, x: path, y: n.value ?? 0, label: path, datum: { ...n.data, __noLegend: true, children: undefined } });
    });
    // Leaves at depth 1 map to themselves.
    for (const p of points) if (!p.datum?.__noLegend) p.datum = { ...p.datum, __root: root };
    return itemSeries(o, ctx, points, 'rect', 'treemap');
  },
  legendEntries: itemLegend,
  formatValue: (s, p, f) => `${p.label}: ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)}`,
  createRenderer: (d) => new TreemapRenderer(d),
};

/* ================================================================ sankey */

interface SNode {
  id: string;
  label: string;
  color?: string;
}

class SankeyRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<SankeySeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const rects: MarkItem<RectAttrs>[] = [];
    const meshes: MeshItem[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const o = s.options;
      const nodePts = s.points.filter((p) => p.datum?.__kind === 'node');
      const linkPts = s.points.filter((p) => p.datum?.__kind === 'link' && !hiddenOf(p));
      if (!nodePts.length) continue;
      const pl = ctx.plot;
      const aligns = { justify: sankeyJustify, left: sankeyLeft, right: sankeyRight, center: sankeyCenter };
      const graph = sankey<SNode, { value: number; color?: string; __p: SeriesPoint }>()
        .nodeId((d) => d.id)
        .nodeWidth(o.nodeWidth ?? 14)
        .nodePadding(o.nodePadding ?? 14)
        .nodeAlign(aligns[o.align ?? 'justify'])
        .extent([
          [pl.x + 1, pl.y + 4],
          [pl.x + pl.width - 1, pl.y + pl.height - 4],
        ])({
        nodes: nodePts.map((p) => ({ id: p.key, label: p.label ?? p.key, color: p.datum?.color as string | undefined })),
        links: linkPts.map((p) => ({ source: p.datum!.source as string, target: p.datum!.target as string, value: p.y ?? 0, color: p.datum!.color as string | undefined, __p: p })),
      });
      const nodeColor = new Map<string, RGBA>();
      for (const n of graph.nodes as D3Node<SNode, object>[]) {
        const p = nodePts.find((x) => x.key === n.id)!;
        const c = p.color ?? s.color;
        nodeColor.set(n.id, c);
        const x0 = n.x0 ?? 0;
        const y0 = n.y0 ?? 0;
        const value = rect(x0, y0, (n.x1 ?? 0) - x0, Math.max(1, (n.y1 ?? 0) - y0), c, 2);
        const key = `${s.id}|n|${n.id}`;
        rects.push({ key, seriesIndex: s.index, dataIndex: p.index, value, enter: { ...value, y: y0 + value.height / 2, height: 0 } });
        hits.push({ kind: 'rect', key, series: s, dataIndex: p.index, anchor: { x: x0 + value.width / 2, y: y0 } });
        const right = x0 > pl.x + pl.width / 2;
        labels.push({ text: n.label, x: right ? x0 - 6 : (n.x1 ?? 0) + 6, y: y0 + value.height / 2, align: right ? 'right' : 'left', font: '600 12px' });
      }
      const STEPS = 24;
      for (const l of graph.links as D3Link<SNode, { value: number; color?: string; __p: SeriesPoint }>[]) {
        const src = l.source as D3Node<SNode, object>;
        const tgt = l.target as D3Node<SNode, object>;
        const x0 = src.x1 ?? 0;
        const x1 = tgt.x0 ?? 0;
        const ya = l.y0 ?? 0;
        const yb = l.y1 ?? 0;
        const w = l.width ?? 1;
        const top: number[] = [];
        const bot: number[] = [];
        for (let i = 0; i <= STEPS; i++) {
          const t = i / STEPS;
          const x = x0 + (x1 - x0) * t;
          const e = t * t * (3 - 2 * t);
          const y = ya + (yb - ya) * e;
          top.push(x, y - w / 2);
          bot.push(x, y + w / 2);
        }
        const tri = new Float32Array(STEPS * 12);
        for (let i = 0; i < STEPS; i++) {
          const t0 = [top[i * 2], top[i * 2 + 1]];
          const t1 = [top[i * 2 + 2], top[i * 2 + 3]];
          const b0 = [bot[i * 2], bot[i * 2 + 1]];
          const b1 = [bot[i * 2 + 2], bot[i * 2 + 3]];
          tri.set([...t0, ...b0, ...t1, ...t1, ...b0, ...b1], i * 12);
        }
        // Grow links from their source edge.
        const enter = new Float32Array(tri.length);
        for (let i = 0; i < tri.length; i += 2) {
          enter[i] = x0;
          enter[i + 1] = tri[i + 1];
        }
        const pc = l.color;
        const col = pc === 'target' ? nodeColor.get(tgt.id)! : pc && pc !== 'source' ? resolveColor(pc, ctx.scheme) : nodeColor.get(src.id)!;
        const key = `${s.id}|l|${l.__p.key}`;
        meshes.push({ key, seriesIndex: s.index, dataIndex: l.__p.index, triangles: tri, color: withAlpha(col, o.linkOpacity ?? 0.38), enter });
        hits.push({ kind: 'mesh', key, series: s, dataIndex: l.__p.index, anchor: { x: (x0 + x1) / 2, y: (ya + yb) / 2 } });
      }
    }
    return { rects, meshes, hits, labels };
  }
}

export const sankeySeries: SeriesDefinition<SankeySeriesOptions> = {
  type: 'sankey',
  coordinates: 'polar',
  normalize(o, ctx) {
    const links = o.links ?? (rowsOf(o, ctx) as unknown as SankeySeriesOptions['links']) ?? [];
    const ids: string[] = [];
    for (const l of links) for (const id of [l.source, l.target]) if (!ids.includes(id)) ids.push(id);
    const meta = new Map((o.nodes ?? []).map((n) => [n.id, n]));
    const points: SeriesPoint[] = ids.map((id, i) => ({
      key: id,
      index: i,
      x: id,
      y: links.filter((l) => l.source === id || l.target === id).reduce((a, l) => a + l.value, 0) / 2,
      label: meta.get(id)?.label ?? id,
      color: resolveColor(meta.get(id)?.color ?? ctx.nextColor(), ctx.scheme),
      datum: { __kind: 'node', __id: id, __hidden: false, id },
    }));
    links.forEach((l, i) => {
      const hidden = ctx.isHidden(l.source) || ctx.isHidden(l.target);
      points.push({ key: `${l.source}->${l.target}`, index: ids.length + i, x: `${l.source} → ${l.target}`, y: l.value, label: `${meta.get(l.source)?.label ?? l.source} → ${meta.get(l.target)?.label ?? l.target}`, datum: { ...l, __kind: 'link', __noLegend: true, __hidden: hidden } });
    });
    return itemSeries(o, ctx, points, 'rect', 'sankey');
  },
  legendEntries: itemLegend,
  formatValue: (s, p, f) => `${p.label}: ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)}`,
  createRenderer: (d) => new SankeyRenderer(d),
};

/* ================================================================ venn */

/** `orientation` in degrees, clockwise: where the second-largest circle sits relative to the largest (0 = right, 90 = below). */
export type VennOrientation = number | '0deg' | '90deg' | '180deg' | '270deg';

/** Venn options beyond the base interface (legacy names). */
export interface VennLegacyOptions {
  /** Row field holding the set list (the legacy `color` key). Default `'sets'`. */
  setsField?: string;
  /** Row field holding the label shown in sets and intersections (the legacy `label` key). Default `'label'`. */
  labelField?: string;
  /** Layout rotation: degrees, or the legacy `'0deg' | '90deg' | '180deg' | '270deg'`. Default 0. */
  orientation?: VennOrientation;
}

/** Venn options as the renderer reads them. `metric` (default `'size'`) names the size field. */
export type VennOptions = Omit<VennSeriesOptions, 'orientation'> & VennLegacyOptions;

function overlapArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const c = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return a + b - c;
}

/** Distance between two circles giving the requested overlap area (bisection). */
function distanceFor(r1: number, r2: number, overlap: number): number {
  let lo = Math.abs(r1 - r2);
  let hi = r1 + r2;
  if (overlap <= 0) return hi + 0.05 * (r1 + r2);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (overlapArea(r1, r2, mid) > overlap) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function circleIntersections(ax: number, ay: number, ar: number, bx: number, by: number, br: number): { x: number; y: number }[] {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > ar + br || d < Math.abs(ar - br)) return [];
  const a = (ar * ar - br * br + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ar * ar - a * a));
  const mx = ax + (a * dx) / d;
  const my = ay + (a * dy) / d;
  return [
    { x: mx + (h * dy) / d, y: my - (h * dx) / d },
    { x: mx - (h * dy) / d, y: my + (h * dx) / d },
  ];
}

/** Degrees from a numeric or `'90deg'` orientation. */
const orientationDegrees = (o: VennOrientation | undefined): number => {
  const v = typeof o === 'number' ? o : parseFloat(o ?? '0');
  return Number.isFinite(v) ? v : 0;
};

/**
 * Greedy Venn layout for any number of sets, in the manner of the legacy library's layout: sets are placed one at a
 * time (most overlapping first) at the candidate point whose pairwise overlap areas best match the requested ones.
 * Candidates sit at the target distance from each placed circle, and where two such distance rings cross. Pairs with
 * no intersection entry are kept apart. The result is then normalised: the largest circle at the origin, the
 * second-largest at `orientation` degrees (clockwise, 0 = to the right) and the third on the clockwise side.
 *
 * @param radii circle radii
 * @param overlap requested overlap area of circles i and j (0 when disjoint)
 */
export function vennLayout(radii: number[], overlap: (i: number, j: number) => number, orientation: VennOrientation = 0): { x: number; y: number }[] {
  const n = radii.length;
  const pos = radii.map(() => ({ x: 0, y: 0 }));
  if (n <= 1) return pos;
  const want: number[][] = radii.map(() => new Array<number>(n).fill(0));
  const dist: number[][] = radii.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = Math.max(0, Math.min(overlap(i, j), Math.PI * Math.min(radii[i], radii[j]) ** 2));
      want[i][j] = want[j][i] = w;
      dist[i][j] = dist[j][i] = distanceFor(radii[i], radii[j], w);
    }
  }
  const order = radii.map((_, i) => i).sort((a, b) => want[b].reduce((s, v) => s + v, 0) - want[a].reduce((s, v) => s + v, 0) || radii[b] - radii[a] || a - b);
  const placed = [order[0]];
  const scale = Math.max(1e-12, ...radii) ** 2;
  for (let k = 1; k < n; k++) {
    const i = order[k];
    const candidates: { x: number; y: number }[] = [];
    for (let a = 0; a < placed.length; a++) {
      const p = pos[placed[a]];
      const d = dist[i][placed[a]];
      for (let m = 0; m < 8; m++) candidates.push({ x: p.x + d * Math.cos((m * Math.PI) / 4), y: p.y + d * Math.sin((m * Math.PI) / 4) });
      if (placed.length <= 24) {
        for (let b = a + 1; b < placed.length; b++) {
          const q = pos[placed[b]];
          candidates.push(...circleIntersections(p.x, p.y, d, q.x, q.y, dist[i][placed[b]]));
        }
      }
    }
    let cx = 0;
    let cy = 0;
    for (const j of placed) {
      cx += pos[j].x / placed.length;
      cy += pos[j].y / placed.length;
    }
    let best = candidates[0];
    let bestLoss = Infinity;
    let bestSpread = Infinity;
    for (const c of candidates) {
      let loss = 0;
      for (const j of placed) {
        const e = overlapArea(radii[i], radii[j], Math.hypot(c.x - pos[j].x, c.y - pos[j].y)) - want[i][j];
        loss += e * e;
      }
      loss /= scale * scale;
      const spread = Math.hypot(c.x - cx, c.y - cy);
      // Lowest error first; among equally good points, the most compact one.
      if (loss < bestLoss - 1e-9 || (Math.abs(loss - bestLoss) <= 1e-9 && spread < bestSpread)) {
        best = c;
        bestLoss = loss;
        bestSpread = spread;
      }
    }
    pos[i] = { x: best.x, y: best.y };
    placed.push(i);
  }
  // Normalise: largest at the origin, second-largest at the orientation angle, third on the clockwise side.
  const bySize = radii.map((_, i) => i).sort((a, b) => radii[b] - radii[a] || a - b);
  const o0 = { ...pos[bySize[0]] };
  for (const p of pos) {
    p.x -= o0.x;
    p.y -= o0.y;
  }
  const theta = (orientationDegrees(orientation) * Math.PI) / 180;
  const s = pos[bySize[1]];
  if (Math.hypot(s.x, s.y) > 1e-9) {
    const rot = theta - Math.atan2(s.y, s.x);
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    for (const p of pos) {
      const x = p.x;
      p.x = c * x - sn * p.y;
      p.y = sn * x + c * p.y;
    }
  }
  if (n > 2) {
    const vx = -Math.sin(theta);
    const vy = Math.cos(theta);
    const t = pos[bySize[2]];
    if (t.x * vx + t.y * vy < -1e-9) {
      for (const p of pos) {
        const dot = p.x * vx + p.y * vy;
        p.x -= 2 * dot * vx;
        p.y -= 2 * dot * vy;
      }
    }
  }
  return pos;
}

/** Middle of the overlap between circles a and b along the line joining their centres. */
function lensCenter(a: { x: number; y: number }, ra: number, b: { x: number; y: number }, rb: number): { x: number; y: number } {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d < 1e-9) return { x: a.x, y: a.y };
  const t = (Math.max(d - rb, -ra) + Math.min(ra, d + rb)) / 2 / d;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

class VennRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<VennSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const points: MarkItem<PointAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const o = s.options as VennOptions;
      const singles = s.points.filter((p) => p.datum?.__single && !hiddenOf(p));
      const multi = s.points.filter((p) => !p.datum?.__single);
      if (!singles.length) continue;
      const r = singles.map((p) => Math.sqrt(Math.max(0, p.y ?? 0) / Math.PI));
      const setsOf = (p: SeriesPoint) => p.datum?.sets as string[];
      const sizeOf = (a: string, b: string) => multi.find((p) => setsOf(p).length === 2 && setsOf(p).includes(a) && setsOf(p).includes(b))?.y ?? 0;
      const pos = vennLayout(r, (i, j) => sizeOf(singles[i].key, singles[j].key), o.orientation);
      // Fit into the plot.
      const minX = minOf(pos.map((p, i) => p.x - r[i]));
      const maxX = maxOf(pos.map((p, i) => p.x + r[i]));
      const minY = minOf(pos.map((p, i) => p.y - r[i]));
      const maxY = maxOf(pos.map((p, i) => p.y + r[i]));
      const pl = ctx.plot;
      const k = Math.max(0, Math.min((pl.width - 20) / (maxX - minX || 1), (pl.height - 20) / (maxY - minY || 1)));
      const ox = pl.x + pl.width / 2 - ((minX + maxX) / 2) * k;
      const oy = pl.y + pl.height / 2 - ((minY + maxY) / 2) * k;
      const gx = ox + (pos.reduce((a, q) => a + q.x, 0) / pos.length) * k;
      const gy = oy + (pos.reduce((a, q) => a + q.y, 0) / pos.length) * k;
      singles.forEach((p, i) => {
        const cx = ox + pos[i].x * k;
        const cy = oy + pos[i].y * k;
        const rad = r[i] * k;
        const c = p.color ?? s.color;
        const value: PointAttrs = { x: cx, y: cy, size: rad * 2, color: withAlpha(c, 0.42), strokeColor: c, shape: 0 };
        const key = `${s.id}|${p.key}`;
        points.push({ key, seriesIndex: s.index, dataIndex: p.index, value, enter: { ...value, size: 0 } });
        hits.push({ kind: 'circle', key, series: s, dataIndex: p.index, anchor: { x: cx, y: cy - rad }, cx, cy, r: rad });
        // Label on the side away from the others.
        const dx = cx - gx;
        const dy = cy - gy;
        const dl = Math.hypot(dx, dy) || 1;
        const off = singles.length > 1 ? rad * 0.45 : 0;
        labels.push({ text: p.label ?? p.key, x: cx + (dx / dl) * off, y: cy + (dy / dl) * off, font: '700 13px' });
      });
      // Intersections: small hit targets in the overlap; the label when one is given, else the value.
      multi.forEach((p) => {
        const idx = setsOf(p).map((id) => singles.findIndex((q) => q.key === id));
        if (idx.some((i) => i < 0)) return;
        let sx = 0;
        let sy = 0;
        let m = 0;
        for (let a = 0; a < idx.length; a++) {
          for (let b = a + 1; b < idx.length; b++) {
            const c = lensCenter(pos[idx[a]], r[idx[a]], pos[idx[b]], r[idx[b]]);
            sx += c.x;
            sy += c.y;
            m++;
          }
        }
        if (!m) return;
        const cx = ox + (sx / m) * k;
        const cy = oy + (sy / m) * k;
        hits.push({ kind: 'circle', key: `${s.id}|${p.key}`, series: s, dataIndex: p.index, anchor: { x: cx, y: cy }, cx, cy, r: 16 });
        const text = p.datum?.__label != null ? String(p.datum.__label) : formatSeriesValue(s, p.y, ctx.formatter, 'label', p.index);
        labels.push({ text, x: cx, y: cy, font: '600 12px' });
      });
    }
    return { points, hits, labels };
  }
}

export const vennSeries: SeriesDefinition<VennSeriesOptions> = {
  type: 'venn',
  coordinates: 'polar',
  normalize(opts, ctx) {
    const o = opts as VennOptions;
    const setsField = o.setsField ?? 'sets';
    const sizeField = o.metric ?? 'size';
    const labelField = o.labelField ?? 'label';
    const rows = (o.sets ?? rowsOf(opts, ctx)) as unknown as Datum[];
    const points: SeriesPoint[] = [];
    for (const row of rows) {
      const raw = row[setsField] ?? (o.sets ? row.sets : undefined);
      const sets = Array.isArray(raw) ? raw.map(String) : raw === null || raw === undefined || raw === '' ? [] : String(raw).split('∩');
      if (!sets.length) continue;
      const single = sets.length === 1;
      const key = sets.join('∩');
      const given = row[labelField] ?? (o.sets ? row.label : undefined);
      const label = given === null || given === undefined || given === '' ? undefined : String(given);
      points.push({
        key,
        index: points.length,
        x: key,
        y: toNumber(row[sizeField]) ?? toNumber(row.size) ?? 0,
        label: label ?? sets.join(' ∩ '),
        color: single ? resolveColor(ctx.nextColor(), ctx.scheme) : undefined,
        datum: { ...row, sets, __label: label, __single: single, __id: key, __hidden: single && ctx.isHidden(key), __noLegend: !single },
      } as SeriesPoint);
    }
    return itemSeries(opts, ctx, points, 'circle', 'venn');
  },
  legendEntries: itemLegend,
  formatValue: (s, p, f) => `${p.label}: ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)}`,
  createRenderer: (d) => new VennRenderer(d),
};

/* ================================================================ bullet */

/**
 * One threshold band. Legacy form: `thresholdMin` / `thresholdMax` (either open-ended) and `fill`.
 * Older form: `value` (upper bound; the band starts at the previous value) and `color`.
 */
export interface BulletThreshold {
  thresholdMin?: number;
  thresholdMax?: number;
  fill?: ColorInput;
  value?: number;
  color?: ColorInput;
}

/** Bullet options beyond the base interface (legacy names). */
export interface BulletLegacyOptions {
  thresholds?: BulletThreshold[];
  /**
   * `normal`: the scale runs to the largest metric or 1.05 × target across all rows. `fixed`: to `maxScaleValue`.
   * `flexible`: to `maxScaleValue` until the data passes it. Unset: each row scales on its own (`maxValue`, the row's
   * `max`, or 1.15 × its larger value).
   */
  scaleType?: 'normal' | 'fixed' | 'flexible';
  /** Scale maximum for `fixed` and `flexible` (falls back to `maxValue`, then 100, as in the legacy library). */
  maxScaleValue?: number;
  /** Draw the target line. Default true. */
  showTarget?: boolean;
  /** Draw "Target: <value>" under the target line. Default false. */
  showTargetValue?: boolean;
  /** Colour the bar with the fill of the threshold band its value falls in. Default false. */
  thresholdBarColor?: boolean;
  /** `column` stacks bullets vertically (default), `row` places them side by side (labels always on top). */
  direction?: 'column' | 'row';
  /** `side`: label left, value right (default). `top`: both above the bar, with the legacy geometry. */
  labelPosition?: 'top' | 'side';
  /** Draw the grey track behind the bar. Default: drawn unless thresholds are given with an explicit `track`. */
  track?: boolean;
  /** Row field holding text shown instead of the formatted metric. */
  metricLabel?: string;
  /** Row field holding text shown instead of the formatted target in the target label. */
  targetLabel?: string;
}

export type BulletOptions = Omit<BulletSeriesOptions, 'thresholds'> & BulletLegacyOptions;

interface BulletBand {
  min?: number;
  max?: number;
  fill: ColorInput;
  opacity: number;
}

function bulletBands(list: readonly BulletThreshold[] | undefined): BulletBand[] {
  if (!list?.length) return [];
  const bands: BulletBand[] = list.filter((t) => t.value === undefined).map((t) => ({ min: t.thresholdMin, max: t.thresholdMax, fill: t.fill ?? t.color ?? 'gray-300', opacity: 0.2 }));
  let prev = 0;
  for (const t of list.filter((x) => x.value !== undefined).sort((a, b) => a.value! - b.value!)) {
    bands.push({ min: prev, max: t.value, fill: t.color ?? t.fill ?? 'gray-300', opacity: 0.35 });
    prev = t.value!;
  }
  return bands;
}

/** Fill of the band a value falls in, as the legacy `thresholdBarColor` picks it (undefined below the first band). */
function bandFillFor(bands: BulletBand[], v: number): ColorInput | undefined {
  const lo = (b: BulletBand) => b.min ?? -1e12;
  const sorted = [...bands].sort((a, b) => lo(a) - lo(b));
  if (!sorted.length || v < lo(sorted[0])) return undefined;
  for (let i = 0; i < sorted.length - 1; i++) if (v < lo(sorted[i + 1])) return sorted[i].fill;
  return sorted[sorted.length - 1].fill;
}

/**
 * The value domain shared by every row for the legacy scale types, or undefined when `scaleType` is unset (each row
 * then scales on its own).
 */
export function bulletDomain(o: Pick<BulletOptions, 'scaleType' | 'maxScaleValue' | 'maxValue'>, values: readonly (number | null)[], targets: readonly (number | null)[]): [number, number] | undefined {
  if (!o.scaleType) return undefined;
  const msv = o.maxScaleValue ?? o.maxValue ?? 100;
  if (o.scaleType === 'fixed' && msv > 0) return [0, msv];
  let lo = 0;
  let hi = 0;
  for (const v of values) {
    if (v === null) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  for (const t of targets) {
    if (t === null) continue;
    const padded = Math.round(t * 1.05);
    lo = Math.min(lo, padded);
    hi = Math.max(hi, padded);
  }
  if (o.scaleType === 'flexible' && msv > 0) hi = Math.max(hi, msv);
  return [lo, hi];
}

class BulletRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<BulletSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const rects: MarkItem<RectAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    const css = (token: string) => rgbaToCss(resolveColor(token, ctx.scheme));
    for (const s of series) {
      const o = s.options as BulletOptions;
      const pl = ctx.plot;
      const n = s.points.length;
      if (!n) continue;
      const targetField = o.targetField ?? 'target';
      const targets = s.points.map((p) => toNumber(p.datum?.[targetField]));
      const shared = bulletDomain(o, s.points.map((p) => p.y), targets);
      const showTarget = o.showTarget !== false;
      const showTargetValue = showTarget && !!o.showTargetValue;
      const isRow = o.direction === 'row';
      const onTop = isRow || o.labelPosition === 'top';
      const bands = bulletBands(o.thresholds);
      const rowBandsOf = (d: Datum) => (Array.isArray(d.thresholds) ? bulletBands(d.thresholds as BulletThreshold[]) : bands);
      const track = resolveColor('gray-200', ctx.scheme);
      const targetColor = resolveColor(onTop || ctx.scheme === 'dark' ? 'gray-900' : 'gray-800', ctx.scheme);
      // Side layout (fills the plot) and the legacy top-label geometry.
      const labelW = 110;
      const valueW = 70;
      const rowH = pl.height / n;
      const sideBand = Math.min(26, rowH * 0.5);
      const tvl = showTargetValue ? 20 : 0;
      const gap = 12;
      const groupH = 48 + tvl;
      const groupW = isRow ? Math.max(10, (pl.width - gap * (n - 1)) / n) : pl.width;
      s.points.forEach((p, i) => {
        const d = p.datum ?? {};
        const target = targets[i];
        const [lo, hi] = shared ?? [0, o.maxValue ?? toNumber(d.max) ?? Math.max(p.y ?? 0, target ?? 0) * 1.15];
        let x0: number;
        let w: number;
        let cy: number;
        let bandH: number;
        let barH: number;
        let targetH: number;
        let targetW: number;
        let trackH: number;
        if (onTop) {
          const gx = isRow ? pl.x + i * (groupW + gap) : pl.x;
          const gy = isRow ? pl.y : pl.y + i * (groupH + gap);
          x0 = gx;
          w = groupW;
          cy = gy + groupH - tvl - 15;
          bandH = 24;
          barH = 8;
          trackH = 8;
          targetH = 30;
          targetW = 2;
          labels.push({ text: p.label ?? String(p.x), x: gx, y: gy, align: 'left', baseline: 'top', color: css('gray-600'), font: '600 12px', maxWidth: Math.max(0, groupW - 60) });
          const valueText = o.metricLabel ? String(d[o.metricLabel] ?? '') : ctx.formatter.number(p.y ?? 0, o.numberFormat);
          labels.push({ text: valueText, x: gx + groupW, y: gy, align: 'right', baseline: 'top', color: css('gray-900'), font: '700 13px' });
        } else {
          x0 = pl.x + labelW;
          w = Math.max(10, pl.width - labelW - valueW);
          cy = pl.y + rowH * i + rowH / 2;
          bandH = sideBand;
          barH = sideBand * 0.44;
          trackH = sideBand;
          targetH = sideBand * 0.9;
          targetW = 3;
          labels.push({ text: p.label ?? String(p.x), x: pl.x, y: cy, align: 'left', font: '600 12px', maxWidth: labelW - 8 });
          const valueText = o.metricLabel ? String(d[o.metricLabel] ?? '') : ctx.formatter.number(p.y ?? 0, o.numberFormat);
          labels.push({ text: valueText, x: pl.x + pl.width, y: cy, align: 'right', font: '700 13px' });
        }
        const span = hi - lo || 1;
        const sx = (v: number) => x0 + ((Math.min(hi, Math.max(lo, v)) - lo) / span) * w;
        const key = `${s.id}|${p.key}`;
        const rowBands = rowBandsOf(d);
        const drawTrack = rowBands.length ? o.track === undefined : o.track !== false;
        if (drawTrack) {
          const tr = rect(x0, cy - trackH / 2, w, trackH, track, onTop ? 3 : 4);
          rects.push({ key: `${key}|t`, seriesIndex: -1, dataIndex: -1, value: tr, enter: { ...tr, width: 0 } });
        }
        rowBands.forEach((b, k) => {
          const bx0 = b.min === undefined ? x0 : sx(b.min);
          const bx1 = b.max === undefined ? x0 + w : sx(b.max);
          const band = rect(bx0, cy - bandH / 2, Math.max(0, bx1 - bx0), bandH, withAlpha(resolveColor(b.fill, ctx.scheme), b.opacity));
          rects.push({ key: `${key}|th${k}`, seriesIndex: -1, dataIndex: -1, value: band, enter: { ...band, width: 0 } });
        });
        const v = p.y ?? 0;
        const barFill = o.thresholdBarColor ? bandFillFor(rowBands, v) : undefined;
        const c = barFill !== undefined ? resolveColor(barFill, ctx.scheme) : (p.color ?? s.color);
        const base = sx(Math.max(lo, Math.min(hi, 0)));
        const end = sx(v);
        const bar = rect(Math.min(base, end), cy - barH / 2, Math.abs(end - base), barH, c, 3);
        rects.push({ key, seriesIndex: s.index, dataIndex: p.index, value: bar, enter: { ...bar, x: base, width: 0 } });
        hits.push({ kind: 'rect', key, series: s, dataIndex: p.index, anchor: { x: Math.max(base, end), y: cy - bandH / 2 } });
        if (target !== null && showTarget) {
          const tm = rect(sx(target) - targetW / 2, cy - targetH / 2, targetW, targetH, targetColor, onTop ? 0 : 1);
          rects.push({ key: `${key}|tg`, seriesIndex: -1, dataIndex: -1, value: tm, enter: { ...tm, x: x0 } });
          if (showTargetValue) {
            const text = `Target: ${o.targetLabel ? String(d[o.targetLabel] ?? '') : ctx.formatter.number(target, o.numberFormat)}`;
            labels.push({ text, x: sx(target), y: cy + Math.max(bandH, targetH) / 2 + 4, align: 'center', baseline: 'top', color: css('gray-900'), font: '400 11px' });
          }
        }
      });
    }
    return { rects, hits, labels, rectStyle: { hoverGrow: 0 } };
  }
}

export const bulletSeries: SeriesDefinition<BulletSeriesOptions> = {
  type: 'bullet',
  coordinates: 'polar',
  normalize(o, ctx) {
    const rows = rowsOf(o, ctx);
    const lf = o.labelField ?? o.dimension ?? 'label';
    const metric = o.metric ?? 'value';
    const points = rows.map((r: Datum, i) => ({ key: String(r[lf] ?? i), index: i, x: String(r[lf] ?? i), y: toNumber(r[metric]), label: String(r[lf] ?? ''), datum: { ...r, __noLegend: true } }) as SeriesPoint);
    return itemSeries(o, ctx, points, 'rect', 'bullet');
  },
  legendEntries: () => [],
  formatValue: (s, p, f) => {
    const t = toNumber(p.datum?.[s.options.targetField ?? 'target']);
    return `${f.number(p.y ?? 0, s.options.numberFormat)}${t !== null ? ` (target ${f.number(t, s.options.numberFormat)})` : ''}`;
  },
  createRenderer: (d) => new BulletRenderer(d),
};
