import type { MeshItem } from '../marks/mesh-mark';
import { strip } from '../marks/mesh-mark';
import { contrastText, resolveColor, rgbaToCss } from '../theme/colors';
import type { BaseSeriesOptions } from '../types';
import { formatSeriesValue } from './format-value';
import { GeomRenderer, type GeomHit, type GeomLabel, type GeomOutput } from './geom-renderer';
import { normalizeGroups } from './normalize';
import type { LayoutContext, LegendEntry, ResolvedSeries, SeriesDefinition, SeriesPoint } from './types';

export interface MorphSeriesOptions extends BaseSeriesOptions {
  type: 'morph';
  /** Shape every item takes; changing it morphs items on the GPU. */
  mode?: 'bar' | 'horizontalBar' | 'pie' | 'donut' | 'radial';
  showLabels?: boolean;
}

/** Vertices per edge: bars and arc slices share this topology so they can morph. */
const M = 40;

function bandPolylines(top: (t: number) => [number, number], bottom: (t: number) => [number, number]): Float32Array {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < M; i++) {
    const t = i / (M - 1);
    a.push(...top(t));
    b.push(...bottom(t));
  }
  return strip(a, b);
}

const polar = (cx: number, cy: number, r: number, ang: number): [number, number] => [cx + Math.sin(ang) * r, cy - Math.cos(ang) * r];

class MorphRenderer extends GeomRenderer {
  protected build(series: ResolvedSeries<MorphSeriesOptions>[], ctx: LayoutContext): GeomOutput {
    const meshes: MeshItem[] = [];
    const hits: GeomHit[] = [];
    const labels: GeomLabel[] = [];
    for (const s of series) {
      const o = s.options;
      const mode = o.mode ?? 'bar';
      const pts = s.points.filter((p) => !p.datum?.__hidden && (p.y ?? 0) >= 0);
      const n = pts.length;
      if (!n) continue;
      const pl = ctx.plot;
      const max = Math.max(...pts.map((p) => p.y ?? 0)) || 1;
      const total = pts.reduce((a, p) => a + (p.y ?? 0), 0) || 1;
      const cx = pl.x + pl.width / 2;
      const cy = pl.y + pl.height / 2;
      const R = Math.min(pl.width, pl.height) / 2 - 8;
      let angle = 0;
      pts.forEach((p, i) => {
        const v = p.y ?? 0;
        let tri: Float32Array;
        let anchor: { x: number; y: number };
        let label: { x: number; y: number };
        if (mode === 'bar' || mode === 'horizontalBar') {
          const band = (mode === 'bar' ? pl.width : pl.height) / n;
          const gap = band * 0.18;
          if (mode === 'bar') {
            const x0 = pl.x + i * band + gap / 2;
            const x1 = x0 + band - gap;
            const base = pl.y + pl.height - 18;
            const top = base - (v / max) * (pl.height - 30);
            tri = bandPolylines((t) => [x0 + (x1 - x0) * t, top], (t) => [x0 + (x1 - x0) * t, base]);
            anchor = { x: (x0 + x1) / 2, y: top };
            label = { x: (x0 + x1) / 2, y: base + 10 };
          } else {
            const y0 = pl.y + i * band + gap / 2;
            const y1 = y0 + band - gap;
            const left = pl.x + 70;
            const right = left + (v / max) * (pl.width - 80);
            tri = bandPolylines((t) => [right, y0 + (y1 - y0) * t], (t) => [left, y0 + (y1 - y0) * t]);
            anchor = { x: right, y: (y0 + y1) / 2 };
            label = { x: pl.x + 64, y: (y0 + y1) / 2 };
          }
        } else if (mode === 'radial') {
          // Concentric rings, each sweeping to its value.
          const ring = (R * 0.75) / n;
          const outer = R - i * ring;
          const inner = outer - ring * 0.75;
          const sweep = (v / max) * Math.PI * 1.6;
          tri = bandPolylines((t) => polar(cx, cy, outer, sweep * t), (t) => polar(cx, cy, inner, sweep * t));
          anchor = { x: polar(cx, cy, outer, sweep)[0], y: polar(cx, cy, outer, sweep)[1] };
          label = { x: cx - 6, y: cy - (outer + inner) / 2 };
        } else {
          const inner = mode === 'donut' ? R * 0.58 : 0;
          const a0 = angle;
          const a1 = angle + (v / total) * Math.PI * 2;
          angle = a1;
          tri = bandPolylines((t) => polar(cx, cy, R, a0 + (a1 - a0) * t), (t) => polar(cx, cy, inner, a0 + (a1 - a0) * t));
          const mid = (a0 + a1) / 2;
          anchor = { x: polar(cx, cy, R, mid)[0], y: polar(cx, cy, R, mid)[1] };
          const lr = inner ? (inner + R) / 2 : R * 0.62;
          label = { x: polar(cx, cy, lr, mid)[0], y: polar(cx, cy, lr, mid)[1] };
        }
        const key = `${s.id}|${p.key}`;
        const c = p.color ?? s.color;
        meshes.push({ key, seriesIndex: s.index, dataIndex: p.index, triangles: tri, color: c });
        hits.push({ kind: 'mesh', key, series: s, dataIndex: p.index, anchor });
        if (o.showLabels !== false) {
          const inside = mode === 'pie' || mode === 'donut';
          labels.push({
            text: inside ? formatSeriesValue(s, v, ctx.formatter, 'label', p.index) : String(p.x),
            x: label.x,
            y: label.y,
            color: inside ? contrastText(c) : undefined,
            align: mode === 'horizontalBar' || mode === 'radial' ? 'right' : 'center',
            font: '600 11px',
          });
        }
      });
    }
    return { meshes, hits, labels };
  }
}

export const morphSeries: SeriesDefinition<MorphSeriesOptions> = {
  type: 'morph',
  coordinates: 'polar',
  normalize(o, ctx) {
    const groups = normalizeGroups(o, ctx, { dimension: 'label', metric: 'value' }, o.id ?? 'morph');
    const g = groups[0] ?? { id: 'morph', label: 'Series', points: [] };
    const color = resolveColor(o.color ?? '#888', ctx.scheme);
    const points: SeriesPoint[] = g.points.map((p) => {
      const id = String(p.x);
      return { ...p, key: id, label: id, color: resolveColor(ctx.nextColor(), ctx.scheme), datum: { ...p.datum, __id: id, __hidden: ctx.isHidden(id) } };
    });
    return [{ id: o.id ?? 'morph', type: 'morph', label: o.label ?? g.label, index: ctx.nextIndex(), color, colorCss: rgbaToCss(color), options: o, points, hidden: false, xAxisId: 'x', yAxisId: 'y', legendShape: 'rect' }];
  },
  legendEntries(series): LegendEntry[] {
    return series.flatMap((s) => s.points.map((p) => ({ id: String(p.datum?.__id ?? p.key), label: String(p.x), color: rgbaToCss(p.color ?? s.color), shape: 'rect' as const, seriesIndex: s.index, dataIndex: p.index })));
  },
  formatValue: (s, p, f) => formatSeriesValue(s, p.y, f, 'tooltip', p.index),
  createRenderer: (d) => new MorphRenderer(d),
};
