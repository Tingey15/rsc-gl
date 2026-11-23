import { BarChart } from '@rsc-gl/react';
import BasicBars from '../demos/bars/BasicBars';
import BasicBarsSrc from '../demos/bars/BasicBars.tsx?raw';
import StackedBars from '../demos/bars/StackedBars';
import StackedBarsSrc from '../demos/bars/StackedBars.tsx?raw';
import HorizontalBars from '../demos/bars/HorizontalBars';
import HorizontalBarsSrc from '../demos/bars/HorizontalBars.tsx?raw';
import ComposableBars from '../demos/bars/ComposableBars';
import ComposableBarsSrc from '../demos/bars/ComposableBars.tsx?raw';
import { revenue } from '../demos/data';
import { Callout, Demo, H2, Page, Playground, PropsTable, useSite } from '../components/docs';

export default function BarsPage() {
  const { scheme } = useSite();
  return (
    <Page title="Bars" lede="Bar charts compare values across categories. Every bar is an instanced GPU quad with a rounded-rectangle SDF, so thousands of bars animate at full frame rate.">
      <H2>Basics</H2>
      <p>
        Pass category labels on the band axis and one <code>data</code> array per series. Each series gets the next palette color.
      </p>
      <Demo title="BasicBars.tsx" code={BasicBarsSrc}>
        <BasicBars />
      </Demo>

      <H2>Stacking</H2>
      <p>
        Series that share a <code>stack</code> id are stacked. Negative values stack downwards (<code>stackOffset: 'diverging'</code>); use{' '}
        <code>'expand'</code> to normalize each category to 100%.
      </p>
      <Demo title="StackedBars.tsx" code={StackedBarsSrc}>
        <StackedBars />
      </Demo>

      <H2>Horizontal layout and labels</H2>
      <Demo title="HorizontalBars.tsx" code={HorizontalBarsSrc}>
        <HorizontalBars />
      </Demo>

      <H2>Composable children API</H2>
      <p>
        The same engine can be driven by declarative children. Long-format rows are split into series by the <code>color</code> facet.
      </p>
      <Demo title="ComposableBars.tsx" code={ComposableBarsSrc}>
        <ComposableBars />
      </Demo>

      <H2>Playground</H2>
      <Playground
        knobs={{
          layout: { kind: 'select', label: 'layout', options: ['vertical', 'horizontal'], value: 'vertical' },
          stacked: { kind: 'switch', label: 'stacked', value: false },
          borderRadius: { kind: 'range', label: 'borderRadius', min: 0, max: 16, value: 4 },
          categoryGapRatio: { kind: 'range', label: 'categoryGapRatio', min: 0, max: 0.8, step: 0.05, value: 0.2 },
          barGapRatio: { kind: 'range', label: 'barGapRatio', min: 0, max: 1, step: 0.05, value: 0.1 },
          labels: { kind: 'switch', label: 'barLabel', value: false },
          series: { kind: 'range', label: 'series', min: 1, max: 3, value: 2 },
        }}
        render={(v) => {
          const all = [
            { data: revenue.product, label: 'Product' },
            { data: revenue.services, label: 'Services' },
            { data: revenue.licensing, label: 'Licensing' },
          ].slice(0, v.series);
          const axis = [{ data: revenue.months.slice(0, 8), categoryGapRatio: v.categoryGapRatio, barGapRatio: v.barGapRatio }];
          return (
            <BarChart
              height={320}
              colorScheme={scheme}
              layout={v.layout as 'vertical' | 'horizontal'}
              borderRadius={v.borderRadius}
              barLabel={v.labels ? 'value' : undefined}
              xAxis={v.layout === 'vertical' ? axis : undefined}
              yAxis={v.layout === 'horizontal' ? axis : undefined}
              series={all.map((s) => ({ ...s, data: s.data.slice(0, 8), stack: v.stacked ? 'a' : undefined }))}
            />
          );
        }}
        code={(v) => `<BarChart
  layout="${v.layout}"
  borderRadius={${v.borderRadius}}${v.labels ? '\n  barLabel="value"' : ''}
  ${v.layout === 'vertical' ? 'xAxis' : 'yAxis'}={[{ data: months, categoryGapRatio: ${v.categoryGapRatio}, barGapRatio: ${v.barGapRatio} }]}
  series={[
${['Product', 'Services', 'Licensing'].slice(0, v.series).map((l) => `    { data: ${l.toLowerCase()}, label: '${l}'${v.stacked ? ", stack: 'a'" : ''} },`).join('\n')}
  ]}
/>`}
      />

      <Callout>Toggle the legend entries, hover bars, or change knobs: every change animates from the on-screen state on the GPU.</Callout>

      <H2>API</H2>
      <PropsTable
        rows={[
          { name: 'series', type: 'BarSeriesOptions[]', description: 'Series definitions (data, label, color, stack, layout, borderRadius…).' },
          { name: 'layout', type: "'vertical' | 'horizontal'", default: "'vertical'", description: 'Orientation of the bars.' },
          { name: 'borderRadius', type: 'number', default: '4', description: 'Radius applied to the outer end of each bar (stack-aware).' },
          { name: 'barLabel', type: "'value' | (item) => string", description: 'Draws value labels on or next to bars.' },
          { name: 'xAxis / yAxis', type: 'AxisOptions[]', description: 'Band axis categories, gap ratios, formatting.' },
          { name: 'onItemClick', type: '(item, event) => void', description: 'Called with the series id, data index, datum and value.' },
          { name: 'skipAnimation', type: 'boolean', default: 'false', description: 'Disables transitions.' },
        ]}
      />
    </Page>
  );
}
