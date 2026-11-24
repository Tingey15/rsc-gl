import type { ReactElement, ReactNode } from 'react';
import type { AxisAnnotation as AxisAnnotationSpec, AxisGroupLevel, CurveType, Datum, LineType, LineWidth, NumberFormat, SymbolShape, SymbolSize, TimeGranularity, ToolbarOptions } from '@rsc-gl/core';
export type { NumberFormat };

/**
 * Spec components. They render nothing; `<Chart>` reads their props and
 * compiles them into one engine spec. Wrap them only in fragments (custom
 * wrapper components are not traversed).
 */

type Facet<T = string> = string | { value: T };

/** Pointer callbacks shared by the marks. */
interface MarkEvents {
  onClick?: (datum: Datum) => void;
  onContextMenu?: (event: MouseEvent, datum: Datum) => void;
  /** The pointer moved onto an item of this mark. */
  onMouseOver?: (datum: Datum) => void;
  /** The pointer left the item it was over. */
  onMouseOut?: (datum: Datum) => void;
}

/** Small-multiple layout shared by the cartesian marks. */
interface TrellisProps {
  /** Data key that splits the chart into small multiples (one panel per value). */
  trellis?: string;
  /** Panels side by side ('horizontal') or stacked ('vertical'). Default 'horizontal'. */
  trellisOrientation?: 'horizontal' | 'vertical';
  /** Panels per row (overrides the orientation). */
  trellisColumns?: number;
  /** Gap between panels as a ratio of panel size. Default 0.04. */
  trellisPadding?: number;
}

export interface BarProps extends MarkEvents, TrellisProps {
  name?: string;
  dimension?: string;
  metric?: string;
  /** Data key to split series by color, or a static color `{ value: '#f00' }`. Default: one static color. */
  color?: Facet;
  /** Field holding a CSS color per row. */
  colorOverride?: string;
  type?: 'stacked' | 'dodged';
  orientation?: 'vertical' | 'horizontal';
  /** Gap between categories as a share of each category's slot. Default 0.4. */
  paddingRatio?: number;
  /** Space before the first and after the last category, as a share of a slot. */
  paddingOuter?: number;
  /** Gap between dodged bars as a share of their slot. Default `paddingRatio`. */
  groupedPadding?: number;
  hasSquareCorners?: boolean;
  opacity?: number;
  /** Border width in px (drawn in the bar's color). */
  lineWidth?: number;
  /** 'time' formats numeric categories as dates. */
  dimensionDataType?: 'time' | 'string';
  /** Data key that orders the segments of a stack. */
  order?: string;
  /** Name of the `Axis` the values are drawn against (secondary metric axis). */
  metricAxis?: string;
  /** Draws the last series against a second metric axis on the right. */
  dualMetricAxis?: boolean;
  /** Shows the value next to each bar. */
  showValues?: boolean;
  children?: ReactNode;
}

export interface LineProps extends MarkEvents, TrellisProps {
  name?: string;
  dimension?: string;
  metric?: string;
  /** Data key to split series by color, or a static color. Default: one static color. */
  color?: Facet;
  lineType?: Facet<LineType>;
  lineWidth?: LineWidth;
  opacity?: number;
  scaleType?: 'time' | 'linear' | 'point';
  interpolate?: CurveType | 'monotone' | 'catmull-rom' | 'step-after' | 'step-before' | 'cardinal' | 'basis';
  /** `true` marks every point; a data key marks the rows where it is truthy. */
  staticPoint?: boolean | string;
  /** Marker size: a token ('S', 'M', …) or an area in px² (as in the legacy library, default 125). */
  pointSize?: SymbolSize;
  /** Sparkline styling (thin line, no hover dot). */
  isSparkline?: boolean;
  /** With `isSparkline`: a point on the last value. */
  isMethodLast?: boolean;
  gradient?: boolean;
  /** Field marking rows drawn with the alternate (dotted) pattern. */
  alternateSegmentKey?: string;
  /** Dash pattern of the alternate segments. Default 'dotted'. */
  alternateSegmentLineType?: LineType;
  /** Name of the `Axis` the values are drawn against (secondary metric axis). */
  metricAxis?: string;
  /** Draws the last series against a second metric axis on the right. */
  dualMetricAxis?: boolean;
  children?: ReactNode;
}

export interface AreaProps extends MarkEvents, TrellisProps {
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

export interface ScatterProps extends MarkEvents, TrellisProps {
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
  /** Outline color of the points. */
  stroke?: string;
  children?: ReactNode;
}

export interface DonutProps extends MarkEvents {
  name?: string;
  metric?: string;
  color?: string;
  holeRatio?: number;
  /** Radians. */
  startAngle?: number;
  isBoolean?: boolean;
  sortOrder?: 'valueDescending' | 'data';
  variant?: 'circle' | 'semicircle';
  children?: ReactNode;
}

/** An explicit tick: its value, optionally with its own text, alignment and weight. */
export interface AxisLabel {
  value: string | number;
  label?: string;
  align?: 'start' | 'center' | 'end';
  fontWeight?: 'normal' | 'bold' | number;
}

/** A second label line under the tick with the same value. */
export interface AxisSubLabel {
  value: string | number;
  subLabel: string;
  align?: 'start' | 'center' | 'end';
  fontWeight?: 'normal' | 'bold' | number;
}

export interface AxisProps {
  position: 'top' | 'bottom' | 'left' | 'right';
  name?: string;
  /** Axis title; an array draws one line per entry. */
  title?: string | string[];
  grid?: boolean;
  ticks?: boolean;
  /** Draws the axis line (off by default, as in the legacy library). */
  baseline?: boolean;
  labelFormat?: 'linear' | 'percentage' | 'duration' | 'time';
  granularity?: TimeGranularity;
  /** Default 'shortNumber'. */
  numberFormat?: NumberFormat;
  /** Currency for the currency number formats, e.g. 'EUR'. */
  currencyCode?: string;
  /** Locale used to place the currency symbol, e.g. 'de-DE'. */
  currencyLocale?: string;
  labelOrientation?: 'horizontal' | 'vertical';
  labelAlign?: 'start' | 'center' | 'end';
  labelFontWeight?: 'normal' | 'bold' | number;
  labelLimit?: number;
  /** Truncates category labels to the width of their band. */
  truncateLabels?: boolean;
  /** Only these ticks, with optional text and styling. */
  labels?: (AxisLabel | string | number)[];
  subLabels?: AxisSubLabel[];
  range?: [number, number];
  /** Upper limit on the number of ticks. */
  tickCountLimit?: number;
  /** Lower limit on the number of ticks. */
  tickCountMinimum?: number;
  /** Smallest step between two ticks (numeric axes), e.g. 1 for whole numbers. */
  tickMinStep?: number;
  hideDefaultLabels?: boolean;
  /** Shows the full text of a (truncated) label on hover. */
  hasTooltip?: boolean;
  /** Called when a tick label is clicked. */
  onClick?: (value: string | number, index: number) => void;
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
  /** Data key holding an image URL per category. Default 'thumbnail'. */
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

type Anchor = 'top' | 'bottom' | 'left' | 'right';

/** A labelled callout on a point of the parent `Line` (or `Bar` / `Area`). */
export interface LinePointAnnotationProps {
  /**
   * Dimension value to annotate, or 'first' / 'last' / 'max' / 'min'. When
   * omitted, every static point of the parent line (`staticPoint`) is labelled.
   */
  dimensionValue?: unknown;
  /** Color facet value when the mark is split into several series. */
  series?: string;
  label?: string | ((value: number) => string);
  /** Data key shown as the label (default: the metric value). */
  textKey?: string;
  /** Side of the point; a list is tried in order. */
  anchor?: Anchor | Anchor[];
  /** Badge in the line's color (default) or plain text. */
  matchLineColor?: boolean;
  color?: string;
  offset?: number;
}

/** Labels next to points of the parent `Scatter`. */
export interface ScatterAnnotationProps {
  /** Data key shown as the label. Default: the metric. */
  textKey?: string;
  /** Side of the point; a list is tried in order until a label fits. */
  anchor?: Anchor | Anchor[];
  /** Alias of `anchor`. */
  position?: Anchor;
}

/** Lines connecting points of the parent `Scatter`. */
export interface ScatterPathProps {
  /** Data key(s) that split points into separate paths. */
  groupBy?: string | string[];
  order?: 'data' | 'x';
  /** Default 'gray-500'. */
  color?: string;
  pathWidth?: number;
  /** Default 0.5. */
  opacity?: number;
  lineType?: LineType;
}

/** A value badge on each bar of the parent `Bar`. */
export interface AnnotationProps {
  /** Data key shown in the badge. Default: the metric. */
  textKey?: string;
  style?: { width?: number };
}

/** Value labels on the bars of the parent `Bar`. */
export interface BarDirectLabelProps {
  position?: 'start' | 'middle' | 'end' | 'end-outside';
  /** Data key shown instead of the metric. */
  dataKey?: string;
  format?: NumberFormat;
  /** Labels that do not fit: hidden (default) or drawn past the bar. */
  overflow?: 'hide' | 'spill';
}

/** Labels at the end (or start) of each line of the parent `Line`. */
export interface LineDirectLabelProps {
  /** 'last' / 'average' value, or the series name. Default 'last'. */
  value?: 'last' | 'average' | 'series';
  position?: 'start' | 'end';
  format?: NumberFormat;
  prefix?: string;
  excludeSeries?: string[];
  fontSize?: number;
}

/** A forecast on the parent `Line`: another metric drawn dashed from `start` on, with a boundary rule. */
export interface LineForecastProps {
  metric: string;
  /** Dimension value where the forecast starts. */
  start: number | string;
  /** Text next to the boundary. Default 'Forecast'. */
  label?: string;
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
  /** 'axis' (default) draws the label outside the plot. */
  labelPosition?: 'start' | 'end' | 'axis';
  /** Default: the text color. */
  labelColor?: string;
  labelFontWeight?: 'normal' | 'bold' | number;
  /** On category axes: before, on (default) or after the category. */
  position?: 'before' | 'center' | 'after';
  layer?: 'back' | 'front';
}

export interface LegendProps {
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'middle' | 'end';
  title?: string;
  isToggleable?: boolean;
  highlight?: boolean;
  /** `maxLength` truncates the label (characters). */
  legendLabels?: { seriesName: string; label: string; maxLength?: number }[];
  hiddenEntries?: string[];
  descriptions?: { seriesName: string; description: string; title?: string }[];
  /** Series hidden at first (uncontrolled). */
  defaultHiddenSeries?: string[];
  /** Max label width in px. */
  labelLimit?: number;
  /** Max title width in px. */
  titleLimit?: number;
  onClick?: (seriesName: string) => void;
  onMouseOver?: (seriesName: string) => void;
  onMouseOut?: (seriesName: string) => void;
}

export interface ChartTooltipProps {
  children?: (datum: Datum) => ReactNode;
  /** 'dimension' groups every series at the hovered value; a key list behaves like 'item'. */
  highlightBy?: 'item' | 'series' | 'dimension' | string[];
  /** Rows where any of these keys is truthy get no tooltip and no hover highlight. */
  excludeDataKeys?: string[];
}

export interface ChartPopoverProps {
  children?: (datum: Datum, close: () => void) => ReactNode;
  /** Default 250. */
  width?: number | 'auto';
  minWidth?: number;
  maxWidth?: number;
  height?: number | 'auto';
  minHeight?: number;
  maxHeight?: number;
  /** Space kept between the popover and the chart's edges. Default 12. */
  containerPadding?: number;
  /** Inner padding. Default 12. */
  contentMargin?: number;
  rightClick?: boolean;
  /** What stays highlighted while the popover is open. Default 'item'. */
  UNSAFE_highlightBy?: 'item' | 'series' | 'dimension';
  onOpenChange?: (open: boolean) => void;
}

export interface TitleProps {
  text: string;
  /** Default 'middle'. */
  position?: 'start' | 'middle' | 'end';
  fontWeight?: 'normal' | 'bold' | number;
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
  /** Data key shown as the label. Default: the color key. */
  labelKey?: string;
  /** Number format of the percent. Default '.0%'. */
  percentFormat?: NumberFormat;
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
  /** 'percentage' formats the value as a percent. */
  numberType?: 'linear' | 'percentage';
  orientation?: 'vertical' | 'horizontal';
  icon?: ReactElement;
  children?: ReactNode;
}

export interface TrendlineProps {
  method?: 'linear' | 'average' | 'median' | 'exponential' | 'logarithmic' | 'power' | 'quadratic' | `polynomial-${number}` | `movingAverage-${number}`;
  color?: string;
  lineType?: LineType;
  /** Default 2. */
  lineWidth?: number;
  /** Default 1. */
  opacity?: number;
  /** Extend across the whole dimension domain. */
  dimensionExtent?: 'domain';
  /** Only drawn while its series is hovered. */
  displayOnHover?: boolean;
  /** Rows where any of these keys is truthy are left out of the fit. */
  excludeDataKeys?: string[];
  /** Moving averages: skip points without a full window. Default false. */
  hidePartialWindows?: boolean;
  children?: ReactNode;
}

/** A label at the end of the parent `Trendline`. */
export interface TrendlineAnnotationProps {
  /** Draws the label on a badge in the trendline's color. */
  badge?: boolean;
  numberFormat?: NumberFormat;
  prefix?: string;
}

export interface MetricRangeProps {
  metricStart: string;
  metricEnd: string;
  color?: string;
  lineType?: LineType;
  /** Width of the boundary lines. Default 1. */
  lineWidth?: number;
  lineOpacity?: number;
  rangeOpacity?: number;
  displayOnHover?: boolean;
  /** Widen the value axis to fit the range. Default false. */
  scaleAxisToFit?: boolean;
}

export interface BulletProps {
  dimension?: string;
  metric?: string;
  target?: string;
  maxScaleValue?: number;
  thresholds?: { thresholdMin?: number; thresholdMax?: number; fill?: string }[];
  color?: string;
  numberFormat?: NumberFormat;
  /** 'fixed' uses `maxScaleValue`; 'flexible' grows past it to fit the data. Default 'normal'. */
  scaleType?: 'normal' | 'fixed' | 'flexible';
  showTarget?: boolean;
  showTargetValue?: boolean;
  thresholdBarColor?: boolean;
  direction?: 'column' | 'row';
  /** Default 'top'. */
  labelPosition?: 'top' | 'side';
  /** Gray track behind the bar. Default false. */
  track?: boolean;
}

export interface VennProps {
  metric?: string;
  /** Field holding the sets array. */
  setsKey?: string;
  /** Field holding each region's label. Default 'label'. */
  label?: string;
  orientation?: '0deg' | '90deg' | '180deg' | '270deg';
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
  | 'trendlineAnnotation'
  | 'metricRange'
  | 'bullet'
  | 'venn'
  | 'axisAnnotation'
  | 'axisThumbnail'
  | 'axisGroup'
  | 'linePointAnnotation'
  | 'scatterAnnotation'
  | 'scatterPath'
  | 'annotation'
  | 'barDirectLabel'
  | 'lineDirectLabel'
  | 'lineForecast'
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
/** Same as `ChartTooltip` (the name used by the next-generation legacy package). */
export const ChartInspect = /*#__PURE__*/ spec<ChartTooltipProps>('tooltip', 'ChartInspect');
export const ChartPopover = /*#__PURE__*/ spec<ChartPopoverProps>('popover', 'ChartPopover');
export const Title = /*#__PURE__*/ spec<TitleProps>('title', 'Title');
export const DonutSummary = /*#__PURE__*/ spec<DonutSummaryProps>('donutSummary', 'DonutSummary');
export const SegmentLabel = /*#__PURE__*/ spec<SegmentLabelProps>('segmentLabel', 'SegmentLabel');
export const Combo = /*#__PURE__*/ spec<ComboProps>('combo', 'Combo');
export const BigNumber = /*#__PURE__*/ spec<BigNumberProps>('bigNumber', 'BigNumber');
export const Trendline = /*#__PURE__*/ spec<TrendlineProps>('trendline', 'Trendline');
export const TrendlineAnnotation = /*#__PURE__*/ spec<TrendlineAnnotationProps>('trendlineAnnotation', 'TrendlineAnnotation');
export const MetricRange = /*#__PURE__*/ spec<MetricRangeProps>('metricRange', 'MetricRange');
export const Bullet = /*#__PURE__*/ spec<BulletProps>('bullet', 'Bullet');
export const Venn = /*#__PURE__*/ spec<VennProps>('venn', 'Venn');
export const AxisAnnotation = /*#__PURE__*/ spec<AxisAnnotationProps>('axisAnnotation', 'AxisAnnotation');
export const AxisThumbnail = /*#__PURE__*/ spec<AxisThumbnailProps>('axisThumbnail', 'AxisThumbnail');
export const AxisGroup = /*#__PURE__*/ spec<AxisGroupProps>('axisGroup', 'AxisGroup');
export const LinePointAnnotation = /*#__PURE__*/ spec<LinePointAnnotationProps>('linePointAnnotation', 'LinePointAnnotation');
export const ScatterAnnotation = /*#__PURE__*/ spec<ScatterAnnotationProps>('scatterAnnotation', 'ScatterAnnotation');
export const ScatterPath = /*#__PURE__*/ spec<ScatterPathProps>('scatterPath', 'ScatterPath');
export const Annotation = /*#__PURE__*/ spec<AnnotationProps>('annotation', 'Annotation');
export const BarDirectLabel = /*#__PURE__*/ spec<BarDirectLabelProps>('barDirectLabel', 'BarDirectLabel');
export const LineDirectLabel = /*#__PURE__*/ spec<LineDirectLabelProps>('lineDirectLabel', 'LineDirectLabel');
export const LineForecast = /*#__PURE__*/ spec<LineForecastProps>('lineForecast', 'LineForecast');
export const ChartToolbar = /*#__PURE__*/ spec<ChartToolbarProps>('toolbar', 'ChartToolbar');
export const ChartActionBar = /*#__PURE__*/ spec<ChartActionBarProps>('actionBar', 'ChartActionBar');

export const kindOf = (el: unknown): Kind | undefined =>
  el && typeof el === 'object' && 'type' in el ? ((el as { type: { rglKind?: Kind } }).type?.rglKind ?? undefined) : undefined;

/** Placeholder shown instead of a chart when there is no data (legacy `EmptyState`). */
export function EmptyState({ height, text = 'No data found' }: { height?: number | string; text?: string }) {
  return (
    <div
      role="status"
      style={{
        height: height ?? '100%',
        minHeight: 80,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        font: '14px var(--rgl-font, Inter, system-ui, sans-serif)',
        color: 'var(--rgl-muted, #6e6e78)',
      }}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="22" width="6" height="12" rx="1" />
        <rect x="17" y="14" width="6" height="20" rx="1" />
        <rect x="28" y="6" width="6" height="28" rx="1" />
      </svg>
      <span>{text}</span>
    </div>
  );
}
