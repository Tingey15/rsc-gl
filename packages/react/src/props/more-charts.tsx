import { forwardRef, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import {
  boxplotSeries,
  bulletSeries,
  candlestickSeries,
  chordSeries,
  funnelSeries,
  heatmapSeries,
  mapSeries,
  morphSeries,
  type MorphSeriesOptions,
  radarSeries,
  radialBarSeries,
  radialLineSeries,
  type RadialLineSeriesOptions,
  rangeBarSeries,
  sankeySeries,
  sunburstSeries,
  treemapSeries,
  vennSeries,
  waterfallSeries,
  type AxisOptions,
  type BoxplotSeriesOptions,
  type BulletSeriesOptions,
  type CandlestickSeriesOptions,
  type ChartOptions,
  type ChordSeriesOptions,
  type FunnelSeriesOptions,
  type HeatmapSeriesOptions,
  type LegendOptions,
  type MapSeriesOptions,
  type RadarSeriesOptions,
  type RadialBarSeriesOptions,
  type RangeBarSeriesOptions,
  type SankeySeriesOptions,
  type SeriesDefinition,
  type SunburstSeriesOptions,
  type TreemapSeriesOptions,
  type VennSeriesOptions,
  type WaterfallSeriesOptions,
} from '@rsc-gl/core';
import { GLChart, type ChartHandle } from '../GLChart';
import { commonOptions, withPlugins, type CommonChartProps } from './common';

type NoType<T> = Omit<T, 'type'>;

interface FactoryConfig<P> {
  legend?: boolean | LegendOptions;
  axes?: (p: P) => { xAxis?: AxisOptions[]; yAxis?: AxisOptions[] };
  /** Charts without axes hide the grid. */
  noGrid?: boolean;
}

/**
 * Builds a props-driven chart component for one series type. Each component
 * registers only its own series definition, so unused types are tree-shaken.
 */
function seriesChart<O extends { type: string }>(def: SeriesDefinition<any>, displayName: string, cfg: FactoryConfig<CommonChartProps & { series: NoType<O>[] }> = {}) {
  const TYPES = [def];
  const C = forwardRef<ChartHandle, CommonChartProps & { series: NoType<O>[] }>(function SeriesChart(p, ref) {
    const axes = cfg.axes?.(p) ?? {};
    const options: ChartOptions = {
      ...commonOptions(p, { legend: true }),
      legend: p.hideLegend ? false : (p.legend ?? cfg.legend ?? true),
      xAxis: p.xAxis ?? axes.xAxis,
      yAxis: p.yAxis ?? axes.yAxis,
      grid: p.grid ?? (cfg.noGrid ? { horizontal: false, vertical: false } : undefined),
      series: p.series.map((s) => ({ ...s, type: def.type }) as never),
    };
    return (
      <GLChart
        ref={ref}
        options={options}
        seriesTypes={TYPES}
        width={p.width}
        height={p.height}
        className={p.className}
        style={p.style}
        renderTooltip={p.renderTooltip} slots={p.slots} slotProps={p.slotProps} serverSvg={p.serverSvg}
        onBackend={p.onBackend}
        plugins={withPlugins(options, p.plugins)}
      >
        {p.children}
      </GLChart>
    );
  });
  C.displayName = displayName;
  return C as ForwardRefExoticComponent<CommonChartProps & { series: NoType<O>[] } & RefAttributes<ChartHandle>>;
}

/* Cartesian */
export const HeatmapChart = /*#__PURE__*/ seriesChart<HeatmapSeriesOptions>(heatmapSeries, 'HeatmapChart', {
  legend: { position: 'right' },
  axes: () => ({ xAxis: [{ disableTicks: true }], yAxis: [{ disableTicks: true, disableLine: true }] }),
  noGrid: true,
});
export const CandlestickChart = /*#__PURE__*/ seriesChart<CandlestickSeriesOptions>(candlestickSeries, 'CandlestickChart', { legend: false });
export const RangeBarChart = /*#__PURE__*/ seriesChart<RangeBarSeriesOptions>(rangeBarSeries, 'RangeBarChart');
/** Gantt timelines: horizontal range bars on a time axis. */
export const GanttChart = /*#__PURE__*/ forwardRef<ChartHandle, CommonChartProps & { series: NoType<RangeBarSeriesOptions>[] }>(function GanttChart(p, ref) {
  return <RangeBarChart ref={ref} {...p} hideLegend={p.hideLegend ?? true} grid={p.grid ?? { vertical: true }} series={p.series.map((s) => ({ layout: 'horizontal', showLabels: true, ...s }))} />;
});
export const WaterfallChart = /*#__PURE__*/ seriesChart<WaterfallSeriesOptions>(waterfallSeries, 'WaterfallChart', { legend: false });
export const BoxplotChart = /*#__PURE__*/ seriesChart<BoxplotSeriesOptions>(boxplotSeries, 'BoxplotChart');

/* Standalone layouts */
export const FunnelChart = /*#__PURE__*/ seriesChart<FunnelSeriesOptions>(funnelSeries, 'FunnelChart', { legend: { position: 'right' }, noGrid: true });
export const TreemapChart = /*#__PURE__*/ seriesChart<TreemapSeriesOptions>(treemapSeries, 'TreemapChart', { legend: { position: 'bottom' }, noGrid: true });
export const SankeyChart = /*#__PURE__*/ seriesChart<SankeySeriesOptions>(sankeySeries, 'SankeyChart', { legend: false, noGrid: true });
export const VennChart = /*#__PURE__*/ seriesChart<VennSeriesOptions>(vennSeries, 'VennChart', { noGrid: true });
export const BulletChart = /*#__PURE__*/ seriesChart<BulletSeriesOptions>(bulletSeries, 'BulletChart', { legend: false, noGrid: true });

/* Polar */
export const RadarChart = /*#__PURE__*/ seriesChart<RadarSeriesOptions>(radarSeries, 'RadarChart', { noGrid: true });
export const SunburstChart = /*#__PURE__*/ seriesChart<SunburstSeriesOptions>(sunburstSeries, 'SunburstChart', { legend: { position: 'right' }, noGrid: true });
export const ChordChart = /*#__PURE__*/ seriesChart<ChordSeriesOptions>(chordSeries, 'ChordChart', { legend: { position: 'right' }, noGrid: true });
export const RadialBarChart = /*#__PURE__*/ seriesChart<RadialBarSeriesOptions>(radialBarSeries, 'RadialBarChart', { legend: { position: 'right' }, noGrid: true });
export const MapChart = /*#__PURE__*/ seriesChart<MapSeriesOptions>(mapSeries, 'MapChart', { legend: { position: 'bottom' }, noGrid: true });

/** Bar, pie, donut and radial layouts of the same data; switching morphs the shapes on the GPU. */
export const MorphChart = /*#__PURE__*/ seriesChart<MorphSeriesOptions>(morphSeries, 'MorphChart', { legend: false, noGrid: true });

/** Lines and areas in polar coordinates (categorical or continuous angles, spirals). */
export const RadialLineChart = /*#__PURE__*/ seriesChart<RadialLineSeriesOptions>(radialLineSeries, 'RadialLineChart', { legend: { position: 'bottom' }, noGrid: true });
