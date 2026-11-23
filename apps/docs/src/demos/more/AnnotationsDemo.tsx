import { useMemo } from 'react';
import { LineChart, ScatterChart, annotationsPlugin } from '@rsc-gl/react';
import { clusters } from '../data';
import { useDemoScheme } from '../util';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const rows = months.map((m, i) => {
  const v = 40 + i * 4 + Math.sin(i) * 6;
  return { month: m, value: v, low: v - 6 - (i % 3), high: v + 7 + (i % 4) };
});
const points = clusters(160, 1, 8).map((p) => ({ x: p.x, y: p.x * 0.7 + (p.y - 50) * 0.4 + 20 }));

export default function AnnotationsDemo() {
  const scheme = useDemoScheme();
  const plugins = useMemo(() => [annotationsPlugin({ directLabels: { value: 'last' } })], []);
  return (
    <div className="row">
      <LineChart
        height={320}
        colorScheme={scheme}
        hideLegend
        plugins={plugins}
        margin={{ right: 90 }}
        xAxis={[{ data: months, scaleType: 'point' }]}
        referenceAreas={[{ x1: 'Jun', x2: 'Aug', label: 'Summer campaign', color: '#d9a400', opacity: 0.12 }]}
        series={[
          {
            label: 'Bookings',
            data: rows,
            dimension: 'month',
            metric: 'value',
            metricRanges: [{ metricStart: 'low', metricEnd: 'high', rangeOpacity: 0.18 }],
          },
        ]}
      />
      <ScatterChart
        height={320}
        colorScheme={scheme}
        hideLegend
        trendlines={[
          { method: 'linear', color: '#d9475b', label: (v) => `linear ${v.toFixed(0)}` },
          { method: 'polynomial-3', color: '#22a884', lineType: 'solid' },
        ]}
        series={[{ data: points, markerSize: 6, opacity: 0.6 }]}
      />
    </div>
  );
}
