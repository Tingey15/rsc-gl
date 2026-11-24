import type { GpuDevice, RenderPass } from '@rsc-gl/gpu';
import type { FrameState, MarkItem } from '../marks/instance-mark';
import { RectMark, type RectAttrs } from '../marks/rect-mark';
import { contrastText, resolveColor, withAlpha, type RGBA } from '../theme/colors';
import type { BarSeriesOptions, TooltipItem } from '../types';
import type { DomainValue } from '../scales/scales';
import { normalizeGroups, stackSeries, toResolvedSeries, uniqueValues } from './normalize';
import type { HitResult, LayoutContext, ResolvedSeries, SeriesDefinition, SeriesRenderer } from './types';
import { formatSeriesValue } from './format-value';
import { minOf, maxOf } from '../data/extent';

type BarSeries = ResolvedSeries<BarSeriesOptions>;

const isHorizontal = (s: BarSeries) => s.options.layout === 'horizontal';

interface BarGeom {
  key: string;
  series: BarSeries;
  index: number;
  rect: { x: number; y: number; width: number; height: number };
  value: number | null;
  datum?: Record<string, unknown>;
}

class BarRenderer implements SeriesRenderer {
  private mark: RectMark;
  private geoms: BarGeom[] = [];
  private series: BarSeries[] = [];

  constructor(device: GpuDevice) {
    this.mark = new RectMark(device);
  }

  layout(all: ResolvedSeries[], ctx: LayoutContext): void {
    const series = (all as BarSeries[]).filter((s) => !s.hidden);
    this.series = series;
    const items: MarkItem<RectAttrs>[] = [];
    const geoms: BarGeom[] = [];

    // Group by category axis so independent axes lay out independently.
    const groups = new Map<string, BarSeries[]>();
    for (const s of series) {
      const k = isHorizontal(s) ? `h|${s.yAxisId}` : `v|${s.xAxisId}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(s);
    }

    for (const group of groups.values()) {
      const horizontal = isHorizontal(group[0]);
      const catAxis = horizontal ? ctx.yAxis(group[0].yAxisId) : ctx.xAxis(group[0].xAxisId);
      const groupValAxis = horizontal ? ctx.xAxis(group[0].xAxisId) : ctx.yAxis(group[0].yAxisId);
      if (!catAxis || !groupValAxis) continue;
      const cat = catAxis.scale;

      // Slots: one per stack id (or per unstacked series).
      const slots = uniqueValues(group.map((s) => s.stack ?? `__${s.id}`)) as string[];
      // Stagger by category so every segment of a stack (and each dodge group) moves together.
      const cats = cat.domain().map(String);
      const catDelay = (x: unknown) => (cats.length > 1 ? Math.max(0, cats.indexOf(String(x))) / (cats.length - 1) : 0);
      const n = slots.length;
      const gapRatio = catAxis.options.barGapRatio ?? 0.1;
      const band = cat.bandwidth() || Math.max(2, Math.abs(cat.step() || 20) * 0.8);
      const w = band / (n + (n - 1) * gapRatio);

      // Determine outermost segment per stack/category for corner rounding.
      const outerPos = new Map<string, BarSeries>();
      const outerNeg = new Map<string, BarSeries>();
      for (const s of group) {
        for (const p of s.points) {
          if (p.y === null) continue;
          const k = `${s.stack ?? s.id}|${String(p.x)}`;
          if ((p.y ?? 0) >= 0) outerPos.set(k, s);
          else outerNeg.set(k, s);
        }
      }

      for (const s of group) {
        // Each series uses its own value axis (a secondary metric axis can share the categories).
        const valAxis = (horizontal ? ctx.xAxis(s.xAxisId) : ctx.yAxis(s.yAxisId)) ?? groupValAxis;
        const val = valAxis.scale;
        // Log scales have no zero: bars start at the bottom of the domain instead.
        const floor = valAxis.scaleType === 'log' ? minOf(val.domain().map(Number)) : 0;
        const zero = val.map(clampDomain(val.domain(), floor));
        const y0Of = (y0: number | null | undefined) => (valAxis.scaleType === 'log' ? Math.max(y0 ?? floor, floor) : (y0 ?? 0));
        const slot = slots.indexOf(s.stack ?? `__${s.id}`);
        const o = s.options;
        const radius = o.borderRadius ?? 4;
        const roundAll = o.roundCorners === 'all';
        for (const p of s.points) {
          if (p.y === null) continue;
          const c0 = cat.map(p.x);
          if (!Number.isFinite(c0)) continue;
          const pos = c0 + slot * w * (1 + gapRatio) + (cat.bandwidth() ? 0 : -band / 2);
          const v0 = val.map(y0Of(p.y0));
          const v1 = val.map(p.y1 ?? p.y);
          let a = Math.min(v0, v1);
          let len = Math.abs(v1 - v0);
          if (o.minBarSize && len < o.minBarSize && p.y !== 0) {
            const grow = o.minBarSize - len;
            len = o.minBarSize;
            a -= horizontal ? (v1 >= v0 ? 0 : grow) : v1 <= v0 ? grow : 0;
          }
          const positive = (p.y ?? 0) >= 0;
          const stackKey = `${s.stack ?? s.id}|${String(p.x)}`;
          const isOuter = (positive ? outerPos : outerNeg).get(stackKey) === s;
          const corners = roundAll ? 15 : !isOuter ? 0 : horizontal ? (positive ? 6 : 9) : positive ? 3 : 12;
          const color: RGBA = withAlpha(p.color ?? s.color, o.opacity ?? 1);
          // A border without its own color is drawn in the fill color: the bar grows by half the width on each side.
          const grow = !o.borderColor && o.borderWidth ? o.borderWidth / 2 : 0;
          const rect = horizontal ? { x: a - grow, y: pos - grow, width: len + 2 * grow, height: w + 2 * grow } : { x: pos - grow, y: a - grow, width: w + 2 * grow, height: len + 2 * grow };
          const base = horizontal
            ? { x: val.map(y0Of(p.y0)), y: pos, width: 0, height: w }
            : { x: pos, y: v0 === v1 ? zero : val.map(y0Of(p.y0)), width: w, height: 0 };
          const value: RectAttrs = { ...rect, color, radius, corners };
          items.push({
            key: `${s.id}|${p.key}`,
            seriesIndex: s.index,
            dataIndex: p.index,
            delay: catDelay(p.x),
            value,
            enter: ctx.enterAnimation ? { ...value, ...base } : { ...value, color: [color[0], color[1], color[2], 0] },
            exit: { ...value, ...base, color: [color[0], color[1], color[2], 0] },
          });
          geoms.push({ key: `${s.id}|${p.key}`, series: s, index: p.index, rect, value: p.y, datum: p.datum });
        }
      }
    }
    const first = series[0]?.options;
    this.mark.style = {
      strokeColor: first?.borderColor ? resolveColor(first.borderColor, ctx.scheme) : [0, 0, 0, 0],
      strokeWidth: first?.borderColor ? (first.borderWidth ?? 0) : 0,
      hoverGrow: 0,
    };
    this.mark.update(items, ctx.transition, ctx.now);
    this.geoms = geoms;
  }

  draw(pass: RenderPass, frame: FrameState): void {
    this.mark.draw(pass, frame);
  }

  toSvg(now: number): string {
    return this.mark.toSvg(now);
  }

  drawOverlay(g: CanvasRenderingContext2D, ctx: LayoutContext, now: number): void {
    const labelled = this.series.filter((s) => s.options.barLabel);
    if (labelled.length === 0) return;
    g.save();
    g.font = `500 ${ctx.theme.fontSize}px ${ctx.theme.fontFamily}`;
    g.textBaseline = 'middle';
    for (const geo of this.geoms) {
      const o = geo.series.options;
      if (!o.barLabel) continue;
      const text =
        typeof o.barLabel === 'function'
          ? o.barLabel({ value: geo.value, dataIndex: geo.index, seriesId: geo.series.id, datum: geo.datum })
          : o.barLabelFormat && geo.value !== null
            ? ctx.formatter.number(geo.value, o.barLabelFormat)
            : formatSeriesValue(geo.series, geo.value, ctx.formatter, 'label', geo.index);
      if (!text) continue;
      // Labels ride on the animated bar and fade with it.
      const cur = this.mark.currentState(geo.key, now);
      const r = cur ?? geo.rect;
      g.globalAlpha = cur ? Math.max(0, Math.min(1, cur.color[3] / Math.max(0.001, geo.series.color[3] * (o.opacity ?? 1)))) : 1;
      const horizontal = isHorizontal(geo.series);
      const placement = o.barLabelPlacement ?? (geo.series.stack ? 'center' : 'outside');
      const tw = g.measureText(text).width;
      let x: number;
      let y: number;
      let color = ctx.theme.textColor;
      const neg0 = (geo.value ?? 0) < 0;
      // Inside placements need room; 'spill' draws them anyway.
      const fits = o.barLabelOverflow === 'spill' || (horizontal ? r.width >= tw + 8 && r.height >= 12 : r.height >= 16 && r.width >= tw + 4);
      if (placement === 'center') {
        x = r.x + r.width / 2;
        y = r.y + r.height / 2;
        g.textAlign = 'center';
        if (!fits) continue;
        color = contrastText(geo.series.color);
      } else if (placement === 'inside-end') {
        if (!fits) continue;
        g.textAlign = horizontal ? (neg0 ? 'left' : 'right') : 'center';
        x = horizontal ? (neg0 ? r.x + 6 : r.x + r.width - 6) : r.x + r.width / 2;
        y = horizontal ? r.y + r.height / 2 : neg0 ? r.y + r.height - 10 : r.y + 10;
        color = contrastText(geo.series.color);
      } else if (placement === 'start') {
        if (!fits) continue;
        g.textAlign = horizontal ? (neg0 ? 'right' : 'left') : 'center';
        x = horizontal ? (neg0 ? r.x + r.width - 6 : r.x + 6) : r.x + r.width / 2;
        y = horizontal ? r.y + r.height / 2 : neg0 ? r.y + 10 : r.y + r.height - 10;
        color = contrastText(geo.series.color);
      } else {
        const neg = (geo.value ?? 0) < 0;
        g.textAlign = horizontal ? (neg ? 'right' : 'left') : 'center';
        x = horizontal ? (neg ? r.x - 4 : r.x + r.width + 4) : r.x + r.width / 2;
        y = horizontal ? r.y + r.height / 2 : neg ? r.y + r.height + 9 : r.y - 9;
      }
      if (o.barLabelBadge) {
        // Annotation badge: a rounded box in the theme's tooltip colors.
        const bw = tw + 10;
        const bh = ctx.theme.fontSize + 6;
        const bx = g.textAlign === 'center' ? x - bw / 2 : g.textAlign === 'right' ? x - bw + 3 : x - 3;
        g.fillStyle = ctx.theme.tooltipBackground;
        g.strokeStyle = ctx.theme.tooltipBorder;
        g.lineWidth = 1;
        g.beginPath();
        g.roundRect(bx, y - bh / 2, bw, bh, 4);
        g.fill();
        g.stroke();
        color = ctx.theme.tooltipText;
      }
      g.fillStyle = color;
      g.fillText(text, x, y);
    }
    g.globalAlpha = 1;
    g.restore();
  }

  hitTest(x: number, y: number, _ctx: LayoutContext, now: number): HitResult | null {
    let best: HitResult | null = null;
    for (const geo of this.geoms) {
      const cur = this.mark.currentState(geo.key, now);
      const r = cur ?? geo.rect;
      const pad = 1;
      if (x >= r.x - pad && x <= r.x + r.width + pad && y >= r.y - pad && y <= r.y + r.height + pad) {
        const horizontal = isHorizontal(geo.series);
        const anchor = horizontal ? { x: r.x + r.width, y: r.y + r.height / 2 } : { x: r.x + r.width / 2, y: r.y };
        best = { series: geo.series, dataIndex: geo.index, anchor, distance: 0 };
      }
    }
    return best;
  }

  itemsAtIndex(_i: number, axisValue: DomainValue, ctx: LayoutContext): TooltipItem[] {
    const out: TooltipItem[] = [];
    for (const s of this.series) {
      const p = s.points.find((pt) => String(pt.x) === String(axisValue));
      if (!p || s.options.excludeFromInteraction) continue;
      out.push({
        seriesId: s.id,
        seriesLabel: s.label,
        dataIndex: p.index,
        color: s.colorCss,
        value: p.y,
        formattedValue: formatSeriesValue(s, p.y, ctx.formatter, 'tooltip', p.index),
        datum: p.datum,
      });
    }
    return out;
  }

  itemAnchor(seriesId: string, dataIndex: number, now: number) {
    const geo = this.geoms.find((g) => g.series.id === seriesId && g.index === dataIndex);
    if (!geo) return null;
    const r = this.mark.currentState(geo.key, now) ?? geo.rect;
    return isHorizontal(geo.series) ? { x: r.x + r.width, y: r.y + r.height / 2 } : { x: r.x + r.width / 2, y: r.y };
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

function clampDomain(domain: DomainValue[], v: number): number {
  const nums = domain.map(Number);
  const lo = minOf(nums);
  const hi = maxOf(nums);
  return Math.min(hi, Math.max(lo, v));
}

export const barSeries: SeriesDefinition<BarSeriesOptions> = {
  type: 'bar',
  coordinates: 'cartesian',
  normalize(o, ctx) {
    const groups = normalizeGroups(o, ctx, { dimension: 'category', metric: 'value', categoryAxis: o.layout === 'horizontal' ? 'y' : 'x' }, o.id ?? `bar-${ctx.nextIndex()}`);
    const series = toResolvedSeries(o, groups, ctx, 'rect');
    // `groupBy` with an explicit stack keeps groups stacked; without `stack` grouped series dodge.
    for (const s of series) s.stack = o.stack;
    return series;
  },
  process(series) {
    stackSeries(series, series.find((s) => s.options.stackOffset)?.options.stackOffset ?? 'diverging');
  },
  requirements(series) {
    const horizontal = series.some((s) => s.options.layout === 'horizontal');
    const cats: DomainValue[] = [];
    const vals: number[] = [0];
    for (const s of series) {
      if (s.hidden) {
        for (const p of s.points) cats.push(p.x);
        continue;
      }
      for (const p of s.points) {
        cats.push(p.x);
        if (p.y0 !== undefined) vals.push(p.y0);
        if (p.y1 !== undefined) vals.push(p.y1);
        else if (p.y !== null) vals.push(p.y);
      }
    }
    const cat = { values: uniqueValues(cats), preferredType: 'band' as const, requiresBand: true };
    const val = { values: vals, preferredType: 'linear' as const, includeZero: true };
    return horizontal ? { x: val, y: cat } : { x: cat, y: val };
  },
  createRenderer: (device) => new BarRenderer(device),
};
