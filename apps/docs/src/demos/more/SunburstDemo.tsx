import { SunburstChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const root = {
  name: 'Traffic',
  children: [
    { name: 'Organic', children: [{ name: 'Web search', value: 48 }, { name: 'Image search', value: 9 }, { name: 'Other', value: 5 }] },
    { name: 'Social', children: [{ name: 'Video', value: 14 }, { name: 'Network A', value: 11 }, { name: 'Network B', value: 7 }] },
    { name: 'Direct', value: 22 },
    { name: 'Referral', children: [{ name: 'Partners', value: 9 }, { name: 'Press', value: 4 }] },
  ],
};

export default function SunburstDemo() {
  const scheme = useDemoScheme();
  return <SunburstChart height={380} colorScheme={scheme} series={[{ root, label: 'Traffic' }]} />;
}
