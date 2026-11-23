import type { GpuDevice, RenderPass } from '@rsc-gl/gpu';
import type { TransitionOptions } from '../animation/easing';
import type { Formatter } from '../format/format';
import type { FrameState } from '../marks/instance-mark';
import type { ChartScale, DomainValue, ScaleType } from '../scales/scales';
import type { RGBA, ColorScheme } from '../theme/colors';
import type { ChartTheme } from '../theme/theme';
import type { AxisOptions, BaseSeriesOptions, Datum, TooltipItem } from '../types';

export interface SeriesPoint {
  /** Stable key used for transitions. */
  key: string;
  /** Index into the series' source data. */
  index: number;
  x: DomainValue;
  y: number | null;
  /** Stack / band lower value. */
  y0?: number;
  /** Stack / band upper value. */
  y1?: number;
  datum?: Datum;
  color?: RGBA;
  size?: number;
  colorValue?: number;
  label?: string;
  alternate?: boolean;
}

export type LegendShape = 'rect' | 'line' | 'circle' | 'area' | 'gradient';

export interface ResolvedSeries<O extends BaseSeriesOptions = BaseSeriesOptions> {
  id: string;
  type: string;
  label: string;
  /** Global, stable series index (used for GPU highlight keys). */
  index: number;
  color: RGBA;
  colorCss: string;
  options: O;
  points: SeriesPoint[];
  hidden: boolean;
  xAxisId: string;
  yAxisId: string;
  stack?: string;
  legendShape: LegendShape;
  dash?: number[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedAxis {
  id: string;
  direction: 'x' | 'y';
  options: AxisOptions;
  scaleType: ScaleType;
  scale: ChartScale;
  position: 'top' | 'bottom' | 'left' | 'right' | 'none';
  format(value: DomainValue, location: 'tick' | 'tooltip'): string;
}

export interface LayoutContext {
  now: number;
  transition: TransitionOptions;
  /** True on the very first layout (enter animations). */
  firstRender: boolean;
  /** Server-side / vector rendering: no GPU resources may be created. */
  headless?: boolean;
  enterAnimation: boolean;
  theme: ChartTheme;
  scheme: ColorScheme;
  formatter: Formatter;
  plot: Rect;
  width: number;
  height: number;
  dpr: number;
  xAxis(id?: string): ResolvedAxis | undefined;
  yAxis(id?: string): ResolvedAxis | undefined;
}

export interface HitResult {
  series: ResolvedSeries;
  dataIndex: number;
  /** Mark anchor in CSS px (for tooltip anchoring). */
  anchor: { x: number; y: number };
  distance: number;
}

export interface AxisRequirement {
  values: DomainValue[];
  /** Preferred scale type when the axis does not specify one. */
  preferredType: ScaleType;
  includeZero?: boolean;
  /** Band axes are required (bars). */
  requiresBand?: boolean;
}

export interface NormalizeContext {
  data?: ReadonlyArray<Datum>;
  dataset?: ReadonlyArray<Datum>;
  /** Category values for an axis id (from axis `data` / `dataKey`). */
  axisData(direction: 'x' | 'y', id?: string): ReadonlyArray<DomainValue> | undefined;
  nextColor(): string;
  scheme: ColorScheme;
  nextIndex(): number;
  /** Whether a series / legend entry id is hidden (pie slices use this). */
  isHidden(id: string): boolean;
}

export interface LegendEntry {
  id: string;
  label: string;
  color: string;
  shape: LegendShape;
  dash?: number[];
  /** Series index used for highlight. */
  seriesIndex: number;
  /** Item index for item-level entries (pie slices). */
  dataIndex?: number;
  /** Continuous legends: CSS colors from min to max and their labels. */
  gradient?: string[];
  min?: string;
  max?: string;
}

export interface SeriesRenderer {
  /** Updates GPU marks for the current layout. */
  layout(series: ResolvedSeries[], ctx: LayoutContext): void;
  draw(pass: RenderPass, frame: FrameState, ctx: LayoutContext): void;
  /** Canvas2D overlay (labels, annotations). */
  drawOverlay?(g: CanvasRenderingContext2D, ctx: LayoutContext, now: number): void;
  hitTest(x: number, y: number, ctx: LayoutContext, now: number): HitResult | null;
  /** Items sharing a category (axis tooltip). */
  itemsAtIndex?(axisIndex: number, axisValue: DomainValue, ctx: LayoutContext): TooltipItem[];
  /** Screen anchor of an item (keyboard focus, controlled highlight tooltips). */
  itemAnchor?(seriesId: string, dataIndex: number, now: number): { x: number; y: number } | null;
  isAnimating(now: number): boolean;
  /** Vector export of the current state. */
  toSvg?(now: number): string;
  setDevice(device: GpuDevice): void;
  destroy(): void;
}

/**
 * A pluggable series type. Charts only bundle the definitions they register,
 * so unused series types are tree-shaken away.
 */
export interface SeriesDefinition<O extends BaseSeriesOptions = BaseSeriesOptions> {
  type: string;
  coordinates: 'cartesian' | 'polar';
  /** Expands options into one or more series with resolved points. */
  normalize(options: O, ctx: NormalizeContext): ResolvedSeries<O>[];
  /** Cartesian requirements per axis (values used to compute domains). */
  requirements?(series: ResolvedSeries<O>[]): { x: AxisRequirement; y: AxisRequirement };
  /** Mutates series in place (stacking etc.) once all series of this type are known. */
  process?(series: ResolvedSeries<O>[]): void;
  createRenderer(device: GpuDevice): SeriesRenderer;
  /** Custom legend entries (e.g. one per pie slice). Defaults to one per series. */
  legendEntries?(series: ResolvedSeries<O>[]): LegendEntry[];
  /** Formats a value for tooltips / legends. */
  formatValue?(series: ResolvedSeries<O>, point: SeriesPoint, formatter: Formatter): string;
}
