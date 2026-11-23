import { HeatmapChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hours = Array.from({ length: 12 }, (_, i) => `${i * 2}:00`);
const data = days.flatMap((d, di) =>
  hours.map((h, hi) => ({ day: d, hour: h, visits: Math.round(40 + 60 * Math.sin((hi / 11) * Math.PI) * (di < 5 ? 1 : 0.55) + ((di * 7 + hi * 13) % 17)) })),
);

export default function HeatmapDemo() {
  const scheme = useDemoScheme();
  return (
    <HeatmapChart
      height={340}
      colorScheme={scheme}
      xAxis={[{ data: hours }]}
      yAxis={[{ data: days }]}
      series={[{ data, xField: 'hour', yField: 'day', valueField: 'visits', colorScheme: 'magma', showValues: true, label: 'Visits' }]}
    />
  );
}
