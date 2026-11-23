import { format as d3format, formatLocale, type FormatLocaleDefinition } from 'd3-format';
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
  /** BCP 47 code for Intl based formatting (compact numbers, currency, dates). */
  code: string;
  number?: FormatLocaleDefinition;
  time?: TimeLocaleDefinition;
}

export interface Formatter {
  locale: string;
  number(value: number, fmt?: NumberFormat): string;
  time(value: number | Date, specifier: string): string;
  /** Default tick label for a time value at a granularity. Returns [primary, secondary]. */
  timeTick(value: number | Date, granularity: TimeGranularity): [string, string];
  duration(seconds: number): string;
}

const cache = new Map<string, Formatter>();

export function resolveLocale(input: string | LocaleOptions | undefined): LocaleOptions {
  if (!input) return { code: 'en-US' };
  return typeof input === 'string' ? { code: input } : input;
}

/** Creates (and caches) a formatter for a locale. Intl supplies localized separators. */
export function getFormatter(input?: string | LocaleOptions): Formatter {
  const opts = resolveLocale(input);
  const key = typeof input === 'string' || !input ? opts.code : JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) return hit;

  const parts = new Intl.NumberFormat(opts.code).formatToParts(12345.6);
  const group = parts.find((p) => p.type === 'group')?.value ?? ',';
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  const numLocale = formatLocale(
    opts.number ?? { decimal, thousands: group, grouping: [3], currency: ['$', ''] },
  );
  const timeLocale = opts.time ? timeFormatLocale(opts.time) : null;
  const tf = (spec: string) => (timeLocale ? timeLocale.format(spec) : timeFormat(spec));
  const compact = new Intl.NumberFormat(opts.code, { notation: 'compact', maximumFractionDigits: 1 });
  const standard = new Intl.NumberFormat(opts.code, { maximumFractionDigits: 2 });
  const currency = new Intl.NumberFormat(opts.code, { style: 'currency', currency: currencyFor(opts.code) });
  const shortCurrency = new Intl.NumberFormat(opts.code, { style: 'currency', currency: currencyFor(opts.code), notation: 'compact', maximumFractionDigits: 1 });
  const specCache = new Map<string, (n: number) => string>();
  const dateFmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(opts.code, o);
  const month = dateFmt({ month: 'short' });
  const day = dateFmt({ day: 'numeric' });
  const monthDay = dateFmt({ month: 'short', day: 'numeric' });
  const hour = dateFmt({ hour: 'numeric' });
  const minute = dateFmt({ hour: 'numeric', minute: '2-digit' });
  const year = dateFmt({ year: 'numeric' });

  const f: Formatter = {
    locale: opts.code,
    number(value, fmt) {
      if (value === null || value === undefined || Number.isNaN(value)) return '';
      if (typeof fmt === 'function') return fmt(value);
      switch (fmt) {
        case undefined:
        case 'standardNumber':
          return standard.format(value);
        case 'shortNumber':
          return compact.format(value);
        case 'currency':
          return currency.format(value);
        case 'shortCurrency':
          return shortCurrency.format(value);
        case 'percentage':
          return numLocale.format('.0~%')(value);
        default: {
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
      return h > 0 ? `${sign}${standard.format(h)}:${pad(m)}:${pad(sec)}` : `${sign}${m}:${pad(sec)}`;
    },
  };
  cache.set(key, f);
  return f;
}

function currencyFor(code: string): string {
  const region = code.split('-')[1]?.toUpperCase();
  const map: Record<string, string> = {
    US: 'USD', CA: 'CAD', GB: 'GBP', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', FI: 'EUR', JP: 'JPY',
    CN: 'CNY', KR: 'KRW', BR: 'BRL', MX: 'MXN', CH: 'CHF', SE: 'SEK', DK: 'DKK', PL: 'PLN', RU: 'RUB', IN: 'INR',
    AU: 'AUD', CZ: 'CZK', HU: 'HUF', IL: 'ILS', UA: 'UAH', EG: 'EGP', TR: 'TRY',
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
