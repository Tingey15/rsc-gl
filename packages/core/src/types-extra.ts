import type { BaseSeriesOptions, ColorInput, Datum } from './types';
import type { NumberFormat } from './format/format';

/* ---------------------------------------------------------------- cartesian */

export interface HeatmapSeriesOptions extends BaseSeriesOptions {
  type: 'heatmap';
  /** Field names (rows) — tuples `[x, y, value]` are accepted too. */
  xField?: string;
  yField?: string;
  valueField?: string;
  /** Sequential / diverging scheme name (e.g. 'viridis', 'redBlue'). */
  colorScheme?: string;
  /** Piecewise color map: values below each threshold get its color. */
  thresholds?: { value: number; color: ColorInput }[];
  /** Domain for the continuous color map (defaults to the data extent). */
  colorDomain?: [number, number];
  cellGap?: number;
  borderRadius?: number;
  showValues?: boolean;
}

export interface CandlestickSeriesOptions extends BaseSeriesOptions {
  type: 'candlestick';
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  upColor?: ColorInput;
  downColor?: ColorInput;
  /** Body width as a fraction of the band. */
  bodyWidth?: number;
  /** 'candle' (filled bodies) or 'ohlc' (bars with open / close ticks). */
  style?: 'candle' | 'ohlc';
  /** Field with traded volume; drawn as bars along the bottom of the plot. */
  volume?: string;
  /** Fraction of the plot height used by volume bars. Default 0.2. */
  volumeHeight?: number;
  /** Dashed line at the last close with a price badge on the right edge. */
  lastPrice?: boolean | { color?: ColorInput; format?: (v: number) => string };
}

export interface RangeBarSeriesOptions extends BaseSeriesOptions {
  type: 'rangeBar';
  start?: string;
  end?: string;
  /** 'horizontal' gives Gantt-style timelines. */
  layout?: 'vertical' | 'horizontal';
  borderRadius?: number;
  /** Optional progress field (0..1) drawn as an inner bar (Gantt). */
  progressField?: string;
  showLabels?: boolean;
}

export interface WaterfallSeriesOptions extends BaseSeriesOptions {
  type: 'waterfall';
  /** Rows whose field is truthy are drawn as totals (from zero). */
  totalField?: string;
  upColor?: ColorInput;
  downColor?: ColorInput;
  totalColor?: ColorInput;
  connectors?: boolean;
  borderRadius?: number;
  showValues?: boolean;
}

export interface BoxplotSeriesOptions extends BaseSeriesOptions {
  type: 'boxplot';
  /** 'iqr' uses 1.5×IQR whiskers with outliers; 'minmax' spans all values. */
  whiskers?: 'iqr' | 'minmax';
  showOutliers?: boolean;
  boxWidth?: number;
}

/* ---------------------------------------------------------------- standalone layouts */

export interface FunnelSeriesOptions extends BaseSeriesOptions {
  type: 'funnel';
  /** 'funnel' narrows to the last value, 'pyramid' is triangular. */
  variant?: 'funnel' | 'pyramid';
  /** Gap between sections (px). */
  gap?: number;
  orientation?: 'vertical' | 'horizontal';
  /** Label inside each section: value, percent of first, or label. */
  sectionLabel?: 'value' | 'percent' | 'label' | false;
}

export interface TreemapNode {
  name: string;
  value?: number;
  children?: TreemapNode[];
  color?: ColorInput;
  [key: string]: unknown;
}

export interface TreemapSeriesOptions extends BaseSeriesOptions {
  type: 'treemap';
  root?: TreemapNode;
  tile?: 'squarify' | 'binary' | 'slice' | 'dice' | 'sliceDice';
  padding?: number;
  /** Depth of nodes that are drawn (1 = top level children). */
  depth?: number;
  showLabels?: boolean;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  color?: 'source' | 'target' | ColorInput;
}

export interface SankeySeriesOptions extends BaseSeriesOptions {
  type: 'sankey';
  links?: SankeyLink[];
  nodes?: { id: string; label?: string; color?: ColorInput }[];
  nodeWidth?: number;
  nodePadding?: number;
  align?: 'justify' | 'left' | 'right' | 'center';
  linkOpacity?: number;
}

export interface VennSet {
  sets: string[];
  size: number;
  label?: string;
}

export interface VennSeriesOptions extends BaseSeriesOptions {
  type: 'venn';
  sets?: VennSet[];
  /** Rows (with `setsField` / `metric` / `labelField`) instead of `sets`. */
  data?: Datum[];
  /** Row field holding the sets array. Default 'sets'. */
  setsField?: string;
  /** Row field holding each region's label. Default 'label'. */
  labelField?: string;
  /** Degrees clockwise of the second circle from the first, or the legacy '0deg' … '270deg'. */
  orientation?: number | '0deg' | '90deg' | '180deg' | '270deg';
}

export interface BulletSeriesOptions extends BaseSeriesOptions {
  type: 'bullet';
  /** Rows: { label, value, target, max?, thresholds? }. */
  data?: Datum[];
  labelField?: string;
  targetField?: string;
  maxValue?: number;
  /** `{ value, color }` (upper bound) or the legacy `{ thresholdMin?, thresholdMax?, fill }`. */
  thresholds?: ({ value: number; color: ColorInput } | { thresholdMin?: number; thresholdMax?: number; fill?: ColorInput })[];
  numberFormat?: NumberFormat;
  /** Shared scale: 'normal' fits the data, 'fixed' uses `maxScaleValue`, 'flexible' grows past it. Unset: each row on its own. */
  scaleType?: 'normal' | 'fixed' | 'flexible';
  maxScaleValue?: number;
  showTarget?: boolean;
  showTargetValue?: boolean;
  /** Colors the bar with the threshold band its value falls in. */
  thresholdBarColor?: boolean;
  direction?: 'column' | 'row';
  labelPosition?: 'top' | 'side';
  track?: boolean;
  metricLabel?: string;
  targetLabel?: string;
}

/* ---------------------------------------------------------------- polar */

export interface RadarSeriesOptions extends BaseSeriesOptions {
  type: 'radar';
  /** Metric names (axes) in order; values read from rows by name. */
  metrics?: string[];
  /** Max per metric (defaults to the max across series). */
  max?: number | Record<string, number>;
  fillArea?: boolean;
  showMarks?: boolean;
  shape?: 'circular' | 'sharp';
  divisions?: number;
}

export interface SunburstSeriesOptions extends BaseSeriesOptions {
  type: 'sunburst';
  root?: TreemapNode;
  innerRadius?: number | string;
  cornerRadius?: number;
  showLabels?: boolean;
}

export interface ChordSeriesOptions extends BaseSeriesOptions {
  type: 'chord';
  /** Square matrix of flows; matrix[i][j] = flow from i to j. */
  matrix?: number[][];
  names?: string[];
  padAngle?: number;
  ribbonOpacity?: number;
}

export interface RadialBarSeriesOptions extends BaseSeriesOptions {
  type: 'radialBar';
  innerRadius?: number | string;
  /** Degrees. */
  startAngle?: number;
  endAngle?: number;
  maxValue?: number;
  cornerRadius?: number;
  track?: boolean;
}

export interface MapRegion {
  id: string;
  name?: string;
  value?: number;
  [key: string]: unknown;
}

export interface MapSeriesOptions extends BaseSeriesOptions {
  type: 'map';
  /** GeoJSON FeatureCollection. */
  geoJson?: { type: 'FeatureCollection'; features: unknown[] };
  /** Property used as region id. */
  idProperty?: string;
  regions?: MapRegion[];
  projection?: 'equalEarth' | 'mercator' | 'naturalEarth1' | 'equirectangular' | 'albersUsa' | 'orthographic';
  colorScheme?: string;
  unknownColor?: ColorInput;
  strokeColor?: ColorInput;
  /** Orthographic rotation [lambda, phi] in degrees. */
  rotate?: [number, number];
}
