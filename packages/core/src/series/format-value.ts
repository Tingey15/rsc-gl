import type { FormatLocation, Formatter } from '../format/format';
import type { ResolvedSeries } from './types';

/** Formats a series value using the series formatter, number format, or locale default. */
export function formatSeriesValue(series: ResolvedSeries, value: number | null, formatter: Formatter, location: FormatLocation, dataIndex?: number): string {
  const o = series.options;
  if (o.valueFormatter) return o.valueFormatter(value, { location, dataIndex, seriesId: series.id });
  if (value === null || value === undefined) return '';
  return formatter.number(value, o.numberFormat);
}
