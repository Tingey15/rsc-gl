import { BarChart, LineChart, PieChart, SparkLineChart } from '@rsc-gl/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

const TILES = 36;

/** 36 charts, one GPU device: no per-chart context limits. */
export default function Dashboard() {
  const scheme = useDemoScheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
      {Array.from({ length: TILES }, (_, i) => {
        const r = rng(i + 1);
        const values = Array.from({ length: 8 }, () => Math.round(10 + r() * 90));
        const kind = i % 4;
        return (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 6 }}>
            {kind === 0 && <SparkLineChart data={values} area height={80} colorScheme={scheme} />}
            {kind === 1 && (
              <BarChart height={80} colorScheme={scheme} hideLegend tooltip={false} margin={{ top: 2, right: 2, bottom: 2, left: 2 }} xAxis={[{ data: values.map((_, k) => k), position: 'none' }]} yAxis={[{ position: 'none' }]} grid={{}} series={[{ data: values, borderRadius: 2 }]} />
            )}
            {kind === 2 && <PieChart height={80} colorScheme={scheme} hideLegend series={[{ data: values.slice(0, 4).map((v, k) => ({ id: k, value: v })), innerRadius: '55%' }]} />}
            {kind === 3 && (
              <LineChart height={80} colorScheme={scheme} hideLegend tooltip={false} margin={{ top: 4, right: 4, bottom: 4, left: 4 }} xAxis={[{ data: values.map((_, k) => k), position: 'none', scaleType: 'point' }]} yAxis={[{ position: 'none' }]} grid={{}} series={[{ data: values, showMark: true }]} />
            )}
          </div>
        );
      })}
    </div>
  );
}
