import { hierarchy, treemap, treemapBinary, treemapDice, treemapSlice, treemapSliceDice, treemapSquarify, type HierarchyNode } from 'd3-hierarchy';
import { sankey, sankeyCenter, sankeyJustify, sankeyLeft, sankeyRight, type SankeyLink as D3Link, type SankeyNode as D3Node } from 'd3-sankey';
import type { MarkItem } from '../marks/instance-mark';
import type { MeshItem } from '../marks/mesh-mark';
import type { PointAttrs } from '../marks/point-mark';
import type { RectAttrs } from '../marks/rect-mark';
import { contrastText, resolveColor, rgbaToCss, withAlpha, type RGBA } from '../theme/colors';
import type { Datum } from '../types';
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

class VennRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<VennSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const points: MarkItem<PointAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const singles = s.points.filter((p) => p.datum?.__single && !hiddenOf(p));
      const pairs = s.points.filter((p) => !p.datum?.__single);
      if (!singles.length) continue;
      const r = singles.map((p) => Math.sqrt((p.y ?? 0) / Math.PI));
      const sizeOf = (a: string, b: string) => pairs.find((p) => (p.datum?.sets as string[]).length === 2 && (p.datum?.sets as string[]).includes(a) && (p.datum?.sets as string[]).includes(b))?.y ?? 0;
      const pos: { x: number; y: number }[] = [{ x: 0, y: 0 }];
      if (singles.length > 1) pos.push({ x: distanceFor(r[0], r[1], sizeOf(singles[0].key, singles[1].key)), y: 0 });
      if (singles.length > 2) {
        const dAC = distanceFor(r[0], r[2], sizeOf(singles[0].key, singles[2].key));
        const dBC = distanceFor(r[1], r[2], sizeOf(singles[1].key, singles[2].key));
        const dAB = pos[1].x || 1;
        const x = (dAC * dAC - dBC * dBC + dAB * dAB) / (2 * dAB);
        const y = Math.sqrt(Math.max(0, dAC * dAC - x * x));
        pos.push({ x, y });
      }
      // Fit into the plot.
      const minX = minOf(pos.map((p, i) => p.x - r[i]));
      const maxX = maxOf(pos.map((p, i) => p.x + r[i]));
      const minY = minOf(pos.map((p, i) => p.y - r[i]));
      const maxY = maxOf(pos.map((p, i) => p.y + r[i]));
      const pl = ctx.plot;
      const k = Math.min((pl.width - 20) / (maxX - minX || 1), (pl.height - 20) / (maxY - minY || 1));
      const ox = pl.x + pl.width / 2 - ((minX + maxX) / 2) * k;
      const oy = pl.y + pl.height / 2 - ((minY + maxY) / 2) * k;
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
        const gx = ox + (pos.reduce((a, q) => a + q.x, 0) / pos.length) * k;
        const gy = oy + (pos.reduce((a, q) => a + q.y, 0) / pos.length) * k;
        const dx = cx - gx;
        const dy = cy - gy;
        const dl = Math.hypot(dx, dy) || 1;
        labels.push({ text: p.label ?? p.key, x: cx + (dx / dl) * rad * 0.45, y: cy + (dy / dl) * rad * 0.45, font: '700 13px' });
      });
      // Intersections: small hit targets at lens centers.
      pairs.forEach((p) => {
        const sets = p.datum?.sets as string[];
        const idx = sets.map((id) => singles.findIndex((q) => q.key === id));
        if (idx.some((i) => i < 0)) return;
        const cx = ox + (idx.reduce((a, i) => a + pos[i].x, 0) / idx.length) * k;
        const cy = oy + (idx.reduce((a, i) => a + pos[i].y, 0) / idx.length) * k;
        hits.push({ kind: 'circle', key: `${s.id}|${p.key}`, series: s, dataIndex: p.index, anchor: { x: cx, y: cy }, cx, cy, r: 16 });
        labels.push({ text: formatSeriesValue(s, p.y, ctx.formatter, 'label', p.index), x: cx, y: cy, font: '600 12px' });
      });
    }
    return { points, hits, labels };
  }
}

export const vennSeries: SeriesDefinition<VennSeriesOptions> = {
  type: 'venn',
  coordinates: 'polar',
  normalize(o, ctx) {
    const sets = o.sets ?? (rowsOf(o, ctx) as unknown as NonNullable<VennSeriesOptions['sets']>);
    const points: SeriesPoint[] = sets.map((v, i) => {
      const single = v.sets.length === 1;
      const key = v.sets.join('∩');
      return {
        key,
        index: i,
        x: key,
        y: v.size,
        label: v.label ?? v.sets.join(' ∩ '),
        color: single ? resolveColor(ctx.nextColor(), ctx.scheme) : undefined,
        datum: { ...v, __single: single, __id: key, __hidden: single && ctx.isHidden(key), __noLegend: !single },
      } as SeriesPoint;
    });
    return itemSeries(o, ctx, points, 'circle', 'venn');
  },
  legendEntries: itemLegend,
  formatValue: (s, p, f) => `${p.label}: ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)}`,
  createRenderer: (d) => new VennRenderer(d),
};

/* ================================================================ bullet */

class BulletRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<BulletSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const rects: MarkItem<RectAttrs>[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const o = s.options;
      const pl = ctx.plot;
      const n = s.points.length;
      if (!n) continue;
      const labelW = 110;
      const valueW = 70;
      const rowH = pl.height / n;
      const barH = Math.min(26, rowH * 0.5);
      const track = resolveColor(ctx.scheme === 'dark' ? 'gray-200' : 'gray-100', ctx.scheme);
      s.points.forEach((p, i) => {
        const d = p.datum ?? {};
        const max = o.maxValue ?? toNumber(d.max) ?? Math.max(p.y ?? 0, toNumber(d[o.targetField ?? 'target']) ?? 0) * 1.15;
        const x0 = pl.x + labelW;
        const w = Math.max(10, pl.width - labelW - valueW);
        const sx = (v: number) => x0 + (Math.min(max, Math.max(0, v)) / (max || 1)) * w;
        const cy = pl.y + rowH * i + rowH / 2;
        const key = `${s.id}|${p.key}`;
        const tr = rect(x0, cy - barH / 2, w, barH, track, 4);
        rects.push({ key: `${key}|t`, seriesIndex: -1, dataIndex: -1, value: tr, enter: { ...tr, width: 0 } });
        const th = (d.thresholds as BulletSeriesOptions['thresholds']) ?? o.thresholds ?? [];
        let prev = 0;
        [...th].sort((a, b) => a.value - b.value).forEach((t, k) => {
          const band = rect(sx(prev), cy - barH / 2, sx(t.value) - sx(prev), barH, withAlpha(resolveColor(t.color, ctx.scheme), 0.35));
          rects.push({ key: `${key}|th${k}`, seriesIndex: -1, dataIndex: -1, value: band, enter: { ...band, width: 0 } });
          prev = t.value;
        });
        const c = p.color ?? s.color;
        const bar = rect(x0, cy - barH * 0.22, sx(p.y ?? 0) - x0, barH * 0.44, c, 3);
        rects.push({ key, seriesIndex: s.index, dataIndex: p.index, value: bar, enter: { ...bar, width: 0 } });
        hits.push({ kind: 'rect', key, series: s, dataIndex: p.index, anchor: { x: bar.x + bar.width, y: cy - barH / 2 } });
        const target = toNumber(d[o.targetField ?? 'target']);
        if (target !== null) {
          const tm = rect(sx(target) - 1.5, cy - barH * 0.45, 3, barH * 0.9, resolveColor(ctx.scheme === 'dark' ? 'gray-900' : 'gray-800', ctx.scheme), 1);
          rects.push({ key: `${key}|tg`, seriesIndex: -1, dataIndex: -1, value: tm, enter: { ...tm, x: x0 } });
        }
        labels.push({ text: p.label ?? String(p.x), x: pl.x, y: cy, align: 'left', font: '600 12px', maxWidth: labelW - 8 });
        labels.push({ text: ctx.formatter.number(p.y ?? 0, o.numberFormat), x: pl.x + pl.width, y: cy, align: 'right', font: '700 13px' });
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
