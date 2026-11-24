import type { BackendType, GpuBackend } from '@rsc-gl/gpu';
import type { EasingName, TransitionOptions } from './animation/easing';
import type { FormatContext, LocaleInput, NumberFormat, TimeGranularity } from './format/format';
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
  /** Rows where any of these fields is truthy get no tooltip and no hover highlight. */
  excludeDataKeys?: string[];
  /** Hovering this series shows no tooltip (other series still do). */
  disableTooltip?: boolean;
  /** CSS cursor while an item of this series is under the pointer (e.g. 'pointer' for clickable marks). */
  cursor?: string;
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
  barLabel?: 'value' | ((item: { value: number | null; dataIndex: number; seriesId: string; datum?: Datum }) => string | null);
  /** 'start' sits inside the bar near its base; 'outside' past its end. */
  barLabelPlacement?: 'start' | 'center' | 'inside-end' | 'outside';
  /** Draws labels on a filled badge (bar annotations). */
  barLabelBadge?: boolean;
  /** Labels that do not fit: hide them (default) or let them spill past the bar. */
  barLabelOverflow?: 'hide' | 'spill';
  /** Number format for `barLabel: 'value'`. */
  barLabelFormat?: NumberFormat;
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
  showMark?: boolean | 'start' | 'end' | ((p: { index: number; value: number | null; datum?: Datum }) => boolean);
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
  /** Widen the value axis so the whole range is visible. Default true. */
  scaleAxisToFit?: boolean;
  /** Width of the range boundary lines in px. Default 1. */
  lineWidth?: number;
  /** Opacity of the range boundary lines. Default 1. */
  lineOpacity?: number;
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
  /** A second line under the arc label (e.g. the value or percent under the category). */
  arcLabelSecondary?: 'value' | 'formattedValue' | 'percent';
  /** Datum field used for `arcLabel: 'label'`. */
  arcLabelField?: string;
  /** Labels inside the ring (default) or outside it. */
  arcLabelPosition?: 'inside' | 'outside';
  /** Number format for percent labels. Default '.0%'. */
  percentFormat?: NumberFormat;
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
  /** Axis title. An array draws one line per entry. */
  label?: string | string[];
  min?: number | Date;
  max?: number | Date;
  reverse?: boolean;
  domainLimit?: DomainLimit;
  /** Target tick count (continuous axes). */
  tickNumber?: number;
  /**
   * Upper limit on the tick count (continuous axes). As in the legacy library the
   * first (base) tick is not counted: `0, 1, 2, 3` is three ticks.
   */
  maxTicks?: number;
  /** Lower limit on the tick count (continuous axes), counted like `maxTicks`. */
  minTicks?: number;
  /** Minimum step between ticks in domain units (numeric, non-log axes). */
  tickMinStep?: number;
  /** Explicit tick values. */
  tickValues?: ReadonlyArray<DomainValue>;
  /**
   * Explicit ticks: only these are drawn. An object can set the label text, its
   * alignment and its font weight. Overrides `tickValues`.
   */
  labels?: ReadonlyArray<
    DomainValue | { value: DomainValue; label?: string; align?: 'start' | 'center' | 'end'; fontWeight?: 'normal' | 'bold' | number }
  >;
  /** A second label line under the tick labels with matching values. */
  subLabels?: ReadonlyArray<{ value: DomainValue; subLabel: string; align?: 'start' | 'center' | 'end'; fontWeight?: 'normal' | 'bold' | number }>;
  /** Alignment of every tick label within its band (or around its tick). Default 'center'. */
  labelAlign?: 'start' | 'center' | 'end';
  /** Font weight of every tick label. Default 'normal'. */
  labelFontWeight?: 'normal' | 'bold' | number;
  /** ISO 4217 code used by the `currency` / `shortCurrency` number formats (e.g. 'EUR'). */
  currencyCode?: string;
  /** BCP 47 locale for the currency symbol's placement (e.g. 'de-DE'). */
  currencyLocale?: string;
  tickSize?: number;
  /** Tick label rotation in degrees (x and y axes); -90 draws vertical labels. */
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
  /** Time axes: the label format and the tick interval (one tick per day, week, month, ...). */
  granularity?: TimeGranularity;
  categoryGapRatio?: number;
  /** Band axes: outer padding as a fraction of the step. Default half of `categoryGapRatio`. */
  categoryOuterGapRatio?: number;
  barGapRatio?: number;
  /**
   * Max label width in px before truncation with an ellipsis (ordinal axes).
   * `'band'` truncates to the band step.
   */
  labelLimit?: number | 'band';
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
  /** Restricts the `seriesId` lookup to series of this entry of `ChartOptions.series`. */
  markIndex?: number;
  /** Badge in the series color (default) or plain text in the theme text color. */
  matchLineColor?: boolean;
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
  markIndex?: number;
  /** Datum field(s) that split points into separate paths. */
  groupBy?: string | string[];
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
  markIndex?: number;
  /** Datum field to show; defaults to the point's y value. */
  field?: string;
  /** Side of the point; a list is tried in order until a label fits. */
  position?: 'right' | 'left' | 'top' | 'bottom' | ('right' | 'left' | 'top' | 'bottom')[];
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
  /** Entries are buttons that report clicks (`onLegendClick`) even when not toggleable. */
  clickable?: boolean;
  /** Max label width in px (ellipsis beyond; the full text stays in the title attribute). */
  labelLimit?: number;
  /** Max title width in px. */
  titleLimit?: number;
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
  /** Index of the series options (`ChartOptions.series`) that produced this item. */
  markIndex?: number;
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
  /** Return false to show no tooltip for this context (also applies with `customContent`). */
  filter?: (ctx: TooltipContext) => boolean;
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
  /** Only series produced by this entry of `ChartOptions.series`. */
  markIndex?: number;
  /** Only drawn while its series is highlighted. */
  displayOnHover?: boolean;
  /** Rows where any of these fields is truthy are left out of the fit. */
  excludeDataKeys?: string[];
  /** Moving averages: skip the first points that have no full window (default true). */
  hidePartialWindows?: boolean;
  /** Draws the label on a filled badge. */
  labelBadge?: boolean;
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
  /** 'axis' draws the label outside the plot, next to the axis. */
  labelPlacement?: 'plot' | 'axis';
  labelColor?: ColorInput;
  labelFontWeight?: 'normal' | 'bold' | number;
  /** On band axes: at the start, center (default) or end of the band. */
  bandPosition?: 'before' | 'center' | 'after';
  color?: ColorInput;
  lineType?: LineType;
  lineWidth?: number;
  layer?: 'back' | 'front';
}

export interface TitleOptions {
  text: string;
  subtitle?: string;
  align?: 'start' | 'middle' | 'end';
  fontWeight?: 'normal' | 'bold' | number;
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
  locale?: LocaleInput;
  animation?: boolean | AnimationOptions;
  /** Controlled hidden series ids. */
  hiddenSeries?: string[];
  /** Initial hidden series ids (uncontrolled). */
  defaultHiddenSeries?: string[];
  /** Controlled highlight. `null` clears; `undefined` leaves it uncontrolled. */
  highlightedItem?: ItemIdentifier | null;
  /** Controlled highlight by row id (the `idKey` field); used when `highlightedItem` is unset. */
  highlightedId?: string | number | null;
  /** Row field that identifies a datum (item keys, `highlightedId`). Default `id`, then `key`. */
  idKey?: string;
  /** Labels next to the end (or start) of each line / area series (requires the annotations plugin). */
  directLabels?: boolean | import('./plugins/annotations').DirectLabelOptions;
  highlightScope?: HighlightScopeOptions;
  axisHighlight?: { x?: 'none' | 'line' | 'band'; y?: 'none' | 'line' | 'band' };
  loading?: boolean;
  noDataText?: string;
  loadingText?: string;
  keyboardNavigation?: boolean;
  onItemClick?: (item: ItemIdentifier & { datum?: Datum; value?: number | null; markIndex?: number }, event: PointerEvent) => void;
  onItemContextMenu?: (item: ItemIdentifier & { datum?: Datum; markIndex?: number }, event: MouseEvent) => void;
  /** Pointer enters (item) or leaves (null) a mark. */
  onItemHover?: (item: (ItemIdentifier & { datum?: Datum; markIndex?: number }) | null) => void;
  /** Pointer enters (id) or leaves (null) a legend entry. */
  onLegendHover?: (seriesId: string | null) => void;
  /** A tick label was clicked. */
  onAxisLabelClick?: (axisId: string, value: string | number, index: number) => void;
  /** Axis ids (or all axes) whose labels show their full text on hover. */
  axisLabelTooltips?: boolean | string[];
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
