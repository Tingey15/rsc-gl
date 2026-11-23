export { Chart, type ChartConfig } from './chart/chart';
export type { ChartPlugin, PlotPoint } from './chart/plugin';
export * from './plugins/index';
export { trend, polyfit } from './data/regression';
export { lttb, minmax, m4, sampleIndices, type SamplingMethod } from './data/sampling';
export { renderToSVGString, type RenderToSvgConfig } from './svg/ssr';
export { gpuMinMaxIndices, decimateInWorker } from './data/offload';
export { GlyphAtlas, type Glyph } from './text/glyph-atlas';
export { SvgContext } from './svg/svg-context';
export { RenderEngine, type Renderable, type RenderEngineOptions } from './engine/render-engine';
export * from './types';

// Series definitions (import only what you use).
export { barSeries } from './series/bar';
export { lineSeries, areaSeries } from './series/line';
export { scatterSeries } from './series/scatter';
export { pieSeries } from './series/pie';
export { heatmapSeries, candlestickSeries, rangeBarSeries, waterfallSeries, boxplotSeries, boxStats } from './series/cartesian-extra';
export { funnelSeries, treemapSeries, sankeySeries, vennSeries, bulletSeries } from './series/standalone';
export { radarSeries, sunburstSeries, chordSeries, radialBarSeries } from './series/polar';
export { mapSeries } from './series/map';
export { morphSeries, type MorphSeriesOptions } from './series/morph';
export { GeomRenderer, type GeomOutput, type GeomHit, type GeomLabel, type GeomLine } from './series/geom-renderer';
export { MeshMark, fan, strip, hitTriangles, type MeshItem } from './marks/mesh-mark';
export * from './types-extra';
export type { SeriesDefinition, SeriesRenderer, ResolvedSeries, SeriesPoint, LayoutContext, HitResult, LegendEntry, ResolvedAxis } from './series/types';

// Building blocks for custom series and other renderers (e.g. 3D).
export { RectMark, type RectAttrs } from './marks/rect-mark';
export { PointMark, SYMBOL_SHAPES, symbolShapeId, type PointAttrs } from './marks/point-mark';
export { ArcMark, type ArcAttrs } from './marks/arc-mark';
export { LineMark, AreaMark, type PathPoint } from './marks/path-mark';
export { InstanceMark, packColor, type MarkItem, type FrameState } from './marks/instance-mark';
export { COMMON_UNIFORMS, GLSL_LIB, WGSL_LIB } from './marks/shader-lib';

export { createScale, isOrdinal, isTimeScale, type ChartScale, type ScaleType, type DomainValue } from './scales/scales';
export { getFormatter, inferGranularity, type Formatter, type NumberFormat, type TimeGranularity, type ValueFormatter } from './format/format';
export {
  ease,
  EASING_ID,
  resolveTransition,
  DEFAULT_TRANSITION,
  prefersReducedMotion,
  systemPrefersReducedMotion,
  setReducedMotionPolicy,
  type EasingName,
  type TransitionOptions,
} from './animation/easing';
export { resolveColor, resolvePalette, rgbaToCss, parseCss, PALETTES, CATEGORICAL_16, getInterpolator, contrastText } from './theme/colors';
export { getTheme, LIGHT_THEME, DARK_THEME, LINE_TYPES, LINE_WIDTHS, SYMBOL_SIZES, resolveLineType, resolveLineWidth, resolveSymbolSize, type ChartTheme, type LineType, type LineWidth, type SymbolSize } from './theme/theme';
export { facetBy, sharedExtent, niceExtent, type Facet } from './data/facet';
export { exportRows, serializeRows, type DataExportFormat, type TextExportFormat } from './data/export';
export { toXlsx, zipStore, XLSX_MIME } from './data/xlsx';
export { axisAnnotationBoxes, groupRuns, type AxisAnnotationBox } from './components/axis-extras';
export { loadImage, onImageLoad } from './components/images';
export type { ChartEvent } from './chart/chart';
export type { AxisLayout, AxisBox, CartesianLayout, AxisTick } from './components/axes';
export { radialLineSeries, type RadialLineSeriesOptions } from './series/radial-line';
export { startChartWorker, type ChartWorkerConfig, type WorkerChartApi } from './worker/runtime';
export { WorkerChart, type WorkerChartOptions } from './worker/host';
export { cloneable } from './worker/protocol';
export { buildScene, type Scene, type SceneInput } from './chart/scene';
export { hydrateChart, withoutEntrance } from './svg/hydrate';
