import type { ReactNode } from 'react';
import type {
  AxisOptions,
  ChartOptions,
  Datum,
  HighlightScopeOptions,
  ItemIdentifier,
  LegendOptions,
  PaletteInput,
  ReferenceLineOptions,
  ReferenceAreaOptions,
  TrendlineOptions,
  ChartPlugin,
  ZoomState,
  TooltipContext,
  TooltipOptions,
  PointAnnotationOptions,
  ScatterPathOptions,
  ScatterLabelOptions,
  ToolbarOptions,
  MarqueeOptions,
} from '@rsc-gl/core';
import { referenceLinesPlugin } from '@rsc-gl/core';
import { type ChartSize, type ChartSlotProps, type ChartSlots } from '../GLChart';

/** Props shared by every props-driven chart component. */
export interface CommonChartProps {
  width?: ChartSize;
  height?: ChartSize;
  dataset?: Datum[];
  xAxis?: AxisOptions[];
  yAxis?: AxisOptions[];
  colors?: PaletteInput;
  colorScheme?: 'light' | 'dark';
  margin?: ChartOptions['margin'];
  grid?: ChartOptions['grid'];
  title?: ChartOptions['title'];
  description?: string;
  locale?: ChartOptions['locale'];
  hideLegend?: boolean;
  legend?: LegendOptions;
  tooltip?: TooltipOptions | false;
  /** React tooltip content. */
  renderTooltip?: (ctx: TooltipContext) => ReactNode;
  referenceLines?: ReferenceLineOptions[];
  referenceAreas?: ReferenceAreaOptions[];
  trendlines?: TrendlineOptions[];
  /** Labelled callouts on data points. */
  pointAnnotations?: PointAnnotationOptions[];
  /** Lines connecting scatter points. */
  scatterPaths?: ScatterPathOptions[];
  /** Text labels next to scatter points. */
  scatterLabels?: ScatterLabelOptions[];
  onAxisAnnotationClick?: ChartOptions['onAxisAnnotationClick'];
  /** Toolbar with zoom, downloads (PNG, SVG, CSV, .xlsx), print and full screen. */
  toolbar?: boolean | ToolbarOptions;
  /** Drag to zoom into a range (default), or `{ action: 'select' }` to select data. */
  marquee?: boolean | MarqueeOptions;
  /** Replace the tooltip, legend or overlays with React components. */
  slots?: ChartSlots;
  slotProps?: ChartSlotProps;
  /** Custom layers over the plot (use `ChartsSvgLayer` and the scale hooks). */
  children?: ReactNode;
  /** Server-rendered SVG (`renderToSVGString`) shown until the GPU chart takes over. */
  serverSvg?: string;
  /** Extra chart plugins (marquee, crosshair, annotations, zoom with options, ...). */
  plugins?: ChartPlugin[];
  initialZoom?: ZoomState[];
  onZoomChange?: (zoom: ZoomState[]) => void;
  skipAnimation?: boolean;
  animation?: ChartOptions['animation'];
  loading?: boolean;
  noDataText?: string;
  highlightedItem?: ItemIdentifier | null;
  onHighlightChange?: (item: ItemIdentifier | null) => void;
  highlightScope?: HighlightScopeOptions;
  hiddenSeries?: string[];
  onHiddenSeriesChange?: (ids: string[]) => void;
  onItemClick?: ChartOptions['onItemClick'];
  onAxisClick?: ChartOptions['onAxisClick'];
  axisHighlight?: ChartOptions['axisHighlight'];
  backgroundColor?: string;
  disableKeyboardNavigation?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onBackend?: (backend: string) => void;
}

export function commonOptions(p: CommonChartProps, defaults: { legend: boolean }): Omit<ChartOptions, 'series'> {
  return {
    dataset: p.dataset,
    xAxis: p.xAxis,
    yAxis: p.yAxis,
    colors: p.colors,
    colorScheme: p.colorScheme,
    margin: p.margin,
    grid: p.grid,
    title: p.title,
    description: p.description,
    locale: p.locale,
    legend: p.hideLegend ? false : (p.legend ?? defaults.legend),
    tooltip: p.tooltip === false ? false : (p.tooltip ?? true),
    referenceLines: p.referenceLines,
    referenceAreas: p.referenceAreas,
    trendlines: p.trendlines,
    pointAnnotations: p.pointAnnotations,
    scatterPaths: p.scatterPaths,
    scatterLabels: p.scatterLabels,
    onAxisAnnotationClick: p.onAxisAnnotationClick,
    toolbar: p.toolbar,
    marquee: p.marquee,
    initialZoom: p.initialZoom,
    onZoomChange: p.onZoomChange,
    animation: p.skipAnimation ? false : p.animation,
    loading: p.loading,
    noDataText: p.noDataText,
    highlightedItem: p.highlightedItem,
    onHighlightChange: p.onHighlightChange,
    highlightScope: p.highlightScope,
    hiddenSeries: p.hiddenSeries,
    onHiddenSeriesChange: p.onHiddenSeriesChange,
    onItemClick: p.onItemClick,
    onAxisClick: p.onAxisClick,
    axisHighlight: p.axisHighlight,
    backgroundColor: p.backgroundColor,
    keyboardNavigation: !p.disableKeyboardNavigation,
  };
}

/**
 * Extra plugins are added on top of the ones implied by the options (those
 * load on demand and are skipped when an extra plugin has the same name).
 */
export function withPlugins(_options: ChartOptions, extra?: ChartPlugin[]): ChartPlugin[] | undefined {
  if (!extra?.length) return undefined;
  return extra.some((e) => e.name === 'referenceLines') ? extra : [referenceLinesPlugin(), ...extra];
}
