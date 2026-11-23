import { LineChart, Trellis } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const cities = ['Seattle', 'Denver', 'Austin', 'Boston', 'Miami', 'Chicago'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const base: Record<string, number> = { Seattle: 8, Denver: 4, Austin: 17, Boston: 3, Miami: 24, Chicago: 0 };
const rows = cities.flatMap((city) => months.map((month, i) => ({ city, month, temp: Math.round(base[city] + 12 * Math.sin(((i - 3) / 12) * Math.PI * 2) * (city === 'Miami' ? 0.4 : 1)) })));

/** `Trellis` works with any chart: here a 3×2 grid of line charts on one shared scale. */
export default function TrellisPropsDemo() {
  const scheme = useDemoScheme();
  return (
    <Trellis data={rows} by="city" columns={3} sharedScale={{ metric: 'temp', includeZero: false }}>
      {(cityRows, facet, range, i) => (
        <LineChart
          height={150}
          colorScheme={scheme}
          hideLegend
          margin={{ top: 4, right: 8 }}
          xAxis={[{ data: months, scaleType: 'point', hideTickLabels: i < 3 }]}
          yAxis={[{ min: range?.[0], max: range?.[1], tickNumber: 3, valueFormatter: (v) => `${v}°` }]}
          series={[{ label: String(facet.value), data: cityRows.map((r) => r.temp), area: true, gradient: true, curve: 'monotoneX', color: ['#4f6bed', '#e06d3c', '#2fa37a', '#a656d6', '#d9a400', '#3b9fd6'][i] }]}
        />
      )}
    </Trellis>
  );
}
