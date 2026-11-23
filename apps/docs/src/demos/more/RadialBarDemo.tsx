import { RadialBarChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const data = [
  { label: 'Move', value: 82 },
  { label: 'Exercise', value: 64 },
  { label: 'Stand', value: 91 },
  { label: 'Sleep', value: 73 },
];

export default function RadialBarDemo() {
  const scheme = useDemoScheme();
  return <RadialBarChart height={340} colorScheme={scheme} series={[{ data, maxValue: 100, innerRadius: '28%', endAngle: 300 }]} />;
}
