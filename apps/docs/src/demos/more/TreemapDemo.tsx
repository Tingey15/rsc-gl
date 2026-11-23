import { TreemapChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const root = {
  name: 'Portfolio',
  children: [
    { name: 'Technology', children: [{ name: 'Chips', value: 42 }, { name: 'Cloud', value: 35 }, { name: 'Software', value: 28 }, { name: 'Devices', value: 16 }] },
    { name: 'Health', children: [{ name: 'Pharma', value: 30 }, { name: 'Devices', value: 12 }, { name: 'Insurance', value: 9 }] },
    { name: 'Energy', children: [{ name: 'Solar', value: 18 }, { name: 'Oil & gas', value: 14 }, { name: 'Grid', value: 8 }] },
    { name: 'Finance', children: [{ name: 'Banks', value: 22 }, { name: 'Payments', value: 17 }] },
  ],
};

export default function TreemapDemo() {
  const scheme = useDemoScheme();
  return <TreemapChart height={380} colorScheme={scheme} series={[{ root, label: 'Allocation' }]} />;
}
