import { format as d3format, formatLocale, type FormatLocaleDefinition, type FormatLocaleObject } from 'd3-format';
import { timeFormat, timeFormatLocale, type TimeLocaleDefinition } from 'd3-time-format';

export type NumberFormatPreset = 'currency' | 'shortCurrency' | 'shortNumber' | 'standardNumber' | 'percentage';
/** A preset name, any d3-format specifier (e.g. `,.2f`), or a function. */
export type NumberFormat = NumberFormatPreset | string | ((value: number) => string);

export type TimeGranularity = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export type FormatLocation = 'tick' | 'tooltip' | 'legend' | 'label';

export interface FormatContext {
  location: FormatLocation;
  dataIndex?: number;
  seriesId?: string;
}

export type ValueFormatter<V = unknown> = (value: V, context: FormatContext) => string;

export interface LocaleOptions {
  /** BCP 47 code for Intl based formatting (compact numbers, currency, dates). Default 'en-US'. */
  code?: string;
  /** A d3 number locale definition, or a BCP 47 code used for numbers only. */
  number?: Partial<FormatLocaleDefinition> | string;
  /** A d3 time locale definition, or a BCP 47 code used for dates only. */
  time?: Partial<TimeLocaleDefinition> | string;
}

/**
 * Everything `getFormatter` accepts: a BCP 47 code, `LocaleOptions`, the legacy
 * `{ number, time }` object (each a code or a d3 definition), or a bare d3
 * number or time locale definition.
 */
export type LocaleInput = string | LocaleOptions | Partial<FormatLocaleDefinition> | Partial<TimeLocaleDefinition>;

/** Per-call options for `Formatter.number`. */
export interface NumberFormatOptions {
  /** ISO 4217 currency code (e.g. 'EUR'). Overrides the currency implied by the locale. */
  currencyCode?: string;
  /** BCP 47 locale that sets the currency symbol's position and spacing (e.g. 'de-DE' gives `100 $`). Digits keep the chart locale. */
  currencyLocale?: string;
}

export interface Formatter {
  locale: string;
  /**
   * Formats a number. `options` overrides the currency used by the `currency`
   * and `shortCurrency` presets and by d3 specifiers that contain `$`.
   */
  number(value: number, fmt?: NumberFormat, options?: NumberFormatOptions): string;
  time(value: number | Date, specifier: string): string;
  /** Default tick label for a time value at a granularity. Returns [primary, secondary]. */
  timeTick(value: number | Date, granularity: TimeGranularity): [string, string];
  duration(seconds: number): string;
}

/** A locale input reduced to Intl codes plus optional d3 definitions. */
export interface ResolvedLocale {
  /** Intl code for dates (also `Formatter.locale`). */
  code: string;
  /** Intl code for numbers. */
  numberCode: string;
  number?: Partial<FormatLocaleDefinition>;
  time?: Partial<TimeLocaleDefinition>;
  /** True when a separate time locale code was given: d3 time specifiers then use its month and day names. */
  localizeTime?: boolean;
}

const DEFAULT_CODE = 'en-US';
const cache = new Map<string, Formatter>();

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const NUMBER_KEYS = ['decimal', 'thousands', 'grouping', 'currency', 'numerals', 'percent', 'minus', 'nan'];
const TIME_KEYS = ['dateTime', 'date', 'time', 'periods', 'days', 'shortDays', 'months', 'shortMonths'];
const isNumberDef = (v: Record<string, unknown>) => NUMBER_KEYS.some((k) => k in v) && !('number' in v) && !('code' in v);
// `time` is also a key of the legacy object, so a time definition needs one of its other keys.
const isTimeDef = (v: Record<string, unknown>) => TIME_KEYS.some((k) => k !== 'time' && k in v) && !('number' in v) && !('code' in v);

/** A valid, canonical BCP 47 code, or undefined. */
export function safeLocaleCode(code: unknown): string | undefined {
  if (typeof code !== 'string' || !code.trim()) return undefined;
  try {
    const c = Intl.getCanonicalLocales(code.trim())[0];
    if (!c) return undefined;
    new Intl.NumberFormat(c);
    return c;
  } catch {
    return undefined;
  }
}

/** Normalizes any supported locale input. Never throws; falls back to 'en-US'. */
export function resolveLocale(input: LocaleInput | null | undefined): ResolvedLocale {
  if (typeof input === 'string') {
    const code = safeLocaleCode(input) ?? DEFAULT_CODE;
    return { code, numberCode: code };
  }
  if (!isObject(input)) return { code: DEFAULT_CODE, numberCode: DEFAULT_CODE };
  if (isNumberDef(input)) return { code: DEFAULT_CODE, numberCode: DEFAULT_CODE, number: input as Partial<FormatLocaleDefinition> };
  if (isTimeDef(input)) return { code: DEFAULT_CODE, numberCode: DEFAULT_CODE, time: input as Partial<TimeLocaleDefinition> };
  const o = input as LocaleOptions;
  const base = safeLocaleCode(o.code);
  const numberCode = (typeof o.number === 'string' ? safeLocaleCode(o.number) : undefined) ?? base;
  const timeCode = (typeof o.time === 'string' ? safeLocaleCode(o.time) : undefined) ?? base;
  const out: ResolvedLocale = { code: timeCode ?? numberCode ?? DEFAULT_CODE, numberCode: numberCode ?? timeCode ?? DEFAULT_CODE };
  if (typeof o.time === 'string' && timeCode) out.localizeTime = true;
  if (isObject(o.number)) out.number = o.number;
  if (isObject(o.time)) out.time = o.time;
  return out;
}

/** Intl-derived d3 time locale for a code (month and day names, AM/PM). */
function intlTimeLocale(code: string): TimeLocaleDefinition {
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(code, { ...o, timeZone: 'UTC' });
  const dayLong = fmt({ weekday: 'long' });
  const dayShort = fmt({ weekday: 'short' });
  const monLong = fmt({ month: 'long' });
  const monShort = fmt({ month: 'short' });
  // 1 January 2023 was a Sunday.
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)));
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2023, i, 15)));
  const period = (h: number) =>
    fmt({ hour: 'numeric', hour12: true })
      .formatToParts(new Date(Date.UTC(2023, 0, 1, h)))
      .find((p) => p.type === 'dayPeriod')?.value;
  const us = code.toLowerCase().startsWith('en-us') || code.toLowerCase() === 'en';
  return {
    dateTime: '%x, %X',
    date: us ? '%-m/%-d/%Y' : '%Y-%m-%d',
    time: us ? '%-I:%M:%S %p' : '%H:%M:%S',
    periods: [period(1) ?? 'AM', period(13) ?? 'PM'],
    days: days.map((d) => dayLong.format(d)) as TimeLocaleDefinition['days'],
    shortDays: days.map((d) => dayShort.format(d)) as TimeLocaleDefinition['shortDays'],
    months: months.map((d) => monLong.format(d)) as TimeLocaleDefinition['months'],
    shortMonths: months.map((d) => monShort.format(d)) as TimeLocaleDefinition['shortMonths'],
  };
}

function cacheKey(input: LocaleInput | null | undefined): string | null {
  if (input === undefined || input === null) return DEFAULT_CODE;
  if (typeof input === 'string') return `s:${input}`;
  try {
    return `o:${JSON.stringify(input)}`;
  } catch {
    return null;
  }
}

/** Creates (and caches) a formatter for a locale. Intl supplies localized separators. Never throws. */
export function getFormatter(input?: LocaleInput | null): Formatter {
  const key = cacheKey(input);
  const hit = key !== null ? cache.get(key) : undefined;
  if (hit) return hit;
  let f: Formatter;
  try {
    f = buildFormatter(resolveLocale(input));
  } catch {
    f = buildFormatter({ code: DEFAULT_CODE, numberCode: DEFAULT_CODE });
  }
  if (key !== null) cache.set(key, f);
  return f;
}

function buildFormatter(opts: ResolvedLocale): Formatter {
  const nCode = opts.numberCode;
  const parts = new Intl.NumberFormat(nCode).formatToParts(12345.6);
  const group = parts.find((p) => p.type === 'group')?.value ?? ',';
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  const baseNumber: FormatLocaleDefinition = { decimal, thousands: group, grouping: [3], currency: ['$', ''] };
  let numLocale: FormatLocaleObject;
  try {
    numLocale = formatLocale({ ...baseNumber, ...opts.number } as FormatLocaleDefinition);
  } catch {
    numLocale = formatLocale(baseNumber);
  }
  // A custom number definition swaps its separators into Intl output.
  const customSep = opts.number && (opts.number.decimal !== undefined || opts.number.thousands !== undefined);
  const sepDecimal = opts.number?.decimal ?? decimal;
  const sepGroup = opts.number?.thousands ?? group;
  const intl = (nf: Intl.NumberFormat) =>
    customSep
      ? (v: number) =>
          nf
            .formatToParts(v)
            .map((p) => (p.type === 'group' ? sepGroup : p.type === 'decimal' ? sepDecimal : p.value))
            .join('')
      : (v: number) => nf.format(v);

  let timeLocale: ReturnType<typeof timeFormatLocale> | null = null;
  const tCode = opts.code;
  if (opts.time || opts.localizeTime) {
    try {
      const base = intlTimeLocale(tCode);
      timeLocale = timeFormatLocale({ ...base, ...opts.time } as TimeLocaleDefinition);
    } catch {
      timeLocale = null;
    }
  }
  const tf = (spec: string) => (timeLocale ? timeLocale.format(spec) : timeFormat(spec));
  const compact = intl(new Intl.NumberFormat(nCode, { notation: 'compact', maximumFractionDigits: 1 }));
  const standard = intl(new Intl.NumberFormat(nCode, { maximumFractionDigits: 2 }));
  const specCache = new Map<string, (n: number) => string>();
  const intlCache = new Map<string, Intl.NumberFormat>();
  const nf = (code: string, o: Intl.NumberFormatOptions): Intl.NumberFormat => {
    const k = `${code}|${JSON.stringify(o)}`;
    let x = intlCache.get(k);
    if (!x) {
      x = new Intl.NumberFormat(code, o);
      intlCache.set(k, x);
    }
    return x;
  };
  const defaultCurrency = currencyFor(nCode);
  const hasCustomCurrency = !!opts.number?.currency;

  /**
   * Currency text. Without a `currencyLocale` (or when it is the chart's own
   * number locale) Intl formats the whole value. Otherwise, as in the legacy
   * library, the currency locale gives the symbol and its placement and the
   * chart locale gives the digits.
   */
  const currencyText = (value: number, o: NumberFormatOptions | undefined, compactNotation: boolean, digits?: number): string => {
    const code = (o?.currencyCode && o.currencyCode.trim().toUpperCase()) || defaultCurrency;
    const curLoc = safeLocaleCode(o?.currencyLocale);
    const digitOpts: Intl.NumberFormatOptions = compactNotation
      ? { notation: 'compact', maximumFractionDigits: digits ?? 1 }
      : digits !== undefined
        ? { minimumFractionDigits: digits, maximumFractionDigits: digits }
        : {};
    try {
      if (!curLoc || curLoc === nCode) return intl(nf(nCode, { style: 'currency', currency: code, ...digitOpts }))(value);
      const template = nf(curLoc, { style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(1);
      let numberOpts = digitOpts;
      if (!compactNotation && digits === undefined) {
        const d = nf(curLoc, { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
        numberOpts = { minimumFractionDigits: d, maximumFractionDigits: d };
      }
      const body = intl(nf(nCode, numberOpts))(Math.abs(value));
      const at = template.indexOf('1');
      const text = at < 0 ? `${template} ${body}` : template.slice(0, at) + body + template.slice(at + 1);
      return value < 0 ? `-${text}` : text;
    } catch {
      return intl(nf(nCode, { style: 'currency', currency: defaultCurrency, ...digitOpts }))(value);
    }
  };

  const dateFmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tCode, o);
  const month = dateFmt({ month: 'short' });
  const day = dateFmt({ day: 'numeric' });
  const monthDay = dateFmt({ month: 'short', day: 'numeric' });
  const hour = dateFmt({ hour: 'numeric' });
  const minute = dateFmt({ hour: 'numeric', minute: '2-digit' });
  const year = dateFmt({ year: 'numeric' });

  const f: Formatter = {
    locale: tCode,
    number(value, fmt, options) {
      if (value === null || value === undefined || Number.isNaN(value)) return '';
      if (typeof fmt === 'function') return fmt(value);
      const withCurrency = !!(options && (options.currencyCode || options.currencyLocale));
      switch (fmt) {
        case undefined:
        case 'standardNumber':
          return standard(value);
        case 'shortNumber':
          return compact(value);
        case 'currency':
          // A custom d3 number locale with its own currency symbol keeps it (legacy `$,.2f`).
          if (hasCustomCurrency && !withCurrency) return numLocale.format('$,.2f')(value);
          return currencyText(value, options, false);
        case 'shortCurrency':
          return currencyText(value, options, true);
        case 'percentage':
          return numLocale.format('.0~%')(value);
        default: {
          if (withCurrency) {
            // d3 currency specifiers, and (legacy) fixed-precision specifiers when both currency options are set.
            const fixed = /^\$?,?\.(\d+)f$/.exec(fmt);
            if (fmt.includes('$') || (fixed && options!.currencyCode && options!.currencyLocale)) {
              if (/s$/.test(fmt)) return currencyText(value, options, true, precisionOf(fmt));
              return currencyText(value, options, false, precisionOf(fmt));
            }
          }
          let fn = specCache.get(fmt);
          if (!fn) {
            try {
              fn = numLocale.format(fmt);
            } catch {
              fn = d3format(',');
            }
            specCache.set(fmt, fn);
          }
          return fn(value);
        }
      }
    },
    time(value, spec) {
      return tf(spec)(new Date(value));
    },
    timeTick(value, granularity) {
      const d = new Date(value);
      switch (granularity) {
        case 'second':
          return [tf(':%S')(d), minute.format(d)];
        case 'minute':
          return [minute.format(d), monthDay.format(d)];
        case 'hour':
          return [hour.format(d), monthDay.format(d)];
        case 'day':
        case 'week':
          return [day.format(d), month.format(d)];
        case 'month':
          return [month.format(d), year.format(d)];
        case 'quarter':
          return [`Q${Math.floor(d.getMonth() / 3) + 1}`, year.format(d)];
        case 'year':
        default:
          return [year.format(d), ''];
      }
    },
    duration(seconds) {
      const s = Math.abs(Math.round(seconds));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      const sign = seconds < 0 ? '-' : '';
      return h > 0 ? `${sign}${standard(h)}:${pad(m)}:${pad(sec)}` : `${sign}${m}:${pad(sec)}`;
    },
  };
  return f;
}

/** Precision of a d3 specifier (`$,.2f` gives 2), if it has one. */
function precisionOf(spec: string): number | undefined {
  const m = /\.(\d+)/.exec(spec);
  return m ? Math.min(20, Number(m[1])) : undefined;
}

/** The default currency for a locale's region. Undefined or unknown codes give 'USD'. */
export function currencyFor(code?: string | null): string {
  if (typeof code !== 'string') return 'USD';
  const region = code
    .split(/[-_]/)
    .slice(1)
    .find((p) => /^[A-Za-z]{2}$/.test(p))
    ?.toUpperCase();
  const map: Record<string, string> = {
    US: 'USD', CA: 'CAD', GB: 'GBP', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', FI: 'EUR', JP: 'JPY',
    CN: 'CNY', KR: 'KRW', BR: 'BRL', MX: 'MXN', CH: 'CHF', SE: 'SEK', DK: 'DKK', PL: 'PLN', RU: 'RUB', IN: 'INR',
    AU: 'AUD', CZ: 'CZK', HU: 'HUF', IL: 'ILS', UA: 'UAH', EG: 'EGP', TR: 'TRY', AT: 'EUR', BE: 'EUR', PT: 'EUR',
    IE: 'EUR', NO: 'NOK', NZ: 'NZD', ZA: 'ZAR', SG: 'SGD', HK: 'HKD', TW: 'TWD',
  };
  return (region && map[region]) || 'USD';
}

/** Chooses a sensible granularity for a time span (ms) and tick count. */
export function inferGranularity(spanMs: number, ticks: number): TimeGranularity {
  const per = spanMs / Math.max(1, ticks);
  const H = 3600e3;
  if (per < 60e3) return 'second';
  if (per < H) return 'minute';
  if (per < 24 * H) return 'hour';
  if (per < 28 * 24 * H) return 'day';
  if (per < 85 * 24 * H) return 'month';
  if (per < 360 * 24 * H) return 'quarter';
  return 'year';
}
