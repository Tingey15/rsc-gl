import TrellisDemo from '../demos/p4/TrellisDemo';
import TrellisSrc from '../demos/p4/TrellisDemo.tsx?raw';
import TrellisPropsDemo from '../demos/p4/TrellisPropsDemo';
import TrellisPropsSrc from '../demos/p4/TrellisPropsDemo.tsx?raw';
import ToolbarExportDemo from '../demos/p4/ToolbarExportDemo';
import ToolbarExportSrc from '../demos/p4/ToolbarExportDemo.tsx?raw';
import ActionBarDemo from '../demos/p4/ActionBarDemo';
import ActionBarSrc from '../demos/p4/ActionBarDemo.tsx?raw';
import AxisExtrasDemo from '../demos/p4/AxisExtrasDemo';
import AxisExtrasSrc from '../demos/p4/AxisExtrasDemo.tsx?raw';
import PointAnnotationsDemo from '../demos/p4/PointAnnotationsDemo';
import PointAnnotationsSrc from '../demos/p4/PointAnnotationsDemo.tsx?raw';
import RadialLineDemo from '../demos/p4/RadialLineDemo';
import RadialLineSrc from '../demos/p4/RadialLineDemo.tsx?raw';
import CompositionDemo from '../demos/p4/CompositionDemo';
import CompositionSrc from '../demos/p4/CompositionDemo.tsx?raw';
import WorkerDemo from '../demos/p4/WorkerDemo';
import WorkerSrc from '../demos/p4/WorkerDemo.tsx?raw';
import WorkerFileSrc from '../demos/p4/chart.worker.ts?raw';
import HydrationDemo from '../demos/p4/HydrationDemo';
import HydrationSrc from '../demos/p4/HydrationDemo.tsx?raw';
import { chartPage } from './MoreCharts';

export const TrellisPage = chartPage(
  'Small multiples',
  'Split one chart into a grid of panels that share a value scale, so differences between groups read at a glance.',
  [
    { title: 'TrellisDemo.tsx', code: TrellisSrc, C: TrellisDemo, text: 'Children API: add trellis="field" to a mark. Panels share the value axis; the legend appears once.' },
    { title: 'TrellisPropsDemo.tsx', code: TrellisPropsSrc, C: TrellisPropsDemo, text: 'Props API: <Trellis> renders any chart per facet and computes the shared range for you.' },
  ],
  [
    { name: 'trellis', type: 'string', description: 'Data key that splits the chart into panels (Bar, Line, Area, Scatter).' },
    { name: 'trellisOrientation', type: "'horizontal' | 'vertical'", default: "'horizontal'", description: 'Panels side by side or stacked.' },
    { name: 'trellisColumns', type: 'number', description: 'Panels per row.' },
    { name: 'Trellis.sharedScale', type: '{ metric, stackBy?, includeZero? }', description: 'Shared value range across panels (sums stacks first).' },
  ],
);

export const ToolbarPage = chartPage(
  'Toolbar, actions & data export',
  'A toolbar with zoom, image, vector and data downloads, print and full screen, plus an action bar for the selected mark.',
  [
    { title: 'ToolbarExportDemo.tsx', code: ToolbarExportSrc, C: ToolbarExportDemo, text: 'Wheel or drag to zoom, or use the toolbar. CSV, TSV and JSON come from chart.exportData(format); chart.exportXlsx() builds an .xlsx spreadsheet.' },
    { title: 'ActionBarDemo.tsx', code: ActionBarSrc, C: ActionBarDemo },
  ],
  [
    { name: 'toolbar', type: 'boolean | ToolbarOptions', description: "Built-in items: 'zoomIn', 'zoomOut', 'resetZoom', 'downloadPng', 'downloadSvg', 'downloadCsv', 'downloadXlsx', 'copy', 'print', 'fullscreen', or custom { id, label, icon, onClick }." },
    { name: 'chart.exportData(format)', type: "'csv' | 'tsv' | 'json'", description: 'Serializes the visible data (wide format when series share an x axis).' },
    { name: 'chart.exportXlsx()', type: 'Uint8Array', description: 'The same table as an .xlsx workbook (open spreadsheet format, no dependencies).' },
    { name: 'chart.downloadData / downloadSvg / print', type: 'method', description: 'Downloads data or vector SVG, or prints a vector copy.' },
    { name: '<ChartActionBar actions>', type: '{ label, icon?, onAction(datum) }[]', description: 'Actions for a clicked mark; Esc or an outside click closes it.' },
  ],
);

export const AxisExtrasPage = chartPage(
  'Grouped axes, thumbnails & axis annotations',
  'Multi-level category labels, images next to ticks, and event markers or spans in a lane along an axis.',
  [{ title: 'AxisExtrasDemo.tsx', code: AxisExtrasSrc, C: AxisExtrasDemo }],
  [
    { name: 'groups', type: '{ getValue(value, index), format? }[]', description: 'Group levels drawn outward from the axis; consecutive categories share a bracket.' },
    { name: 'thumbnails', type: '{ url(value), size?, radius?, hideLabel? }', description: 'Images next to each tick (also exported to SVG).' },
    { name: 'annotations', type: 'AxisAnnotation[]', description: '{ value } markers (dot, flag, diamond, triangle, star) or { start, end } spans with label and description.' },
    { name: 'annotationFormat', type: "'span' | 'summary'", description: 'Summary collapses all annotations into one badge.' },
    { name: '<AxisGroup> / <AxisThumbnail> / <AxisAnnotation>', type: 'children of <Axis>', description: 'Children API equivalents reading from data keys.' },
  ],
);

export const PointAnnotationsPage = chartPage(
  'Point annotations',
  'Callouts on data points, paths connecting scatter points, and collision-aware point labels.',
  [{ title: 'PointAnnotationsDemo.tsx', code: PointAnnotationsSrc, C: PointAnnotationsDemo }],
  [
    { name: 'pointAnnotations', type: 'PointAnnotationOptions[]', description: '{ x, y? | seriesId, label, anchor, color, offset }.' },
    { name: '<LinePointAnnotation>', type: 'child of Line / Bar', description: "dimensionValue: a value or 'first' | 'last' | 'max' | 'min'." },
    { name: 'scatterPaths', type: 'ScatterPathOptions[]', description: 'Connects points per groupBy value (data or x order).' },
    { name: 'scatterLabels', type: 'ScatterLabelOptions[]', description: 'Labels from a field; overlapping labels are skipped.' },
  ],
);

export const RadialLinePage = chartPage(
  'Radial lines',
  'Lines and areas in polar coordinates: closed loops over categories, or continuous angles such as hours of the day.',
  [{ title: 'RadialLineDemo.tsx', code: RadialLineSrc, C: RadialLineDemo }],
  [
    { name: 'angles', type: '(string | number | Date)[]', description: 'Angle per value: categories are spaced evenly, numbers map onto the sweep.' },
    { name: 'angleDomain', type: '[number, number]', description: 'Numeric angle domain (e.g. [0, 24] for hours).' },
    { name: 'innerRadius / startAngle / endAngle', type: 'number | string', description: 'Hole and sweep (degrees).' },
    { name: 'area / curve / closed / showMarks', type: 'boolean', description: 'Fill, smoothing, loop closing and markers.' },
  ],
);

export const CompositionPage = chartPage(
  'Composition: hooks & slots',
  'Draw your own layers with the chart scales, or replace the tooltip, legend and overlays with React components.',
  [{ title: 'CompositionDemo.tsx', code: CompositionSrc, C: CompositionDemo }],
  [
    { name: 'useXScale / useYScale', type: '(axisId?) => Scale', description: 'scale.map(value) gives pixels; updates on data, resize and zoom.' },
    { name: 'useDrawingArea', type: '() => { left, top, width, height }', description: 'Plot rectangle.' },
    { name: 'useSeries / useLegend / useChartLayout', type: 'hooks', description: 'Resolved series, legend items with toggle/highlight, full layout.' },
    { name: '<ChartsSvgLayer>', type: 'component', description: 'An SVG layer over the plot for custom drawing.' },
    { name: 'slots', type: '{ tooltip, legend, loadingOverlay, noDataOverlay }', description: 'Replace built-in pieces; slotProps passes extra props.' },
  ],
);

export const WorkerRenderingPage = chartPage(
  'Worker rendering',
  'Run a whole chart inside a Web Worker: data, layout, GPU drawing, text and hit testing happen off the main thread, so heavy page work never stalls the chart.',
  [
    { title: 'WorkerDemo.tsx', code: WorkerSrc, C: WorkerDemo, text: 'Press the button: the main-thread chart freezes for three seconds while the worker chart keeps streaming.' },
    { title: 'chart.worker.ts', code: WorkerFileSrc, C: () => <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 2px' }}>Use “Show code” to view the worker file.</div>, text: 'The worker file. Only the series types it registers are bundled into the worker.' },
  ],
  [
    { name: 'startChartWorker({ series, backends, setup? })', type: 'worker', description: 'Starts the runtime inside a worker; setup receives { appendData, setOptions, getOptions }.' },
    { name: '<WorkerChart worker options />', type: 'React', description: 'Transfers a canvas to the worker (OffscreenCanvas), forwards size and pointer input, shows tooltips.' },
    { name: 'new WorkerChart(el, worker, options)', type: 'core', description: 'Framework-agnostic host with setOptions, appendData and destroy.' },
    { name: 'Options', type: 'structured clone', description: 'Options cross a thread boundary, so functions (formatters, callbacks) are dropped.' },
  ],
);

export const HydrationPage = chartPage(
  'Server rendering & hydration',
  'Send a real SVG chart in the server HTML, then let the GPU chart take over in place with no flash and no repeated entrance animation.',
  [{ title: 'HydrationDemo.tsx', code: HydrationSrc, C: HydrationDemo }],
  [
    { name: 'renderToSVGString(options, { series, width, height })', type: 'server', description: 'Renders without a DOM or GPU; the SVG carries data-rgl-ssr.' },
    { name: 'serverSvg', type: 'string', description: 'React prop: shows the SVG until the first GPU frame, then cross-fades.' },
    { name: 'hydrateChart(container, options, config)', type: 'core', description: 'Framework-agnostic takeover of an SVG already in the container.' },
  ],
);
