import type { GpuDevice, RenderPass } from '@rsc-gl/gpu';
import { packColor, type FrameState, type MarkItem } from '../marks/instance-mark';
import { PointMark, symbolShapeId, writePointInstance, type PointAttrs } from '../marks/point-mark';
import { getInterpolator, parseCss, resolveColor, withAlpha, type RGBA } from '../theme/colors';
import { resolveSymbolSize } from '../theme/theme';
import type { ScatterSeriesOptions, TooltipItem } from '../types';
import { formatSeriesValue } from './format-value';
import { normalizeGroups, toNumber, toResolvedSeries } from './normalize';
import type { HitResult, LayoutContext, ResolvedSeries, SeriesDefinition, SeriesRenderer } from './types';

type ScatterSeries = ResolvedSeries<ScatterSeriesOptions>;

/** Above this many points per chart the keyed-transition path is skipped. */
export const SCATTER_DIRECT_THRESHOLD = 25_000;

/**
 * Uniform grid spatial index over screen positions (counting sort into
 * cells). Rebuilt on layout; O(1) average nearest-neighbor queries.
 */
class GridIndex {
  private cellStart = new Int32Array(0);
  private items = new Int32Array(0);
  private cols = 1;
  private rows = 1;
  constructor(
    private xs: Float32Array,
    private ys: Float32Array,
    private count: number,
    private x0: number,
    private y0: number,
    width: number,
    height: number,
    private cell = 16,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cell) + 1);
    this.rows = Math.max(1, Math.ceil(height / cell) + 1);
    const cells = this.cols * this.rows;
    const cellOf = new Int32Array(count);
    const counts = new Int32Array(cells + 1);
    for (let i = 0; i < count; i++) {
      const c = this.cellIndex(xs[i], ys[i]);
      cellOf[i] = c;
      if (c >= 0) counts[c + 1]++;
    }
    for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
    this.cellStart = counts.slice();
    const cursor = counts.slice();
    this.items = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      const c = cellOf[i];
      if (c >= 0) this.items[cursor[c]++] = i;
    }
  }

  private cellIndex(x: number, y: number): number {
    const cx = Math.floor((x - this.x0) / this.cell);
    const cy = Math.floor((y - this.y0) / this.cell);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows || !Number.isFinite(cx + cy)) return -1;
    return cy * this.cols + cx;
  }

  nearest(x: number, y: number, radius: number): { i: number; d: number } | null {
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor((x - this.x0) / this.cell);
    const cy = Math.floor((y - this.y0) / this.cell);
    let best = -1;
    let bestD = radius * radius;
    for (let gy = cy - r; gy <= cy + r; gy++) {
      if (gy < 0 || gy >= this.rows) continue;
      for (let gx = cx - r; gx <= cx + r; gx++) {
        if (gx < 0 || gx >= this.cols) continue;
        const c = gy * this.cols + gx;
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
          const i = this.items[k];
          const dx = this.xs[i] - x;
          const dy = this.ys[i] - y;
          const d = dx * dx + dy * dy;
          // Later points draw on top, so prefer them on ties.
          if (d <= bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best < 0 ? null : { i: best, d: Math.sqrt(bestD) };
  }
}

class ScatterRenderer implements SeriesRenderer {
  private mark: PointMark;
  private index: GridIndex | null = null;
  /** Flat lookup: instance -> (series, point index, size). */
  private owner: Int32Array = new Int32Array(0);
  private pointIdx: Int32Array = new Int32Array(0);
  private sizes: Float32Array = new Float32Array(0);
  private series: ScatterSeries[] = [];
  private xs = new Float32Array(0);
  private directMode = false;
  private ys = new Float32Array(0);

  constructor(device: GpuDevice) {
    this.mark = new PointMark(device);
  }

  layout(all: ResolvedSeries[], ctx: LayoutContext): void {
    const series = (all as ScatterSeries[]).filter((s) => !s.hidden);
    this.series = series;
    let total = 0;
    for (const s of series) total += s.options.positions ? s.options.positions.length / 2 : s.points.length;
    const xs = new Float32Array(total);
    const ys = new Float32Array(total);
    this.owner = new Int32Array(total);
    this.pointIdx = new Int32Array(total);
    this.sizes = new Float32Array(total);
    const direct = total > SCATTER_DIRECT_THRESHOLD || series.some((s) => s.options.positions);
    this.directMode = direct;
    const items: MarkItem<PointAttrs>[] = [];
    const meta: { color: number; stroke: number; shape: number; series: number }[] = [];
    let n = 0;
    series.forEach((s, si) => {
      const xa = ctx.xAxis(s.xAxisId);
      const ya = ctx.yAxis(s.yAxisId);
      if (!xa || !ya) return;
      const o = s.options;
      const baseSize = resolveSymbolSize(o.markerSize, 8);
      const opacity = o.opacity ?? 0.85;
      const color = withAlpha(s.color, opacity);
      const stroke: RGBA = o.strokeColor ? resolveColor(o.strokeColor, ctx.scheme) : withAlpha(s.color, 1);
      const shape = symbolShapeId(o.shape);
      const packedColor = packColor(color);
      const packedStroke = packColor(stroke);
      const interp = o.colorValueField || s.points.some((p) => p.colorValue !== undefined) ? getInterpolator(o.colorScheme ?? 'viridis') : undefined;
      let cmin = Infinity;
      let cmax = -Infinity;
      let smin = Infinity;
      let smax = -Infinity;
      for (const p of s.points) {
        if (p.colorValue !== undefined) {
          cmin = Math.min(cmin, p.colorValue);
          cmax = Math.max(cmax, p.colorValue);
        }
        if (p.size !== undefined) {
          smin = Math.min(smin, p.size);
          smax = Math.max(smax, p.size);
        }
      }
      const [r0, r1] = o.sizeRange ?? [6, 36];
      const sizeFor = (v: number | undefined) =>
        v === undefined || !Number.isFinite(smin) ? baseSize : smax === smin ? (r0 + r1) / 2 : r0 + (Math.sqrt((v - smin) / (smax - smin)) * (r1 - r0));

      if (o.positions) {
        const pos = o.positions;
        const m = pos.length / 2;
        for (let i = 0; i < m; i++) {
          xs[n] = xa.scale.map(pos[i * 2]);
          ys[n] = ya.scale.map(pos[i * 2 + 1]);
          this.owner[n] = si;
          this.pointIdx[n] = i;
          this.sizes[n] = baseSize;
          meta.push({ color: packedColor, stroke: packedStroke, shape, series: s.index });
          n++;
        }
        return;
      }
      for (const p of s.points) {
        if (p.y === null) continue;
        const px = xa.scale.map(p.x);
        const py = ya.scale.map(p.y);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        const size = sizeFor(p.size);
        const c: RGBA = p.color
          ? withAlpha(p.color, opacity)
          : interp && p.colorValue !== undefined
            ? withAlpha(parseCss(interp(cmax === cmin ? 0.5 : (p.colorValue - cmin) / (cmax - cmin))), opacity)
            : color;
        xs[n] = px;
        ys[n] = py;
        this.owner[n] = si;
        this.pointIdx[n] = p.index;
        this.sizes[n] = size;
        if (direct) {
          meta.push({ color: packColor(c), stroke: packedStroke, shape, series: s.index });
        } else {
          const value: PointAttrs = { x: px, y: py, size, color: c, strokeColor: stroke, shape };
          items.push({
            key: `${s.id}|${p.key}`,
            seriesIndex: s.index,
            dataIndex: p.index,
            value,
            enter: ctx.enterAnimation ? { ...value, size: 0 } : { ...value, color: [c[0], c[1], c[2], 0] },
          });
        }
        n++;
      }
    });
    this.mark.strokeWidth = series.some((s) => s.options.strokeWidth) ? (series[0].options.strokeWidth ?? 1) : 0;
    if (direct && ctx.headless) {
      // Vector rendering reads the arrays directly.
    } else if (direct) {
      const idx = this.pointIdx;
      const sizes = this.sizes;
      // Entrance: points grow in on the GPU, sweeping left to right.
      const enter = ctx.enterAnimation;
      const x0 = ctx.plot.x;
      const w = Math.max(1, ctx.plot.width);
      this.mark.updateDirect(
        n,
        (f, u, o, i) =>
          writePointInstance(f, u, o, xs[i], ys[i], sizes[i], meta[i].color, meta[i].stroke, meta[i].series, idx[i], meta[i].shape, enter ? 0 : sizes[i], enter ? Math.min(1, Math.max(0, (xs[i] - x0) / w)) : 0),
        enter ? { ...ctx.transition, duration: ctx.transition.duration * 1.6, stagger: 0.6 } : { duration: 0, easing: 'linear', stagger: 0 },
        ctx.now,
      );
    } else {
      this.mark.update(items, { ...ctx.transition, stagger: ctx.firstRender ? 0.4 : 0 }, ctx.now);
    }
    this.xs = xs;
    this.ys = ys;
    this.index = new GridIndex(xs, ys, n, ctx.plot.x - 20, ctx.plot.y - 20, ctx.plot.width + 40, ctx.plot.height + 40, 16);
  }

  draw(pass: RenderPass, frame: FrameState): void {
    this.mark.draw(pass, frame);
  }

  toSvg(now: number): string {
    if (this.directMode) {
      // Direct (typed-array) mode: emit up to 20k points.
      const step = Math.max(1, Math.ceil(this.xs.length / 20000));
      const out: string[] = [];
      for (let i = 0; i < this.xs.length; i += step) {
        const s = this.series[this.owner[i]];
        if (!s) continue;
        const r = this.sizes[i] / 2;
        out.push(`<circle cx="${this.xs[i].toFixed(1)}" cy="${this.ys[i].toFixed(1)}" r="${r}" fill="${s.colorCss}" fill-opacity="${s.options.opacity ?? 0.85}"/>`);
      }
      return out.join('');
    }
    return this.mark.toSvg(now);
  }

  hitTest(x: number, y: number): HitResult | null {
    if (!this.index) return null;
    const hit = this.index.nearest(x, y, 24);
    if (!hit) return null;
    const s = this.series[this.owner[hit.i]];
    if (!s || s.options.excludeFromInteraction) return null;
    const radius = this.sizes[hit.i] / 2 + 6;
    if (hit.d > radius) return null;
    return { series: s, dataIndex: this.pointIdx[hit.i], anchor: { x: this.xs[hit.i], y: this.ys[hit.i] }, distance: hit.d };
  }

  itemsAtIndex(): TooltipItem[] {
    return [];
  }

  itemAnchor(seriesId: string, dataIndex: number) {
    const si = this.series.findIndex((s) => s.id === seriesId);
    for (let i = 0; i < this.owner.length; i++) {
      if (this.owner[i] === si && this.pointIdx[i] === dataIndex) return { x: this.xs[i], y: this.ys[i] };
    }
    return null;
  }

  isAnimating(now: number): boolean {
    return this.mark.isAnimating(now);
  }

  setDevice(device: GpuDevice): void {
    this.mark.setDevice(device);
  }

  destroy(): void {
    this.mark.destroy();
  }
}

export const scatterSeries: SeriesDefinition<ScatterSeriesOptions> = {
  type: 'scatter',
  coordinates: 'cartesian',
  normalize(o, ctx) {
    if (o.positions) {
      return toResolvedSeries(o, [{ id: o.id ?? `scatter-${ctx.nextIndex()}`, label: o.label ?? 'Series', points: [] }], ctx, 'circle');
    }
    const groups = normalizeGroups(o, ctx, { dimension: 'x', metric: 'y' }, o.id ?? `scatter-${ctx.nextIndex()}`);
    for (const g of groups) {
      for (const p of g.points) {
        const d = p.datum;
        if (!d) continue;
        if (d.id !== undefined) p.key = `${g.id}::${String(d.id)}`;
        const size = o.sizeField ? toNumber(d[o.sizeField]) : null;
        if (size !== null) p.size = size;
        const cv = toNumber(o.colorValueField ? d[o.colorValueField] : d.colorValue);
        if (cv !== null) p.colorValue = cv;
      }
    }
    return toResolvedSeries(o, groups, ctx, 'circle');
  },
  requirements(series) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of series) {
      if (s.hidden) continue;
      const pos = s.options.positions;
      if (pos) {
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (let i = 0; i < pos.length; i += 2) {
          if (pos[i] < x0) x0 = pos[i];
          if (pos[i] > x1) x1 = pos[i];
          if (pos[i + 1] < y0) y0 = pos[i + 1];
          if (pos[i + 1] > y1) y1 = pos[i + 1];
        }
        xs.push(x0, x1);
        ys.push(y0, y1);
        continue;
      }
      for (const p of s.points) {
        if (p.y === null) continue;
        xs.push(Number(p.x));
        ys.push(p.y);
      }
    }
    return { x: { values: xs, preferredType: 'linear' }, y: { values: ys, preferredType: 'linear' } };
  },
  formatValue(s, p, f) {
    return `(${f.number(Number(p.x))}, ${formatSeriesValue(s, p.y, f, 'tooltip', p.index)})`;
  },
  createRenderer: (device) => new ScatterRenderer(device),
};
