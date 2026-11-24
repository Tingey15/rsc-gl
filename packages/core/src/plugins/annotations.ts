import type { GpuDevice, RenderPass } from '@rsc-gl/gpu';
import type { Chart } from '../chart/chart';
import type { ChartPlugin } from '../chart/plugin';
import { trend, type XY } from '../data/regression';
import type { FrameState } from '../marks/instance-mark';
import { LineMark } from '../marks/path-mark';
import { isOrdinal, isTimeScale } from '../scales/scales';
import type { LayoutContext, ResolvedSeries } from '../series/types';
import { resolveColor, rgbaToCss, withAlpha } from '../theme/colors';
import { resolveLineType } from '../theme/theme';
import type { PointAnnotationOptions, ScatterLabelOptions, ScatterPathOptions, TrendlineOptions } from '../types';
import { contrastText } from '../theme/colors';
import { minOf, maxOf } from '../data/extent';

interface Callout {
  px: number;
  py: number;
  bx: number;
  by: number;
  text: string;
  color: string;
  textColor: string;
  anchor: NonNullable<PointAnnotationOptions['anchor']>;
  marker: boolean;
  /** Plain text in the theme color (no badge). */
  plain?: boolean;
}

export interface DirectLabelOptions {
  /** Which value to show next to the label ('series' / 'none' show the series name only). */
  value?: 'last' | 'average' | 'series' | 'none';
  /** Series ids to skip. */
  exclude?: string[];
  /** Only label series of these `ChartOptions.series` entries. */
  markIndices?: number[];
  /** At the end (default) or the start of each line. */
  position?: 'start' | 'end';
  /** Text before the value. */
  prefix?: string;
  /** Show the series name before the value. Default true. */
  showName?: boolean;
  fontSize?: number;
  format?: (value: number) => string;
}

export interface AnnotationsPluginOptions {
  /** Labels at the end of each line / area series, stacked to avoid overlaps. */
  directLabels?: boolean | DirectLabelOptions;
}

const toNum = (v: unknown, time: boolean) => (typeof v === 'number' ? v : time && typeof v === 'string' ? Date.parse(v) : Number(v));

/**
 * Trendlines (`trendlines` option: linear, polynomial, exponential,
 * logarithmic, power, average, median, moving averages) and direct labels.
 */
export function annotationsPlugin(options: AnnotationsPluginOptions = {}): ChartPlugin {
  let chart: Chart | null = null;
  let device: GpuDevice | null = null;
  let lines: LineMark[] = [];
  /** Trendlines drawn only while their series is highlighted (by line index). */
  let hoverOnly: (number | null)[] = [];
  let labels: { text: string; x: number; y: number; color: string; badge?: boolean; seriesIndex?: number | null }[] = [];
  let endLabels: { text: string; x: number; y: number; color: string; align: CanvasTextAlign; size?: number }[] = [];
  let pathLines: LineMark[] = [];
  let callouts: Callout[] = [];
  let pointLabels: { text: string; x: number; y: number; align: CanvasTextAlign; baseline: CanvasTextBaseline; color: string }[] = [];

  const sourceSeries = (t: TrendlineOptions): ResolvedSeries[] =>
    (chart?.resolvedSeries ?? []).filter(
      (s) => !s.hidden && s.type !== 'pie' && (t.markIndex === undefined || s.markIndex === t.markIndex) && (!t.seriesId || s.id === t.seriesId || s.id.startsWith(`${t.seriesId}:`)),
    );

  /** Point callouts: ring on the point, leader line, filled label badge. */
  function layoutCallouts(c: Chart, ctx: LayoutContext): void {
    callouts = [];
    for (const a of c.getOptions().pointAnnotations ?? []) {
      const inMark = (x: ResolvedSeries) => a.markIndex === undefined || x.markIndex === a.markIndex;
      const s = a.seriesId
        ? (c.resolvedSeries.find((x) => inMark(x) && x.id === a.seriesId) ?? c.resolvedSeries.find((x) => inMark(x) && (x.id.startsWith(`${a.seriesId}:`) || x.id.endsWith(`:${a.seriesId}`))))
        : a.markIndex !== undefined
          ? c.resolvedSeries.find(inMark)
          : undefined;
      if (s?.hidden) continue;
      const xa = ctx.xAxis(a.xAxisId ?? s?.xAxisId);
      const ya = ctx.yAxis(a.yAxisId ?? s?.yAxisId);
      if (!xa || !ya) continue;
      const time = isTimeScale(xa.scaleType);
      const xv = typeof a.x === 'string' && time ? Date.parse(a.x) : a.x;
      const key = (v: unknown) => String(v instanceof Date ? v.getTime() : time && typeof v === 'string' ? Date.parse(v) : v);
      let yv = a.y;
      if (yv === undefined && s) {
        const pt = s.points.find((p) => key(p.x) === key(xv));
        yv = pt ? (pt.y1 ?? (pt.y as number)) : undefined;
      }
      if (yv === undefined || yv === null) continue;
      const px = xa.scale.map(xv as never) + xa.scale.bandwidth() / 2;
      const py = ya.scale.map(yv);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      const anchor = a.anchor ?? 'top';
      const off = a.offset ?? 26;
      const bx = px + (anchor === 'left' ? -off : anchor === 'right' ? off : 0);
      const by = py + (anchor === 'top' ? -off : anchor === 'bottom' ? off : 0);
      const rgba = resolveColor(a.color ?? s?.colorCss ?? ctx.theme.textColor, ctx.scheme);
      callouts.push({ px, py, bx, by, text: a.label, color: rgbaToCss(rgba), textColor: contrastText(rgba), anchor, marker: a.marker !== false, plain: a.matchLineColor === false });
    }
  }

  function drawCallouts(g: CanvasRenderingContext2D, fontSize: number, fontFamily: string, ring: string): void {
    g.font = `600 ${fontSize - 1}px ${fontFamily}`;
    const W = chart?.size.width ?? Infinity;
    const H = chart?.size.height ?? Infinity;
    for (const k of callouts) {
      const w = g.measureText(k.text).width + 14;
      const h = fontSize + 8;
      // Flip to the other side when the badge would leave the chart, then clamp.
      const off = Math.hypot(k.bx - k.px, k.by - k.py);
      if (k.anchor === 'top' && k.by - h < 2) k.by = k.py + off;
      else if (k.anchor === 'bottom' && k.by + h > H - 2) k.by = k.py - off;
      else if (k.anchor === 'left' && k.bx - w < 2) k.bx = k.px + off;
      else if (k.anchor === 'right' && k.bx + w > W - 2) k.bx = k.px - off;
      const anchor = k.anchor === 'top' ? (k.by > k.py ? 'bottom' : 'top') : k.anchor === 'bottom' ? (k.by < k.py ? 'top' : 'bottom') : k.anchor === 'left' ? (k.bx > k.px ? 'right' : 'left') : k.bx < k.px ? 'left' : 'right';
      let x = anchor === 'left' ? k.bx - w : anchor === 'right' ? k.bx : k.bx - w / 2;
      let y = anchor === 'top' ? k.by - h : anchor === 'bottom' ? k.by : k.by - h / 2;
      x = Math.max(2, Math.min(W - w - 2, x));
      y = Math.max(2, Math.min(H - h - 2, y));
      g.strokeStyle = k.color;
      g.lineWidth = 1.25;
      g.beginPath();
      g.moveTo(k.px, k.py);
      g.lineTo(k.bx, k.by);
      g.stroke();
      if (k.marker) {
        g.fillStyle = ring;
        g.beginPath();
        g.arc(k.px, k.py, 5, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 2;
        g.beginPath();
        g.arc(k.px, k.py, 5, 0, Math.PI * 2);
        g.stroke();
      }
      if (k.plain) {
        g.fillStyle = ring === '#ffffff' ? '#1d1d1f' : '#f2f2f5';
      } else {
        g.fillStyle = k.color;
        g.beginPath();
        g.roundRect(x, y, w, h, 5);
        g.fill();
        g.fillStyle = k.textColor;
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(k.text, x + w / 2, y + h / 2 + 0.5);
    }
  }

  const scatterSources = (c: Chart, id?: string, markIndex?: number) =>
    c.resolvedSeries.filter((s) => !s.hidden && s.type === 'scatter' && (markIndex === undefined || s.markIndex === markIndex) && (!id || s.id === id || s.id.startsWith(`${id}:`)));

  function layoutScatterPaths(c: Chart, ctx: LayoutContext, d: GpuDevice): void {
    const specs: ScatterPathOptions[] = c.getOptions().scatterPaths ?? [];
    const jobs: { spec: ScatterPathOptions; s: ResolvedSeries; pts: ResolvedSeries['points'] }[] = [];
    for (const spec of specs)
      for (const s of scatterSources(c, spec.seriesId, spec.markIndex)) {
        const groups = new Map<string, ResolvedSeries['points']>();
        const fields = spec.groupBy ? (Array.isArray(spec.groupBy) ? spec.groupBy : [spec.groupBy]) : [];
        for (const p of s.points) {
          if (p.y === null) continue;
          const k = fields.map((f) => String((p.datum as Record<string, unknown> | undefined)?.[f] ?? '')).join(' | ');
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(p);
        }
        for (const pts of groups.values()) if (pts.length > 1) jobs.push({ spec, s, pts: spec.order === 'x' ? [...pts].sort((a, b) => Number(a.x) - Number(b.x)) : pts });
      }
    while (pathLines.length > jobs.length) pathLines.pop()!.destroy();
    while (pathLines.length < jobs.length) pathLines.push(new LineMark(d));
    jobs.forEach(({ spec, s, pts }, i) => {
      const xa = ctx.xAxis(s.xAxisId);
      const ya = ctx.yAxis(s.yAxisId);
      if (!xa || !ya) return;
      const screen = pts.map((p) => ({ key: `p${p.index}`, x: xa.scale.map(p.x as never), y: ya.scale.map(p.y as number) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      const color = resolveColor(spec.color ?? s.colorCss, ctx.scheme);
      pathLines[i].style = { color: withAlpha(color, spec.opacity ?? 0.55), width: spec.width ?? 1.5, dash: resolveLineType(spec.lineType ?? 'solid'), alternateDash: [], opacity: 1 };
      pathLines[i].clip = { x0: ctx.plot.x, x1: ctx.plot.x + ctx.plot.width, y0: ctx.plot.y, y1: ctx.plot.y + ctx.plot.height };
      pathLines[i].update(screen, ctx.transition, ctx.now, (p) => ({ x: p.x, y: p.y, y0: 0 }));
    });
  }

  function layoutScatterLabels(c: Chart, ctx: LayoutContext): void {
    pointLabels = [];
    const specs: ScatterLabelOptions[] = c.getOptions().scatterLabels ?? [];
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const fs = ctx.theme.fontSize - 1;
    const width = (t: string) => t.length * fs * 0.56;
    for (const spec of specs)
      for (const s of scatterSources(c, spec.seriesId, spec.markIndex)) {
        const xa = ctx.xAxis(s.xAxisId);
        const ya = ctx.yAxis(s.yAxisId);
        if (!xa || !ya) continue;
        const only = spec.indices ? new Set(spec.indices) : null;
        const positions = Array.isArray(spec.position) ? spec.position : [spec.position ?? 'right'];
        for (const p of s.points) {
          if (p.y === null || (only && !only.has(p.index))) continue;
          const raw = spec.field ? (p.datum as Record<string, unknown> | undefined)?.[spec.field] : p.y;
          if (raw === undefined || raw === null || raw === '') continue;
          const text = spec.format ? spec.format(raw) : !spec.field && typeof raw === 'number' ? c.chartFormatter.number(raw, 'shortNumber') : String(raw);
          const x = xa.scale.map(p.x as never);
          const y = ya.scale.map(p.y as number);
          if (x < ctx.plot.x || x > ctx.plot.x + ctx.plot.width || y < ctx.plot.y || y > ctx.plot.y + ctx.plot.height) continue;
          const w = width(text);
          // Try each side in order; skip the label when none is free.
          let pos: (typeof positions)[number] | null = null;
          let lx = x;
          let ly = y;
          for (const cand of positions) {
            const cx = cand === 'right' ? x + 8 : cand === 'left' ? x - 8 : x;
            const cy = cand === 'top' ? y - 8 : cand === 'bottom' ? y + 8 : y;
            const box = {
              x0: cand === 'right' ? cx : cand === 'left' ? cx - w : cx - w / 2,
              x1: cand === 'right' ? cx + w : cand === 'left' ? cx : cx + w / 2,
              y0: cand === 'top' ? cy - fs : cand === 'bottom' ? cy : cy - fs / 2,
              y1: cand === 'top' ? cy : cand === 'bottom' ? cy + fs : cy + fs / 2,
            };
            if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
            placed.push(box);
            pos = cand;
            lx = cx;
            ly = cy;
            break;
          }
          if (!pos) continue;
          pointLabels.push({ text, x: lx, y: ly, align: pos === 'right' ? 'left' : pos === 'left' ? 'right' : 'center', baseline: pos === 'top' ? 'bottom' : pos === 'bottom' ? 'top' : 'middle', color: ctx.theme.textColor });
        }
      }
  }

  return {
    name: 'annotations',
    attach(c) {
      chart = c;
    },
    layout(c, ctx: LayoutContext) {
      const d = c.gpuDevice;
      if (!d) return;
      if (d !== device) {
        device = d;
        lines.forEach((l) => l.setDevice(d));
        pathLines.forEach((l) => l.setDevice(d));
      }
      layoutCallouts(c, ctx);
      layoutScatterPaths(c, ctx, d);
      layoutScatterLabels(c, ctx);
      const specs = c.getOptions().trendlines ?? [];
      const jobs: { t: TrendlineOptions; s: ResolvedSeries }[] = [];
      for (const t of specs) for (const s of sourceSeries(t)) jobs.push({ t, s });
      while (lines.length > jobs.length) lines.pop()!.destroy();
      while (lines.length < jobs.length) lines.push(new LineMark(d));
      labels = [];
      hoverOnly = jobs.map(({ t, s }) => (t.displayOnHover ? s.index : null));
      jobs.forEach(({ t, s }, i) => {
        const xa = ctx.xAxis(s.xAxisId);
        const ya = ctx.yAxis(s.yAxisId);
        if (!xa || !ya) return;
        const ordinal = isOrdinal(xa.scaleType);
        const time = isTimeScale(xa.scaleType);
        const cats = ordinal ? xa.scale.domain().map(String) : [];
        const xOf = (v: unknown) => (ordinal ? cats.indexOf(String(v)) : toNum(v, time));
        const skip = t.excludeDataKeys?.length ? (d: Record<string, unknown> | undefined) => !!d && t.excludeDataKeys!.some((k) => !!d[k]) : null;
        const pts: XY[] = s.points
          .filter((p) => p.y !== null && !(skip && skip(p.datum as Record<string, unknown> | undefined)))
          .map((p) => ({ x: xOf(p.x), y: p.y1 ?? (p.y as number) }));
        const fit = trend(pts, t.method ?? 'linear', { partialWindows: t.hidePartialWindows === false });
        const px = (x: number) => (ordinal ? xa.scale.map(cats[Math.round(x)] ?? cats[0]) + xa.scale.bandwidth() / 2 : xa.scale.map(x));
        let path: XY[] = [];
        if (fit.points) path = fit.points;
        else if (fit.at && pts.length) {
          const dom = xa.scale.domain();
          const lo = t.extend && !ordinal ? Number(dom[0]) : minOf(pts.map((p) => p.x));
          const hi = t.extend && !ordinal ? Number(dom[dom.length - 1]) : maxOf(pts.map((p) => p.x));
          const n = (t.method ?? 'linear') === 'linear' ? 2 : 64;
          path = Array.from({ length: n }, (_, k) => {
            const x = lo + ((hi - lo) * k) / (n - 1);
            return { x, y: fit.at!(x) };
          });
        }
        const screen = path.map((p, k) => ({ key: `t${k}`, x: ordinal ? px(p.x) : px(p.x), y: ya.scale.map(p.y) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        const color = resolveColor(t.color ?? s.colorCss, ctx.scheme);
        lines[i].style = { color: withAlpha(color, t.opacity ?? 0.9), width: t.lineWidth ?? 1.5, dash: resolveLineType(t.lineType ?? 'dashed'), alternateDash: [], opacity: 1 };
        lines[i].clip = { x0: ctx.plot.x, x1: ctx.plot.x + ctx.plot.width, y0: ctx.plot.y, y1: ctx.plot.y + ctx.plot.height };
        lines[i].update(screen, ctx.transition, ctx.now, (p) => ({ x: p.x, y: screen[0]?.y ?? p.y, y0: 0 }));
        if (t.label && screen.length) {
          const last = path[path.length - 1];
          const text = typeof t.label === 'function' ? t.label(last.y) : t.label;
          const end = screen[screen.length - 1];
          labels.push({ text, x: end.x - 4, y: end.y - 8, color: rgbaToCss(color), badge: t.labelBadge, seriesIndex: t.displayOnHover ? s.index : null });
        }
      });

      // Direct labels at series ends.
      endLabels = [];
      const dl = c.getOptions().directLabels ?? options.directLabels;
      if (dl) {
        const o: DirectLabelOptions = typeof dl === 'object' ? dl : {};
        const f = c.chartFormatter;
        const atStart = o.position === 'start';
        const raw: { text: string; x: number; y: number; color: string; align: CanvasTextAlign; size?: number }[] = [];
        for (const s of c.resolvedSeries) {
          if (s.hidden || (s.type !== 'line' && s.type !== 'area') || o.exclude?.includes(s.id)) continue;
          if (o.markIndices && (s.markIndex === undefined || !o.markIndices.includes(s.markIndex))) continue;
          const xa = ctx.xAxis(s.xAxisId);
          const ya = ctx.yAxis(s.yAxisId);
          const valid = s.points.filter((p) => p.y !== null);
          const at = atStart ? valid[0] : valid[valid.length - 1];
          if (!xa || !ya || !at) continue;
          const value = o.value === 'average' ? valid.reduce((a, p) => a + (p.y ?? 0), 0) / valid.length : (at.y as number);
          const nameOnly = o.value === 'none' || o.value === 'series';
          const num = `${o.prefix ?? ''}${o.format ? o.format(value) : f.number(value, 'shortNumber')}`;
          const text = nameOnly ? s.label : o.showName === false ? num : `${s.label} ${num}`;
          const x = xa.scale.map(at.x) + xa.scale.bandwidth() / 2;
          raw.push({ text, x: atStart ? x - 6 : x + 6, y: ya.scale.map(at.y1 ?? (at.y as number)), color: s.colorCss, align: atStart ? 'right' : 'left', size: o.fontSize });
        }
        // Stack labels so they never overlap (keep order by y).
        raw.sort((a, b) => a.y - b.y);
        const gap = 15;
        for (let i = 1; i < raw.length; i++) if (raw[i].y - raw[i - 1].y < gap) raw[i].y = raw[i - 1].y + gap;
        const overflow = raw.length ? raw[raw.length - 1].y - (ctx.plot.y + ctx.plot.height) : 0;
        if (overflow > 0) raw.forEach((r) => (r.y -= overflow));
        endLabels = raw;
      }
    },
    drawPlot(pass: RenderPass, frame: FrameState) {
      for (const l of pathLines) l.draw(pass, frame);
      const hl = chart?.highlightedSeriesIndex ?? null;
      lines.forEach((l, i) => {
        const only = hoverOnly[i];
        if (only === null || only === undefined || only === hl) l.draw(pass, frame);
      });
    },
    drawOverlay(g) {
      if (!chart) return;
      const theme = chart.chartTheme;
      g.save();
      g.font = `600 ${theme.fontSize - 1}px ${theme.fontFamily}`;
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      const hl = chart.highlightedSeriesIndex;
      for (const l of labels) {
        if (l.seriesIndex !== null && l.seriesIndex !== undefined && l.seriesIndex !== hl) continue;
        if (l.badge) {
          const w = g.measureText(l.text).width + 10;
          const h = theme.fontSize + 6;
          g.fillStyle = l.color;
          g.beginPath();
          g.roundRect(l.x - w + 5, l.y - h + 3, w, h, 4);
          g.fill();
          g.fillStyle = contrastText(resolveColor(l.color));
          g.fillText(l.text, l.x, l.y);
          continue;
        }
        g.fillStyle = l.color;
        g.fillText(l.text, l.x, l.y);
      }
      g.textBaseline = 'middle';
      for (const l of endLabels) {
        g.textAlign = l.align;
        if (l.size) g.font = `600 ${l.size}px ${theme.fontFamily}`;
        g.fillStyle = l.color;
        g.fillText(l.text, l.x, l.y);
      }
      g.font = `600 ${theme.fontSize - 1}px ${theme.fontFamily}`;
      g.font = `${theme.fontSize - 1}px ${theme.fontFamily}`;
      for (const l of pointLabels) {
        g.fillStyle = l.color;
        g.textAlign = l.align;
        g.textBaseline = l.baseline;
        g.fillText(l.text, l.x, l.y);
      }
      drawCallouts(g, theme.fontSize, theme.fontFamily, theme.scheme === 'dark' ? '#1b1b1f' : '#ffffff');
      g.restore();
    },
    isAnimating(now) {
      return lines.some((l) => l.isAnimating(now)) || pathLines.some((l) => l.isAnimating(now));
    },
    toSvg(now, layer) {
      return layer === 'front' ? [...pathLines, ...lines].map((l) => l.toSvg(now)).join('') : '';
    },
    setDevice(d) {
      device = d;
      lines.forEach((l) => l.setDevice(d));
      pathLines.forEach((l) => l.setDevice(d));
    },
    destroy() {
      lines.forEach((l) => l.destroy());
      pathLines.forEach((l) => l.destroy());
      lines = [];
      pathLines = [];
    },
  };
}
