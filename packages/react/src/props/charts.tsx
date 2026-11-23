import { forwardRef } from 'react';
import {
  areaSeries,
  barSeries,
  lineSeries,
  pieSeries,
  scatterSeries,
  heatmapSeries,
  candlestickSeries,
  rangeBarSeries,
  waterfallSeries,
  boxplotSeries,
  type AreaSeriesOptions,
  type BarSeriesOptions,
  type ChartOptions,
  type LineSeriesOptions,
  type PieSeriesOptions,
  type ScatterSeriesOptions,
  type SeriesDefinition,
  type SeriesOptions,
} from '@rsc-gl/core';
import { GLChart, type ChartHandle } from '../GLChart';
import { commonOptions, withPlugins, type CommonChartProps } from './common';

type WithoutType<T> = Omit<T, 'type'> & { type?: T extends { type: infer K } ? K : never };

const hasLabels = (series: { label?: string }[]) => series.length > 1 || series.some((s) => s.label);

/* ---------------------------------------------------------------- BarChart */

export interface BarChartProps extends CommonChartProps {
  series: WithoutType<BarSeriesOptions>[];
  layout?: 'vertical' | 'horizontal';
  borderRadius?: number;
  barLabel?: BarSeriesOptions['barLabel'];
}

const BAR_TYPES = [barSeries];

export const BarChart = /*#__PURE__*/ forwardRef<ChartHandle, BarChartProps>(function BarChart(p, ref) {
  const horizontal = p.layout === 'horizontal';
  const series = p.series.map((s) => ({ borderRadius: p.borderRadius, barLabel: p.barLabel, ...s, type: 'bar' as const, layout: s.layout ?? p.layout }));
  const catAxis = (horizontal ? p.yAxis : p.xAxis)?.map((a) => ({ scaleType: 'band' as const, ...a }));
  const options: ChartOptions = {
    ...commonOptions(p, { legend: hasLabels(p.series) }),
    xAxis: horizontal ? p.xAxis : catAxis,
    yAxis: horizontal ? catAxis : p.yAxis,
    series,
  };
  return (
    <GLChart ref={ref} options={options} seriesTypes={BAR_TYPES} width={p.width} height={p.height} className={p.className} style={p.style} renderTooltip={p.renderTooltip} slots={p.slots} slotProps={p.slotProps} serverSvg={p.serverSvg} onBackend={p.onBackend} plugins={withPlugins(options, p.plugins)}>
      {p.children}
    </GLChart>
  );
});

/* ---------------------------------------------------------------- LineChart */

export interface LineChartProps extends CommonChartProps {
  series: WithoutType<LineSeriesOptions>[];
}

const LINE_TYPES = [lineSeries];

export const LineChart = /*#__PURE__*/ forwardRef<ChartHandle, LineChartProps>(function LineChart(p, ref) {
  const options: ChartOptions = {
    ...commonOptions(p, { legend: hasLabels(p.series) }),
    series: p.series.map((s) => ({ curve: 'monotoneX' as const, ...s, type: 'line' as const })),
  };
  return (
    <GLChart ref={ref} options={options} seriesTypes={LINE_TYPES} width={p.width} height={p.height} className={p.className} style={p.style} renderTooltip={p.renderTooltip} slots={p.slots} slotProps={p.slotProps} serverSvg={p.serverSvg} onBackend={p.onBackend} plugins={withPlugins(options, p.plugins)}>
      {p.children}
    </GLChart>
  );
});

/* ---------------------------------------------------------------- AreaChart */

export interface AreaChartProps extends CommonChartProps {
  series: WithoutType<AreaSeriesOptions>[];
}

const AREA_TYPES = [areaSeries];

export const AreaChart = /*#__PURE__*/ forwardRef<ChartHandle, AreaChartProps>(function AreaChart(p, ref) {
  const options: ChartOptions = {
    ...commonOptions(p, { legend: hasLabels(p.series) }),
    series: p.series.map((s) => ({ curve: 'monotoneX' as const, ...s, type: 'area' as const })),
  };
  return (
    <GLChart ref={ref} options={options} seriesTypes={AREA_TYPES} width={p.width} height={p.height} className={p.className} style={p.style} renderTooltip={p.renderTooltip} slots={p.slots} slotProps={p.slotProps} serverSvg={p.serverSvg} onBackend={p.onBackend} plugins={withPlugins(options, p.plugins)}>
      {p.children}
    </GLChart>
  );
});

/* ---------------------------------------------------------------- ScatterChart */

export interface ScatterChartProps extends CommonChartProps {
  series: WithoutType<ScatterSeriesOptions>[];
}

const SCATTER_TYPES = [scatterSeries];

export const ScatterChart = /*#__PURE__*/ forwardRef<ChartHandle, ScatterChartProps>(function ScatterChart(p, ref) {
  const options: ChartOptions = {
    ...commonOptions(p, { legend: hasLabels(p.series) }),
    series: p.series.map((s) => ({ ...s, type: 'scatter' as const })),
  };
  return (
    <GLChart ref={ref} options={options} seriesTypes={SCATTER_TYPES} width={p.width} height={p.height} className={p.className} style={p.style} renderTooltip={p.renderTooltip} slots={p.slots} slotProps={p.slotProps} serverSvg={p.serverSvg} onBackend={p.onBackend} plugins={withPlugins(options, p.plugins)}>
      {p.children}
    </GLChart>
  );
});

/* ---------------------------------------------------------------- PieChart */

export interface PieChartProps extends CommonChartProps {
  series: WithoutType<PieSeriesOptions>[];
}

const PIE_TYPES = [pieSeries];

export const PieChart = /*#__PURE__*/ forwardRef<ChartHandle, PieChartProps>(function PieChart(p, ref) {
  const options: ChartOptions = {
    ...commonOptions(p, { legend: true }),
    legend: p.hideLegend ? false : (p.legend ?? { position: 'right' }),
    series: p.series.map((s) => ({ ...s, type: 'pie' as const })),
  };
  return (
    <GLChart ref={ref} options={options} seriesTypes={PIE_TYPES} width={p.width} height={p.height} className={p.className} style={p.style} renderTooltip={p.renderTooltip} slots={p.slots} slotProps={p.slotProps} serverSvg={p.serverSvg} onBackend={p.onBackend} plugins={withPlugins(options, p.plugins)}>
      {p.children}
    </GLChart>
  );
});

/* ---------------------------------------------------------------- SparkLineChart */

export interface SparkLineChartProps {
  data: (number | null)[];
  plotType?: 'line' | 'bar';
  area?: boolean;
  curve?: LineSeriesOptions['curve'];
  color?: string;
  width?: number | `${number}%`;
  height?: number;
  showTooltip?: boolean;
  showHighlight?: boolean;
  valueFormatter?: (v: number | null) => string;
  yAxis?: { min?: number; max?: number };
  colorScheme?: 'light' | 'dark';
  className?: string;
}

const SPARK_TYPES = [lineSeries, barSeries];

export function SparkLineChart(p: SparkLineChartProps) {
  const series: SeriesOptions =
    p.plotType === 'bar'
      ? { type: 'bar', data: p.data, color: p.color, borderRadius: 1, valueFormatter: p.valueFormatter ? (v) => p.valueFormatter!(v) : undefined }
      : { type: 'line', data: p.data, color: p.color, area: p.area, gradient: p.area, curve: p.curve ?? 'linear', lineWidth: 1.5, valueFormatter: p.valueFormatter ? (v) => p.valueFormatter!(v) : undefined };
  const options: ChartOptions = {
    series: [series],
    xAxis: [{ position: 'none', scaleType: p.plotType === 'bar' ? 'band' : 'point', data: p.data.map((_, i) => i), categoryGapRatio: 0.25 }],
    yAxis: [{ position: 'none', min: p.yAxis?.min, max: p.yAxis?.max, domainLimit: 'strict' }],
    grid: { horizontal: false, vertical: false },
    margin: { top: 3, right: 3, bottom: 3, left: 3 },
    legend: false,
    tooltip: p.showTooltip ? { trigger: 'axis' } : false,
    axisHighlight: { x: p.showHighlight ? 'line' : 'none' },
    colorScheme: p.colorScheme,
    keyboardNavigation: false,
  };
  return <GLChart options={options} seriesTypes={SPARK_TYPES as SeriesDefinition<any>[]} width={p.width ?? '100%'} height={p.height ?? 40} className={p.className} />;
}

/* ---------------------------------------------------------------- Gauge */

export interface GaugeProps {
  value: number | null;
  valueMin?: number;
  valueMax?: number;
  /** Degrees. */
  startAngle?: number;
  endAngle?: number;
  innerRadius?: number | string;
  outerRadius?: number | string;
  cornerRadius?: number;
  /** Text in the center; a function receives the value. */
  text?: string | ((p: { value: number | null; valueMin: number; valueMax: number }) => string);
  color?: string;
  trackColor?: string;
  width?: number | `${number}%`;
  height?: number;
  colorScheme?: 'light' | 'dark';
  className?: string;
}

export function Gauge(p: GaugeProps) {
  const min = p.valueMin ?? 0;
  const max = p.valueMax ?? 100;
  const v = Math.max(min, Math.min(max, p.value ?? min));
  const text = typeof p.text === 'function' ? p.text({ value: p.value, valueMin: min, valueMax: max }) : (p.text ?? (p.value === null ? '–' : String(p.value)));
  const options: ChartOptions = {
    series: [
      {
        type: 'pie',
        data: [
          { id: 'value', label: 'Value', value: v - min, color: p.color ?? '#3b6fe0' },
          { id: 'rest', label: 'Remaining', value: max - v, color: p.trackColor ?? (p.colorScheme === 'dark' ? 'gray-300' : 'gray-150') },
        ],
        startAngle: p.startAngle ?? -110,
        endAngle: p.endAngle ?? 110,
        innerRadius: p.innerRadius ?? '78%',
        outerRadius: p.outerRadius,
        cornerRadius: p.cornerRadius ?? 0,
        paddingAngle: 0,
        hoverOffset: 0,
        centerLabel: text,
        cy: (p.endAngle ?? 110) - (p.startAngle ?? -110) <= 180 ? '75%' : '50%',
      } as PieSeriesOptions,
    ],
    legend: false,
    tooltip: false,
    colorScheme: p.colorScheme,
    highlightScope: { highlight: 'none', fade: 'none' },
    keyboardNavigation: false,
  };
  return (
    <div role="meter" aria-valuenow={p.value ?? undefined} aria-valuemin={min} aria-valuemax={max} aria-valuetext={text} className={p.className}>
      <GLChart options={options} seriesTypes={PIE_TYPES} width={p.width ?? '100%'} height={p.height ?? 200} />
    </div>
  );
}

/* ---------------------------------------------------------------- ChartsContainer */

/**
 * Props for `ChartsContainer`: a chart that mixes any series types (bars, lines,
 * scatter, ...) on shared axes. Accepts every common chart prop plus the series.
 */
export interface ChartsContainerProps extends CommonChartProps {
  series: SeriesOptions[];
  /** Series types to register (defaults to the types used by `series`). */
  seriesTypes?: SeriesDefinition<any>[];
}

const ALL_TYPES: Record<string, SeriesDefinition<any>> = {
  bar: barSeries,
  line: lineSeries,
  area: areaSeries,
  scatter: scatterSeries,
  pie: pieSeries,
  heatmap: heatmapSeries,
  candlestick: candlestickSeries,
  rangeBar: rangeBarSeries,
  waterfall: waterfallSeries,
  boxplot: boxplotSeries,
};

/** Generic container mixing any registered series types (e.g. bar + line combos). */
export const ChartsContainer = /*#__PURE__*/ forwardRef<ChartHandle, ChartsContainerProps>(function ChartsContainer(p, ref) {
  const types = p.seriesTypes ?? [...new Set(p.series.map((s) => s.type))].map((t) => ALL_TYPES[t]).filter(Boolean);
  const options: ChartOptions = { ...commonOptions(p, { legend: hasLabels(p.series) }), series: p.series };
  return (
    <GLChart ref={ref} options={options} seriesTypes={types} width={p.width} height={p.height} className={p.className} style={p.style} renderTooltip={p.renderTooltip} slots={p.slots} slotProps={p.slotProps} serverSvg={p.serverSvg} onBackend={p.onBackend} plugins={withPlugins(options, p.plugins)}>
      {p.children}
    </GLChart>
  );
});
