import { useState } from 'react';
import {
  Annotation,
  Axis,
  Bar,
  BarDirectLabel,
  Chart,
  ChartPopover,
  ChartTooltip,
  Donut,
  Legend,
  Line,
  LineDirectLabel,
  LineForecast,
  LinePointAnnotation,
  ReferenceLine,
  SegmentLabel,
  Title,
  Trendline,
  TrendlineAnnotation,
} from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const quarters = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026'];
const revenue = quarters.flatMap((q, i) => [
  { quarter: q, series: 'Revenue', value: 120 + i * 18 + (i % 2) * 9, note: i === 5 ? 'record' : '' },
  { quarter: q, series: 'Margin %', value: 18 + i * 1.5 },
]);

const day = 86_400_000;
const start = Date.UTC(2026, 0, 1);
const traffic = Array.from({ length: 24 }, (_, i) => [
  { datetime: start + i * day * 7, series: 'Web', value: 420 + i * 14 + Math.sin(i / 2) * 40, forecast: i >= 17 ? 420 + i * 16 : null, peak: i === 11 },
  { datetime: start + i * day * 7, series: 'App', value: 260 + i * 9 + Math.cos(i / 3) * 30, forecast: i >= 17 ? 260 + i * 11 : null, peak: false },
]).flat();

const browsers = [
  { browser: 'Chrome', value: 5200 },
  { browser: 'Safari', value: 2100 },
  { browser: 'Firefox', value: 900 },
  { browser: 'Edge', value: 700 },
];

/** Charts written exactly as for the legacy library: every prop and child below comes from its API. */
export default function LegacyParity() {
  const scheme = useDemoScheme();
  const [clicked, setClicked] = useState<string>('—');
  const [hidden, setHidden] = useState<string[]>([]);
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Chart data={revenue} height={300} colorScheme={scheme} hiddenSeries={hidden}>
        <Title text="Dual metric axis, bar annotations, legend onClick" />
        <Axis position="bottom" baseline labels={quarters.filter((_, i) => i % 2 === 0)} />
        <Axis position="left" grid title={['Revenue', '(USD, thousands)']} currencyCode="USD" numberFormat="currency" tickCountLimit={5} />
        <Axis position="right" title="Margin" tickMinStep={1} />
        <Bar dimension="quarter" metric="value" color="series" type="dodged" dualMetricAxis onClick={(d) => setClicked(String(d.quarter))}>
          <Annotation textKey="note" />
          <ChartTooltip>{(d) => `${d.series} · ${d.quarter}: ${d.value}`}</ChartTooltip>
        </Bar>
        <Legend onClick={(name) => setHidden((h) => (h.includes(name) ? h.filter((x) => x !== name) : [...h, name]))} />
      </Chart>
      <p style={{ margin: '-8px 0 0', fontSize: 13, color: 'var(--muted)' }}>
        Last bar clicked: <b>{clicked}</b>. Clicking a legend entry toggles it through controlled <code>hiddenSeries</code>.
      </p>

      <Chart data={traffic} height={300} colorScheme={scheme}>
        <Axis position="bottom" baseline labelFormat="time" granularity="month" />
        <Axis position="left" grid>
          <ReferenceLine value={600} label="Target" lineType="dashed" />
        </Axis>
        <Line dimension="datetime" metric="value" color="series" staticPoint="peak">
          <LinePointAnnotation textKey="series" />
          <LineDirectLabel value="last" />
          <LineForecast metric="forecast" start={start + 17 * day * 7} label="Forecast" />
          <Trendline method="linear" displayOnHover>
            <TrendlineAnnotation badge prefix="Trend " />
          </Trendline>
          <ChartPopover width={220}>{(d, close) => <PopoverBody d={d} close={close} />}</ChartPopover>
        </Line>
        <Legend isToggleable highlight />
      </Chart>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        <Chart data={browsers} height={260} colorScheme={scheme}>
          <Axis position="left" truncateLabels hasTooltip />
          <Bar dimension="browser" metric="value" orientation="horizontal">
            <BarDirectLabel position="end" format="shortNumber" />
          </Bar>
        </Chart>
        <Chart data={browsers} height={260} colorScheme={scheme}>
          <Donut metric="value" color="browser" holeRatio={0.7}>
            <SegmentLabel percent labelKey="browser" />
          </Donut>
          <Legend position="right" />
        </Chart>
      </div>
    </div>
  );
}

function PopoverBody({ d, close }: { d: Record<string, unknown>; close: () => void }) {
  return (
    <div style={{ fontSize: 13 }}>
      <b>{String(d.series)}</b>
      <div>{new Date(Number(d.datetime)).toLocaleDateString()}</div>
      <div>{Math.round(Number(d.value))} visits</div>
      <button type="button" className="btn" style={{ marginTop: 8 }} onClick={close}>
        Close
      </button>
    </div>
  );
}
