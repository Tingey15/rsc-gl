import type { ComponentType, ReactNode } from 'react';
import HeatmapDemo from '../demos/more/HeatmapDemo';
import HeatmapSrc from '../demos/more/HeatmapDemo.tsx?raw';
import CandlestickDemo from '../demos/more/CandlestickDemo';
import CandlestickSrc from '../demos/more/CandlestickDemo.tsx?raw';
import LiveMarketDemo from '../demos/more/LiveMarketDemo';
import LiveMarketSrc from '../demos/more/LiveMarketDemo.tsx?raw';
import GanttDemo from '../demos/more/GanttDemo';
import GanttSrc from '../demos/more/GanttDemo.tsx?raw';
import WaterfallDemo from '../demos/more/WaterfallDemo';
import WaterfallSrc from '../demos/more/WaterfallDemo.tsx?raw';
import BoxplotDemo from '../demos/more/BoxplotDemo';
import BoxplotSrc from '../demos/more/BoxplotDemo.tsx?raw';
import FunnelDemo from '../demos/more/FunnelDemo';
import FunnelSrc from '../demos/more/FunnelDemo.tsx?raw';
import TreemapDemo from '../demos/more/TreemapDemo';
import TreemapSrc from '../demos/more/TreemapDemo.tsx?raw';
import SankeyDemo from '../demos/more/SankeyDemo';
import SankeySrc from '../demos/more/SankeyDemo.tsx?raw';
import VennBulletDemo from '../demos/more/VennBulletDemo';
import VennBulletSrc from '../demos/more/VennBulletDemo.tsx?raw';
import RadarDemo from '../demos/more/RadarDemo';
import RadarSrc from '../demos/more/RadarDemo.tsx?raw';
import SunburstDemo from '../demos/more/SunburstDemo';
import SunburstSrc from '../demos/more/SunburstDemo.tsx?raw';
import ChordDemo from '../demos/more/ChordDemo';
import ChordSrc from '../demos/more/ChordDemo.tsx?raw';
import RadialBarDemo from '../demos/more/RadialBarDemo';
import RadialBarSrc from '../demos/more/RadialBarDemo.tsx?raw';
import MapDemo from '../demos/more/MapDemo';
import MapSrc from '../demos/more/MapDemo.tsx?raw';
import ZoomMarqueeDemo from '../demos/more/ZoomMarqueeDemo';
import ZoomMarqueeSrc from '../demos/more/ZoomMarqueeDemo.tsx?raw';
import AnnotationsDemo from '../demos/more/AnnotationsDemo';
import AnnotationsSrc from '../demos/more/AnnotationsDemo.tsx?raw';
import { Demo, H2, Page, PropsTable, type PropRow } from '../components/docs';

export function chartPage(title: string, lede: ReactNode, demos: { title: string; code: string; C: ComponentType; text?: ReactNode }[], rows?: PropRow[]) {
  return function ChartPage() {
    return (
      <Page title={title} lede={lede}>
        {demos.map((d) => (
          <section key={d.title}>
            <H2>{d.title.replace(/Demo\.tsx$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')}</H2>
            {d.text && <p>{d.text}</p>}
            <Demo title={d.title} code={d.code}>
              <d.C />
            </Demo>
          </section>
        ))}
        {rows && (
          <>
            <H2>API</H2>
            <PropsTable rows={rows} />
          </>
        )}
      </Page>
    );
  };
}

export const HeatmapPage = chartPage('Heatmap', 'A matrix of colored cells on two band axes. Cells grow from their centers, and the legend shows a continuous color scale.', [{ title: 'HeatmapDemo.tsx', code: HeatmapSrc, C: HeatmapDemo }], [
  { name: 'data', type: '{ x, y, value }[] | [x, y, value][]', description: 'Rows or tuples (tuple indices reference axis categories).' },
  { name: 'xField / yField / valueField', type: 'string', default: "'x' / 'y' / 'value'", description: 'Field names for rows.' },
  { name: 'colorScheme', type: 'string', default: "'viridis'", description: 'Sequential or diverging scheme.' },
  { name: 'thresholds', type: '{ value, color }[]', description: 'Piecewise color map.' },
  { name: 'colorDomain', type: '[min, max]', description: 'Fix the color domain.' },
  { name: 'cellGap / borderRadius / showValues', type: 'number / number / boolean', description: 'Cell styling and value labels.' },
]);

export const CandlestickPage = chartPage(
  'Candlestick',
  'Open-high-low-close candles or OHLC bars with volume, moving averages and a last-price marker. Built for real-time feeds: each tick updates the forming candle, new candles slide the window, and short GPU transitions keep motion smooth.',
  [
    { title: 'LiveMarketDemo.tsx', code: LiveMarketSrc, C: LiveMarketDemo, text: 'A live-looking exchange view on a simulated feed: 4 ticks per second, a new candle every 2, 5 or 10 seconds, order book and time & sales. Prices are generated, not real quotes.' },
    { title: 'CandlestickDemo.tsx', code: CandlestickSrc, C: CandlestickDemo, text: 'Static data with a moving-average trendline.' },
  ],
  [
    { name: 'open / high / low / close', type: 'string', description: 'Field names.' },
    { name: 'style', type: "'candle' | 'ohlc'", default: "'candle'", description: 'Filled candles or OHLC bars with open / close ticks.' },
    { name: 'volume / volumeHeight', type: 'string / number', default: "— / 0.2", description: 'Volume field drawn as bars along the bottom; the price scale leaves room for them.' },
    { name: 'lastPrice', type: 'boolean | { color, format }', description: 'Dashed line at the last close with a price badge.' },
    { name: 'upColor / downColor / bodyWidth', type: 'color / color / number', description: 'Colors and body width (fraction of the band).' },
    { name: 'chart.streamData(target, { append, replaceLast, maxPoints }, animation)', type: 'method', description: 'Imperative real-time updates without re-rendering React: append candles, replace the forming candle, keep a sliding window.' },
  ],
);

export const GanttPage = chartPage('Gantt & range bars', 'Range bars span a start and an end value. Horizontal range bars on a time axis give a Gantt timeline, with progress fill and a "today" marker.', [{ title: 'GanttDemo.tsx', code: GanttSrc, C: GanttDemo }], [
  { name: 'start / end', type: 'string', default: "'start' / 'end'", description: 'Field names (numbers, Dates or ISO strings).' },
  { name: 'layout', type: "'vertical' | 'horizontal'", description: 'Horizontal for Gantt charts (GanttChart sets it).' },
  { name: 'progressField', type: 'string', description: 'Field with 0..1 progress.' },
  { name: 'colorField / showLabels', type: 'string / boolean', description: 'Per-row colors and inline labels.' },
]);

export const WaterfallPage = chartPage('Waterfall', 'Running totals with up, down and total bars joined by connector lines.', [{ title: 'WaterfallDemo.tsx', code: WaterfallSrc, C: WaterfallDemo }], [
  { name: 'totalField', type: 'string', description: 'Rows with a truthy value draw the running total from zero.' },
  { name: 'upColor / downColor / totalColor', type: 'color', description: 'Bar colors.' },
  { name: 'connectors / showValues', type: 'boolean', description: 'Connector lines and value labels.' },
]);

export const BoxplotPage = chartPage('Boxplot', 'Distribution summaries computed from raw values: quartiles, median, whiskers at 1.5×IQR, and outliers.', [{ title: 'BoxplotDemo.tsx', code: BoxplotSrc, C: BoxplotDemo }], [
  { name: 'data', type: 'rows of raw values | precomputed { min, q1, median, q3, max }', description: 'Grouped by `dimension`.' },
  { name: 'whiskers', type: "'iqr' | 'minmax'", default: "'iqr'", description: 'Whisker rule.' },
  { name: 'showOutliers / boxWidth', type: 'boolean / number', description: 'Outlier markers and box width.' },
]);

export const FunnelPage = chartPage('Funnel & pyramid', 'Conversion stages drawn as morphing GPU meshes. Switching variants animates between the shapes.', [{ title: 'FunnelDemo.tsx', code: FunnelSrc, C: FunnelDemo }], [
  { name: 'variant', type: "'funnel' | 'pyramid'", default: "'funnel'", description: 'Shape.' },
  { name: 'orientation', type: "'vertical' | 'horizontal'", default: "'vertical'", description: 'Direction.' },
  { name: 'gap / sectionLabel', type: "number / 'value' | 'percent' | 'label' | false", description: 'Spacing and labels.' },
]);

export const TreemapPage = chartPage('Treemap', 'Hierarchical data as nested rectangles (squarified by default). Hiding a group from the legend animates the layout.', [{ title: 'TreemapDemo.tsx', code: TreemapSrc, C: TreemapDemo }], [
  { name: 'root', type: '{ name, value?, children? }', description: 'Hierarchy.' },
  { name: 'tile', type: "'squarify' | 'binary' | 'slice' | 'dice' | 'sliceDice'", default: "'squarify'", description: 'Tiling algorithm.' },
  { name: 'padding / depth / showLabels', type: 'number / number / boolean', description: 'Layout options.' },
]);

export const SankeyPage = chartPage('Sankey', 'Flows between nodes. Ribbons are tessellated on the CPU once and grow in from their source on the GPU.', [{ title: 'SankeyDemo.tsx', code: SankeySrc, C: SankeyDemo }], [
  { name: 'links', type: '{ source, target, value, color? }[]', description: "Link color: 'source', 'target' or a color." },
  { name: 'nodes', type: '{ id, label?, color? }[]', description: 'Optional node metadata.' },
  { name: 'nodeWidth / nodePadding / align / linkOpacity', type: 'number / number / string / number', description: 'Layout options.' },
]);

export const VennBulletPage = chartPage('Venn & bullet', 'Venn diagrams size circles and overlaps by area. Bullet charts compare a value to its target over qualitative bands.', [{ title: 'VennBulletDemo.tsx', code: VennBulletSrc, C: VennBulletDemo }]);

export const RadarPage = chartPage('Radar', 'Multivariate comparison on radial axes. Polygons expand from the center.', [{ title: 'RadarDemo.tsx', code: RadarSrc, C: RadarDemo }], [
  { name: 'metrics', type: 'string[]', description: 'Axis names in order.' },
  { name: 'data', type: 'number[] | row', description: 'Values aligned with metrics.' },
  { name: 'max / divisions / shape', type: "number | Record / number / 'sharp' | 'circular'", description: 'Scale and grid.' },
  { name: 'fillArea / showMarks', type: 'boolean', description: 'Styling.' },
]);

export const SunburstPage = chartPage('Sunburst', 'Hierarchies as concentric rings of SDF arcs that sweep in from 12 o’clock.', [{ title: 'SunburstDemo.tsx', code: SunburstSrc, C: SunburstDemo }]);

export const ChordPage = chartPage('Chord', 'Flows between groups. Ribbons are earcut-triangulated meshes; group arcs are SDF arcs.', [{ title: 'ChordDemo.tsx', code: ChordSrc, C: ChordDemo }]);

export const RadialBarPage = chartPage('Radial bars', 'Concentric progress rings with rounded ends, each sweeping to its value.', [{ title: 'RadialBarDemo.tsx', code: RadialBarSrc, C: RadialBarDemo }]);

export const MapPage = chartPage('Maps', 'GeoJSON regions projected with d3-geo, triangulated with earcut (including holes), and drawn as GPU meshes. Regions grow from their centroids, and colors animate when the data changes.', [{ title: 'MapDemo.tsx', code: MapSrc, C: MapDemo }], [
  { name: 'geoJson', type: 'FeatureCollection', description: 'Regions to draw.' },
  { name: 'regions', type: '{ id, name?, value? }[]', description: 'Data joined on the feature id (or `idProperty`).' },
  { name: 'projection', type: "'equalEarth' | 'naturalEarth1' | 'mercator' | 'equirectangular' | 'albersUsa' | 'orthographic'", default: "'equalEarth'", description: 'Projection.' },
  { name: 'rotate', type: '[lambda, phi]', description: 'Rotation (globe).' },
  { name: 'colorScheme / unknownColor', type: 'string / color', description: 'Color mapping.' },
]);

export const ZoomMarqueePage = chartPage('Zoom, marquee & crosshair', 'Interaction plugins: wheel and pinch zoom, drag to pan, a slider with a live preview, range buttons, marquee selection and a crosshair with axis badges. Plugins are opt-in and tree-shakeable.', [{ title: 'ZoomMarqueeDemo.tsx', code: ZoomMarqueeSrc, C: ZoomMarqueeDemo }], [
  { name: 'zoomPlugin({ slider, rangeButtons, wheel, pan, keyboard, minSpan })', type: 'ChartPlugin', description: 'Requires `zoom: true` on a continuous x axis. Keys: + / - / 0 / Shift+arrows.' },
  { name: 'marqueePlugin({ mode, action, modifier, persist, onMarquee, onMarqueeEnd })', type: 'ChartPlugin', description: "Shift+drag when zoom is enabled; reports the range and the selected items." },
  { name: 'crosshairPlugin({ x, y, badges, snap })', type: 'ChartPlugin', description: 'Dashed crosshair with axis value badges.' },
  { name: 'initialZoom / onZoomChange', type: 'ZoomState[] / (zoom) => void', description: 'Controlled zoom state.' },
]);

export const AnnotationsPage = chartPage('Annotations', 'Trendlines (linear, polynomial, exponential, logarithmic, power, average, median, moving average), metric-range bands, reference areas, and collision-free direct labels.', [{ title: 'AnnotationsDemo.tsx', code: AnnotationsSrc, C: AnnotationsDemo }], [
  { name: 'trendlines', type: 'TrendlineOptions[]', description: 'Computed per visible series (or one `seriesId`).' },
  { name: 'metricRanges (line series)', type: '{ metricStart, metricEnd, color, rangeOpacity, displayOnHover }[]', description: 'Bands around a line.' },
  { name: 'referenceAreas', type: '{ x1, x2, y1, y2, color, opacity, label, layer }[]', description: 'Shaded regions.' },
  { name: "annotationsPlugin({ directLabels })", type: 'ChartPlugin', description: 'End-of-line labels stacked to avoid overlaps.' },
]);
