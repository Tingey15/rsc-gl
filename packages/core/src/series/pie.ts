import type { GpuDevice, RenderPass } from '@rsc-gl/gpu';
import { ArcMark, type ArcAttrs } from '../marks/arc-mark';
import type { FrameState, MarkItem } from '../marks/instance-mark';
import { contrastText, resolveColor, rgbaToCss, withAlpha } from '../theme/colors';
import type { Datum, PieDatum, PieSeriesOptions, TooltipItem } from '../types';
import { formatSeriesValue } from './format-value';
import { toNumber } from './normalize';
import type { HitResult, LayoutContext, LegendEntry, ResolvedSeries, SeriesDefinition, SeriesPoint, SeriesRenderer } from './types';

type PieSeries = ResolvedSeries<PieSeriesOptions>;

const DEG = Math.PI / 180;

function resolveLength(v: number | string | undefined, ref: number, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === 'number') return v;
  const m = /^(-?[\d.]+)%$/.exec(v.trim());
  if (m) return (Number(m[1]) / 100) * ref;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

interface SliceGeom {
  series: PieSeries;
  point: SeriesPoint;
  arc: ArcAttrs;
  percent: number;
  hidden: boolean;
}

class PieRenderer implements SeriesRenderer {
  private mark: ArcMark;
  private slices: SliceGeom[] = [];
  private centers: { series: PieSeries; cx: number; cy: number; inner: number; outer: number; total: number }[] = [];

  constructor(device: GpuDevice) {
    this.mark = new ArcMark(device);
  }

  layout(all: ResolvedSeries[], ctx: LayoutContext): void {
    const series = (all as PieSeries[]).filter((s) => !s.hidden);
    const items: MarkItem<ArcAttrs>[] = [];
    const slices: SliceGeom[] = [];
    this.centers = [];
    const plot = ctx.plot;
    for (const s of series) {
      const o = s.options;
      const ref = Math.min(plot.width, plot.height) / 2;
      const cx = plot.x + resolveLength(o.cx, plot.width, plot.width / 2);
      const cy = plot.y + resolveLength(o.cy, plot.height, plot.height / 2);
      const hoverOffset = o.hoverOffset ?? 6;
      const outer = Math.max(1, resolveLength(o.outerRadius, ref, ref) - hoverOffset - 2);
      const inner = Math.max(0, Math.min(outer - 1, resolveLength(o.innerRadius, outer, 0)));
      const a0 = (o.startAngle ?? 0) * DEG;
      const a1 = (o.endAngle ?? 360) * DEG;
      const pts = [...s.points];
      if (o.sortingValues === 'desc') pts.sort((a, b) => (b.y ?? 0) - (a.y ?? 0));
      else if (o.sortingValues === 'asc') pts.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
      const visible = pts.map((p) => !(p.datum && (p.datum as { __hidden?: boolean }).__hidden));
      const total = pts.reduce((acc, p, i) => acc + (visible[i] ? Math.max(0, p.y ?? 0) : 0), 0);
      let angle = a0;
      const span = a1 - a0;
      const padPx = (o.paddingAngle ?? 0) * DEG * ((inner + outer) / 2) + (o.paddingAngle === undefined ? 1.5 : 0);
      this.mark.padding = padPx;
      this.mark.cornerRadius = o.cornerRadius ?? 0;
      this.mark.hoverGrow = hoverOffset;
      this.centers.push({ series: s, cx, cy, inner, outer, total });
      pts.forEach((p, i) => {
        const v = visible[i] ? Math.max(0, p.y ?? 0) : 0;
        const sweep = total > 0 ? (v / total) * span : 0;
        const color = withAlpha(p.color ?? s.color, o.opacity ?? 1);
        const arc: ArcAttrs = { cx, cy, innerRadius: inner, outerRadius: outer, startAngle: angle, endAngle: angle + sweep, color };
        items.push({
          key: `${s.id}|${p.key}`,
          seriesIndex: s.index,
          dataIndex: p.index,
          value: arc,
          enter: ctx.enterAnimation ? { ...arc, startAngle: a0, endAngle: a0 } : { ...arc, color: [color[0], color[1], color[2], 0] },
        });
        slices.push({ series: s, point: p, arc, percent: total > 0 ? v / total : 0, hidden: !visible[i] });
        angle += sweep;
      });
      if (total === 0) {
        // Empty ring placeholder.
        const c = resolveColor('gray-200', ctx.scheme);
        items.push({ key: `${s.id}|__empty`, seriesIndex: -1, dataIndex: -1, value: { cx, cy, innerRadius: inner, outerRadius: outer, startAngle: a0, endAngle: a1, color: c } });
      }
    }
    this.slices = slices;
    this.mark.update(items, { ...ctx.transition, duration: ctx.firstRender ? ctx.transition.duration * 1.25 : ctx.transition.duration }, ctx.now);
  }

  draw(pass: RenderPass, frame: FrameState): void {
    this.mark.draw(pass, frame);
  }

  toSvg(now: number): string {
    return this.mark.toSvg(now);
  }

  drawOverlay(g: CanvasRenderingContext2D, ctx: LayoutContext, now: number): void {
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const sl of this.slices) {
      const o = sl.series.options;
      if (!o.arcLabel || sl.hidden) continue;
      const cur = this.mark.currentState(`${sl.series.id}|${sl.point.key}`, now) ?? sl.arc;
      const sweep = cur.endAngle - cur.startAngle;
      if (sweep < (o.arcLabelMinAngle ?? 18) * DEG) continue;
      const mid = (cur.startAngle + cur.endAngle) / 2;
      const r = cur.innerRadius > 0 ? (cur.innerRadius + cur.outerRadius) / 2 : cur.outerRadius * 0.62;
      const x = cur.cx + Math.sin(mid) * r;
      const y = cur.cy - Math.cos(mid) * r;
      const datum = { ...(sl.point.datum as PieDatum), value: sl.point.y ?? 0, percent: sl.percent };
      const text =
        typeof o.arcLabel === 'function'
          ? o.arcLabel(datum)
          : o.arcLabel === 'value'
            ? String(sl.point.y ?? '')
            : o.arcLabel === 'formattedValue'
              ? formatSeriesValue(sl.series, sl.point.y, ctx.formatter, 'label', sl.point.index)
              : o.arcLabel === 'percent'
                ? ctx.formatter.number(sl.percent, '.0%')
                : (sl.point.label ?? '');
      g.font = `600 ${ctx.theme.fontSize}px ${ctx.theme.fontFamily}`;
      g.fillStyle = contrastText(sl.point.color ?? sl.series.color);
      g.globalAlpha = Math.min(1, Math.max(0, cur.color[3]));
      g.fillText(text, x, y);
    }
    g.globalAlpha = 1;
    for (const c of this.centers) {
      const o = c.series.options;
      if (!o.centerLabel || c.inner < 20) continue;
      const text = typeof o.centerLabel === 'function' ? o.centerLabel(c.total) : o.centerLabel;
      const size = Math.max(12, Math.min(40, c.inner * 0.42));
      g.font = `700 ${size}px ${ctx.theme.fontFamily}`;
      g.fillStyle = ctx.theme.textColor;
      g.fillText(text, c.cx, c.cy - (o.centerSubLabel ? size * 0.3 : 0));
      if (o.centerSubLabel) {
        g.font = `500 ${Math.max(11, size * 0.38)}px ${ctx.theme.fontFamily}`;
        g.fillStyle = ctx.theme.mutedTextColor;
        g.fillText(o.centerSubLabel, c.cx, c.cy + size * 0.55);
      }
    }
    g.restore();
  }

  hitTest(x: number, y: number, _ctx: LayoutContext, now: number): HitResult | null {
    for (const sl of this.slices) {
      if (sl.hidden || sl.series.options.excludeFromInteraction) continue;
      const a = this.mark.currentState(`${sl.series.id}|${sl.point.key}`, now) ?? sl.arc;
      const dx = x - a.cx;
      const dy = y - a.cy;
      const r = Math.hypot(dx, dy);
      if (r < a.innerRadius || r > a.outerRadius + (sl.series.options.hoverOffset ?? 6)) continue;
      let ang = Math.atan2(dx, -dy);
      const start = a.startAngle;
      while (ang < start) ang += Math.PI * 2;
      while (ang >= start + Math.PI * 2) ang -= Math.PI * 2;
      if (ang >= a.startAngle && ang < a.endAngle) {
        const mid = (a.startAngle + a.endAngle) / 2;
        return {
          series: sl.series,
          dataIndex: sl.point.index,
          anchor: { x: a.cx + Math.sin(mid) * a.outerRadius, y: a.cy - Math.cos(mid) * a.outerRadius },
          distance: 0,
        };
      }
    }
    return null;
  }

  itemsAtIndex(): TooltipItem[] {
    return [];
  }

  itemAnchor(seriesId: string, dataIndex: number, now: number) {
    const sl = this.slices.find((x) => x.series.id === seriesId && x.point.index === dataIndex);
    if (!sl) return null;
    const a = this.mark.currentState(`${sl.series.id}|${sl.point.key}`, now) ?? sl.arc;
    const mid = (a.startAngle + a.endAngle) / 2;
    return { x: a.cx + Math.sin(mid) * a.outerRadius, y: a.cy - Math.cos(mid) * a.outerRadius };
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

export const pieSeries: SeriesDefinition<PieSeriesOptions> = {
  type: 'pie',
  coordinates: 'polar',
  normalize(o, ctx) {
    const id = o.id ?? `pie-${ctx.nextIndex()}`;
    const rows = (o.data as Datum[] | undefined) ?? (ctx.data as Datum[] | undefined) ?? [];
    const metric = o.metric ?? 'value';
    const labelField = o.dimension ?? (o.groupBy as string | undefined) ?? 'label';
    // Aggregate rows sharing a label (sum), preserving first appearance order.
    const agg = new Map<string, SeriesPoint>();
    rows.forEach((row, i) => {
      const label = String(row[labelField] ?? row.label ?? row.id ?? i);
      const sliceId = row.id !== undefined && labelField === 'label' ? String(row.id) : label;
      const v = toNumber(row[metric]) ?? 0;
      const existing = agg.get(sliceId);
      if (existing) {
        existing.y = (existing.y ?? 0) + v;
        return;
      }
      const hidden = ctx.isHidden(sliceId);
      const css = typeof row.color === 'string' ? row.color : o.colorField && typeof row[o.colorField] === 'string' ? (row[o.colorField] as string) : ctx.nextColor();
      agg.set(sliceId, {
        key: sliceId,
        index: agg.size,
        x: label,
        y: v,
        label: String(row.label ?? label),
        datum: { ...row, __hidden: hidden, __id: sliceId },
        color: resolveColor(css, ctx.scheme),
      });
    });
    const points = [...agg.values()];
    const color = resolveColor(o.color ?? '#888', ctx.scheme);
    return [
      {
        id,
        type: 'pie',
        label: o.label ?? id,
        index: ctx.nextIndex(),
        color,
        colorCss: rgbaToCss(color),
        options: o,
        points,
        hidden: false,
        xAxisId: 'x',
        yAxisId: 'y',
        legendShape: 'circle',
      },
    ];
  },
  legendEntries(series) {
    const out: LegendEntry[] = [];
    for (const s of series) {
      for (const p of s.points) {
        out.push({
          id: String((p.datum as { __id?: string })?.__id ?? p.key),
          label: p.label ?? String(p.x),
          color: rgbaToCss(p.color ?? s.color),
          shape: 'circle',
          seriesIndex: s.index,
          dataIndex: p.index,
        });
      }
    }
    return out;
  },
  formatValue(s, p, f) {
    return formatSeriesValue(s, p.y, f, 'tooltip', p.index);
  },
  createRenderer: (device) => new PieRenderer(device),
};
