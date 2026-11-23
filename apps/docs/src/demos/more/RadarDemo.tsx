import { RadarChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const metrics = ['Speed', 'Quality', 'Cost', 'Support', 'Features', 'Security'];

export default function RadarDemo() {
  const scheme = useDemoScheme();
  return (
    <RadarChart
      height={360}
      colorScheme={scheme}
      series={[
        { label: 'Product A', metrics, data: [80, 70, 60, 90, 75, 85] },
        { label: 'Product B', metrics, data: [65, 90, 80, 55, 85, 70] },
      ]}
    />
  );
}
