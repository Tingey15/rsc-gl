import { inferGranularity, type Formatter, type NumberFormatOptions, type TimeGranularity } from '../format/format';
import { createScale, GRANULARITY_MS, isOrdinal, isTimeScale, timeTickInterval, type DomainValue, type ScaleType } from '../scales/scales';
import type { AxisRequirement, Rect, ResolvedAxis, ResolvedSeries, SeriesDefinition } from '../series/types';
import type { ChartTheme } from '../theme/theme';
import type { AxisOptions, Datum, Margin } from '../types';
import { ANNOTATION_LANE as LANE, drawAnnotations, drawGroups, drawThumb, groupRuns } from './axis-extras';
import { maxOf } from '../data/extent';

/** Alignment of a tick label within its band (or around its tick). */
export type AxisLabelAlign = 'start' | 'center' | 'end';
/** Font weight of a tick label. */
export type AxisLabelFontWeight = 'normal' | 'bold' | number;
/** One entry of `AxisOptions.labels`. */
export type AxisLabelEntry = NonNullable<AxisOptions['labels']>[number];
/** One entry of `AxisOptions.subLabels`. */
export type AxisSubLabelEntry = NonNullable<AxisOptions['subLabels']>[number];

export interface AxisTick {
  value: DomainValue;
  /** Pixel position along the axis. */
  pos: number;
  label: string;
  /** Secondary (lower) label row for time axes; empty when unchanged. */
  sub: string;
  /** Label opacity (tick transitions). */
  alpha?: number;
  /** Untruncated label text; set only when `label` was truncated. */
  fullLabel?: string;
  /** Per-label alignment (from `labels`); falls back to the axis `labelAlign`. */
  align?: AxisLabelAlign;
  /** Per-label font weight (from `labels`); falls back to the axis `labelFontWeight`. */
  fontWeight?: AxisLabelFontWeight;
  /** Explicit second line (from `subLabels`). */
  subLabel?: string;
  subAlign?: AxisLabelAlign;
  subFontWeight?: AxisLabelFontWeight;
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
  // One series: use its values as they are (no copy of large arrays).
  if (reqs.length === 1) return { ...reqs[0], includeZero: !!reqs[0].includeZero, requiresBand: !!reqs[0].requiresBand, preferredType: reqs[0].requiresBand ? 'band' : reqs[0].preferredType };
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

const categoryCache = new WeakMap<ReadonlyArray<unknown>, DomainValue[]>();

export function axisCategories(axis: AxisOptions | undefined, dataset: ReadonlyArray<Datum> | undefined): DomainValue[] | undefined {
  if (!axis) return undefined;
  if (axis.data) {
    // Normalized once per data array (layouts call this several times per update).
    let out = categoryCache.get(axis.data);
    if (!out) {
      const src = axis.data;
      out = new Array(src.length);
      for (let i = 0; i < src.length; i++) {
        const v = src[i];
        out[i] = v instanceof Date ? v.getTime() : v;
      }
      categoryCache.set(axis.data, out);
    }
    return out;
  }
  if (axis.dataKey && dataset) return dataset.map((d) => {
    const v = d[axis.dataKey!];
    return v instanceof Date ? v.getTime() : (v as DomainValue);
  });
  return undefined;
}

/** The axis title as lines (`label` may be a string or an array of lines). */
export function axisTitleLines(label: AxisOptions['label']): string[] {
  if (label === undefined || label === null || label === '') return [];
  return Array.isArray(label) ? label.filter((l) => l !== undefined && l !== null).map(String) : [String(label)];
}

/** The axis title as one string (array titles joined with a space), for text exports and descriptions. */
export function axisTitleText(label: AxisOptions['label']): string | undefined {
  const lines = axisTitleLines(label);
  return lines.length ? lines.join(' ') : undefined;
}

/** Currency options of an axis, or undefined when none are set. */
export function axisNumberOptions(axis: AxisOptions): NumberFormatOptions | undefined {
  return axis.currencyCode || axis.currencyLocale ? { currencyCode: axis.currencyCode, currencyLocale: axis.currencyLocale } : undefined;
}

function makeFormat(axis: AxisOptions, scaleType: ScaleType, formatter: Formatter, granularity: () => TimeGranularity | undefined) {
  const numOpts = axisNumberOptions(axis);
  return (value: DomainValue, location: 'tick' | 'tooltip'): string => {
    if (axis.valueFormatter) return axis.valueFormatter(value, { location });
    if (isOrdinal(scaleType)) {
      if (typeof value === 'number' && axis.labelFormat === 'time') {
        const g = axis.granularity ?? 'day';
        const [a, b] = formatter.timeTick(value, g);
        return location === 'tooltip' && b ? `${a} ${b}` : a;
      }
      if (typeof value === 'number' && axis.numberFormat) return formatter.number(value, axis.numberFormat, numOpts);
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
    if (axis.numberFormat) return formatter.number(n, axis.numberFormat, numOpts);
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
    // Continuous scales only need the extent: reduce in one pass instead of copying every value.
    const src = merged?.values ?? cats ?? [];
    const time = isTimeScale(scaleType);
    const log = scaleType === 'log';
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < src.length; k++) {
      const v = src[k];
      const num = typeof v === 'string' ? (time ? Date.parse(v) : Number(v)) : Number(v);
      if (!Number.isFinite(num) || (log && num <= 0)) continue;
      if (num < lo) lo = num;
      if (num > hi) hi = num;
    }
    const vals: number[] = lo <= hi ? (lo === hi ? [lo] : [lo, hi]) : [];
    if (merged?.includeZero && !log) vals.push(0);
    if (vals.length === 0) vals.push(log ? 1 : 0, log ? 10 : 1);
    domain = vals;
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

/* ----------------------------------------------------------------------------
 * Tick values
 * ------------------------------------------------------------------------- */

/** A value as the scale sees it: dates become ms, ISO strings on time axes are parsed. */
function scaleValue(v: DomainValue, scaleType: ScaleType): DomainValue {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && isTimeScale(scaleType)) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : v;
  }
  return v;
}

/** Key used to match `labels` / `subLabels` entries to ticks. */
function valueKey(v: DomainValue, scaleType: ScaleType): string {
  const s = scaleValue(v, scaleType);
  return isOrdinal(scaleType) ? String(s) : String(Number(s));
}

interface LabelSpec {
  value: DomainValue;
  label?: string;
  align?: AxisLabelAlign;
  fontWeight?: AxisLabelFontWeight;
}

function explicitLabels(o: AxisOptions, scaleType: ScaleType): LabelSpec[] | null {
  if (!o.labels || o.labels.length === 0) return null;
  const out: LabelSpec[] = [];
  for (const entry of o.labels) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === 'object' && !(entry instanceof Date)) {
      out.push({ value: scaleValue(entry.value, scaleType), label: entry.label, align: entry.align, fontWeight: entry.fontWeight });
    } else out.push({ value: scaleValue(entry, scaleType) });
  }
  return out;
}

const isBold = (w: AxisLabelFontWeight | undefined) => w === 'bold' || (typeof w === 'number' && w >= 600);
/** Text width at a weight (bold text is measured about 8% wider). */
const widthAt = (measure: Measure, text: string, weight: AxisLabelFontWeight | undefined) => measure(text) * (isBold(weight) ? 1.08 : 1);

const limited = (o: AxisOptions) => o.maxTicks !== undefined || o.minTicks !== undefined;
const autoCount = (direction: 'x' | 'y', length: number) => Math.max(2, Math.floor(Math.abs(length) / (direction === 'x' ? 90 : 44)));

/** The requested tick count, clamped to `minTicks` / `maxTicks`. */
function targetCount(o: AxisOptions, direction: 'x' | 'y', length: number): number {
  let count = o.tickNumber ?? autoCount(direction, length);
  if (o.maxTicks !== undefined) count = Math.min(count, Math.max(1, Math.floor(o.maxTicks)));
  if (o.minTicks !== undefined) count = Math.max(count, Math.floor(o.minTicks));
  return Math.max(1, count);
}

const supportsMinStep = (t: ScaleType) => t === 'linear' || t === 'pow' || t === 'sqrt' || t === 'symlog';

/**
 * Ticks of a continuous axis. Follows the legacy library: the count is a target
 * clamped to `minTicks`..`maxTicks` (the base tick is not counted), and
 * `tickMinStep` lowers the count to at most span / step. `maxTicks` is then
 * enforced as a hard limit.
 */
function continuousTicks(axis: AxisLayout, length: number, measure: Measure, theme: ChartTheme): DomainValue[] {
  const o = axis.options;
  const s = axis.scale;
  if (isTimeScale(axis.scaleType) && o.granularity && o.tickNumber === undefined && !limited(o)) return granularityTicks(axis, o.granularity, length, measure, theme);
  const minStep = supportsMinStep(axis.scaleType) && o.tickMinStep !== undefined && o.tickMinStep > 0 ? o.tickMinStep : undefined;
  if (!limited(o) && minStep === undefined) return s.ticks(o.tickNumber ?? autoCount(axis.direction, length));
  let count = targetCount(o, axis.direction, length);
  if (minStep !== undefined) {
    const d = s.domain().map(Number);
    count = Math.min(count, Math.floor(Math.abs(d[d.length - 1] - d[0]) / minStep) || 1);
  }
  const max = o.maxTicks !== undefined ? Math.max(0, Math.floor(o.maxTicks)) : Infinity;
  const intervals = (v: DomainValue[]) => Math.max(0, v.length - 1);
  const stepOf = (v: DomainValue[]) => (v.length > 1 ? Math.abs(Number(v[1]) - Number(v[0])) : Infinity);
  const tooSmall = (v: DomainValue[]) => minStep !== undefined && stepOf(v) < minStep * (1 - 1e-9);
  let values = s.ticks(count);
  for (let c = count; c > 1 && (intervals(values) > max || tooSmall(values)); ) values = s.ticks(--c);
  if (o.minTicks !== undefined) {
    const min = Math.floor(o.minTicks);
    for (let c = count + 1; intervals(values) < min && c <= count + 40; c++) {
      const next = s.ticks(c);
      if (intervals(next) > max || tooSmall(next)) break;
      if (next.length > values.length) values = next;
    }
  }
  if (intervals(values) > max) {
    if (max <= 0) values = values.slice(0, 1);
    else {
      const k = Math.ceil(intervals(values) / max);
      values = values.filter((_, i) => i % k === 0);
    }
  }
  return values;
}

/** Time ticks at a granularity's interval, taking every n-th unit when they would not fit. */
function granularityTicks(axis: AxisLayout, g: TimeGranularity, length: number, measure: Measure, theme: ChartTheme): DomainValue[] {
  const s = axis.scale;
  const utc = axis.scaleType === 'utc';
  axis.granularity = g;
  const d = s.domain().map(Number);
  const span = Math.abs(d[d.length - 1] - d[0]);
  const fh = theme.fontSize * 1.25;
  let slot: number;
  if (axis.direction === 'x') {
    const sample = Math.max(measure(axis.format(d[0], 'tick')), measure(axis.format(d[d.length - 1], 'tick')));
    slot = sample + 16;
  } else slot = fh + 8;
  const fit = Math.max(1, Math.floor(Math.abs(length) / Math.max(1, slot)));
  const estimate = span / GRANULARITY_MS[g];
  let step = Math.max(1, Math.ceil(estimate / fit));
  let values = s.ticks(timeTickInterval(g, utc, step));
  for (let i = 0; i < 12 && values.length > fit + 1; i++) {
    step = Math.max(step + 1, Math.ceil((step * values.length) / (fit + 1)));
    values = s.ticks(timeTickInterval(g, utc, step));
  }
  return values;
}

function computeTicks(axis: AxisLayout, length: number, measure: Measure, theme: ChartTheme): void {
  const o = axis.options;
  const s = axis.scale;
  const ordinal = isOrdinal(axis.scaleType);
  const explicit = explicitLabels(o, axis.scaleType);
  let values: DomainValue[];
  if (explicit) values = explicit.map((e) => e.value);
  else if (o.tickValues) values = [...o.tickValues];
  else if (ordinal) values = s.domain();
  else values = continuousTicks(axis, length, measure, theme);
  if (isTimeScale(axis.scaleType)) {
    const d = s.domain().map(Number);
    axis.granularity = o.granularity ?? inferGranularity(Math.abs(d[1] - d[0]), Math.max(1, values.length));
  } else if (ordinal && o.labelFormat === 'time') {
    axis.granularity = o.granularity ?? 'day';
  }
  const half = ordinal ? s.bandwidth() / 2 : 0;
  let prevSub = '';
  let ticks: AxisTick[] = values.map((v, i) => {
    const spec = explicit?.[i];
    let label = spec?.label !== undefined ? spec.label : axis.format(v, 'tick');
    let sub = '';
    if (axis.granularity && axis.direction === 'x' && !o.valueFormatter && spec?.label === undefined) {
      const parts = timeTickParts(v, axis);
      if (parts) {
        label = parts[0];
        sub = parts[1] !== prevSub ? parts[1] : '';
        prevSub = parts[1];
      }
    }
    const tick: AxisTick = { value: v, pos: s.map(v) + half, label, sub };
    if (spec?.align) tick.align = spec.align;
    if (spec?.fontWeight !== undefined) tick.fontWeight = spec.fontWeight;
    return tick;
  });
  // Explicit labels outside the scale's domain are dropped.
  if (explicit) ticks = ticks.filter((t) => Number.isFinite(t.pos));
  if (o.subLabels?.length) {
    const subs = new Map(o.subLabels.map((e) => [valueKey(e.value, axis.scaleType), e]));
    for (const t of ticks) {
      const e = subs.get(valueKey(t.value, axis.scaleType));
      if (!e || e.subLabel === undefined || e.subLabel === null) continue;
      t.subLabel = String(e.subLabel);
      if (e.align) t.subAlign = e.align;
      if (e.fontWeight !== undefined) t.subFontWeight = e.fontWeight;
    }
  }
  // Log axes: with many ticks, label only the powers of ten (the rest keep their grid lines).
  if (axis.scaleType === 'log' && ticks.length > 8 && !explicit)
    ticks.forEach((t) => {
      const l = Math.log10(Math.abs(Number(t.value)));
      if (Math.abs(l - Math.round(l)) > 1e-6) t.label = '';
    });
  // Thin ordinal labels when they would overlap (not for explicit labels, or labels truncated to the band).
  if (ordinal && axis.direction === 'x' && ticks.length > 1 && !o.tickLabelAngle && !explicit && o.labelLimit !== 'band') {
    const step = Math.abs(s.step()) || 1;
    const widest = maxOf(ticks.map((t) => widthAt(measure, t.label, t.fontWeight ?? o.labelFontWeight)));
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
  if (ordinal && axis.direction === 'y' && ticks.length > 1 && !explicit) {
    const step = Math.abs(s.step()) || 1;
    const rows = !o.tickLabelAngle && ticks.some((t) => t.subLabel) ? 2 : 1;
    const every = Math.max(1, Math.ceil(((theme.fontSize + 4) * rows) / step));
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

const angleOf = (o: AxisOptions) => o.tickLabelAngle ?? 0;
const isRightAngle = (deg: number) => Math.abs(Math.abs(deg) - 90) < 1e-6;
/** Whether labels run along the axis (x: horizontal text; y: text rotated by 90 degrees). */
const parallelLabels = (a: AxisLayout) => (a.direction === 'x' ? !angleOf(a.options) : isRightAngle(angleOf(a.options)));

/**
 * Label width limit in px. `'band'` gives the band step on ordinal axes whose
 * labels run along the axis; otherwise the defaults apply (y: 160, rotated x: 140).
 */
function labelLimitPx(a: AxisLayout, fallback: number): number {
  const l = a.options.labelLimit;
  if (typeof l === 'number') return l;
  if (l === 'band' && isOrdinal(a.scaleType) && parallelLabels(a)) return Math.max(0, (Math.abs(a.scale.step()) || 0) - 4);
  return fallback;
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
      paddingOuter: o.categoryOuterGapRatio,
      min: zoomed ? zoomed[0] : o.min,
      max: zoomed ? zoomed[1] : o.max,
      reverse: o.reverse,
      // Time axes default to the exact data extent so series span the full width.
      domainLimit: zoomed ? 'strict' : (o.domainLimit ?? (isTimeScale(seed.scaleType) ? 'strict' : 'nice')),
      // With tick limits the domain is rounded to the same count as the ticks.
      tickNumber: limited(o) ? targetCount(o, seed.direction, range[1] - range[0]) : o.tickNumber,
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
    const titleLines = axisTitleLines(o.label).length;
    const labelExtra = titleLines ? titleLines * fh + 6 : 0;
    const ts = o.thumbnails ? (o.thumbnails.size ?? 24) : 0;
    const hideText = o.hideTickLabels || o.thumbnails?.hideLabel;
    const groups = isOrdinal(a.scaleType) ? (o.groups ?? []) : [];
    const box: AxisBox = { thumb: tick + 4, label: 0, labelBlock: 0, group: 0, groupSizes: [], annotation: 0 };
    let c = tick + (o.hideTickLabels && !ts ? 2 : 4);
    if (ts) c += ts + 4;
    box.label = c;
    const weight = (t: AxisTick) => t.fontWeight ?? o.labelFontWeight;
    const subWidth = (t: AxisTick) => (t.subLabel ? widthAt(measure, t.subLabel, t.subFontWeight ?? o.labelFontWeight) : 0);
    const hasSubLabels = a.ticks.some((t) => t.subLabel);
    const angle = angleOf(o);
    if (a.direction === 'x') {
      if (!hideText) {
        const twoRows = a.ticks.some((t) => t.sub);
        let h = fh * (hasSubLabels && !angle ? 2 : 1);
        if (angle) {
          const ang = (Math.abs(angle) * Math.PI) / 180;
          const limit = labelLimitPx(a, 140);
          const w = Math.max(0, maxOf(a.ticks.map((t) => Math.max(Math.min(limit, widthAt(measure, t.label, weight(t))), subWidth(t)))));
          const lines = hasSubLabels ? 2 : 1;
          h = w * Math.sin(ang) + lines * fh * Math.abs(Math.cos(ang));
        }
        box.labelBlock = h + (twoRows ? fh : 0);
      }
      c += box.labelBlock;
      box.group = c;
      for (let i = 0; i < groups.length; i++) box.groupSizes.push(fh + 10);
    } else {
      if (!hideText) {
        const lines = hasSubLabels ? 2 : 1;
        const limit = labelLimitPx(a, 160);
        const w = Math.max(0, maxOf(a.ticks.map((t) => Math.max(Math.min(limit, widthAt(measure, t.label, weight(t))), subWidth(t)))));
        if (!angle) box.labelBlock = w + 2;
        else if (isRightAngle(angle)) box.labelBlock = lines * fh + 2;
        else {
          const ang = (Math.abs(angle) * Math.PI) / 180;
          box.labelBlock = w * Math.abs(Math.cos(ang)) + lines * fh * Math.sin(ang) + 2;
        }
      }
      c += box.labelBlock;
      box.group = c;
      for (const level of groups) {
        const names = groupRuns(a, level).map((r) => r.label);
        box.groupSizes.push(Math.max(0, maxOf(names.map((n) => measure(n)))) + 14);
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
  let overhang = 0;
  if (lastX && !isOrdinal(xAxes[0].scaleType)) {
    const al = lastX.align ?? xAxes[0].options.labelAlign ?? 'center';
    const w = widthAt(measure, lastX.label, lastX.fontWeight ?? xAxes[0].options.labelFontWeight);
    overhang = al === 'start' ? w : al === 'end' ? 0 : w / 2;
  }
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
    // Ordinal labels never overflow their reserved width: truncate with an ellipsis and keep the full text.
    if (isOrdinal(a.scaleType)) {
      const limit = labelLimitPx(a, a.direction === 'y' ? 160 : a.options.tickLabelAngle ? 140 : Infinity);
      if (Number.isFinite(limit))
        a.ticks.forEach((t) => {
          const full = t.label;
          const weight = t.fontWeight ?? a.options.labelFontWeight;
          t.label = truncate(full, limit, (s) => widthAt(measure, s, weight));
          if (t.label !== full) t.fullLabel = full;
        });
    }
  }
  return { plot, xAxes, yAxes };
}

/* ----------------------------------------------------------------------------
 * Label placement (shared by drawing and hit-testing)
 * ------------------------------------------------------------------------- */

interface LabelLine {
  text: string;
  /** Offset from the anchor, in the label's (rotated) frame. */
  dx: number;
  dy: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
  weight?: AxisLabelFontWeight;
  muted?: boolean;
  /** The tick label itself (not a second line). */
  main?: boolean;
}

interface LabelPlacement {
  tick: AxisTick;
  index: number;
  x: number;
  y: number;
  /** Rotation in radians (0 for none). */
  angle: number;
  lines: LabelLine[];
}

const ALIGN_TEXT: Record<AxisLabelAlign, CanvasTextAlign> = { start: 'left', center: 'center', end: 'right' };

/** Offsets of stacked lines from a shared baseline mode, in the label's frame. */
function stack(n: number, baseline: CanvasTextBaseline, fh: number): number[] {
  return Array.from({ length: n }, (_, i) => (baseline === 'top' ? i * fh : baseline === 'bottom' ? -(n - 1 - i) * fh : (i - (n - 1) / 2) * fh));
}

function placeLabels(a: AxisLayout, plot: Rect, theme: ChartTheme): LabelPlacement[] {
  const o = a.options;
  if (a.position === 'none' || o.hideTickLabels || o.thumbnails?.hideLabel) return [];
  const fh = theme.fontSize * 1.25;
  const tick = o.disableTicks ? 0 : (o.tickSize ?? 6);
  const labelGap = a.box?.label ?? tick + 4;
  const bw = isOrdinal(a.scaleType) ? a.scale.bandwidth() : 0;
  const along = (al: AxisLabelAlign) => (al === 'start' ? -bw / 2 : al === 'end' ? bw / 2 : 0);
  const deg = angleOf(o);
  const rad = (deg * Math.PI) / 180;
  const right = isRightAngle(deg);
  const out: LabelPlacement[] = [];
  const timeRows = a.ticks.some((t) => t.sub);
  a.ticks.forEach((t, index) => {
    if (!t.label) return;
    const al = t.align ?? o.labelAlign ?? 'center';
    const weight = t.fontWeight ?? o.labelFontWeight;
    const subWeight = t.subFontWeight ?? o.labelFontWeight;
    if (a.direction === 'x') {
      if (t.pos < plot.x - 1 || t.pos > plot.x + plot.width + 1) return;
      const bottom = a.position === 'bottom';
      const dir = bottom ? 1 : -1;
      const y0 = bottom ? plot.y + plot.height + a.offset : plot.y - a.offset;
      const ly = y0 + dir * labelGap;
      if (!deg) {
        const baseline: CanvasTextBaseline = bottom ? 'top' : 'bottom';
        const lines: LabelLine[] = [{ text: t.label, dx: along(al), dy: 0, align: ALIGN_TEXT[al], baseline, weight, main: true }];
        if (t.sub) lines.push({ text: t.sub, dx: along(al), dy: dir * fh, align: ALIGN_TEXT[al], baseline, muted: true });
        if (t.subLabel) {
          const sal = t.subAlign ?? o.labelAlign ?? 'center';
          lines.push({ text: t.subLabel, dx: along(sal), dy: dir * fh * (timeRows ? 2 : 1), align: ALIGN_TEXT[sal], baseline, weight: subWeight });
        }
        out.push({ tick: t, index, x: t.pos, y: ly, angle: 0, lines });
        return;
      }
      let align: CanvasTextAlign;
      let baseline: CanvasTextBaseline;
      if (right) {
        align = bottom === deg < 0 ? 'right' : 'left';
        const start: CanvasTextBaseline = deg < 0 ? 'top' : 'bottom';
        const end: CanvasTextBaseline = deg < 0 ? 'bottom' : 'top';
        baseline = al === 'start' ? start : al === 'end' ? end : 'middle';
      } else {
        align = bottom === deg < 0 ? 'right' : 'left';
        baseline = 'middle';
      }
      const texts = t.subLabel ? [t.label, t.subLabel] : [t.label];
      const dys = stack(texts.length, baseline, fh);
      const lines: LabelLine[] = texts.map((text, i) => ({ text, dx: 0, dy: dys[i], align, baseline, weight: i === 0 ? weight : subWeight, main: i === 0 }));
      out.push({ tick: t, index, x: t.pos + along(al), y: ly, angle: rad, lines });
      return;
    }
    if (t.pos < plot.y - 1 || t.pos > plot.y + plot.height + 1) return;
    const left = a.position === 'left';
    const dir = left ? -1 : 1;
    const x0 = left ? plot.x - a.offset : plot.x + plot.width + a.offset;
    const lx = x0 + dir * labelGap;
    const texts = t.subLabel ? [t.label, t.subLabel] : [t.label];
    if (!deg) {
      // Lines stack vertically; the block sits at the band's start, centre or end.
      const n = texts.length;
      const top = al === 'start' ? 0 : al === 'end' ? -n * fh : (-n * fh) / 2;
      const align: CanvasTextAlign = left ? 'right' : 'left';
      const lines: LabelLine[] = texts.map((text, i) => ({ text, dx: 0, dy: top + (i + 0.5) * fh, align, baseline: 'middle', weight: i === 0 ? weight : subWeight, main: i === 0 }));
      out.push({ tick: t, index, x: lx, y: t.pos + along(al), angle: 0, lines });
      return;
    }
    let align: CanvasTextAlign;
    let baseline: CanvasTextBaseline;
    if (right) {
      // Text runs along the axis; start / end align it to the band's top / bottom edge.
      const startAlign: CanvasTextAlign = deg < 0 ? 'right' : 'left';
      const endAlign: CanvasTextAlign = deg < 0 ? 'left' : 'right';
      align = al === 'start' ? startAlign : al === 'end' ? endAlign : 'center';
      baseline = left === deg < 0 ? 'bottom' : 'top';
    } else {
      align = left ? 'right' : 'left';
      baseline = 'middle';
    }
    const dys = stack(texts.length, baseline, fh);
    const lines: LabelLine[] = texts.map((text, i) => ({ text, dx: 0, dy: dys[i], align, baseline, weight: i === 0 ? weight : subWeight, main: i === 0 }));
    out.push({ tick: t, index, x: lx, y: t.pos + along(al), angle: rad, lines });
  });
  return out;
}

const fontFor = (theme: ChartTheme, weight?: AxisLabelFontWeight) => `${weight !== undefined && weight !== 'normal' ? `${weight} ` : ''}${theme.fontSize}px ${theme.fontFamily}`;

/** Hit box of a visible tick label, in plot-element coordinates. */
export interface AxisLabelBox {
  axisId: string;
  direction: 'x' | 'y';
  value: DomainValue;
  /** Index of the tick in `AxisLayout.ticks`. */
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text as drawn (possibly truncated). */
  text: string;
  /** Untruncated text. */
  fullText: string;
  truncated: boolean;
}

/**
 * Axis-aligned boxes around every visible tick label (rotated labels get the
 * box around the rotated text). Use them for label tooltips (show `fullText`
 * when `truncated`) and label clicks. `measure` should measure text in the
 * axis font; without it widths are estimated.
 */
export function axisLabelBoxes(layout: CartesianLayout, theme: ChartTheme, measure?: (text: string) => number): AxisLabelBox[] {
  const m: Measure = measure ?? ((t: string) => t.length * theme.fontSize * 0.6);
  const fh = theme.fontSize * 1.25;
  const out: AxisLabelBox[] = [];
  for (const a of [...layout.xAxes, ...layout.yAxes]) {
    for (const p of placeLabels(a, layout.plot, theme)) {
      const line = p.lines.find((l) => l.main);
      if (!line) continue;
      const w = widthAt(m, line.text, line.weight);
      const x0 = line.dx + (line.align === 'right' || line.align === 'end' ? -w : line.align === 'center' ? -w / 2 : 0);
      const y0 = line.dy + (line.baseline === 'bottom' || line.baseline === 'alphabetic' ? -fh : line.baseline === 'middle' ? -fh / 2 : 0);
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [cx, cy] of [
        [x0, y0],
        [x0 + w, y0],
        [x0, y0 + fh],
        [x0 + w, y0 + fh],
      ]) {
        const X = p.x + cx * cos - cy * sin;
        const Y = p.y + cx * sin + cy * cos;
        minX = Math.min(minX, X);
        maxX = Math.max(maxX, X);
        minY = Math.min(minY, Y);
        maxY = Math.max(maxY, Y);
      }
      const fullText = p.tick.fullLabel ?? p.tick.label;
      out.push({ axisId: a.id, direction: a.direction, value: p.tick.value, index: p.index, x: minX, y: minY, width: maxX - minX, height: maxY - minY, text: p.tick.label, fullText, truncated: fullText !== p.tick.label });
    }
  }
  return out;
}

/** The label box under a point (plot-element coordinates), if any. */
export function hitAxisLabel(layout: CartesianLayout, theme: ChartTheme, x: number, y: number, measure?: (text: string) => number): AxisLabelBox | null {
  for (const b of axisLabelBoxes(layout, theme, measure)) if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return b;
  return null;
}

function drawLabels(g: CanvasRenderingContext2D, a: AxisLayout, plot: Rect, theme: ChartTheme): void {
  const base = fontFor(theme);
  for (const p of placeLabels(a, plot, theme)) {
    g.globalAlpha = p.tick.alpha ?? 1;
    if (p.angle) {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.angle);
    }
    for (const l of p.lines) {
      g.font = l.weight !== undefined ? fontFor(theme, l.weight) : base;
      g.textAlign = l.align;
      g.textBaseline = l.baseline;
      g.fillStyle = l.muted ? theme.mutedTextColor : theme.textColor;
      if (p.angle) g.fillText(l.text, l.dx, l.dy);
      else g.fillText(l.text, p.x + l.dx, p.y + l.dy);
    }
    if (p.angle) g.restore();
  }
  g.font = base;
  g.fillStyle = theme.textColor;
  g.globalAlpha = 1;
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
    const title = axisTitleLines(o.label);
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
      if (tick) {
        // Opaque ticks share one path (thousands of category ticks cost one stroke).
        g.beginPath();
        for (const t of a.ticks) {
          if (t.pos < plot.x - 1 || t.pos > plot.x + plot.width + 1 || (t.alpha ?? 1) < 1) continue;
          g.moveTo(Math.round(t.pos) + 0.5, y0);
          g.lineTo(Math.round(t.pos) + 0.5, y0 + dir * tick);
        }
        g.stroke();
      }
      a.ticks.forEach((t, ti) => {
        if (t.pos < plot.x - 1 || t.pos > plot.x + plot.width + 1) return;
        g.globalAlpha = t.alpha ?? 1;
        if (tick && (t.alpha ?? 1) < 1) {
          g.beginPath();
          g.moveTo(Math.round(t.pos) + 0.5, y0);
          g.lineTo(Math.round(t.pos) + 0.5, y0 + dir * tick);
          g.stroke();
        }
        if (ts && box) drawThumb(g, o.thumbnails!.url(t.value, ti), t.pos - ts / 2, bottom ? y0 + box.thumb : y0 - box.thumb - ts, ts, o.thumbnails!.radius ?? 4);
      });
      g.globalAlpha = 1;
      drawLabels(g, a, plot, theme);
      if (box) drawGroups(g, a, plot, theme, y0, dir);
      if (box && o.annotations?.length) drawAnnotations(g, a, plot, theme);
      if (title.length) {
        g.font = `600 ${theme.fontSize}px ${theme.fontFamily}`;
        g.textAlign = 'center';
        g.textBaseline = bottom ? 'bottom' : 'top';
        const n = title.length;
        // The last line sits at the outer edge (bottom axes) and the first at the outer edge (top axes).
        title.forEach((line, i) => g.fillText(line, plot.x + plot.width / 2, bottom ? y0 + a.size - (n - 1 - i) * fh : y0 - a.size + i * fh));
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
      if (tick) {
        g.beginPath();
        for (const t of a.ticks) {
          if (t.pos < plot.y - 1 || t.pos > plot.y + plot.height + 1 || (t.alpha ?? 1) < 1) continue;
          g.moveTo(x0, Math.round(t.pos) + 0.5);
          g.lineTo(x0 + dir * tick, Math.round(t.pos) + 0.5);
        }
        g.stroke();
      }
      a.ticks.forEach((t, ti) => {
        if (t.pos < plot.y - 1 || t.pos > plot.y + plot.height + 1) return;
        g.globalAlpha = t.alpha ?? 1;
        if (tick && (t.alpha ?? 1) < 1) {
          g.beginPath();
          g.moveTo(x0, Math.round(t.pos) + 0.5);
          g.lineTo(x0 + dir * tick, Math.round(t.pos) + 0.5);
          g.stroke();
        }
        if (ts && box) drawThumb(g, o.thumbnails!.url(t.value, ti), left ? x0 - box.thumb - ts : x0 + box.thumb, t.pos - ts / 2, ts, o.thumbnails!.radius ?? 4);
      });
      g.globalAlpha = 1;
      drawLabels(g, a, plot, theme);
      if (box) drawGroups(g, a, plot, theme, x0, dir);
      if (box && o.annotations?.length) drawAnnotations(g, a, plot, theme);
      if (title.length) {
        g.save();
        g.font = `600 ${theme.fontSize}px ${theme.fontFamily}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        // Rotated titles: the first line is the outermost one.
        title.forEach((line, i) => {
          g.save();
          g.translate(left ? x0 - a.size + fh / 2 + i * fh : x0 + a.size - fh / 2 - i * fh, plot.y + plot.height / 2);
          g.rotate(left ? -Math.PI / 2 : Math.PI / 2);
          g.fillText(line, 0, 0);
          g.restore();
        });
        g.restore();
      }
    }
  }
  g.restore();
}
