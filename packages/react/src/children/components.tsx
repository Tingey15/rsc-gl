import type { ReactElement, ReactNode } from 'react';
import type { AxisAnnotation as AxisAnnotationSpec, AxisGroupLevel, CurveType, Datum, LineType, LineWidth, NumberFormat, SymbolShape, SymbolSize, TimeGranularity, ToolbarOptions } from '@rsc-gl/core';
export type { NumberFormat };

/**
 * Spec components. They render nothing; `<Chart>` reads their props and
 * compiles them into one engine spec. Wrap them only in fragments (custom
 * wrapper components are not traversed).
 */

type Facet<T = string> = string | { value: T };

export interface BarProps {
  name?: string;
  dimension?: string;
  metric?: string;
  /** Data key to split series by color, or a static color `{ value: '#f00' }`. */
  color?: Facet;
  /** Field holding a CSS color per row. */
  colorOverride?: string;
  type?: 'stacked' | 'dodged';
  orientation?: 'vertical' | 'horizontal';
  paddingRatio?: number;
  groupedPadding?: number;
  hasSquareCorners?: boolean;
  opacity?: number;
  lineWidth?: number;
  dimensionDataType?: 'time' | 'string';
  /** Shows the value next to each bar. */
  showValues?: boolean;
  /** Data key that splits the chart into small multiples (one panel per value). */
  trellis?: string;
  /** Panels side by side ('horizontal') or stacked ('vertical'). Default 'horizontal'. */
  trellisOrientation?: 'horizontal' | 'vertical';
  /** Panels per row (overrides the orientation). */
  trellisColumns?: number;
  /** Gap between panels as a ratio of panel size. Default 0.04. */
  trellisPadding?: number;
  onClick?: (datum: Datum) => void;
  onContextMenu?: (event: MouseEvent, datum: Datum) => void;
  children?: ReactNode;
}

export interface LineProps {
  name?: string;
  dimension?: string;
  metric?: string;
  color?: Facet;
  lineType?: Facet<LineType>;
  lineWidth?: LineWidth;
  opacity?: number;
  scaleType?: 'time' | 'linear' | 'point';
  interpolate?: CurveType | 'monotone' | 'catmull-rom' | 'step-after' | 'step-before' | 'cardinal' | 'basis';
  staticPoint?: boolean;
  pointSize?: SymbolSize;
  gradient?: boolean;
  /** Field marking rows drawn with the alternate (dotted) pattern. */
  alternateSegmentKey?: string;
  /** Data key that splits the chart into small multiples (one panel per value). */
  trellis?: string;
  /** Panels side by side ('horizontal') or stacked ('vertical'). Default 'horizontal'. */
  trellisOrientation?: 'horizontal' | 'vertical';
  /** Panels per row (overrides the orientation). */
  trellisColumns?: number;
  /** Gap between panels as a ratio of panel size. Default 0.04. */
  trellisPadding?: number;
  onClick?: (datum: Datum) => void;
  children?: ReactNode;
}

export interface AreaProps {
  /** Data key that splits the chart into small multiples (one panel per value). */
  trellis?: string;
  /** Panels side by side ('horizontal') or stacked ('vertical'). Default 'horizontal'. */
  trellisOrientation?: 'horizontal' | 'vertical';
  /** Panels per row (overrides the orientation). */
  trellisColumns?: number;
  /** Gap between panels as a ratio of panel size. Default 0.04. */
  trellisPadding?: number;
  name?: string;
  dimension?: string;
  metric?: string;
  metricStart?: string;
  metricEnd?: string;
  color?: Facet;
  opacity?: number;
  scaleType?: 'time' | 'linear' | 'point';
  interpolate?: LineProps['interpolate'];
  children?: ReactNode;
}

export interface ScatterProps {
  /** Data key that splits the chart into small multiples (one panel per value). */
  trellis?: string;
  /** Panels side by side ('horizontal') or stacked ('vertical'). Default 'horizontal'. */
  trellisOrientation?: 'horizontal' | 'vertical';
  /** Panels per row (overrides the orientation). */
  trellisColumns?: number;
  /** Gap between panels as a ratio of panel size. Default 0.04. */
  trellisPadding?: number;
  name?: string;
  dimension?: string;
  metric?: string;
  color?: Facet;
  colorScaleType?: 'linear' | 'ordinal';
  colorScheme?: string;
  size?: Facet<SymbolSize>;
  symbolShape?: SymbolShape;
  opacity?: number;
  lineWidth?: number;
  onClick?: (datum: Datum) => void;
  children?: ReactNode;
}

export interface DonutProps {
  name?: string;
  metric?: string;
  color?: string;
  holeRatio?: number;
  /** Radians. */
  startAngle?: number;
  isBoolean?: boolean;
  sortOrder?: 'valueDescending' | 'data';
  variant?: 'circle' | 'semicircle';
  onClick?: (datum: Datum) => void;
  children?: ReactNode;
}

export interface AxisProps {
  position: 'top' | 'bottom' | 'left' | 'right';
  name?: string;
  title?: string | string[];
  grid?: boolean;
  ticks?: boolean;
  baseline?: boolean;
  labelFormat?: 'linear' | 'percentage' | 'duration' | 'time';
  granularity?: TimeGranularity;
  numberFormat?: NumberFormat;
  labelOrientation?: 'horizontal' | 'vertical';
  labelLimit?: number;
  truncateLabels?: boolean;
  range?: [number, number];
  tickCountLimit?: number;
  hideDefaultLabels?: boolean;
  /** Enables wheel / drag zoom (continuous axes). */
  zoom?: boolean;
  /** Multi-level category labels (see also `AxisGroup`). */
  groups?: AxisGroupLevel[];
  children?: ReactNode;
}

/** Event markers / spans in a lane along the parent `Axis`. */
export interface AxisAnnotationProps {
  /** Explicit annotations. */
  annotations?: AxisAnnotationSpec[];
  /**
   * Data key holding annotation text. Each row with a value becomes a marker
   * at the row's dimension value.
   */
  dataKey?: string;
  /** Data key of the position (defaults to the chart's dimension). */
  dimension?: string;
  color?: string;
  icon?: AxisAnnotationSpec['icon'];
  /** 'span' draws every annotation; 'summary' shows one badge with a count. */
  format?: 'span' | 'summary';
}

/** Images next to the ticks of the parent `Axis`. */
export interface AxisThumbnailProps {
  /** Data key holding an image URL per category. */
  urlKey?: string;
  /** Data key of the category (defaults to the chart's dimension). */
  dimension?: string;
  getUrl?: (value: unknown) => string | undefined;
  size?: number;
  radius?: number;
  hideLabel?: boolean;
}

/** One level of grouped category labels on the parent `Axis`. */
export interface AxisGroupProps {
  /** Data key holding the group of each category. */
  dataKey: string;
  /** Data key of the category (defaults to the chart's dimension). */
  dimension?: string;
}

/** A labelled callout on a point of the parent `Line` (or `Bar` / `Area`). */
export interface LinePointAnnotationProps {
  /** Dimension value to annotate, or 'first' / 'last' / 'max' / 'min'. */
  dimensionValue: unknown;
  /** Color facet value when the mark is split into several series. */
  series?: string;
  label?: string | ((value: number) => string);
  anchor?: 'top' | 'bottom' | 'left' | 'right';
  color?: string;
  offset?: number;
}

/** Labels next to points of the parent `Scatter`. */
export interface ScatterAnnotationProps {
  /** Data key shown as the label. */
  textKey: string;
  position?: 'right' | 'left' | 'top' | 'bottom';
}

/** Lines connecting points of the parent `Scatter`. */
export interface ScatterPathProps {
  /** Data key that splits points into separate paths. */
  groupBy?: string;
  order?: 'data' | 'x';
  color?: string;
  pathWidth?: number;
  opacity?: number;
  lineType?: LineType;
}

/** Toolbar (zoom, downloads, print, full screen). */
export type ChartToolbarProps = ToolbarOptions;

export interface ChartAction {
  label: string;
  /** Optional icon element. */
  icon?: ReactNode;
  onAction: (datum: Datum) => void;
}

/** Actions shown next to a mark after it is clicked (Esc or outside click closes). */
export interface ChartActionBarProps {
  actions: ChartAction[];
}

export interface ReferenceLineProps {
  value: number | string;
  color?: string;
  lineType?: LineType;
  label?: string;
  labelPosition?: 'start' | 'end' | 'axis';
  layer?: 'back' | 'front';
}

export interface LegendProps {
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'middle' | 'end';
  title?: string;
  isToggleable?: boolean;
  highlight?: boolean;
  legendLabels?: { seriesName: string; label: string }[];
  hiddenEntries?: string[];
  descriptions?: { seriesName: string; description: string }[];
  onClick?: (seriesName: string) => void;
}

export interface ChartTooltipProps {
  children?: (datum: Datum) => ReactNode;
  highlightBy?: 'item' | 'series' | 'dimension';
  excludeDataKeys?: string[];
}

export interface ChartPopoverProps {
  children?: (datum: Datum, close: () => void) => ReactNode;
  width?: number | 'auto';
  rightClick?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface TitleProps {
  text: string;
  position?: 'start' | 'middle' | 'end';
}

export interface DonutSummaryProps {
  label?: string;
  numberFormat?: NumberFormat;
  hideValue?: boolean;
}

export interface SegmentLabelProps {
  percent?: boolean;
  value?: boolean;
  valueFormat?: NumberFormat;
}

export interface ComboProps {
  dimension?: string;
  children?: ReactNode;
}

export interface BigNumberProps {
  dataKey: string;
  label: string;
  method?: 'sum' | 'avg' | 'last';
  numberFormat?: NumberFormat;
  orientation?: 'vertical' | 'horizontal';
  icon?: ReactElement;
  children?: ReactNode;
}

export interface TrendlineProps {
  method?: 'linear' | 'average' | 'median' | 'exponential' | 'logarithmic' | 'power' | 'quadratic' | `polynomial-${number}` | `movingAverage-${number}`;
  color?: string;
  lineType?: LineType;
  lineWidth?: number;
  opacity?: number;
  /** Extend across the whole dimension domain. */
  dimensionExtent?: 'domain';
  displayOnHover?: boolean;
}

export interface MetricRangeProps {
  metricStart: string;
  metricEnd: string;
  color?: string;
  lineType?: LineType;
  rangeOpacity?: number;
  displayOnHover?: boolean;
}

export interface BulletProps {
  dimension?: string;
  metric?: string;
  target?: string;
  maxScaleValue?: number;
  thresholds?: { thresholdMax: number; fill: string }[];
  color?: string;
  numberFormat?: NumberFormat;
}

export interface VennProps {
  metric?: string;
  /** Field holding the sets array. */
  setsKey?: string;
  label?: string;
}

type Kind =
  | 'bar'
  | 'line'
  | 'area'
  | 'scatter'
  | 'donut'
  | 'axis'
  | 'referenceLine'
  | 'legend'
  | 'tooltip'
  | 'popover'
  | 'title'
  | 'donutSummary'
  | 'segmentLabel'
  | 'combo'
  | 'bigNumber'
  | 'trendline'
  | 'metricRange'
  | 'bullet'
  | 'venn'
  | 'axisAnnotation'
  | 'axisThumbnail'
  | 'axisGroup'
  | 'linePointAnnotation'
  | 'scatterAnnotation'
  | 'scatterPath'
  | 'toolbar'
  | 'actionBar';

function spec<P>(kind: Kind, displayName: string) {
  const C = ((_: P) => null) as ((props: P) => null) & { rglKind: Kind; displayName: string };
  C.rglKind = kind;
  C.displayName = displayName;
  return C;
}

export const Bar = /*#__PURE__*/ spec<BarProps>('bar', 'Bar');
export const Line = /*#__PURE__*/ spec<LineProps>('line', 'Line');
export const Area = /*#__PURE__*/ spec<AreaProps>('area', 'Area');
export const Scatter = /*#__PURE__*/ spec<ScatterProps>('scatter', 'Scatter');
export const Donut = /*#__PURE__*/ spec<DonutProps>('donut', 'Donut');
export const Axis = /*#__PURE__*/ spec<AxisProps>('axis', 'Axis');
export const ReferenceLine = /*#__PURE__*/ spec<ReferenceLineProps>('referenceLine', 'ReferenceLine');
export const Legend = /*#__PURE__*/ spec<LegendProps>('legend', 'Legend');
export const ChartTooltip = /*#__PURE__*/ spec<ChartTooltipProps>('tooltip', 'ChartTooltip');
export const ChartPopover = /*#__PURE__*/ spec<ChartPopoverProps>('popover', 'ChartPopover');
export const Title = /*#__PURE__*/ spec<TitleProps>('title', 'Title');
export const DonutSummary = /*#__PURE__*/ spec<DonutSummaryProps>('donutSummary', 'DonutSummary');
export const SegmentLabel = /*#__PURE__*/ spec<SegmentLabelProps>('segmentLabel', 'SegmentLabel');
export const Combo = /*#__PURE__*/ spec<ComboProps>('combo', 'Combo');
export const BigNumber = /*#__PURE__*/ spec<BigNumberProps>('bigNumber', 'BigNumber');
export const Trendline = /*#__PURE__*/ spec<TrendlineProps>('trendline', 'Trendline');
export const MetricRange = /*#__PURE__*/ spec<MetricRangeProps>('metricRange', 'MetricRange');
export const Bullet = /*#__PURE__*/ spec<BulletProps>('bullet', 'Bullet');
export const Venn = /*#__PURE__*/ spec<VennProps>('venn', 'Venn');
export const AxisAnnotation = /*#__PURE__*/ spec<AxisAnnotationProps>('axisAnnotation', 'AxisAnnotation');
export const AxisThumbnail = /*#__PURE__*/ spec<AxisThumbnailProps>('axisThumbnail', 'AxisThumbnail');
export const AxisGroup = /*#__PURE__*/ spec<AxisGroupProps>('axisGroup', 'AxisGroup');
export const LinePointAnnotation = /*#__PURE__*/ spec<LinePointAnnotationProps>('linePointAnnotation', 'LinePointAnnotation');
export const ScatterAnnotation = /*#__PURE__*/ spec<ScatterAnnotationProps>('scatterAnnotation', 'ScatterAnnotation');
export const ScatterPath = /*#__PURE__*/ spec<ScatterPathProps>('scatterPath', 'ScatterPath');
export const ChartToolbar = /*#__PURE__*/ spec<ChartToolbarProps>('toolbar', 'ChartToolbar');
export const ChartActionBar = /*#__PURE__*/ spec<ChartActionBarProps>('actionBar', 'ChartActionBar');

export const kindOf = (el: unknown): Kind | undefined =>
  el && typeof el === 'object' && 'type' in el ? ((el as { type: { rglKind?: Kind } }).type?.rglKind ?? undefined) : undefined;
