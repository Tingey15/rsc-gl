import {
  scaleBand,
  scaleLinear,
  scaleLog,
  scalePoint,
  scalePow,
  scaleSqrt,
  scaleSymlog,
  scaleTime,
  scaleUtc,
  type ScaleBand,
  type ScaleContinuousNumeric,
  type ScalePoint,
  type ScaleTime,
} from 'd3-scale';
import {
  timeDay,
  timeHour,
  timeMinute,
  timeMonth,
  timeSecond,
  timeWeek,
  timeYear,
  utcDay,
  utcHour,
  utcMinute,
  utcMonth,
  utcSecond,
  utcWeek,
  utcYear,
  type CountableTimeInterval,
  type TimeInterval,
} from 'd3-time';
import { minOf, maxOf } from '../data/extent';
import type { TimeGranularity } from '../format/format';

export type ScaleType = 'band' | 'point' | 'linear' | 'log' | 'symlog' | 'pow' | 'sqrt' | 'time' | 'utc';
export type DomainValue = number | string | Date;
export type DomainLimit = 'nice' | 'strict' | ((min: number, max: number) => { min: number; max: number });

export const isOrdinal = (t: ScaleType): t is 'band' | 'point' => t === 'band' || t === 'point';
export const isTimeScale = (t: ScaleType) => t === 'time' || t === 'utc';

/**
 * Unified scale wrapper. Continuous scales map numbers (or dates) to pixels;
 * ordinal scales map categories to the start of their band (band) or the
 * point position (point).
 */
export interface ChartScale {
  readonly type: ScaleType;
  map(value: DomainValue): number;
  /** Band width in px (0 for non-band scales). */
  bandwidth(): number;
  /** Step between categories in px (ordinal only). */
  step(): number;
  domain(): DomainValue[];
  range(): [number, number];
  /** Tick values: a target count, or (time scales) a d3 time interval. */
  ticks(count?: number | TimeInterval): DomainValue[];
  /** Pixel to domain value. Ordinal scales return the nearest category. */
  invert(px: number): DomainValue | undefined;
  /** Index of the category nearest `px` (ordinal only). */
  invertIndex(px: number): number;
  /** Underlying d3 scale (escape hatch). */
  readonly raw: unknown;
}

export interface ScaleOptions {
  type: ScaleType;
  domain: DomainValue[];
  range: [number, number];
  /** Band: inner padding ratio. Point: padding ratio. */
  paddingInner?: number;
  paddingOuter?: number;
  /** Continuous: nice / strict / custom domain limiting. */
  domainLimit?: DomainLimit;
  min?: number | Date;
  max?: number | Date;
  reverse?: boolean;
  /** symlog constant / pow exponent */
  constant?: number;
  exponent?: number;
  tickNumber?: number;
}

export function createScale(o: ScaleOptions): ChartScale {
  const range: [number, number] = o.reverse ? [o.range[1], o.range[0]] : o.range;
  if (o.type === 'band') {
    const s = scaleBand<string>()
      .domain(o.domain.map(String))
      .range(range)
      .paddingInner(o.paddingInner ?? 0.2)
      .paddingOuter(o.paddingOuter ?? (o.paddingInner ?? 0.2) / 2);
    return wrapOrdinal('band', s);
  }
  if (o.type === 'point') {
    const s = scalePoint<string>()
      .domain(o.domain.map(String))
      .range(range)
      .padding(o.paddingOuter ?? 0.5);
    return wrapOrdinal('point', s);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any;
  switch (o.type) {
    case 'log':
      s = scaleLog();
      break;
    case 'symlog':
      s = scaleSymlog().constant(o.constant ?? 1) as unknown as ScaleContinuousNumeric<number, number>;
      break;
    case 'pow':
      s = scalePow().exponent(o.exponent ?? 2);
      break;
    case 'sqrt':
      s = scaleSqrt();
      break;
    case 'time':
      s = scaleTime();
      break;
    case 'utc':
      s = scaleUtc();
      break;
    default:
      s = scaleLinear();
  }
  const nums = o.domain.map((v) => (v instanceof Date ? v.getTime() : Number(v))).filter(Number.isFinite);
  let lo = nums.length ? minOf(nums) : 0;
  let hi = nums.length ? maxOf(nums) : 1;
  if (o.min !== undefined) lo = +o.min;
  if (o.max !== undefined) hi = +o.max;
  if (lo === hi) {
    if (isTimeScale(o.type)) {
      lo -= 864e5;
      hi += 864e5;
    } else if (o.type === 'log') {
      lo = lo / 10;
      hi = hi * 10;
    } else {
      const pad = Math.abs(lo) * 0.1 || 1;
      lo -= o.min !== undefined ? 0 : pad;
      hi += o.max !== undefined ? 0 : pad;
    }
  }
  if (o.type === 'log' && lo <= 0) lo = Math.min(1, hi / 10);
  (s as ScaleContinuousNumeric<number, number>).domain([lo, hi]).range(range);
  const limit = o.domainLimit ?? 'nice';
  if (typeof limit === 'function') {
    const r = limit(lo, hi);
    (s as ScaleContinuousNumeric<number, number>).domain([r.min, r.max]);
  } else if (limit === 'nice') {
    const [a, b] = (s as ScaleContinuousNumeric<number, number>).copy().nice(o.tickNumber ?? 5).domain() as number[];
    // Respect explicit min/max while still rounding the free end.
    (s as ScaleContinuousNumeric<number, number>).domain([o.min !== undefined ? lo : +a, o.max !== undefined ? hi : +b]);
  }
  return wrapContinuous(o.type, s as ScaleContinuousNumeric<number, number>);
}

function wrapOrdinal(type: 'band' | 'point', s: ScaleBand<string> | ScalePoint<string>): ChartScale {
  const domain = s.domain();
  return {
    type,
    raw: s,
    map: (v) => s(String(v instanceof Date ? v.getTime() : v)) ?? Number.NaN,
    bandwidth: () => s.bandwidth(),
    step: () => s.step(),
    domain: () => domain,
    range: () => s.range() as [number, number],
    ticks: () => domain,
    invertIndex(px) {
      if (domain.length === 0) return -1;
      const half = s.bandwidth() / 2;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < domain.length; i++) {
        const d = Math.abs((s(domain[i]) ?? 0) + half - px);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    },
    invert(px) {
      const i = this.invertIndex(px);
      return i < 0 ? undefined : domain[i];
    },
  };
}

function wrapContinuous(type: ScaleType, s: ScaleContinuousNumeric<number, number>): ChartScale {
  return {
    type,
    raw: s,
    map: (v) => s(v instanceof Date ? v.getTime() : typeof v === 'string' ? (isTimeScale(type) ? Date.parse(v) : Number(v)) : v),
    bandwidth: () => 0,
    step: () => 0,
    domain: () => s.domain() as number[],
    range: () => s.range() as [number, number],
    ticks: (count = 5) => {
      // Intervals only apply to time scales; elsewhere fall back to the default count.
      if (typeof count !== 'number' && !isTimeScale(type)) count = 5;
      const out = (s.ticks as (c: number | TimeInterval) => (number | Date)[])(count);
      return out as unknown as DomainValue[];
    },
    invert: (px) => {
      const v = s.invert(px) as number | Date;
      return v instanceof Date ? v.getTime() : v;
    },
    invertIndex: () => -1,
  };
}

const LOCAL_INTERVALS: Record<TimeGranularity, CountableTimeInterval> = {
  second: timeSecond,
  minute: timeMinute,
  hour: timeHour,
  day: timeDay,
  week: timeWeek,
  month: timeMonth,
  quarter: timeMonth,
  year: timeYear,
};
const UTC_INTERVALS: Record<TimeGranularity, CountableTimeInterval> = {
  second: utcSecond,
  minute: utcMinute,
  hour: utcHour,
  day: utcDay,
  week: utcWeek,
  month: utcMonth,
  quarter: utcMonth,
  year: utcYear,
};

/** Approximate length of one granularity step in ms. */
export const GRANULARITY_MS: Record<TimeGranularity, number> = {
  second: 1e3,
  minute: 6e4,
  hour: 36e5,
  day: 864e5,
  week: 6048e5,
  month: 2629746e3,
  quarter: 7889238e3,
  year: 31556952e3,
};

/**
 * The d3 time interval for a granularity (quarters are three months), taking
 * every `step`-th unit counted from 1970 (so months stay aligned to January).
 * `utc` selects UTC intervals.
 */
export function timeTickInterval(granularity: TimeGranularity, utc = false, step = 1): TimeInterval {
  const base = (utc ? UTC_INTERVALS : LOCAL_INTERVALS)[granularity] ?? (utc ? utcDay : timeDay);
  const k = Math.max(1, Math.floor(step)) * (granularity === 'quarter' ? 3 : 1);
  if (k === 1) return base;
  // Count from a fixed origin so steps stay even across month and year boundaries.
  const origin = new Date(utc ? Date.UTC(1970, 0, 1) : new Date(1970, 0, 1).getTime());
  return base.filter((d) => base.count(origin, d) % k === 0);
}
