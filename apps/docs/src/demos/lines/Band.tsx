import { Area, Axis, Chart, Line } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const data = Array.from({ length: 40 }, (_, i) => {
  const v = 50 + Math.sin(i / 5) * 18 + i * 0.6;
  return { day: i, value: v, low: v - 8 - (i % 5), high: v + 8 + (i % 7) };
});

export default function Band() {
  const scheme = useDemoScheme();
  return (
    <Chart data={data} height={300} colorScheme={scheme}>
      <Axis position="bottom" baseline ticks title="Day" />
      <Axis position="left" grid />
      <Area dimension="day" metricStart="low" metricEnd="high" color={{ value: '#8a63d2' }} opacity={0.25} scaleType="linear" interpolate="monotone" />
      <Line dimension="day" metric="value" color={{ value: '#8a63d2' }} scaleType="linear" interpolate="monotone" />
    </Chart>
  );
}
