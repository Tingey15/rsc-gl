import { ScatterChart } from '@rsc-gl/react';
import { clusters } from '../data';
import { useDemoScheme } from '../util';

const points = clusters(450, 3);
const groups = ['Cluster A', 'Cluster B', 'Cluster C'];
const shapes = ['circle', 'diamond', 'triangle-up'] as const;

export default function Clusters() {
  const scheme = useDemoScheme();
  return (
    <ScatterChart
      height={340}
      colorScheme={scheme}
      grid={{ horizontal: true, vertical: true }}
      series={groups.map((g, i) => ({
        label: g,
        data: points.filter((p) => p.group === g),
        shape: shapes[i],
        markerSize: 9,
      }))}
    />
  );
}
