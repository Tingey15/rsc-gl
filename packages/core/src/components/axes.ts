import { inferGranularity, type Formatter, type TimeGranularity } from '../format/format';
import { createScale, isOrdinal, isTimeScale, type DomainValue, type ScaleType } from '../scales/scales';
import type { AxisRequirement, Rect, ResolvedAxis, ResolvedSeries, SeriesDefinition } from '../series/types';
import type { ChartTheme } from '../theme/theme';
import type { AxisOptions, Datum, Margin } from '../types';
import { ANNOTATION_LANE as LANE, drawAnnotations, drawGroups, drawThumb, groupRuns } from './axis-extras';

export interface AxisTick {
  value: DomainValue;
  /** Pixel position along the axis. */
  pos: number;
  label: string;
  /** Secondary (lower) label row for time axes; empty when unchanged. */
  sub: string;
  /** Label opacity (tick transitions). */
  alpha?: number;
}

export interface AxisLayout extends ResolvedAxis {
  ticks: AxisTick[];
  /** Thickness reserved for the axis (px). */
  size: number;
  /** Offset when several axes share a side. */
  offset: number;
  granularity?: TimeGranularity;
  /** Distances from the axis line to each band of the axis (px). */
  box?: AxisBox;
}

/** Where each part of an axis sits, measured outward from the axis line. */
export interface AxisBox {
  thumb: number;
  label: number;
  /** Thickness of the tick-label block. */
  labelBlock: number;
  group: number;
  /** Thickness of each group level. */
  groupSizes: number[];
  annotation: number;
}

export interface CartesianLayout {
  plot: Rect;
  xAxes: AxisLayout[];
  yAxes: AxisLayout[];
}

interface Measure {
  (text: string): number;
}

const DEFAULT_PAD = 8;

function mergeRequirements(reqs: AxisRequirement[]): AxisRequirement | null {
  if (reqs.length === 0) return null;
  const values: DomainValue[] = [];
  let preferred: ScaleType = reqs[0].preferredType;
  let includeZero = false;
  let requiresBand = false;
  for (const r of reqs) {
    for (const v of r.values) values.push(v);
    if (r.requiresBand) {
      requiresBand = true;
      preferred = 'band';
    } else if (!requiresBand && r.preferredType === 'point' && preferred !== 'band') preferred = 'point';
    includeZero ||= !!r.includeZero;
  }
  return { values, preferredType: preferred, includeZero, requiresBand };
}

/** Collects series requirements per axis id. */
export function collectRequirements(defs: Map<string, SeriesDefinition>, series: ResolvedSeries[]) {
  const byType = new Map<string, ResolvedSeries[]>();
  for (const s of series) {
    if (!byType.has(s.type)) byType.set(s.type, []);
    byType.get(s.type)!.push(s);
  }
  const x = new Map<string, AxisRequirement[]>();
  const y = new Map<string, AxisRequirement[]>();
  for (const [type, list] of byType) {
    const def = defs.get(type);
    if (!def?.requirements || def.coordinates !== 'cartesian') continue;
    const byAxes = new Map<string, ResolvedSeries[]>();
    for (const s of list) {
      const k = `${s.xAxisId}\u0000${s.yAxisId}`;
      if (!byAxes.has(k)) byAxes.set(k, []);
      byAxes.get(k)!.push(s);
    }
    for (const [k, group] of byAxes) {
      const [xid, yid] = k.split('\u0000');
      const req = def.requirements(group);
      if (!x.has(xid)) x.set(xid, []);
      if (!y.has(yid)) y.set(yid, []);
      x.get(xid)!.push(req.x);
      y.get(yid)!.push(req.y);
    }
  }
  return { x, y };
}

export function axisCategories(axis: AxisOptions | undefined, dataset: ReadonlyArray<Datum> | undefined): DomainValue[] | undefined {
  if (!axis) return undefined;
  if (axis.data) return [...axis.data].map((v) => (v instanceof Date ? v.getTime() : v));
  if (axis.dataKey && dataset) return dataset.map((d) => {
    const v = d[axis.dataKey!];
    return v instanceof Date ? v.getTime() : (v as DomainValue);
  });
  return undefined;
}

function makeFormat(axis: AxisOptions, scaleType: ScaleType, formatter: Formatter, granularity: () => TimeGranularity | undefined) {
  return (value: DomainValue, location: 'tick' | 'tooltip'): string => {
    if (axis.valueFormatter) return axis.valueFormatter(value, { location });
    if (isOrdinal(scaleType)) {
      if (typeof value === 'number' && axis.labelFormat === 'time') {
        const g = axis.granularity ?? 'day';
        const [a, b] = formatter.timeTick(value, g);
        return location === 'tooltip' && b ? `${a} ${b}` : a;
      }
      if (typeof value === 'number' && axis.numberFormat) return formatter.number(value, axis.numberFormat);
      return String(value);
    }
    const n = Number(value);
    if (isTimeScale(scaleType) || axis.labelFormat === 'time') {
      const g = axis.granularity ?? granularity() ?? 'day';
      if (location === 'tooltip') return new Date(n).toLocaleString(formatter.locale, { dateStyle: 'medium', ...(g === 'hour' || g === 'minute' || g === 'second' ? { timeStyle: 'short' } : {}) });
      return formatter.timeTick(n, g)[0];
    }
    if (axis.labelFormat === 'percentage') return formatter.number(n, '~%');
    if (axis.labelFormat === 'duration') return formatter.duration(n);
    if (axis.numberFormat) return formatter.number(n, axis.numberFormat);
    if (location === 'tick') return Math.abs(n) >= 10000 ? formatter.number(n, 'shortNumber') : formatter.number(n);
    return formatter.number(n);
  };
}

interface AxisSeed {
  id: string;
  direction: 'x' | 'y';
  options: AxisOptions;
  scaleType: ScaleType;
  domain: DomainValue[];
  position: 'top' | 'bottom' | 'left' | 'right' | 'none';
}

function seedAxes(
  direction: 'x' | 'y',
  options: AxisOptions[] | undefined,
  reqs: Map<string, AxisRequirement[]>,
  dataset: ReadonlyArray<Datum> | undefined,
): AxisSeed[] {
  const declared = options && options.length ? options : [{}];
  const ids = new Set<string>();
  const seeds: AxisSeed[] = [];
  declared.forEach((o, i) => {
    const id = o.id ?? (i === 0 ? direction : `${direction}${i}`);
    ids.add(id);
    seeds.push(buildSeed(direction, id, o, reqs.get(id) ?? (i === 0 ? reqs.get(direction) : undefined) ?? [], dataset, i));
  });
  // Axes referenced by series but not declared.
  for (const [id, r] of reqs) {
    if (!ids.has(id)) seeds.push(buildSeed(direction, id, {}, r, dataset, seeds.length));
  }
  return seeds;
}

function buildSeed(direction: 'x' | 'y', id: string, o: AxisOptions, reqs: AxisRequirement[], dataset: ReadonlyArray<Datum> | undefined, i: number): AxisSeed {
  const merged = mergeRequirements(reqs);
  const cats = axisCategories(o, dataset);
  let scaleType: ScaleType = o.scaleType ?? (merged?.requiresBand ? 'band' : merged?.preferredType ?? (cats ? 'band' : 'linear'));
  // Temporal strings / numbers on a time axis.
  let domain: DomainValue[];
  if (isOrdinal(scaleType)) {
    domain = cats ?? uniqueStr(merged?.values ?? []);
  } else {
    const vals = (merged?.values ?? cats ?? []).map((v) => (typeof v === 'string' ? (isTimeScale(scaleType) ? Date.parse(v) : Number(v)) : Number(v))).filter(Number.isFinite);
    if (merged?.includeZero) vals.push(0);
    if (vals.length === 0) vals.push(0, 1);
    domain = vals;
    if (scaleType === 'log') domain = vals.filter((v) => v > 0);
  }
  if (!o.scaleType && merged?.preferredType === 'time') scaleType = 'time';
  const defaultPos = direction === 'x' ? (i === 0 ? 'bottom' : 'top') : i === 0 ? 'left' : 'right';
  return { id, direction, options: o, scaleType, domain, position: o.position ?? defaultPos };
}

function uniqueStr(values: DomainValue[]): DomainValue[] {
  const seen = new Set<string>();
  const out: DomainValue[] = [];
  for (const v of values) {
    const k = String(v);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

function computeTicks(axis: AxisLayout, length: number, measure: Measure, theme: ChartTheme): void {
  const o = axis.options;
  const s = axis.scale;
  const ordinal = isOrdinal(axis.scaleType);
  let values: DomainValue[];
  if (o.tickValues) values = [...o.tickValues];
  else if (ordinal) values = s.domain();
  else {
    const spacing = axis.direction === 'x' ? 90 : 44;
    const count = o.tickNumber ?? Math.max(2, Math.floor(Math.abs(length) / spacing));
    values = s.ticks(count);
  }
  if (isTimeScale(axis.scaleType)) {
    const d = s.domain().map(Number);
    axis.granularity = o.granularity ?? inferGranularity(Math.abs(d[1] - d[0]), Math.max(1, values.length));
  } else if (ordinal && o.labelFormat === 'time') {
    axis.granularity = o.granularity ?? 'day';
  }
  const half = ordinal ? s.bandwidth() / 2 : 0;
  let prevSub = '';
  const ticks: AxisTick[] = values.map((v) => {
    let label = axis.format(v, 'tick');
    let sub = '';
    if (axis.granularity && axis.direction === 'x' && !o.valueFormatter) {
      const parts = timeTickParts(v, axis);
      if (parts) {
        label = parts[0];
        sub = parts[1] !== prevSub ? parts[1] : '';
        prevSub = parts[1];
      }
    }
    return { value: v, pos: s.map(v) + half, label, sub };
  });
  // Log axes: with many ticks, label only the powers of ten (the rest keep their grid lines).
  if (axis.scaleType === 'log' && ticks.length > 8)
    ticks.forEach((t) => {
      const l = Math.log10(Math.abs(Number(t.value)));
      if (Math.abs(l - Math.round(l)) > 1e-6) t.label = '';
    });
  // Thin ordinal labels when they would overlap.
  if (ordinal && axis.direction === 'x' && ticks.length > 1 && !o.tickLabelAngle) {
    const step = Math.abs(s.step()) || 1;
    const widest = Math.max(...ticks.map((t) => measure(t.label)));
    const every = Math.max(1, Math.ceil((widest + 8) / step));
    if (every > 1) {
      // Numeric categories (timestamps) thin by value, so labels stay put while a live window slides.
      const nums = ticks.map((t) => (typeof t.value === 'number' ? t.value : t.value instanceof Date ? t.value.getTime() : NaN));
      let gap = Infinity;
      for (let i = 1; i < nums.length; i++) if (nums[i] - nums[i - 1] > 0) gap = Math.min(gap, nums[i] - nums[i - 1]);
      if (nums.every(Number.isFinite) && Number.isFinite(gap)) ticks.forEach((t, i) => Math.round(nums[i] / gap) % every !== 0 && (t.label = ''));
      else ticks.forEach((t, i) => i % every !== 0 && (t.label = ''));
    }
  }
  if (ordinal && axis.direction === 'y' && ticks.length > 1) {
    const step = Math.abs(s.step()) || 1;
    const every = Math.max(1, Math.ceil((theme.fontSize + 4) / step));
    if (every > 1) ticks.forEach((t, i) => i % every !== 0 && (t.label = ''));
  }
  axis.ticks = ticks;
}

let timeFormatterRef: Formatter | null = null;
function timeTickParts(v: DomainValue, axis: AxisLayout): [string, string] | null {
  if (!timeFormatterRef || !axis.granularity) return null;
  return timeFormatterRef.timeTick(Number(v), axis.granularity);
}

function truncate(text: string, max: number, measure: Measure): string {
  if (measure(text) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(text.slice(0, mid) + '…') <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

export interface CartesianInput {
  defs: Map<string, SeriesDefinition>;
  series: ResolvedSeries[];
  xAxis?: AxisOptions[];
  yAxis?: AxisOptions[];
  dataset?: ReadonlyArray<Datum>;
  width: number;
  height: number;
  margin?: Partial<Margin>;
  formatter: Formatter;
  theme: ChartTheme;
  measure: Measure;
  /** Visible x domain overrides from zoom, by axis id. */
  zoom?: Map<string, [number, number]>;
}

/**
 * Two-pass layout: measure tick labels with provisional scales to size the
 * axes, then build final scales over the remaining drawing area.
 */
export function layoutCartesian(input: CartesianInput): CartesianLayout {
  const { formatter, theme, measure } = input;
  timeFormatterRef = formatter;
  const reqs = collectRequirements(input.defs, input.series);
  const xSeeds = seedAxes('x', input.xAxis, reqs.x, input.dataset);
  const ySeeds = seedAxes('y', input.yAxis, reqs.y, input.dataset);
  const m: Margin = { top: DEFAULT_PAD, right: DEFAULT_PAD + 4, bottom: DEFAULT_PAD, left: DEFAULT_PAD, ...input.margin };

  const build = (seed: AxisSeed, range: [number, number]): AxisLayout => {
    const o = seed.options;
    let zoomed = input.zoom?.get(seed.id);
    let domain = seed.domain;
    // Category axes zoom by an index range into their category list.
    if (zoomed && isOrdinal(seed.scaleType) && domain) {
      const i0 = Math.max(0, Math.round(Math.min(zoomed[0], zoomed[1])));
      const i1 = Math.min(domain.length - 1, Math.round(Math.max(zoomed[0], zoomed[1])));
      domain = domain.slice(i0, i1 + 1);
      zoomed = undefined;
    }
    const scale = createScale({
      type: seed.scaleType,
      domain,
      range,
      paddingInner: o.categoryGapRatio ?? (seed.scaleType === 'band' ? 0.2 : undefined),
      min: zoomed ? zoomed[0] : o.min,
      max: zoomed ? zoomed[1] : o.max,
      reverse: o.reverse,
      // Time axes default to the exact data extent so series span the full width.
      domainLimit: zoomed ? 'strict' : (o.domainLimit ?? (isTimeScale(seed.scaleType) ? 'strict' : 'nice')),
      tickNumber: o.tickNumber,
    });
    const layout: AxisLayout = {
      id: seed.id,
      direction: seed.direction,
      options: o,
      scaleType: seed.scaleType,
      scale,
      position: seed.position,
      format: () => '',
      ticks: [],
      size: 0,
      offset: 0,
    };
    layout.format = makeFormat(o, seed.scaleType, formatter, () => layout.granularity);
    return layout;
  };

  const fh = theme.fontSize * 1.25;
  const sizeOf = (a: AxisLayout): number => {
    if (a.position === 'none') return 0;
    const o = a.options;
    const tick = o.disableTicks ? 0 : (o.tickSize ?? 6);
    const labelExtra = o.label ? fh + 6 : 0;
    const ts = o.thumbnails ? (o.thumbnails.size ?? 24) : 0;
    const hideText = o.hideTickLabels || o.thumbnails?.hideLabel;
    const groups = isOrdinal(a.scaleType) ? (o.groups ?? []) : [];
    const box: AxisBox = { thumb: tick + 4, label: 0, labelBlock: 0, group: 0, groupSizes: [], annotation: 0 };
    let c = tick + (o.hideTickLabels && !ts ? 2 : 4);
    if (ts) c += ts + 4;
    box.label = c;
    if (a.direction === 'x') {
      if (!hideText) {
        const twoRows = a.ticks.some((t) => t.sub);
        let h = fh;
        if (o.tickLabelAngle) {
          const ang = (Math.abs(o.tickLabelAngle) * Math.PI) / 180;
          const w = Math.max(0, ...a.ticks.map((t) => Math.min(o.labelLimit ?? 140, measure(t.label))));
          h = w * Math.sin(ang) + fh * Math.cos(ang);
        }
        box.labelBlock = h + (twoRows ? fh : 0);
      }
      c += box.labelBlock;
      box.group = c;
      for (let i = 0; i < groups.length; i++) box.groupSizes.push(fh + 10);
    } else {
      if (!hideText) box.labelBlock = Math.max(0, ...a.ticks.map((t) => Math.min(o.labelLimit ?? 160, measure(t.label)))) + 2;
      c += box.labelBlock;
      box.group = c;
      for (const level of groups) {
        const names = groupRuns(a, level).map((r) => r.label);
        box.groupSizes.push(Math.max(0, ...names.map((n) => measure(n))) + 14);
      }
    }
    c += box.groupSizes.reduce((x, y) => x + y, 0);
    box.annotation = c;
    if (o.annotations?.length) c += LANE + 6;
    a.box = box;
    return c + labelExtra;
  };

  // Pass 1 with provisional ranges.
  const provW = input.width - m.left - m.right - 60;
  const provH = input.height - m.top - m.bottom - 30;
  let xAxes = xSeeds.map((s) => build(s, [0, Math.max(10, provW)]));
  let yAxes = ySeeds.map((s) => build(s, isOrdinal(s.scaleType) ? [0, Math.max(10, provH)] : [Math.max(10, provH), 0]));
  xAxes.forEach((a) => computeTicks(a, provW, measure, theme));
  yAxes.forEach((a) => computeTicks(a, provH, measure, theme));

  const side = { top: 0, bottom: 0, left: 0, right: 0 };
  const offsets = (axes: AxisLayout[]) => {
    for (const a of axes) {
      if (a.position === 'none') continue;
      a.size = sizeOf(a);
      a.offset = side[a.position];
      side[a.position] += a.size + (side[a.position] > 0 ? 6 : 0);
    }
  };
  offsets(xAxes);
  offsets(yAxes);
  // Room for the last x tick label overhanging the plot.
  const lastX = xAxes[0]?.ticks[xAxes[0].ticks.length - 1];
  const overhang = lastX && !isOrdinal(xAxes[0].scaleType) ? measure(lastX.label) / 2 : 0;
  const plot: Rect = {
    x: m.left + side.left,
    y: m.top + side.top + (yAxes.length && side.top === 0 ? fh / 2 : 0),
    width: 0,
    height: 0,
  };
  plot.width = Math.max(10, input.width - plot.x - m.right - Math.max(side.right, overhang));
  plot.height = Math.max(10, input.height - plot.y - m.bottom - side.bottom);

  // Pass 2: final scales.
  const sizes = new Map([...xAxes, ...yAxes].map((a) => [a.id + a.direction, { size: a.size, offset: a.offset, box: a.box }]));
  xAxes = xSeeds.map((s) => build(s, [plot.x, plot.x + plot.width]));
  // Ordinal y axes list the first category at the top.
  yAxes = ySeeds.map((s) => build(s, isOrdinal(s.scaleType) ? [plot.y, plot.y + plot.height] : [plot.y + plot.height, plot.y]));
  for (const a of [...xAxes, ...yAxes]) {
    computeTicks(a, a.direction === 'x' ? plot.width : plot.height, measure, theme);
    const prev = sizes.get(a.id + a.direction)!;
    a.size = prev.size;
    a.offset = prev.offset;
    a.box = prev.box;
    // Ordinal labels never overflow their reserved width: truncate with an ellipsis.
    if (isOrdinal(a.scaleType)) {
      const limit = a.options.labelLimit ?? (a.direction === 'y' ? 160 : a.options.tickLabelAngle ? 140 : Infinity);
      if (Number.isFinite(limit)) a.ticks.forEach((t) => (t.label = truncate(t.label, limit, measure)));
    }
  }
  return { plot, xAxes, yAxes };
}

/** Draws axis lines, ticks, labels and titles on the 2D overlay. */
export function drawAxes(g: CanvasRenderingContext2D, layout: CartesianLayout, theme: ChartTheme): void {
  const { plot } = layout;
  const fh = theme.fontSize * 1.25;
  g.save();
  g.font = `${theme.fontSize}px ${theme.fontFamily}`;
  g.lineWidth = 1;
  for (const a of [...layout.xAxes, ...layout.yAxes]) {
    if (a.position === 'none') continue;
    const o = a.options;
    const tick = o.disableTicks ? 0 : (o.tickSize ?? 6);
    g.strokeStyle = theme.axisColor;
    g.fillStyle = theme.textColor;
    if (a.direction === 'x') {
      const bottom = a.position === 'bottom';
      const y0 = bottom ? plot.y + plot.height + a.offset : plot.y - a.offset;
      const dir = bottom ? 1 : -1;
      if (!o.disableLine) {
        g.beginPath();
        g.moveTo(plot.x, Math.round(y0) + 0.5);
        g.lineTo(plot.x + plot.width, Math.round(y0) + 0.5);
        g.stroke();
      }
      g.textAlign = 'center';
      g.textBaseline = bottom ? 'top' : 'bottom';
      const box = a.box;
      const ts = o.thumbnails ? (o.thumbnails.size ?? 24) : 0;
      a.ticks.forEach((t, ti) => {
        if (t.pos < plot.x - 1 || t.pos > plot.x + plot.width + 1) return;
        g.globalAlpha = t.alpha ?? 1;
        if (tick) {
          g.beginPath();
          g.moveTo(Math.round(t.pos) + 0.5, y0);
          g.lineTo(Math.round(t.pos) + 0.5, y0 + dir * tick);
          g.stroke();
        }
        if (ts && box) drawThumb(g, o.thumbnails!.url(t.value, ti), t.pos - ts / 2, bottom ? y0 + box.thumb : y0 - box.thumb - ts, ts, o.thumbnails!.radius ?? 4);
      });
      for (const t of a.ticks) {
        if (t.pos < plot.x - 1 || t.pos > plot.x + plot.width + 1) continue;
        g.globalAlpha = t.alpha ?? 1;
        if (o.hideTickLabels || o.thumbnails?.hideLabel || !t.label) continue;
        const ly = y0 + dir * (box?.label ?? tick + 4);
        if (o.tickLabelAngle) {
          g.save();
          g.translate(t.pos, ly);
          g.rotate((o.tickLabelAngle * Math.PI) / 180);
          g.textAlign = o.tickLabelAngle < 0 ? 'right' : 'left';
          g.textBaseline = 'middle';
          g.fillText(t.label, 0, 0);
          g.restore();
        } else {
          g.fillText(t.label, t.pos, ly);
          if (t.sub) {
            g.fillStyle = theme.mutedTextColor;
            g.fillText(t.sub, t.pos, ly + dir * fh);
            g.fillStyle = theme.textColor;
          }
        }
      }
      g.globalAlpha = 1;
      if (box) drawGroups(g, a, plot, theme, y0, dir);
      if (box && o.annotations?.length) drawAnnotations(g, a, plot, theme);
      if (o.label) {
        g.font = `600 ${theme.fontSize}px ${theme.fontFamily}`;
        g.textBaseline = bottom ? 'bottom' : 'top';
        g.fillText(o.label, plot.x + plot.width / 2, bottom ? y0 + a.size : y0 - a.size);
        g.font = `${theme.fontSize}px ${theme.fontFamily}`;
      }
    } else {
      const left = a.position === 'left';
      const x0 = left ? plot.x - a.offset : plot.x + plot.width + a.offset;
      const dir = left ? -1 : 1;
      if (!o.disableLine) {
        g.beginPath();
        g.moveTo(Math.round(x0) + 0.5, plot.y);
        g.lineTo(Math.round(x0) + 0.5, plot.y + plot.height);
        g.stroke();
      }
      g.textAlign = left ? 'right' : 'left';
      g.textBaseline = 'middle';
      const box = a.box;
      const ts = o.thumbnails ? (o.thumbnails.size ?? 24) : 0;
      a.ticks.forEach((t, ti) => {
        if (t.pos < plot.y - 1 || t.pos > plot.y + plot.height + 1) return;
        g.globalAlpha = t.alpha ?? 1;
        if (tick) {
          g.beginPath();
          g.moveTo(x0, Math.round(t.pos) + 0.5);
          g.lineTo(x0 + dir * tick, Math.round(t.pos) + 0.5);
          g.stroke();
        }
        if (ts && box) drawThumb(g, o.thumbnails!.url(t.value, ti), left ? x0 - box.thumb - ts : x0 + box.thumb, t.pos - ts / 2, ts, o.thumbnails!.radius ?? 4);
        if (!o.hideTickLabels && !o.thumbnails?.hideLabel && t.label) g.fillText(t.label, x0 + dir * (box?.label ?? tick + 4), t.pos);
      });
      g.globalAlpha = 1;
      if (box) drawGroups(g, a, plot, theme, x0, dir);
      if (box && o.annotations?.length) drawAnnotations(g, a, plot, theme);
      if (o.label) {
        g.save();
        g.font = `600 ${theme.fontSize}px ${theme.fontFamily}`;
        g.translate(left ? x0 - a.size + fh / 2 : x0 + a.size - fh / 2, plot.y + plot.height / 2);
        g.rotate(left ? -Math.PI / 2 : Math.PI / 2);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(o.label, 0, 0);
        g.restore();
      }
    }
  }
  g.restore();
}
