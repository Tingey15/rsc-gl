import { LineChart, PieChart } from '@rsc-gl/react';
import BasicLines from '../demos/lines/BasicLines';
import BasicLinesSrc from '../demos/lines/BasicLines.tsx?raw';
import TimeSeries from '../demos/lines/TimeSeries';
import TimeSeriesSrc from '../demos/lines/TimeSeries.tsx?raw';
import Forecast from '../demos/lines/Forecast';
import ForecastSrc from '../demos/lines/Forecast.tsx?raw';
import StackedArea from '../demos/lines/StackedArea';
import StackedAreaSrc from '../demos/lines/StackedArea.tsx?raw';
import Band from '../demos/lines/Band';
import BandSrc from '../demos/lines/Band.tsx?raw';
import Clusters from '../demos/scatter/Clusters';
import ClustersSrc from '../demos/scatter/Clusters.tsx?raw';
import Bubbles from '../demos/scatter/Bubbles';
import BubblesSrc from '../demos/scatter/Bubbles.tsx?raw';
import MillionPoints from '../demos/scatter/MillionPoints';
import MillionPointsSrc from '../demos/scatter/MillionPoints.tsx?raw';
import BasicPie from '../demos/pie/BasicPie';
import BasicPieSrc from '../demos/pie/BasicPie.tsx?raw';
import Donut from '../demos/pie/Donut';
import DonutSrc from '../demos/pie/Donut.tsx?raw';
import LegacyDonut from '../demos/pie/LegacyDonut';
import LegacyDonutSrc from '../demos/pie/LegacyDonut.tsx?raw';
import Sparklines from '../demos/misc/Sparklines';
import SparklinesSrc from '../demos/misc/Sparklines.tsx?raw';
import Gauges from '../demos/misc/Gauges';
import GaugesSrc from '../demos/misc/Gauges.tsx?raw';
import ComboChart from '../demos/misc/ComboChart';
import ComboChartSrc from '../demos/misc/ComboChart.tsx?raw';
import { marketShare, revenue } from '../demos/data';
import { Callout, Demo, H2, Page, Playground, PropsTable, useSite } from '../components/docs';

const CURVES = ['linear', 'monotoneX', 'natural', 'catmullRom', 'step', 'stepBefore', 'stepAfter', 'basis', 'bumpX'];

export function LinesPage() {
  const { scheme } = useSite();
  return (
    <Page title="Lines" lede="Line charts show trends over continuous or ordered dimensions. Lines are drawn as instanced GPU segments with exact round joins, arc-length dashing and analytic anti-aliasing.">
      <H2>Basics</H2>
      <Demo title="BasicLines.tsx" code={BasicLinesSrc}>
        <BasicLines />
      </Demo>
      <H2>Time series (children API)</H2>
      <p>
        Long-format rows with a <code>datetime</code> column are split into one line per <code>color</code> value. Bottom time axes render a
        two-row label hierarchy (day over month) and suppress repeated units.
      </p>
      <Demo title="TimeSeries.tsx" code={TimeSeriesSrc}>
        <TimeSeries />
      </Demo>
      <H2>Forecasts, gaps and reference lines</H2>
      <p>
        <code>null</code> values create gaps. Combine a solid and a dotted series to show a forecast, and mark today with a reference line.
      </p>
      <Demo title="Forecast.tsx" code={ForecastSrc}>
        <Forecast />
      </Demo>
      <H2>Playground</H2>
      <Playground
        knobs={{
          curve: { kind: 'select', label: 'curve', options: CURVES, value: 'monotoneX' },
          lineType: { kind: 'select', label: 'lineType', options: ['solid', 'dashed', 'dotted', 'dotDash', 'longDash', 'twoDash'], value: 'solid' },
          lineWidth: { kind: 'range', label: 'lineWidth', min: 1, max: 8, step: 0.5, value: 2.5 },
          showMark: { kind: 'switch', label: 'showMark', value: true },
          area: { kind: 'switch', label: 'area', value: false },
          gradient: { kind: 'switch', label: 'gradient', value: false },
        }}
        render={(v) => (
          <LineChart
            height={300}
            colorScheme={scheme}
            xAxis={[{ data: revenue.months, scaleType: 'point' }]}
            series={[
              { data: revenue.product, label: 'Product', curve: v.curve as never, lineType: v.lineType as never, lineWidth: v.lineWidth, showMark: v.showMark, area: v.area, gradient: v.gradient },
              { data: revenue.services, label: 'Services', curve: v.curve as never, lineType: v.lineType as never, lineWidth: v.lineWidth, showMark: v.showMark, area: v.area, gradient: v.gradient },
            ]}
          />
        )}
        code={(v) => `<LineChart
  xAxis={[{ data: months, scaleType: 'point' }]}
  series={[{
    data: product,
    curve: '${v.curve}',
    lineType: '${v.lineType}',
    lineWidth: ${v.lineWidth},
    showMark: ${v.showMark},
    area: ${v.area},
    gradient: ${v.gradient},
  }]}
/>`}
      />
      <H2>API</H2>
      <PropsTable
        rows={[
          { name: 'curve', type: "'linear' | 'monotoneX' | 'natural' | 'step' | …", default: "'monotoneX'", description: 'Interpolation between points (12 curve types).' },
          { name: 'lineType', type: "'solid' | 'dashed' | 'dotted' | 'dotDash' | number[]", default: "'solid'", description: 'Dash pattern evaluated per fragment on the GPU.' },
          { name: 'lineWidth', type: "'XS' … 'XL' | number", default: '2', description: 'Stroke width in CSS pixels.' },
          { name: 'showMark', type: "boolean | 'start' | 'end' | (p) => boolean", default: 'false', description: 'Point markers.' },
          { name: 'area / gradient', type: 'boolean', default: 'false', description: 'Fill below the line (optionally fading to transparent).' },
          { name: 'stack', type: 'string', description: 'Stack id for stacked lines.' },
          { name: 'connectNulls', type: 'boolean', default: 'false', description: 'Bridge gaps instead of breaking the line.' },
          { name: 'alternateField', type: 'string', description: 'Row field whose truthy rows use the alternate dash (forecast segments).' },
        ]}
      />
    </Page>
  );
}

export function AreasPage() {
  return (
    <Page title="Areas" lede="Stacked and floating areas are GPU triangle strips that morph between datasets.">
      <H2>Stacked areas</H2>
      <Demo title="StackedArea.tsx" code={StackedAreaSrc}>
        <StackedArea />
      </Demo>
      <H2>Floating bands</H2>
      <p>
        <code>metricStart</code> / <code>metricEnd</code> draw a band between two fields, for confidence intervals and ranges.
      </p>
      <Demo title="Band.tsx" code={BandSrc}>
        <Band />
      </Demo>
    </Page>
  );
}

export function ScatterPage() {
  return (
    <Page title="Scatter & bubble" lede="Scatter points are instanced SDF symbols. A typed-array fast path renders millions of points, with a spatial grid index for instant hover.">
      <H2>Basics</H2>
      <Demo title="Clusters.tsx" code={ClustersSrc}>
        <Clusters />
      </Demo>
      <H2>Bubbles and color scales</H2>
      <p>
        Map a field to the marker size with <code>sizeField</code>, and a numeric <code>colorValue</code> to a sequential scheme.
      </p>
      <Demo title="Bubbles.tsx" code={BubblesSrc}>
        <Bubbles />
      </Demo>
      <H2>Millions of points</H2>
      <p>
        Pass interleaved coordinates in <code>positions</code> (a <code>Float32Array</code>). The engine writes straight into the GPU instance
        buffer and skips per-item objects. Scroll to zoom, drag to pan, and double-click to reset.
      </p>
      <Demo title="MillionPoints.tsx" code={MillionPointsSrc}>
        <MillionPoints />
      </Demo>
      <PropsTable
        rows={[
          { name: 'data', type: '{ x, y, id?, size?, colorValue? }[]', description: 'Points (or long-format rows with dimension / metric).' },
          { name: 'positions', type: 'Float32Array | Float64Array', description: 'Interleaved x/y fast path for very large datasets.' },
          { name: 'shape', type: "'circle' | 'square' | 'rounded-square' | 'diamond' | 'triangle-up' | …", default: "'circle'", description: 'Marker symbol (SDF).' },
          { name: 'markerSize', type: "'XS' … 'XL' | number", default: '8', description: 'Diameter in px.' },
          { name: 'sizeField / sizeRange', type: 'string / [min, max]', description: 'Bubble sizing (area-proportional).' },
          { name: 'colorScheme', type: 'string', default: "'viridis'", description: 'Sequential scheme for colorValue.' },
        ]}
      />
    </Page>
  );
}

export function PiePage() {
  const { scheme } = useSite();
  return (
    <Page title="Pie & donut" lede="Slices are instanced quads shaded by an annular-sector SDF, with exact padding, corner radius and anti-aliasing at any size.">
      <H2>Basics</H2>
      <Demo title="BasicPie.tsx" code={BasicPieSrc}>
        <BasicPie />
      </Demo>
      <H2>Donut</H2>
      <Demo title="Donut.tsx" code={DonutSrc}>
        <Donut />
      </Demo>
      <H2>Children API with summary and segment labels</H2>
      <Demo title="LegacyDonut.tsx" code={LegacyDonutSrc}>
        <LegacyDonut />
      </Demo>
      <H2>Playground</H2>
      <Playground
        knobs={{
          innerRadius: { kind: 'range', label: 'innerRadius %', min: 0, max: 90, value: 50 },
          paddingAngle: { kind: 'range', label: 'paddingAngle', min: 0, max: 8, step: 0.5, value: 2 },
          cornerRadius: { kind: 'range', label: 'cornerRadius', min: 0, max: 20, value: 6 },
          startAngle: { kind: 'range', label: 'startAngle', min: -180, max: 180, value: 0 },
          endAngle: { kind: 'range', label: 'endAngle', min: 0, max: 360, value: 360 },
          arcLabel: { kind: 'select', label: 'arcLabel', options: ['none', 'label', 'value', 'percent'], value: 'percent' },
          sortingValues: { kind: 'select', label: 'sortingValues', options: ['none', 'asc', 'desc'], value: 'none' },
        }}
        render={(v) => (
          <PieChart
            height={300}
            colorScheme={scheme}
            series={[
              {
                data: marketShare,
                innerRadius: `${v.innerRadius}%`,
                paddingAngle: v.paddingAngle,
                cornerRadius: v.cornerRadius,
                startAngle: v.startAngle,
                endAngle: v.startAngle + v.endAngle,
                arcLabel: v.arcLabel === 'none' ? undefined : (v.arcLabel as 'label'),
                sortingValues: v.sortingValues as 'none',
              },
            ]}
          />
        )}
        code={(v) => `<PieChart
  series={[{
    data,
    innerRadius: '${v.innerRadius}%',
    paddingAngle: ${v.paddingAngle},
    cornerRadius: ${v.cornerRadius},
    startAngle: ${v.startAngle},
    endAngle: ${v.startAngle + v.endAngle},${v.arcLabel === 'none' ? '' : `\n    arcLabel: '${v.arcLabel}',`}
    sortingValues: '${v.sortingValues}',
  }]}
/>`}
      />
      <Callout>Click legend entries: hidden slices animate closed and the remaining slices sweep to fill the circle.</Callout>
    </Page>
  );
}

export function SparkGaugePage() {
  return (
    <Page title="Sparklines & gauges" lede="Compact charts for dashboards and KPI tiles. Every tile shares the same GPU device, so dozens of them cost almost nothing.">
      <H2>Sparklines</H2>
      <Demo title="Sparklines.tsx" code={SparklinesSrc}>
        <Sparklines />
      </Demo>
      <H2>Gauges</H2>
      <p>
        Gauges expose <code>role="meter"</code> with value attributes for assistive technology.
      </p>
      <Demo title="Gauges.tsx" code={GaugesSrc}>
        <Gauges />
      </Demo>
    </Page>
  );
}

export function ComboPage() {
  return (
    <Page title="Combo & dual axes" lede="Mix any registered series types in one plot, each bound to its own axis.">
      <H2>Bars with a line on a secondary axis</H2>
      <Demo title="ComboChart.tsx" code={ComboChartSrc}>
        <ComboChart />
      </Demo>
    </Page>
  );
}
