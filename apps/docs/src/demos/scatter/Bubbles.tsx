import { ScatterChart } from '@rsc-gl/react';
import { clusters } from '../data';
import { useDemoScheme } from '../util';

const points = clusters(120, 4, 21).map((p) => ({ ...p, colorValue: p.x + p.y }));

export default function Bubbles() {
  const scheme = useDemoScheme();
  return (
    <ScatterChart
      height={340}
      colorScheme={scheme}
      hideLegend
      series={[{ data: points, sizeField: 'size', sizeRange: [6, 42], colorScheme: 'viridis', opacity: 0.75, strokeWidth: 1, strokeColor: '#ffffff' }]}
    />
  );
}
