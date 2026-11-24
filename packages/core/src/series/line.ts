import type { GpuDevice, RenderPass } from '@rsc-gl/gpu';
import { EASING_ID, ease } from '../animation/easing';
import type { FrameState, MarkItem } from '../marks/instance-mark';
import { AreaMark, LineMark, type PathPoint } from '../marks/path-mark';
import { PointMark, symbolShapeId, type PointAttrs } from '../marks/point-mark';
import { isOrdinal, type DomainValue } from '../scales/scales';
import { resolveColor, withAlpha, type RGBA } from '../theme/colors';
import { resolveLineType, resolveLineWidth, resolveSymbolSize } from '../theme/theme';
import type { AreaSeriesOptions, LineSeriesOptions, TooltipItem } from '../types';
import { resolveCurve, sampleCurve, yAt } from './curve';
import { sampleIndices } from '../data/sampling';
import { formatSeriesValue } from './format-value';
import { normalizeGroups, stackSeries, toNumber, toResolvedSeries, uniqueValues } from './normalize';
import type { HitResult, LayoutContext, ResolvedSeries, SeriesDefinition, SeriesRenderer } from './types';
import { minOf, maxOf } from '../data/extent';

type PathSeries = ResolvedSeries<LineSeriesOptions | AreaSeriesOptions>;
/** Union of line + area options for code paths shared by both. */
type AnyPathOptions = Omit<LineSeriesOptions, 'type'> & Omit<AreaSeriesOptions, 'type'> & { type: string };

interface PxPoint {
  x: number;
  y: number;
  y0: number;
  index: number;
  defined: boolean;
  value: number | null;
}

interface SeriesGeom {
  series: PathSeries;
  line: LineMark | null;
  area: AreaMark | null;
  /** Source points in px, sorted by x (for hit testing). */
  px: PxPoint[];
  /** Hidden via the legend: collapsing onto the baseline, then no longer drawn. */
  exiting: boolean;
  ranges: { band: AreaMark; lo: LineMark; hi: LineMark; hover: boolean }[];
}

class PathRenderer implements SeriesRenderer {
  private geoms = new Map<string, SeriesGeom>();
  private order: SeriesGeom[] = [];
  private marks: PointMark;
  private hover: PointMark;
  private revealStart = -1;
  private revealDuration = 0;
  private plot = { x: 0, y: 0, width: 0, height: 0 };

  constructor(private device: GpuDevice) {
    this.marks = new PointMark(device);
    this.hover = new PointMark(device);
    this.hover.strokeWidth = 2;
    this.hover.hoverGrow = 0;
  }

  layout(all: ResolvedSeries[], ctx: LayoutContext): void {
    const series = all as PathSeries[];
    const seen = new Set<string>();
    const markItems: MarkItem<PointAttrs>[] = [];
    this.plot = ctx.plot;
    if (ctx.firstRender && ctx.enterAnimation && ctx.transition.duration > 0) {
      this.revealStart = ctx.now;
      this.revealDuration = ctx.transition.duration * 1.2;
    }
    this.order = [];

    for (const s of series) {
      const xa = ctx.xAxis(s.xAxisId);
      const ya = ctx.yAxis(s.yAxisId);
      if (!xa || !ya) continue;
      // Hidden series that were never drawn have nothing to animate out.
      if (s.hidden && !this.geoms.has(s.id)) continue;
      seen.add(s.id);
      let geom = this.geoms.get(s.id);
      if (!geom) {
        geom = { series: s, line: null, area: null, px: [], exiting: false, ranges: [] };
        this.geoms.set(s.id, geom);
      }
      geom.series = s;
      this.order.push(geom);
      const o = s.options as unknown as AnyPathOptions;
      const isArea = s.type === 'area' || !!(o as LineSeriesOptions).area || !!o.gradient;
      const showLine = s.type === 'line' || o.showLine !== false;
      const bandOffset = xa.scale.bandwidth() / 2;
      const yDomain = ya.scale.domain().map(Number);
      const baselineValue =
        o.baseline === 'min' ? minOf(yDomain) : o.baseline === 'max' ? maxOf(yDomain) : typeof o.baseline === 'number' ? o.baseline : Math.min(Math.max(0, minOf(yDomain)), maxOf(yDomain));

      // Screen positions go into typed arrays; point objects are only made for the
      // points that are drawn (after sampling), so million-point series stay cheap.
      const pts = s.points;
      const n = pts.length;
      const sx = new Float64Array(n);
      const sy = new Float64Array(n);
      const sy0 = new Float64Array(n);
      const def = new Uint8Array(n);
      const stackedBottom = !!(s.stack || o.metricStart);
      const baseY = ya.scale.map(baselineValue);
      let allDefined = true;
      let sorted = true;
      let prevX = -Infinity;
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const top = p.y1 ?? p.y;
        const x = xa.scale.map(p.x) + bandOffset;
        const ok = top !== null && top !== undefined && Number.isFinite(x);
        sx[i] = x;
        sy[i] = ok ? ya.scale.map(top as number) : Number.NaN;
        sy0[i] = stackedBottom ? ya.scale.map(p.y0 ?? baselineValue) : baseY;
        def[i] = ok ? 1 : 0;
        if (!ok) allDefined = false;
        if (Number.isFinite(x)) {
          if (x < prevX) sorted = false;
          prevX = x;
        }
      }
      // Visit order: by x for continuous axes (skipped when the data is already ordered).
      let order: ArrayLike<number> | null = null;
      if (!isOrdinal(xa.scaleType) && !sorted) {
        const idx = new Uint32Array(n);
        for (let i = 0; i < n; i++) idx[i] = i;
        order = idx.sort((i, j) => sx[i] - sx[j]);
      }
      if ((o as LineSeriesOptions).connectNulls && !allDefined) {
        const kept: number[] = [];
        for (let k = 0; k < n; k++) {
          const i = order ? order[k] : k;
          if (def[i]) kept.push(i);
        }
        order = kept;
        allDefined = true;
      }
      const count = order ? order.length : n;
      const at = (k: number) => (order ? order[k] : k);
      // Downsample dense series to what the plot can show (keeps peaks with min-max).
      let chosen: ArrayLike<number> | null = null;
      const sampling = o.sampling ?? 'auto';
      if (sampling !== 'none' && count > 64 && allDefined) {
        let xs: ArrayLike<number> = sx;
        let ys: ArrayLike<number> = sy;
        if (order) {
          const ox = new Float64Array(count);
          const oy = new Float64Array(count);
          for (let k = 0; k < count; k++) {
            ox[k] = sx[order[k]];
            oy[k] = sy[order[k]];
          }
          xs = ox;
          ys = oy;
        }
        chosen = sampleIndices(xs, ys, sampling, ctx.plot.width);
      }
      const make = (i: number): PxPoint => ({ x: sx[i], y: sy[i], y0: sy0[i], index: pts[i].index, defined: def[i] === 1, value: pts[i].y });
      let px: PxPoint[];
      if (chosen) {
        px = new Array(chosen.length);
        for (let k = 0; k < chosen.length; k++) px[k] = make(at(chosen[k]));
      } else {
        px = new Array(count);
        for (let k = 0; k < count; k++) px[k] = make(at(k));
      }
      geom.exiting = s.hidden;
      if (s.hidden) {
        // Collapse onto the baseline; showing it again grows it back from there.
        const base = ya.scale.map(baselineValue);
        for (const p of px) {
          p.y = base;
          p.y0 = base;
        }
      }
      geom.px = s.hidden ? [] : px;

      // Build sampled path points per defined run.
      const curve = resolveCurve(o.curve);
      const linePts: PathPoint[] = [];
      const areaPts: PathPoint[] = [];
      const alternateField = (o as LineSeriesOptions).alternateField;
      const byIndex = new Map(s.points.map((p) => [p.index, p]));
      let run: PxPoint[] = [];
      const flush = () => {
        if (run.length === 0) return;
        const top = sampleCurve(run, curve);
        const bottomSrc = run.map((p) => ({ x: p.x, y: p.y0 }));
        const bottom = s.stack ? sampleCurve(bottomSrc, curve) : bottomSrc;
        for (const t of top) {
          const src = run[t.src];
          const sp = byIndex.get(src.index);
          const key = `${sp?.key ?? src.index}~${t.sub}`;
          const alt = alternateField ? !!sp?.datum?.[alternateField] : false;
          linePts.push({ key, x: t.x, y: t.y, alternate: alt });
          areaPts.push({ key, x: t.x, y: t.y, y0: s.stack || o.metricStart ? yAt(bottom, t.x) : run[0].y0 });
        }
        run = [];
      };
      for (const p of px) {
        if (!p.defined) {
          flush();
          // Gap marker.
          linePts.push({ key: `gap-${p.index}`, x: p.x, y: 0, defined: false });
          areaPts.push({ key: `gap-${p.index}`, x: p.x, y: 0, y0: 0, defined: false });
          continue;
        }
        run.push(p);
      }
      flush();

      const enter = ctx.firstRender ? undefined : (p: PathPoint) => ({ x: p.x, y: p.y0 ?? ctx.plot.y + ctx.plot.height, y0: p.y0 ?? ctx.plot.y + ctx.plot.height });
      const color = withAlpha(s.color, o.opacity ?? 1);
      if (showLine) {
        geom.line ??= new LineMark(this.device);
        geom.line.style = {
          color,
          width: resolveLineWidth(o.lineWidth, 2),
          dash: s.dash ?? resolveLineType((o as LineSeriesOptions).lineType),
          alternateDash: resolveLineType((o as LineSeriesOptions).alternateLineType ?? 'dotted'),
          opacity: 1,
        };
        geom.line.update(linePts, ctx.transition, ctx.now, enter);
      } else if (geom.line) {
        geom.line.destroy();
        geom.line = null;
      }
      if (isArea) {
        geom.area ??= new AreaMark(this.device);
        const gradient = !!o.gradient;
        geom.area.style = {
          color: withAlpha(s.color, s.type === 'area' ? (o.opacity ?? 0.8) : gradient ? 0.45 : 0.3),
          color2: gradient ? withAlpha(s.color, 0) : undefined,
          gradientY: [ctx.plot.y, ctx.plot.y + ctx.plot.height],
          opacity: 1,
        };
        geom.area.update(areaPts, ctx.transition, ctx.now, enter);
      } else if (geom.area) {
        geom.area.destroy();
        geom.area = null;
      }

      // Metric ranges (bands between two fields).
      const mr = s.hidden ? [] : ((o as LineSeriesOptions).metricRanges ?? []);
      while (geom.ranges.length > mr.length) {
        const r = geom.ranges.pop()!;
        r.band.destroy();
        r.lo.destroy();
        r.hi.destroy();
      }
      while (geom.ranges.length < mr.length) geom.ranges.push({ band: new AreaMark(this.device), lo: new LineMark(this.device), hi: new LineMark(this.device), hover: false });
      mr.forEach((r, ri) => {
        const g = geom!.ranges[ri];
        g.hover = !!r.displayOnHover;
        const band: PathPoint[] = [];
        const los: PathPoint[] = [];
        const his: PathPoint[] = [];
        for (const p of px) {
          const d = byIndex.get(p.index)?.datum;
          const a = toNumber(d?.[r.metricStart]);
          const b = toNumber(d?.[r.metricEnd]);
          const ok = p.defined && a !== null && b !== null;
          const key = `mr${ri}|${p.index}`;
          const ya0 = ok ? ya.scale.map(a!) : 0;
          const yb = ok ? ya.scale.map(b!) : 0;
          band.push({ key, x: p.x, y: yb, y0: ya0, defined: ok });
          los.push({ key, x: p.x, y: ya0, defined: ok });
          his.push({ key, x: p.x, y: yb, defined: ok });
        }
        const rc = r.color ? resolveColor(r.color, ctx.scheme) : s.color;
        g.band.style = { color: withAlpha(rc, r.rangeOpacity ?? 0.2), opacity: 1 };
        const ls = { color: withAlpha(rc, 0.9 * (r.lineOpacity ?? 1)), width: r.lineWidth ?? 1, dash: resolveLineType(r.lineType ?? 'dashed'), alternateDash: [], opacity: 1 };
        g.lo.style = ls;
        g.hi.style = { ...ls };
        g.band.update(band, ctx.transition, ctx.now, enter);
        g.lo.update(los, ctx.transition, ctx.now, enter);
        g.hi.update(his, ctx.transition, ctx.now, enter);
      });

      // Point markers.
      const lo = o as LineSeriesOptions;
      if (lo.showMark && !s.hidden) {
        const size = resolveSymbolSize(lo.markSize, 8);
        const definedPts = px.filter((p) => p.defined);
        definedPts.forEach((p, i) => {
          const show =
            lo.showMark === true ||
            (lo.showMark === 'start' && i === 0) ||
            (lo.showMark === 'end' && i === definedPts.length - 1) ||
            (typeof lo.showMark === 'function' && lo.showMark({ index: p.index, value: p.value, datum: byIndex.get(p.index)?.datum }));
          if (!show) return;
          const fill: RGBA = lo.hollowMarks ? resolveColor(ctx.theme.scheme === 'dark' ? '#1b1b1f' : '#ffffff') : color;
          const value: PointAttrs = { x: p.x, y: p.y, size, color: fill, strokeColor: color, shape: symbolShapeId(lo.markShape) };
          markItems.push({ key: `${s.id}|${p.index}`, seriesIndex: s.index, dataIndex: p.index, value, enter: { ...value, size: 0 } });
        });
      }
    }
    for (const [id, g] of this.geoms) {
      if (!seen.has(id)) {
        g.line?.destroy();
        g.area?.destroy();
        g.ranges.forEach((r) => [r.band, r.lo, r.hi].forEach((m) => m.destroy()));
        this.geoms.delete(id);
      }
    }
    this.marks.strokeWidth = markItems.length ? 1.5 : 0;
    this.marks.update(markItems, ctx.transition, ctx.now);
  }

  private clipFor(now: number) {
    const p = this.plot;
    let x1 = p.x + p.width + 2;
    if (this.revealStart >= 0 && this.revealDuration > 0) {
      const t = ease(Math.min(1, (now - this.revealStart) / this.revealDuration), EASING_ID.cubicInOut);
      x1 = p.x - 2 + (p.width + 4) * t;
      if (t >= 1) this.revealStart = -1;
    }
    return { x0: p.x - 2, x1, y0: p.y - 20, y1: p.y + p.height + 20 };
  }

  draw(pass: RenderPass, frame: FrameState, ctx: LayoutContext): void {
    const clip = this.clipFor(frame.now);
    const [hs, hi, fadeA, active] = frame.highlight;
    for (const g of this.order) {
      const highlighted = active > 0.5 && Math.abs(g.series.index - hs) < 0.5;
      for (const r of g.ranges) {
        if (r.hover && !highlighted) continue;
        r.band.clip = clip;
        r.lo.clip = clip;
        r.hi.clip = clip;
        const f = active > 0.5 && !highlighted ? fadeA : 1;
        r.band.draw(pass, frame, f);
        r.lo.draw(pass, frame, f);
        r.hi.draw(pass, frame, f);
      }
    }
    for (const g of this.order) {
      const fade = this.exitFade(g, frame.now) * (active > 0.5 && Math.abs(g.series.index - hs) > 0.5 ? fadeA : 1);
      if (fade <= 0) continue;
      if (g.area) {
        g.area.clip = clip;
        g.area.draw(pass, frame, fade);
      }
    }
    for (const g of this.order) {
      const fade = this.exitFade(g, frame.now) * (active > 0.5 && Math.abs(g.series.index - hs) > 0.5 ? fadeA : 1);
      if (fade <= 0) continue;
      if (g.line) {
        g.line.clip = clip;
        g.line.draw(pass, frame, fade);
      }
    }
    this.marks.draw(pass, frame);
    // Hover dot on the highlighted point.
    if (active > 0.5 && hi >= 0) {
      const g = this.order.find((o) => o.series.index === hs);
      const p = g?.px.find((pt) => pt.index === hi && pt.defined);
      if (g && p) {
        const bg = ctx.theme.scheme === 'dark' ? '#1b1b1f' : '#ffffff';
        this.hover.update(
          [{ key: 'hover', seriesIndex: -10, dataIndex: -10, value: { x: p.x, y: p.y, size: 10, color: g.series.color, strokeColor: resolveColor(bg), shape: 0 } }],
          { duration: 0, easing: 'linear', stagger: 0 },
          frame.now,
        );
        this.hover.draw(pass, { ...frame, highlight: [0, 0, 1, 0] });
      }
    }
  }

  /** 1 for visible series; fades from 1 to 0 while a hidden series collapses. */
  private exitFade(g: SeriesGeom, now: number): number {
    if (!g.exiting) return 1;
    const mark = g.line ?? g.area;
    return mark ? 1 - mark.progress(now) : 0;
  }

  toSvg(now: number): string {
    const out: string[] = [];
    for (const g of this.order) {
      if (g.exiting) continue;
      for (const r of g.ranges) if (!r.hover) out.push(r.band.toSvg(now), r.lo.toSvg(now), r.hi.toSvg(now));
    }
    for (const g of this.order) if (!g.exiting && g.area) out.push(g.area.toSvg(now));
    for (const g of this.order) if (!g.exiting && g.line) out.push(g.line.toSvg(now));
    out.push(this.marks.toSvg(now));
    return out.join('');
  }

  hitTest(x: number, y: number, _ctx: LayoutContext, _now: number): HitResult | null {
    let best: HitResult | null = null;
    for (const g of this.order) {
      if (g.series.options.excludeFromInteraction) continue;
      const pts = g.px;
      if (pts.length === 0) continue;
      // Binary search by x then check neighbors.
      let lo = 0;
      let hi = pts.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].x <= x) lo = mid;
        else hi = mid;
      }
      for (const i of [lo - 1, lo, hi, hi + 1]) {
        const p = pts[i];
        if (!p || !p.defined) continue;
        const d = Math.hypot((p.x - x) * 1, (p.y - y) * 0.5);
        if (!best || d < best.distance) best = { series: g.series, dataIndex: p.index, anchor: { x: p.x, y: p.y }, distance: d };
      }
      // Inside an area fill counts as a direct hit on that series.
      if (g.area && best && best.series === g.series) best.distance *= 0.9;
    }
    return best;
  }

  itemsAtIndex(_index: number, axisValue: DomainValue, ctx: LayoutContext): TooltipItem[] {
    const out: TooltipItem[] = [];
    for (const g of this.order) {
      const s = g.series;
      if (s.options.excludeFromInteraction || s.hidden) continue;
      const p = s.points.find((pt) => String(pt.x) === String(axisValue));
      if (!p) continue;
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

  itemAnchor(seriesId: string, dataIndex: number) {
    const g = this.geoms.get(seriesId);
    const p = g?.px.find((pt) => pt.index === dataIndex && pt.defined);
    return p ? { x: p.x, y: p.y } : null;
  }

  isAnimating(now: number): boolean {
    if (this.revealStart >= 0) return true;
    if (this.marks.isAnimating(now)) return true;
    for (const g of this.order) if (g.line?.isAnimating(now) || g.area?.isAnimating(now)) return true;
    return false;
  }

  setDevice(device: GpuDevice): void {
    this.device = device;
    this.marks.setDevice(device);
    this.hover.setDevice(device);
    for (const g of this.geoms.values()) {
      g.line?.setDevice(device);
      g.area?.setDevice(device);
      g.ranges.forEach((r) => [r.band, r.lo, r.hi].forEach((m) => m.setDevice(device)));
    }
  }

  destroy(): void {
    this.marks.destroy();
    this.hover.destroy();
    for (const g of this.geoms.values()) {
      g.line?.destroy();
      g.area?.destroy();
    }
    this.geoms.clear();
  }
}

function pathRequirements(series: PathSeries[]) {
  const xs: DomainValue[] = [];
  const ys: number[] = [];
  let anyArea = false;
  let allNumeric = true;
  let anyString = false;
  for (const s of series) {
    const o = s.options as LineSeriesOptions;
    if (s.type === 'area' || o.area) anyArea = true;
    for (const p of s.points) {
      xs.push(p.x);
      if (typeof p.x === 'string') {
        anyString = true;
        allNumeric = false;
      }
      if (s.hidden) continue;
      if (p.y1 !== undefined) ys.push(p.y1);
      else if (p.y !== null) ys.push(p.y);
      if (p.y0 !== undefined && (s.stack || (s.options as AreaSeriesOptions).metricStart)) ys.push(p.y0);
      for (const r of (s.options as LineSeriesOptions).metricRanges ?? []) {
        if (r.scaleAxisToFit === false) continue;
        const a = toNumber(p.datum?.[r.metricStart]);
        const b = toNumber(p.datum?.[r.metricEnd]);
        if (a !== null) ys.push(a);
        if (b !== null) ys.push(b);
      }
    }
  }
  const isTime = series.some((s) => s.options.dimension === 'datetime');
  return {
    // Numeric x only needs an extent (category axes dedupe on their own), so skip the
    // per-value string dedupe that dominates million-point layouts.
    x: { values: allNumeric ? xs : uniqueValues(xs), preferredType: anyString ? ('point' as const) : isTime ? ('time' as const) : allNumeric ? ('linear' as const) : ('point' as const) },
    y: { values: ys, preferredType: 'linear' as const, includeZero: anyArea },
  };
}

function createPathDefinition<O extends LineSeriesOptions | AreaSeriesOptions>(type: 'line' | 'area'): SeriesDefinition<O> {
  return {
    type,
    coordinates: 'cartesian',
    normalize(o, ctx) {
      const groups = normalizeGroups(o, ctx, { dimension: 'datetime', metric: 'value' }, o.id ?? `${type}-${ctx.nextIndex()}`);
      const ao = o as AreaSeriesOptions;
      if (ao.metricStart && ao.metricEnd) {
        for (const g of groups) {
          for (const p of g.points) {
            const a = toNumber(p.datum?.[ao.metricStart]);
            const b = toNumber(p.datum?.[ao.metricEnd]);
            p.y0 = a ?? undefined;
            p.y1 = b ?? undefined;
            p.y = b;
          }
        }
      }
      const series = toResolvedSeries(o, groups, ctx, type === 'area' || (o as LineSeriesOptions).area ? 'area' : 'line');
      const lo = o as LineSeriesOptions;
      const typeValues: string[] = [];
      for (const s of series) {
        s.stack = ao.metricStart ? undefined : o.stack;
        if (type !== 'line') continue;
        if (lo.lineTypeField) {
          const v = String(s.points[0]?.datum?.[lo.lineTypeField] ?? '');
          let i = typeValues.indexOf(v);
          if (i < 0) i = typeValues.push(v) - 1;
          const scale = lo.lineTypes ?? ['solid', 'dashed', 'dotted', 'dotDash', 'longDash', 'twoDash'];
          s.dash = resolveLineType(scale[i % scale.length]);
        } else {
          s.dash = resolveLineType(lo.lineType);
        }
      }
      return series;
    },
    process(series) {
      const stacked = series.filter((s) => s.stack);
      if (stacked.length) stackSeries(stacked as ResolvedSeries[], 'none');
    },
    requirements: (series) => pathRequirements(series as PathSeries[]),
    createRenderer: (device) => new PathRenderer(device),
  };
}

export const lineSeries = createPathDefinition<LineSeriesOptions>('line');
export const areaSeries = createPathDefinition<AreaSeriesOptions>('area');
