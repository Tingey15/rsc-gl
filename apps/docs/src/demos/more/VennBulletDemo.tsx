import { BulletChart, VennChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const sets = [
  { sets: ['Design'], size: 120 },
  { sets: ['Engineering'], size: 180 },
  { sets: ['Data'], size: 90 },
  { sets: ['Design', 'Engineering'], size: 40 },
  { sets: ['Engineering', 'Data'], size: 35 },
  { sets: ['Design', 'Data'], size: 15 },
];

const kpis = [
  { label: 'Revenue', value: 820, target: 900, max: 1000 },
  { label: 'Profit', value: 210, target: 180, max: 300 },
  { label: 'New users', value: 1450, target: 1600, max: 2000 },
];

export default function VennBulletDemo() {
  const scheme = useDemoScheme();
  return (
    <div className="row">
      <VennChart height={300} colorScheme={scheme} series={[{ sets }]} />
      <BulletChart
        height={300}
        colorScheme={scheme}
        series={[{ data: kpis, thresholds: [{ value: 600, color: '#d9475b' }, { value: 850, color: '#d9a400' }, { value: 2000, color: '#22a884' }] }]}
      />
    </div>
  );
}
