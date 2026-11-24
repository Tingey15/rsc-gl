import { withBase } from '../base';
import HeroCharts from '../demos/misc/HeroCharts';
import LegacyParity from '../demos/misc/LegacyParity';
import LegacyParitySrc from '../demos/misc/LegacyParity.tsx?raw';
import { Callout, Demo, H2, H3, Page, PropsTable } from '../components/docs';
import { CodeBlock } from '../components/highlight';

const CARDS = [
  { href: '/charts/bars', title: 'Bars', text: 'Grouped, stacked, horizontal, labels' },
  { href: '/charts/lines', title: 'Lines', text: '12 curves, dashes, forecasts, time axes' },
  { href: '/charts/areas', title: 'Areas', text: 'Stacked areas and floating bands' },
  { href: '/charts/scatter', title: 'Scatter & bubble', text: 'Symbols, bubbles, millions of points' },
  { href: '/charts/pie', title: 'Pie & donut', text: 'SDF slices, padding, rounded corners' },
  { href: '/charts/sparkline-gauge', title: 'Sparklines & gauges', text: 'Compact KPI visuals' },
  { href: '/charts/combo', title: 'Combo & dual axes', text: 'Mixed series and secondary axes' },
  { href: '/3d/surface', title: '3D surfaces', text: 'Lit height fields that morph' },
  { href: '/3d/bars', title: '3D bars', text: 'Instanced, lit category grids' },
  { href: '/3d/scatter', title: '3D scatter', text: 'Sphere sprites with orbit camera' },
];

export function OverviewPage() {
  return (
    <Page title="GPU-native charts for React" lede="A WebGPU and WebGL2 charting engine with a composable React API, smooth GPU animations, 3D charts, and first-class accessibility.">
      <HeroCharts />
      <div className="stats">
        <div className="stat">
          <b>WebGPU + WebGL2</b>
          <span>one HAL, both backends</span>
        </div>
        <div className="stat">
          <b>2 APIs</b>
          <span>children and props</span>
        </div>
        <div className="stat">
          <b>Tree-shakeable</b>
          <span>pay per series type</span>
        </div>
        <div className="stat">
          <b>2D + 3D</b>
          <span>shared device and frame loop</span>
        </div>
      </div>
      <H2>Chart types</H2>
      <div className="grid-cards">
        {CARDS.map((c) => (
          <a key={c.href} className="card" href={withBase(c.href)}>
            <h4>{c.title}</h4>
            <p>{c.text}</p>
          </a>
        ))}
      </div>
      <H2>Why a GPU engine?</H2>
      <ul>
        <li>
          <b>Scale:</b> instanced rendering draws millions of marks per frame; animations interpolate on the GPU with zero buffer uploads per frame.
        </li>
        <li>
          <b>Many charts:</b> one device per page and one frame loop, so dashboards never hit browser context limits.
        </li>
        <li>
          <b>Quality:</b> signed-distance-field shapes give crisp, anti-aliased bars, slices, symbols and lines at any DPR or zoom.
        </li>
        <li>
          <b>Familiar APIs:</b> declarative children (<code>&lt;Chart&gt;&lt;Bar/&gt;&lt;Axis/&gt;&lt;/Chart&gt;</code>) or props-driven components (
          <code>&lt;BarChart series=… /&gt;</code>).
        </li>
      </ul>
    </Page>
  );
}

export function QuickstartPage() {
  return (
    <Page title="Quickstart" lede="Install the React package and render your first GPU chart.">
      <H2>Install</H2>
      <CodeBlock code={`npm install @rsc-gl/react\n# optional 3D charts\nnpm install @rsc-gl/3d`} />
      <H2>Props API</H2>
      <CodeBlock
        code={`import { BarChart } from '@rsc-gl/react';

export function Revenue() {
  return (
    <BarChart
      height={320}
      xAxis={[{ data: ['Q1', 'Q2', 'Q3', 'Q4'] }]}
      series={[
        { data: [42, 58, 61, 77], label: '2025' },
        { data: [51, 63, 70, 88], label: '2026' },
      ]}
    />
  );
}`}
      />
      <H2>Children API</H2>
      <CodeBlock
        code={`import { Axis, Bar, Chart, ChartTooltip, Legend } from '@rsc-gl/react';

<Chart data={rows} height={360}>
  <Axis position="bottom" baseline title="Browser" />
  <Axis position="left" grid numberFormat="shortNumber" />
  <Bar dimension="browser" metric="downloads" color="os" type="dodged">
    <ChartTooltip>{(d) => <b>{d.downloads}</b>}</ChartTooltip>
  </Bar>
  <Legend isToggleable highlight />
</Chart>`}
      />
      <H2>Choosing backends</H2>
      <p>
        By default charts use WebGPU when available and fall back to WebGL2. Wrap your app in <code>ChartsEngineProvider</code> to choose backends; pass a
        single backend to bundle only that one.
      </p>
      <CodeBlock
        code={`import { ChartsEngineProvider } from '@rsc-gl/react';
import { webgl2Backend } from '@rsc-gl/gpu/webgl2';

<ChartsEngineProvider backends={[webgl2Backend]}>
  <App />
</ChartsEngineProvider>`}
      />
      <H2>Without React</H2>
      <CodeBlock
        code={`import { Chart, RenderEngine, barSeries } from '@rsc-gl/core';
import { webgpuBackend } from '@rsc-gl/gpu/webgpu';
import { webgl2Backend } from '@rsc-gl/gpu/webgl2';

const chart = new Chart(document.getElementById('host')!, {
  xAxis: [{ data: ['A', 'B', 'C'] }],
  series: [{ type: 'bar', data: [3, 7, 5] }],
}, { series: [barSeries], engine: { backends: [webgpuBackend, webgl2Backend] } });

chart.setOptions({ ...chart.getOptions(), series: [{ type: 'bar', data: [6, 2, 8] }] }); // animates`}
      />
      <Callout>Each chart component registers only the series types it renders, so a page with only bar charts never bundles the pie or scatter code.</Callout>
    </Page>
  );
}

export function ArchitecturePage() {
  return (
    <Page title="Architecture" lede="How the engine is layered, and why each layer exists.">
      <H2>Packages</H2>
      <PropsTable
        rows={[
          { name: '@rsc-gl/gpu', type: 'HAL', description: 'WebGPU-shaped device, buffer, texture, pipeline and render-pass API with WebGPU and WebGL2 backends (separate entry points).' },
          { name: '@rsc-gl/core', type: 'Engine', description: 'Scheduler, chart orchestration, scales, layout, marks, series registry, interaction, animation, accessibility, formatting, themes.' },
          { name: '@rsc-gl/react', type: 'Bindings', description: 'Children API, props API, engine provider, hooks.' },
          { name: '@rsc-gl/3d', type: '3D', description: 'Orbit camera, lit boxes, sphere sprites, surfaces, 3D axes; React bindings at /react.' },
        ]}
      />
      <H2>Frame pipeline</H2>
      <ol>
        <li>Options are normalized into series (facets expanded, colors assigned, stacks computed).</li>
        <li>Cartesian layout measures tick labels, sizes axes, and builds final scales (two passes).</li>
        <li>Each series renderer converts data to mark items keyed for transitions.</li>
        <li>Marks write from/to attributes into instance buffers (only when data changes).</li>
        <li>The shared scheduler renders dirty charts once per animation frame; GPU interpolation drives motion.</li>
        <li>Axes and labels draw on a Canvas2D overlay; legend, tooltip and semantics are HTML.</li>
      </ol>
      <H2>Shader contract</H2>
      <p>
        Every mark ships hand-written GLSL ES 3.00 and WGSL that share attribute locations and one uniform block. The uniform declarations are generated
        from a single layout, restricted to <code>f32 / vec2 / vec4 / mat4</code> so std140 and WGSL packing are identical.
      </p>
      <H3>Context limits</H3>
      <p>
        WebGPU: one device presents to many canvases. WebGL2: one shared context renders each chart into a scissored region of a shared drawing buffer and
        blits it to the chart's own 2D canvas.
      </p>
      <H3>Device loss</H3>
      <p>All CPU-side state is retained. On loss the engine recreates the device and every mark rebuilds its GPU resources lazily.</p>
    </Page>
  );
}

export function MigrationPage() {
  return (
    <Page title="Migrating from spec-based charts" lede="The children API keeps the familiar declarative model: long-format data, dimension/metric props, faceted colors and child components.">
      <H2>What stays the same</H2>
      <ul>
        <li>
          <code>&lt;Chart data&gt;</code> with long-format rows; <code>dimension</code>, <code>metric</code>, <code>color</code> facets (string field or{' '}
          <code>{'{ value }'}</code>).
        </li>
        <li>
          <code>Axis</code>, <code>Legend</code>, <code>ChartTooltip</code> (or <code>ChartInspect</code>), <code>ChartPopover</code>, <code>ReferenceLine</code>,{' '}
          <code>Title</code>, <code>Annotation</code>, <code>Trendline</code>, <code>TrendlineAnnotation</code>, <code>MetricRange</code>,{' '}
          <code>LinePointAnnotation</code>, <code>ScatterAnnotation</code>, <code>ScatterPath</code>, <code>AxisAnnotation</code>, <code>AxisThumbnail</code>,{' '}
          <code>DonutSummary</code>, <code>SegmentLabel</code>, <code>BigNumber</code>, <code>Combo</code>, <code>Bullet</code>, <code>Venn</code>,{' '}
          <code>EmptyState</code>, and the newer <code>BarDirectLabel</code>, <code>LineDirectLabel</code> and <code>LineForecast</code>.
        </li>
        <li>
          The same defaults: a mark draws in one color unless <code>color</code> names a key, the axis line appears only with <code>baseline</code>,
          value axes use <code>shortNumber</code>, titles are centered, charts are 300 px tall, and named palettes and color tokens resolve to the
          same values.
        </li>
        <li>
          Each mark&apos;s <code>ChartTooltip</code>, <code>ChartPopover</code>, <code>onClick</code>, <code>onMouseOver</code> and{' '}
          <code>onMouseOut</code> apply to that mark only; split series are named by their facet value, so <code>hiddenSeries</code>,{' '}
          <code>highlightedSeries</code> and legend callbacks receive the same names.
        </li>
        <li>
          Controlled <code>hiddenSeries</code> / <code>highlightedSeries</code> / <code>highlightedItem</code> (with <code>idKey</code>),{' '}
          <code>loading</code>, <code>emptyStateText</code>, ref methods <code>copy</code>, <code>download</code>, <code>getBase64Png</code>,{' '}
          <code>getSvg</code>.
        </li>
        <li>Axes that are not declared are not drawn.</li>
      </ul>
      <H2>Legacy code, unchanged</H2>
      <p>
        These charts use only the legacy component API: a dual metric axis with bar annotations and a controlled legend, a forecast with direct labels,
        static-point callouts and a hover-only trendline, truncated labels with hover text, direct bar labels and outside segment labels.
      </p>
      <Demo title="LegacyParity.tsx" code={LegacyParitySrc}>
        <LegacyParity />
      </Demo>
      <H2>What changes</H2>
      <PropsTable
        rows={[
          { name: 'renderer', type: 'removed', description: 'Always GPU. Choose backends with ChartsEngineProvider.' },
          { name: 'UNSAFE spec / config props', type: 'removed', description: 'Use the props API or custom series definitions instead of raw specs.' },
          { name: 'onVegaViewReady', type: 'onReady', description: 'Called with the chart engine instance once it has a GPU device.' },
          { name: 'theme (renderer config)', type: 'colorScheme', description: 'Styling comes from colorScheme, colors and the engine theme option.' },
          { name: 'getSvg()', type: 'vector', description: 'True vector SVG (marks, axes, labels, legend).' },
          {
            name: 'Not yet supported',
            type: 'facets',
            description:
              'Opacity, lineType and size facets by key on bars and scatter, dodged-and-stacked bars ([key, key] facets), bar border dashes, legend facets and keys, and the Vega-specific hooks.',
          },
        ]}
      />
      <H2>Codemod</H2>
      <p>
        <code>@rsc-gl/codemod</code> rewrites imports from the legacy package (including pre-release sub-paths), removes renderer-specific props
        such as <code>renderer</code>, <code>config</code> and the raw spec escape hatch from the legacy components only, and renames{' '}
        <code>onVegaViewReady</code> to <code>onReady</code>. Props that changed meaning get a TODO note.
      </p>
      <CodeBlock code={`npx rsc-gl-migrate src --from <legacy-package-name> --dry   # preview
npx rsc-gl-migrate src --from <legacy-package-name>         # apply`} />
      <H2>Side-by-side</H2>
      <CodeBlock
        code={`// Before and after look the same:
<Chart data={data} height={400}>
  <Axis position="bottom" baseline />
  <Axis position="left" grid />
  <Line dimension="datetime" metric="value" color="series" />
  <Legend isToggleable />
</Chart>`}
      />
    </Page>
  );
}

export function ApiReferencePage() {
  return (
    <Page title="API reference" lede="Core option types shared by every chart. Component pages list chart-specific props.">
      <H2>Chart options</H2>
      <PropsTable
        rows={[
          { name: 'series', type: 'SeriesOptions[]', description: 'Series of any registered type.' },
          { name: 'data / dataset', type: 'Datum[]', description: 'Long-format rows / wide rows for `dataKey`.' },
          { name: 'xAxis / yAxis', type: 'AxisOptions[]', description: 'Axis definitions (ids referenced by series).' },
          { name: 'legend', type: 'LegendOptions | boolean', description: 'HTML legend.' },
          { name: 'tooltip', type: 'TooltipOptions | boolean', description: 'Trigger, anchor, placement, render hook.' },
          { name: 'grid', type: '{ horizontal?, vertical? }', description: 'Gridlines (animated with ticks).' },
          { name: 'referenceLines', type: 'ReferenceLineOptions[]', description: 'Horizontal or vertical lines with labels.' },
          { name: 'title / description', type: 'string | { text, subtitle, align }', description: 'Title and accessible description.' },
          { name: 'colors', type: 'palette name | string[] | (scheme) => string[]', description: 'Categorical palette.' },
          { name: 'colorScheme', type: "'light' | 'dark'", default: "'light'", description: 'Theme.' },
          { name: 'theme', type: 'Partial<ChartTheme>', description: 'Fonts, text, grid and tooltip colors, fade opacity.' },
          { name: 'margin', type: '{ top, right, bottom, left }', description: 'Outer padding.' },
          { name: 'locale', type: 'string | LocaleOptions', default: "'en-US'", description: 'Formatting locale.' },
          { name: 'animation', type: 'boolean | AnimationOptions', description: 'Transitions.' },
          { name: 'hiddenSeries / defaultHiddenSeries', type: 'string[]', description: 'Controlled / initial visibility.' },
          { name: 'highlightedItem', type: 'ItemIdentifier | null', description: 'Controlled highlight.' },
          { name: 'highlightScope', type: '{ highlight, fade }', description: 'Highlight behaviour.' },
          { name: 'loading / noDataText', type: 'boolean / string', description: 'Overlays.' },
          { name: 'keyboardNavigation', type: 'boolean', default: 'true', description: 'Arrow-key navigation.' },
          { name: 'on…', type: 'onItemClick, onAxisClick, onItemContextMenu, onHighlightChange, onHiddenSeriesChange, onLegendClick', description: 'Events.' },
        ]}
      />
      <H2>Common series options</H2>
      <PropsTable
        rows={[
          { name: 'type', type: "'bar' | 'line' | 'area' | 'scatter' | 'pie' | custom", description: 'Series type (must be registered).' },
          { name: 'id / label', type: 'string', description: 'Identity and display name.' },
          { name: 'data', type: '(number | null)[] | Datum[]', description: 'Values aligned with categories, or rows.' },
          { name: 'dataKey', type: 'string', description: 'Field of the chart dataset.' },
          { name: 'dimension / metric / groupBy', type: 'string', description: 'Long-format mapping; groupBy splits into series.' },
          { name: 'color / colorField / colors', type: 'string / string / palette', description: 'Static color, per-row color field, group palette.' },
          { name: 'xAxisId / yAxisId', type: 'string', description: 'Axis binding.' },
          { name: 'valueFormatter / numberFormat', type: 'fn / NumberFormat', description: 'Tooltip and label formatting.' },
          { name: 'highlightScope', type: '{ highlight, fade }', description: 'Per-series override.' },
          { name: 'opacity', type: 'number', description: 'Mark opacity.' },
        ]}
      />
      <H2>Custom series types</H2>
      <p>
        A series type is a <code>SeriesDefinition</code>: <code>normalize</code>, optional <code>requirements</code> (axis domains), <code>process</code>{' '}
        (stacking), <code>createRenderer</code> (GPU marks), <code>legendEntries</code> and <code>formatValue</code>. Register it by passing it to{' '}
        <code>GLChart</code> / <code>Chart</code> in the core package.
      </p>
    </Page>
  );
}
