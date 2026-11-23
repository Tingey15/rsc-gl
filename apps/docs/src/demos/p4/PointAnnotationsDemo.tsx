import { Axis, Chart, Line, LinePointAnnotation, ScatterChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const start = new Date(2026, 0, 1).getTime();
const rows = Array.from({ length: 48 }, (_, i) => ({ datetime: start + i * 7 * 864e5, value: Math.round(200 + 80 * Math.sin(i / 5) + i * 4) }));

// Countries moving between two years: one path per country.
const countries = ['A', 'B', 'C', 'D', 'E', 'F'];
const moves = countries.flatMap((c, i) => [
  { country: `Country ${c}`, year: 2015, gdp: 8 + i * 6, life: 62 + i * 2.2 },
  { country: `Country ${c}`, year: 2020, gdp: 12 + i * 7, life: 64 + i * 2.4 },
  { country: `Country ${c}`, year: 2025, gdp: 15 + i * 8.5, life: 67 + i * 2.1 },
]);

export default function PointAnnotationsDemo() {
  const scheme = useDemoScheme();
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Chart data={rows} height={300} colorScheme={scheme}>
        <Axis position="bottom" labelFormat="time" granularity="month" />
        <Axis position="left" grid range={[100, 520]} />
        <Line dimension="datetime" metric="value" color={{ value: '#4f6bed' }} interpolate="monotone">
          <LinePointAnnotation dimensionValue="max" label={(v) => `Peak ${v}`} anchor="top" />
          <LinePointAnnotation dimensionValue="min" label={(v) => `Low ${v}`} anchor="bottom" color="#d64545" />
          <LinePointAnnotation dimensionValue="last" anchor="left" color="#2fa37a" />
        </Line>
      </Chart>
      <ScatterChart
        height={340}
        colorScheme={scheme}
        hideLegend
        dataset={moves}
        xAxis={[{ label: 'GDP per capita (k$)' }]}
        yAxis={[{ label: 'Life expectancy', min: 60 }]}
        scatterPaths={[{ groupBy: 'country', color: '#8a8f98', opacity: 0.6, width: 1.5 }]}
        scatterLabels={[{ field: 'year', position: 'top' }]}
        series={[{ label: 'Countries', data: moves.map((m) => ({ x: m.gdp, y: m.life, ...m })), markerSize: 7 } as never]}
      />
    </div>
  );
}
