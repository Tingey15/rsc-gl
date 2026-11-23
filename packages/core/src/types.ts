import type { BackendType, GpuBackend } from '@rsc-gl/gpu';
import type { EasingName, TransitionOptions } from './animation/easing';
import type { FormatContext, LocaleOptions, NumberFormat, TimeGranularity } from './format/format';
import type { DomainLimit, DomainValue, ScaleType } from './scales/scales';
import type { ChartTheme } from './theme/theme';
import type { ColorScheme, RGBA } from './theme/colors';
import type { LineType, LineWidth, SymbolSize } from './theme/theme';
import type { SymbolShape } from './marks/point-mark';

export type Datum = Record<string, unknown>;

export type ColorInput = string;
export type PaletteInput = string | string[] | ((scheme: ColorScheme) => string[]);

export type HighlightScope = 'item' | 'series' | 'dimension' | 'none';
export type FadeScope = 'global' | 'series' | 'none';

export interface HighlightScopeOptions {
  highlight?: HighlightScope;
  fade?: FadeScope;
}

/** Identifies a highlighted / clicked / focused item. */
export interface ItemIdentifier {
  seriesId: string;
  dataIndex?: number;
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/* ----------------------------------------------------------------------------
 * Series
 * ------------------------------------------------------------------------- */

/**
 * Properties shared by all series. Data can be provided in three ways:
 *  1. `data` as an array of values aligned with the category axis `data`
 *  2. `dataKey` reading a field from the chart `dataset`
 *  3. long-format rows (`data` rows or chart-level `data`) with
 *     `dimension` / `metric` fields, optionally split into several series by
 *     `groupBy` (one series per distinct value, in order of first appearance)
 */
export interface BaseSeriesOptions {
  type: string;
  id?: string;
  label?: string;
  /** Static color (CSS color or theme token). */
  color?: ColorInput;
  /** Field holding a per-row CSS color (bypasses the palette). */
  colorField?: string;
  data?: ReadonlyArray<number | null | Datum>;
  dataKey?: string;
  dimension?: string;
  metric?: string;
  groupBy?: string | string[];
  /** Explicit palette for the groups produced by `groupBy`. */
  colors?: PaletteInput;
  xAxisId?: string;
  yAxisId?: string;
  valueFormatter?: (value: number | null, context: FormatContext) => string;
  numberFormat?: NumberFormat;
  highlightScope?: HighlightScopeOptions;
  opacity?: number;
  /** Rows / items excluded from interaction (tooltip, highlight). */
  excludeFromInteraction?: boolean;
  animation?: boolean | Partial<TransitionOptions>;
}

export interface BarSeriesOptions extends BaseSeriesOptions {
  type: 'bar';
  /** Series sharing a stack id are stacked. */
  stack?: string;
  stackOffset?: 'none' | 'diverging' | 'expand';
  /** 'horizontal' draws bars along the x axis. */
  layout?: 'vertical' | 'horizontal';
  borderRadius?: number;
  /** Round only the outer end of a bar (default) or every corner. */
  roundCorners?: 'end' | 'all';
  borderWidth?: number;
  borderColor?: ColorInput;
  minBarSize?: number;
  barLabel?: 'value' | ((item: { value: number | null; dataIndex: number; seriesId: string }) => string | null);
  barLabelPlacement?: 'center' | 'inside-end' | 'outside';
}

export type CurveType =
  | 'linear'
  | 'monotoneX'
  | 'monotoneY'
  | 'natural'
  | 'step'
  | 'stepBefore'
  | 'stepAfter'
  | 'catmullRom'
  | 'cardinal'
  | 'basis'
  | 'bumpX'
  | 'bumpY';

export interface LineSeriesOptions extends BaseSeriesOptions {
  type: 'line';
  curve?: CurveType;
  lineType?: LineType;
  lineWidth?: LineWidth;
  /** Fill below the line. `true` uses the line color at 30% opacity. */
  area?: boolean;
  /** Gradient area fill fading to transparent. */
  gradient?: boolean;
  baseline?: number | 'min' | 'max';
  stack?: string;
  showMark?: boolean | 'start' | 'end' | ((p: { index: number; value: number | null }) => boolean);
  markShape?: SymbolShape;
  markSize?: SymbolSize;
  hollowMarks?: boolean;
  connectNulls?: boolean;
  /** Field with a truthy value for points drawn with the alternate dash (e.g. forecasts). */
  alternateField?: string;
  alternateLineType?: LineType;
  /** Downsampling for dense series ('auto' = min-max above 2 points per pixel). */
  sampling?: 'none' | 'auto' | 'lttb' | 'minmax' | 'm4';
  /** Bands between two fields drawn around the line (confidence intervals, targets). */
  metricRanges?: MetricRangeOptions[];
  /** Field whose distinct values select a dash pattern from `lineTypes` (one per group). */
  lineTypeField?: string;
  lineTypes?: LineType[];
}

export interface MetricRangeOptions {
  metricStart: string;
  metricEnd: string;
  color?: ColorInput;
  lineType?: LineType;
  rangeOpacity?: number;
  /** Only show the range while its series is highlighted. */
  displayOnHover?: boolean;
}

export interface AreaSeriesOptions extends BaseSeriesOptions {
  type: 'area';
  curve?: CurveType;
  stack?: string;
  /** Floating band between two metrics (disables stacking). */
  metricStart?: string;
  metricEnd?: string;
  baseline?: number | 'min' | 'max';
  showLine?: boolean;
  lineWidth?: LineWidth;
  gradient?: boolean;
  sampling?: 'none' | 'auto' | 'lttb' | 'minmax' | 'm4';
}

export interface ScatterPoint {
  x: number;
  y: number;
  id?: string | number;
  size?: number;
  colorValue?: number;
  [key: string]: unknown;
}

export interface ScatterSeriesOptions extends BaseSeriesOptions {
  type: 'scatter';
  /** Field used for the bubble size (or `size` on point objects). */
  sizeField?: string;
  /** [min, max] pixel diameter when sized by a field. */
  sizeRange?: [number, number];
  markerSize?: SymbolSize;
  shape?: SymbolShape;
  strokeColor?: ColorInput;
  strokeWidth?: number;
  /** Continuous color by a numeric field using `colorScheme`. */
  colorValueField?: string;
  colorScheme?: string;
  /** Typed array fast path: interleaved [x0, y0, x1, y1, …]. Skips per-item transitions. */
  positions?: Float32Array | Float64Array;
}

export interface PieDatum {
  id?: string | number;
  value: number;
  label?: string;
  color?: ColorInput;
  [key: string]: unknown;
}

export interface PieSeriesOptions extends BaseSeriesOptions {
  type: 'pie';
  /** Px or percentage of the available radius, e.g. '60%'. */
  innerRadius?: number | string;
  outerRadius?: number | string;
  /** Degrees. */
  startAngle?: number;
  endAngle?: number;
  /** Degrees between slices. */
  paddingAngle?: number;
  cornerRadius?: number;
  cx?: number | string;
  cy?: number | string;
  sortingValues?: 'none' | 'asc' | 'desc';
  arcLabel?: 'value' | 'formattedValue' | 'label' | 'percent' | ((item: PieDatum & { percent: number }) => string);
  arcLabelMinAngle?: number;
  /** Content drawn in the center of a donut. */
  centerLabel?: string | ((total: number) => string);
  centerSubLabel?: string;
  hoverOffset?: number;
}

export type SeriesOptions =
  | BarSeriesOptions
  | LineSeriesOptions
  | AreaSeriesOptions
  | ScatterSeriesOptions
  | PieSeriesOptions
  | (BaseSeriesOptions & Record<string, unknown>);

/* ----------------------------------------------------------------------------
 * Axes & components
 * ------------------------------------------------------------------------- */

export type AxisPosition = 'top' | 'bottom' | 'left' | 'right' | 'none';

export interface AxisOptions {
  id?: string;
  scaleType?: ScaleType;
  /** Categories / values for ordinal axes. */
  data?: ReadonlyArray<DomainValue>;
  dataKey?: string;
  position?: AxisPosition;
  label?: string;
  min?: number | Date;
  max?: number | Date;
  reverse?: boolean;
  domainLimit?: DomainLimit;
  tickNumber?: number;
  /** Explicit tick values. */
  tickValues?: ReadonlyArray<DomainValue>;
  tickSize?: number;
  tickLabelAngle?: number;
  disableLine?: boolean;
  disableTicks?: boolean;
  hideTickLabels?: boolean;
  grid?: boolean;
  /** Draws a highlighted 0 line. */
  baseline?: boolean;
  valueFormatter?: (value: DomainValue, context: FormatContext) => string;
  numberFormat?: NumberFormat;
  labelFormat?: 'linear' | 'percentage' | 'duration' | 'time';
  granularity?: TimeGranularity;
  categoryGapRatio?: number;
  barGapRatio?: number;
  /** Max label width in px before truncation (ordinal axes). */
  labelLimit?: number;
  /** Enables wheel / drag zoom on this axis (continuous axes). */
  zoom?: boolean | { minSpan?: number; maxSpan?: number; slider?: boolean };
  /**
   * Grouped (multi-level) category labels. Each level maps a category to its
   * group; consecutive categories with the same group share one bracketed label.
   * Levels are drawn outward from the axis (ordinal axes only).
   */
  groups?: AxisGroupLevel[];
  /** Images drawn next to each tick (e.g. logos, avatars, flags). */
  thumbnails?: AxisThumbnailOptions;
  /** Event markers and spans drawn in a lane alongside the axis. */
  annotations?: AxisAnnotation[];
  /** `span` draws every annotation; `summary` collapses them into one badge. */
  annotationFormat?: 'span' | 'summary';
}

export interface AxisGroupLevel {
  /** Group key for a category. */
  getValue: (value: DomainValue, index: number) => string | number | null | undefined;
  /** Optional label formatter for the group key. */
  format?: (group: string) => string;
}

export interface AxisThumbnailOptions {
  /** Image URL for a tick value (undefined draws nothing). */
  url: (value: DomainValue, index: number) => string | undefined;
  /** Box size in px. Default 24. */
  size?: number;
  /** Corner radius in px (use size / 2 for circles). Default 4. */
  radius?: number;
  /** Hides the text label and shows only the image. */
  hideLabel?: boolean;
}

export interface AxisAnnotation {
  id?: string;
  /** Single position (draws a marker). */
  value?: DomainValue;
  /** Span start / end (draws a bar). */
  start?: DomainValue;
  end?: DomainValue;
  label?: string;
  /** Longer text shown in the tooltip. */
  description?: string;
  color?: ColorInput;
  icon?: 'dot' | 'flag' | 'diamond' | 'triangle' | 'star';
}

/** A labelled callout attached to a data point. */
export interface PointAnnotationOptions {
  /** x value (category, number or date). */
  x: DomainValue;
  /** y value; when omitted it is read from `seriesId` at `x`. */
  y?: number;
  seriesId?: string;
  label: string;
  color?: ColorInput;
  /** Side of the point the label sits on. Default 'top'. */
  anchor?: 'top' | 'bottom' | 'left' | 'right';
  /** Leader line length in px. Default 26. */
  offset?: number;
  /** Draws a ring around the point. Default true. */
  marker?: boolean;
  xAxisId?: string;
  yAxisId?: string;
}

/** Lines connecting scatter points (trajectories, before/after pairs). */
export interface ScatterPathOptions {
  seriesId?: string;
  /** Datum field that splits points into separate paths. */
  groupBy?: string;
  /** Order points by x or keep data order. Default 'data'. */
  order?: 'data' | 'x';
  color?: ColorInput;
  width?: number;
  opacity?: number;
  lineType?: LineType;
}

/** Text labels next to scatter points, skipping labels that would overlap. */
export interface ScatterLabelOptions {
  seriesId?: string;
  /** Datum field to show; defaults to the point's y value. */
  field?: string;
  position?: 'right' | 'left' | 'top' | 'bottom';
  /** Only label these data indices. */
  indices?: number[];
  format?: (value: unknown) => string;
}

export interface LegendOptions {
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'middle' | 'end';
  title?: string;
  /** Click toggles series visibility. */
  toggleable?: boolean;
  /** Hover highlights the series. */
  highlight?: boolean;
  /** Overrides displayed labels by series id. */
  labels?: Record<string, string>;
  /** Series ids not shown in the legend. */
  hiddenEntries?: string[];
  descriptions?: Record<string, string>;
}

export interface TooltipContext {
  trigger: 'item' | 'axis';
  axisValue?: DomainValue;
  axisLabel?: string;
  items: TooltipItem[];
  x: number;
  y: number;
}

export interface TooltipItem {
  seriesId: string;
  seriesLabel: string;
  dataIndex: number;
  color: string;
  value: number | null;
  formattedValue: string;
  datum?: Datum;
  label?: string;
}

export interface TooltipOptions {
  trigger?: 'item' | 'axis' | 'none';
  /** Anchor at the cursor or at the mark. */
  anchor?: 'pointer' | 'mark';
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** When true the engine positions the container but leaves content to the host (e.g. React portal). */
  customContent?: boolean;
  /** Plain DOM rendering hook. */
  render?: (ctx: TooltipContext) => string | HTMLElement | null;
  sort?: 'none' | 'asc' | 'desc';
}

export interface ReferenceAreaOptions {
  /** Data-space corners; omit a bound to extend to the plot edge. */
  x1?: DomainValue;
  x2?: DomainValue;
  y1?: DomainValue;
  y2?: DomainValue;
  xAxisId?: string;
  yAxisId?: string;
  color?: ColorInput;
  opacity?: number;
  label?: string;
  layer?: 'back' | 'front';
}

export type TrendlineMethod =
  | 'linear'
  | 'average'
  | 'median'
  | 'exponential'
  | 'logarithmic'
  | 'power'
  | 'quadratic'
  | `polynomial-${number}`
  | `movingAverage-${number}`;

export interface TrendlineOptions {
  /** Series the trendline is computed from (default: every visible cartesian series). */
  seriesId?: string;
  method?: TrendlineMethod;
  color?: ColorInput;
  lineType?: LineType;
  lineWidth?: number;
  opacity?: number;
  /** Extend the line to the full x domain (regressions only). */
  extend?: boolean;
  /** Label drawn at the end of the line; receives the last trend value. */
  label?: string | ((value: number) => string);
}

export interface ZoomState {
  axisId: string;
  start: number;
  end: number;
}

export interface ReferenceLineOptions {
  x?: DomainValue;
  y?: DomainValue;
  axisId?: string;
  label?: string;
  labelAlign?: 'start' | 'middle' | 'end';
  color?: ColorInput;
  lineType?: LineType;
  lineWidth?: number;
  layer?: 'back' | 'front';
}

export interface TitleOptions {
  text: string;
  subtitle?: string;
  align?: 'start' | 'middle' | 'end';
}

export interface AnimationOptions extends Partial<TransitionOptions> {
  /** Initial draw-in animation. */
  enter?: boolean;
  easing?: EasingName;
}

export interface ChartOptions {
  /** Long-format rows shared by series that use `dimension` / `metric`. */
  data?: ReadonlyArray<Datum>;
  /** Wide-format rows used by `dataKey`. */
  dataset?: ReadonlyArray<Datum>;
  series: SeriesOptions[];
  xAxis?: AxisOptions[];
  yAxis?: AxisOptions[];
  legend?: LegendOptions | boolean;
  tooltip?: TooltipOptions | boolean;
  grid?: { vertical?: boolean; horizontal?: boolean };
  referenceLines?: ReferenceLineOptions[];
  referenceAreas?: ReferenceAreaOptions[];
  /** Regression / smoothing lines over series (requires the annotations plugin). */
  trendlines?: TrendlineOptions[];
  /** Labelled callouts on data points (requires the annotations plugin). */
  pointAnnotations?: PointAnnotationOptions[];
  /** Paths connecting scatter points (requires the annotations plugin). */
  scatterPaths?: ScatterPathOptions[];
  /** Labels next to scatter points (requires the annotations plugin). */
  scatterLabels?: ScatterLabelOptions[];
  onAxisAnnotationClick?: (annotation: AxisAnnotation, axisId: string) => void;
  /**
   * Drag to select. Default action zooms into the selection (double-click, Esc
   * or the reset chip go back); `{ action: 'select' }` keeps it and reports
   * the covered items. Loaded on demand.
   */
  marquee?: boolean | import('./plugins/marquee').MarqueeOptions;
  /** Adds the toolbar plugin (zoom, downloads, print, full screen) when using hosts that read it. */
  toolbar?: boolean | import('./plugins/toolbar').ToolbarOptions;
  /** Initial zoom windows (requires the zoom plugin). */
  initialZoom?: ZoomState[];
  onZoomChange?: (zoom: ZoomState[]) => void;
  title?: string | TitleOptions;
  /** Accessible description; auto-generated when omitted. */
  description?: string;
  colors?: PaletteInput;
  colorScheme?: ColorScheme;
  theme?: Partial<ChartTheme>;
  backgroundColor?: ColorInput;
  margin?: Partial<Margin>;
  locale?: string | LocaleOptions;
  animation?: boolean | AnimationOptions;
  /** Controlled hidden series ids. */
  hiddenSeries?: string[];
  /** Initial hidden series ids (uncontrolled). */
  defaultHiddenSeries?: string[];
  /** Controlled highlight. `null` clears; `undefined` leaves it uncontrolled. */
  highlightedItem?: ItemIdentifier | null;
  highlightScope?: HighlightScopeOptions;
  axisHighlight?: { x?: 'none' | 'line' | 'band'; y?: 'none' | 'line' | 'band' };
  loading?: boolean;
  noDataText?: string;
  loadingText?: string;
  keyboardNavigation?: boolean;
  onItemClick?: (item: ItemIdentifier & { datum?: Datum; value?: number | null }, event: PointerEvent) => void;
  onItemContextMenu?: (item: ItemIdentifier & { datum?: Datum }, event: MouseEvent) => void;
  onAxisClick?: (data: { axisValue: DomainValue; dataIndex: number }, event: PointerEvent) => void;
  onHighlightChange?: (item: ItemIdentifier | null) => void;
  onHiddenSeriesChange?: (hidden: string[]) => void;
  onLegendClick?: (seriesId: string) => void;
}

export interface EngineConfig {
  backends: GpuBackend[];
  prefer?: BackendType;
  antialias?: boolean;
}

export type { RGBA, ColorScheme, SymbolShape };
