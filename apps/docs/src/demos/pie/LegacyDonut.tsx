import { Chart, ChartTooltip, Donut, DonutSummary, Legend, SegmentLabel } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const data = [
  { browser: 'Aurora', count: 2700 },
  { browser: 'Nimbus', count: 1700 },
  { browser: 'Comet', count: 800 },
  { browser: 'Vertex', count: 600 },
];

export default function LegacyDonut() {
  const scheme = useDemoScheme();
  return (
    <Chart data={data} height={320} colorScheme={scheme}>
      <Donut metric="count" color="browser" holeRatio={0.7}>
        <DonutSummary label="Visitors" />
        <SegmentLabel percent />
        <ChartTooltip>{(d) => `${d.browser}: ${Number(d.count).toLocaleString()}`}</ChartTooltip>
      </Donut>
      <Legend position="right" isToggleable highlight />
    </Chart>
  );
}
