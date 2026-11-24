import { BarChart, LineChart } from '@rsc-gl/react';
import AnimatedUpdates from '../demos/misc/AnimatedUpdates';
import AnimatedUpdatesSrc from '../demos/misc/AnimatedUpdates.tsx?raw';
import Streaming from '../demos/misc/Streaming';
import StreamingSrc from '../demos/misc/Streaming.tsx?raw';
import Dashboard from '../demos/misc/Dashboard';
import DashboardSrc from '../demos/misc/Dashboard.tsx?raw';
import SyncedHighlight from '../demos/misc/SyncedHighlight';
import SyncedHighlightSrc from '../demos/misc/SyncedHighlight.tsx?raw';
import ExportDemo from '../demos/misc/ExportDemo';
import ExportDemoSrc from '../demos/misc/ExportDemo.tsx?raw';
import Locales from '../demos/misc/Locales';
import LocalesSrc from '../demos/misc/Locales.tsx?raw';
import Palettes from '../demos/misc/Palettes';
import PalettesSrc from '../demos/misc/Palettes.tsx?raw';
import CustomTooltip from '../demos/misc/CustomTooltip';
import CustomTooltipSrc from '../demos/misc/CustomTooltip.tsx?raw';
import TimeSeries from '../demos/lines/TimeSeries';
import MillionPoints from '../demos/scatter/MillionPoints';
import ComposableBars from '../demos/bars/ComposableBars';
import ComposableBarsSrc from '../demos/bars/ComposableBars.tsx?raw';
import { revenue } from '../demos/data';
import { Callout, Demo, H2, H3, Page, PropsTable, useSite } from '../components/docs';
import { CodeBlock } from '../components/highlight';

export function AnimationPage() {
  return (
    <Page title="Animation" lede="Every mark stores its start and end state on the GPU. The vertex shader interpolates them with one progress uniform, so a running transition uploads no buffers at all.">
      <H2>Data transitions</H2>
      <p>
        Items are matched by key across updates: existing items animate from their <em>on-screen</em> position (even mid-transition), new items enter
        (bars grow from the baseline, points scale in, slices sweep), and removed items exit before they are dropped.
      </p>
      <Demo title="AnimatedUpdates.tsx" code={AnimatedUpdatesSrc}>
        <AnimatedUpdates />
      </Demo>
      <H2>Options</H2>
      <PropsTable
        rows={[
          { name: 'animation', type: 'boolean | { duration, easing, stagger, enter }', default: '{ duration: 600, easing: "cubicInOut" }', description: 'Chart-level transition settings. `false` disables animation.' },
          { name: 'easing', type: "'linear' | 'cubicInOut' | 'cubicOut' | 'backOut' | 'elasticOut' | 'quadOut'", description: 'Evaluated identically on the CPU and the GPU.' },
          { name: 'stagger', type: 'number (0..1)', default: '0', description: 'Fraction of the duration spread across items in order.' },
          { name: 'enter', type: 'boolean', default: 'true', description: 'Initial draw-in (grow, sweep, reveal).' },
          { name: 'skipAnimation', type: 'boolean', description: 'Props-API shorthand for `animation: false`.' },
        ]}
      />
      <Callout>
        <b>Reduced motion:</b> when the user prefers reduced motion, transitions are skipped automatically.
      </Callout>
      <H2>How it works</H2>
      <CodeBlock
        code={`// Vertex shader (excerpt, same contract in GLSL and WGSL)
float t = localT(a_delay);              // per-instance stagger + easing
vec4 rect = mix(a_from, a_to, t);       // geometry interpolation
vec4 color = mix(a_colorFrom, a_colorTo, t);`}
      />
    </Page>
  );
}

export function InteractionPage() {
  return (
    <Page title="Highlighting & interaction" lede="Hover, focus and legend interactions write a single highlight uniform; fading happens in the fragment shader without re-uploading geometry.">
      <H2>Highlight scope</H2>
      <p>
        <code>highlightScope</code> controls what lights up (<code>item</code>, <code>series</code>) and what fades (<code>global</code>, <code>none</code>).
        Line charts fade the other series; bars fade every other bar.
      </p>
      <H2>Controlled highlight and synchronised charts</H2>
      <Demo title="SyncedHighlight.tsx" code={SyncedHighlightSrc}>
        <SyncedHighlight />
      </Demo>
      <H2>Click handlers</H2>
      <PropsTable
        rows={[
          { name: 'onItemClick', type: '(item: { seriesId, dataIndex, datum, value }, event) => void', description: 'Clicked mark.' },
          { name: 'onAxisClick', type: '({ axisValue, dataIndex }, event) => void', description: 'Click anywhere in a category band.' },
          { name: 'onItemContextMenu', type: '(item, event) => void', description: 'Right-click on a mark.' },
          { name: 'highlightedItem', type: '{ seriesId, dataIndex? } | null', description: 'Controlled highlight.' },
          { name: 'onHighlightChange', type: '(item | null) => void', description: 'Pointer, keyboard and legend highlight changes.' },
          { name: 'axisHighlight', type: "{ x?: 'none' | 'line' | 'band' }", description: 'Crosshair line or category band.' },
        ]}
      />
      <H2>Zoom & pan</H2>
      <p>
        Set <code>zoom: true</code> on a continuous x axis. Scroll to zoom around the cursor, drag to pan, and double-click to reset. Zooming only
        changes scale domains, so GPU buffers are rewritten in place without allocation.
      </p>
      <Demo>
        <MillionPoints />
      </Demo>
    </Page>
  );
}

export function LegendTooltipPage() {
  const { scheme } = useSite();
  return (
    <Page title="Legend & tooltip" lede="HTML legends and tooltips stay accessible, themeable and easy to customise while the marks render on the GPU.">
      <H2>Legend</H2>
      <p>
        Click entries to toggle series (hidden series animate out, and axes rescale), and hover to highlight. Entries are buttons with{' '}
        <code>aria-pressed</code>.
      </p>
      <Demo>
        <BarChart
          height={280}
          colorScheme={scheme}
          legend={{ position: 'right', title: 'Revenue streams', toggleable: true }}
          xAxis={[{ data: revenue.months.slice(0, 6) }]}
          series={[
            { data: revenue.product.slice(0, 6), label: 'Product', stack: 's' },
            { data: revenue.services.slice(0, 6), label: 'Services', stack: 's' },
            { data: revenue.licensing.slice(0, 6), label: 'Licensing', stack: 's' },
          ]}
        />
      </Demo>
      <PropsTable
        rows={[
          { name: 'position', type: "'top' | 'bottom' | 'left' | 'right'", default: "'bottom'", description: 'Placement around the plot.' },
          { name: 'align', type: "'start' | 'middle' | 'end'", default: "'middle'", description: 'Alignment for horizontal legends.' },
          { name: 'toggleable', type: 'boolean', default: 'true', description: 'Click toggles series visibility.' },
          { name: 'highlight', type: 'boolean', default: 'true', description: 'Hover highlights the series.' },
          { name: 'labels / descriptions', type: 'Record<seriesId, string>', description: 'Override labels; descriptions show on hover.' },
          { name: 'hiddenEntries', type: 'string[]', description: 'Series kept out of the legend.' },
        ]}
      />
      <H2>Tooltip</H2>
      <p>
        <code>trigger: 'axis'</code> lists every series at the hovered category. <code>'item'</code> shows only the hovered mark. Provide{' '}
        <code>renderTooltip</code> to render any React content. The engine still positions and flips it.
      </p>
      <Demo title="CustomTooltip.tsx" code={CustomTooltipSrc}>
        <CustomTooltip />
      </Demo>
    </Page>
  );
}

export function AxesPage() {
  const { scheme } = useSite();
  return (
    <Page title="Axes" lede="Band, point, linear, log, symlog, pow, sqrt, time and UTC scales, with multiple axes per side, label rotation, two-row time labels and animated gridlines.">
      <H2>Scale types</H2>
      <div className="row">
        <Demo>
          <LineChart
            height={220}
            colorScheme={scheme}
            hideLegend
            yAxis={[{ scaleType: 'log', label: 'log scale' }]}
            xAxis={[{ data: [1, 2, 3, 4, 5, 6, 7, 8], scaleType: 'linear' }]}
            series={[{ data: [2, 9, 40, 180, 900, 3800, 16000, 90000], showMark: true }]}
          />
        </Demo>
        <Demo>
          <BarChart
            height={220}
            colorScheme={scheme}
            hideLegend
            xAxis={[{ data: ['Alpha centauri', 'Barnard star', 'Wolf 359', 'Lalande 21185', 'Sirius'], tickLabelAngle: -30 }]}
            series={[{ data: [4.2, 6, 7.9, 8.3, 8.6], valueFormatter: (v) => `${v} ly` }]}
          />
        </Demo>
      </div>
      <H2>Time axes</H2>
      <Demo>
        <TimeSeries />
      </Demo>
      <H2>Axis options</H2>
      <PropsTable
        rows={[
          { name: 'scaleType', type: "'band' | 'point' | 'linear' | 'log' | 'symlog' | 'pow' | 'sqrt' | 'time' | 'utc'", description: 'Inferred from series when omitted.' },
          { name: 'data / dataKey', type: 'values[] / string', description: 'Categories for ordinal axes.' },
          { name: 'position', type: "'top' | 'bottom' | 'left' | 'right' | 'none'", description: '`none` keeps the scale but hides the axis.' },
          { name: 'min / max / reverse', type: 'number | Date / boolean', description: 'Domain overrides.' },
          { name: 'domainLimit', type: "'nice' | 'strict' | (min, max) => { min, max }", default: "'nice'", description: 'Domain rounding (time axes default to strict).' },
          { name: 'tickNumber / tickValues', type: 'number / values[]', description: 'Tick density or explicit ticks.' },
          { name: 'tickLabelAngle', type: 'number', description: 'Rotated labels; axis size adapts.' },
          { name: 'valueFormatter / numberFormat', type: 'fn / preset | d3 specifier', description: 'Tick and tooltip formatting.' },
          { name: 'labelFormat / granularity', type: "'linear' | 'percentage' | 'duration' | 'time'", description: 'Format families (time labels render two rows).' },
          { name: 'categoryGapRatio / barGapRatio', type: 'number', description: 'Band spacing.' },
          { name: 'zoom', type: 'boolean | { minSpan, maxSpan }', description: 'Wheel / drag zoom on continuous axes.' },
        ]}
      />
    </Page>
  );
}

export function StylingPage() {
  return (
    <Page title="Styling & theming" lede="Light and dark color schemes, named palettes, design tokens, line types, symbol sizes and CSS variables for the HTML chrome.">
      <H2>Palettes and tokens</H2>
      <p>
        <code>colors</code> accepts a palette name, an array of CSS colors, or design tokens such as <code>blue-900</code> and{' '}
        <code>categorical-300</code>. Tokens adapt to dark mode.
      </p>
      <Demo title="Palettes.tsx" code={PalettesSrc}>
        <Palettes />
      </Demo>
      <H2>Dark mode</H2>
      <p>
        Set <code>colorScheme="dark"</code>. Use the moon button in the top bar to switch every demo on this site.
      </p>
      <H2>CSS hooks</H2>
      <CodeBlock
        code={`.rgl-root { --rgl-font: 'Inter'; --rgl-tooltip-bg: #101114; }
.rgl-legend-item[data-hidden] { opacity: .3; }
.rgl-tooltip { border-radius: 12px; }`}
      />
      <H2>Line types, widths and symbols</H2>
      <PropsTable
        rows={[
          { name: 'lineType', type: "'solid' | 'dashed' | 'dotted' | 'dotDash' | 'shortDash' | 'longDash' | 'twoDash' | number[]", description: 'Dash patterns.' },
          { name: 'lineWidth', type: "'XS' | 'S' | 'M' | 'L' | 'XL' | number", description: '1, 1.5, 2, 3, 4 px.' },
          { name: 'markerSize', type: "'XS' | 'S' | 'M' | 'L' | 'XL' | number", description: '6, 8, 10, 12, 16 px.' },
          { name: 'shape', type: "'circle' | 'square' | 'rounded-square' | 'diamond' | 'triangle-up' | 'triangle-down' | 'triangle-right' | 'cross'", description: 'SDF marker shapes.' },
        ]}
      />
    </Page>
  );
}

export function LocalizationPage() {
  return (
    <Page title="Formatting & localization" lede="Number presets, d3-format specifiers, Intl-based compact and currency formatting, durations and localized time labels.">
      <H2>Locales and number formats</H2>
      <Demo title="Locales.tsx" code={LocalesSrc}>
        <Locales />
      </Demo>
      <PropsTable
        rows={[
          { name: 'locale', type: "string | { code, number?, time? }", default: "'en-US'", description: 'BCP 47 code or custom d3 locale definitions.' },
          { name: 'numberFormat', type: "'standardNumber' | 'shortNumber' | 'currency' | 'shortCurrency' | 'percentage' | d3 specifier | fn", description: 'On axes and series.' },
          { name: 'labelFormat', type: "'percentage' | 'duration' | 'time'", description: 'Axis label families.' },
          { name: 'granularity', type: "'second' … 'year'", description: 'Time label granularity (inferred when omitted).' },
          { name: 'noDataText / loadingText', type: 'string', description: 'Localizable built-in strings.' },
        ]}
      />
    </Page>
  );
}

export function AccessibilityPage() {
  const { scheme } = useSite();
  return (
    <Page title="Accessibility" lede="Canvas charts with a semantic HTML layer: keyboard navigation, live announcements, generated descriptions and accessible legends.">
      <H2>Keyboard navigation</H2>
      <p>Click the chart (or Tab to it) and use the keys below. The focused item is highlighted, its tooltip opens, and a live region announces it.</p>
      <Demo>
        <BarChart height={260} colorScheme={scheme} title="Quarterly revenue" xAxis={[{ data: ['Q1', 'Q2', 'Q3', 'Q4'] }]} series={[{ data: [42, 58, 61, 77], label: '2025' }, { data: [51, 63, 70, 88], label: '2026' }]} />
      </Demo>
      <table className="props">
        <thead>
          <tr>
            <th>Key</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['← / →', 'Previous / next item in the series'],
            ['↑ / ↓', 'Previous / next series'],
            ['Home / End', 'First / last item'],
            ['Enter / Space', 'Activate (onItemClick, popovers)'],
            ['Esc', 'Leave item navigation'],
          ].map(([k, a]) => (
            <tr key={k}>
              <td>
                <code>{k}</code>
              </td>
              <td>{a}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <H2>Semantics</H2>
      <ul>
        <li>
          The root has <code>role="graphics-document"</code> and an <code>aria-label</code> generated from the title, chart type and series names (override
          it with <code>description</code>).
        </li>
        <li>Legend entries are buttons with <code>aria-pressed</code>; tooltips use <code>role="tooltip"</code>; gauges use <code>role="meter"</code>.</li>
        <li>The GPU and overlay canvases are <code>aria-hidden</code>. All information is available through the semantic layer.</li>
        <li>Reduced-motion preferences disable transitions.</li>
      </ul>
    </Page>
  );
}

export function ExportPage() {
  return (
    <Page title="Export" lede="Composite the GPU canvas, text overlay, title and legend into PNG, JPEG or WebP, or copy to the clipboard.">
      <Demo title="ExportDemo.tsx" code={ExportDemoSrc}>
        <ExportDemo />
      </Demo>
      <PropsTable
        rows={[
          { name: 'download(fileName?)', type: 'Promise', description: 'Downloads a PNG (named after the title by default).' },
          { name: 'copy()', type: 'Promise', description: 'Copies a PNG to the clipboard.' },
          { name: 'getBase64Png()', type: 'Promise<string>', description: 'PNG data URL.' },
          { name: 'getSvg()', type: 'Promise<string>', description: 'Vector SVG of marks, axes, labels and legend.' },
          { name: 'exportAsImage({ type, quality, fileName })', type: 'Promise', description: 'PNG, JPEG or WebP.' },
        ]}
      />
    </Page>
  );
}

export function PerformancePage() {
  return (
    <Page title="Performance" lede="One GPU device per page, one frame loop, on-demand rendering and typed-array fast paths.">
      <div className="stats">
        <div className="stat">
          <b>1 device</b>
          <span>shared by every chart</span>
        </div>
        <div className="stat">
          <b>0 uploads</b>
          <span>per animation frame</span>
        </div>
        <div className="stat">
          <b>2M+</b>
          <span>points interactive</span>
        </div>
        <div className="stat">
          <b>On demand</b>
          <span>idle charts cost nothing</span>
        </div>
      </div>
      <H2>Dashboards with many charts</H2>
      <p>
        Browsers cap WebGL contexts at about 16 per page. Charts here never own a context: WebGPU presents one device to many canvases, and WebGL2 renders
        into one shared context and copies each frame into the chart's own canvas.
      </p>
      <Demo title="Dashboard.tsx" code={DashboardSrc}>
        <Dashboard />
      </Demo>
      <H2>Streaming data</H2>
      <Demo title="Streaming.tsx" code={StreamingSrc}>
        <Streaming />
      </Demo>
      <H2>Tips</H2>
      <ul>
        <li>
          Use <code>positions</code> typed arrays for scatter plots over ~25k points (automatic above that threshold).
        </li>
        <li>Inline callbacks are fine: options are compared structurally and callbacks refresh without a relayout.</li>
        <li>
          Large arrays (&gt; 2,000 items) are compared by reference. Create a new array when the data changes.
        </li>
        <li>
          Disable animation (<code>skipAnimation</code>) for high-frequency streaming updates.
        </li>
      </ul>
    </Page>
  );
}

export function ChildrenApiPage() {
  return (
    <Page title="Composable children API" lede="Declare marks, axes, legends, tooltips and popovers as children of a single <Chart>. Long-format rows are split into series by facets.">
      <Demo title="ComposableBars.tsx" code={ComposableBarsSrc}>
        <ComposableBars />
      </Demo>
      <H2>Components</H2>
      <PropsTable
        rows={[
          {
            name: '<Chart>',
            type: 'data, width, height (300), padding, colors, colorScheme, backgroundColor, locale, idKey, hiddenSeries, highlightedSeries, highlightedItem, loading, emptyStateText, animations, onReady…',
            description: 'Root. Owns the GPU surface.',
          },
          {
            name: '<Bar>',
            type: 'dimension, metric, color, type (stacked | dodged), orientation, paddingRatio, paddingOuter, groupedPadding, order, lineWidth, hasSquareCorners, colorOverride, dimensionDataType, metricAxis, dualMetricAxis, onClick, onMouseOver, onMouseOut',
            description: 'Bars. Children: <ChartTooltip>, <ChartPopover>, <Annotation>, <BarDirectLabel>, <Trendline>.',
          },
          {
            name: '<Line>',
            type: 'dimension, metric, color, lineType, lineWidth, scaleType, interpolate, staticPoint (boolean or key), pointSize, isSparkline, isMethodLast, gradient, alternateSegmentKey, metricAxis, dualMetricAxis',
            description: 'Lines, faceted by color and lineType. Children: <MetricRange>, <Trendline>, <LinePointAnnotation>, <LineDirectLabel>, <LineForecast>.',
          },
          { name: '<Area>', type: 'name, dimension, metric, metricStart, metricEnd, color, opacity', description: 'Stacked areas or floating bands.' },
          { name: '<Scatter>', type: 'name, dimension, metric, color, colorScaleType, size, symbolShape, opacity, lineWidth, stroke', description: 'Scatter and bubbles. Children: <ScatterAnnotation>, <ScatterPath>, <Trendline>.' },
          { name: '<Donut>', type: 'metric, color, holeRatio, startAngle, isBoolean, sortOrder, variant', description: 'With <DonutSummary> and <SegmentLabel> (labelKey, percent, value, percentFormat).' },
          { name: '<Combo>', type: 'dimension', description: 'Groups <Bar> and <Line> sharing a dimension.' },
          {
            name: '<Axis>',
            type: 'position, title (string or lines), grid, ticks, baseline, labelFormat, granularity, numberFormat, currencyCode, labels, subLabels, labelAlign, labelFontWeight, truncateLabels, tickCountLimit, tickCountMinimum, tickMinStep, hasTooltip, onClick, range, zoom',
            description: 'Children: <ReferenceLine>, <AxisAnnotation>, <AxisThumbnail>, <AxisGroup>.',
          },
          {
            name: '<Legend>',
            type: 'position, title, isToggleable, highlight, legendLabels, descriptions, hiddenEntries, defaultHiddenSeries, labelLimit, onClick, onMouseOver, onMouseOut',
            description: 'HTML legend.',
          },
          { name: '<ChartTooltip>', type: '(datum) => ReactNode; highlightBy; excludeDataKeys', description: 'React tooltip content for its mark (alias: <ChartInspect>).' },
          { name: '<ChartPopover>', type: '(datum, close) => ReactNode; width; min/max width and height; containerPadding; rightClick; onOpenChange', description: 'Click or right-click popovers, anchored on the mark.' },
          { name: '<Title>', type: 'text, position, fontWeight', description: 'Chart title.' },
          { name: '<BigNumber>', type: 'dataKey, label, method, numberFormat, numberType, orientation, icon', description: 'KPI with optional sparkline (<Line> child).' },
        ]}
      />
    </Page>
  );
}
