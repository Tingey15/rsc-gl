import { BarChart, LineChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cats = months.flatMap((m) => [`2025 ${m}`]).concat(months.slice(0, 6).map((m) => `2026 ${m}`));
const values = cats.map((_, i) => 40 + Math.round(18 * Math.sin(i / 2.4) + i * 2));

// Small generated avatars (any image URL works).
const avatar = (text: string, color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="24" fill="${color}"/><text x="24" y="31" font-family="sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="middle">${text}</text></svg>`)}`;
const people = [
  { name: 'Ava', color: '#4f6bed', closed: 42 },
  { name: 'Ben', color: '#e06d3c', closed: 35 },
  { name: 'Chloe', color: '#2fa37a', closed: 51 },
  { name: 'Dev', color: '#a656d6', closed: 28 },
  { name: 'Eli', color: '#d9a400', closed: 46 },
];

const days = Array.from({ length: 90 }, (_, i) => new Date(2026, 2, 1 + i).getTime());
const latency = days.map((_, i) => 120 + 30 * Math.sin(i / 6) + (i > 40 && i < 48 ? 140 : 0) + ((i * 13) % 17));

export default function AxisExtrasDemo() {
  const scheme = useDemoScheme();
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* Grouped axis: months, then quarter, then year. */}
      <BarChart
        height={300}
        colorScheme={scheme}
        hideLegend
        xAxis={[
          {
            data: cats,
            valueFormatter: (v) => String(v).split(' ')[1],
            groups: [{ getValue: (v) => `Q${Math.floor(months.indexOf(String(v).split(' ')[1]) / 3) + 1}` }, { getValue: (v) => String(v).split(' ')[0] }],
          },
        ]}
        series={[{ data: values, label: 'Orders', color: '#4f6bed' }]}
      />
      {/* Thumbnails next to category ticks (horizontal bars: on the y axis). */}
      <BarChart
        height={260}
        colorScheme={scheme}
        hideLegend
        layout="horizontal"
        barLabel="value"
        yAxis={[{ data: people.map((p) => p.name), thumbnails: { url: (v) => { const p = people.find((x) => x.name === v); return p ? avatar(p.name[0], p.color) : undefined; }, size: 26, radius: 13 } }]}
        series={[{ data: people.map((p) => p.closed), label: 'Tickets closed', color: '#2fa37a' }]}
      />
      {/* Axis annotations: incident spans and release markers. Hover them for details. */}
      <LineChart
        height={300}
        colorScheme={scheme}
        hideLegend
        xAxis={[
          {
            data: days,
            scaleType: 'time',
            annotations: [
              { start: days[41], end: days[47], label: 'Incident', description: 'Elevated latency in us-east (7 days)', color: '#d64545' },
              { value: days[12], label: 'v2.4', icon: 'flag', color: '#4f6bed', description: 'Release 2.4' },
              { value: days[60], label: 'v2.5', icon: 'flag', color: '#4f6bed', description: 'Release 2.5' },
              { value: days[75], label: 'Migration', icon: 'diamond', color: '#a656d6', description: 'Database migration' },
            ],
          },
        ]}
        yAxis={[{ label: 'p95 latency (ms)' }]}
        series={[{ data: latency, curve: 'monotoneX', label: 'p95 latency', color: '#e06d3c' }]}
      />
    </div>
  );
}
