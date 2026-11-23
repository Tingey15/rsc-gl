import { SankeyChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const links = [
  { source: 'Search', target: 'Landing', value: 520 },
  { source: 'Social', target: 'Landing', value: 260 },
  { source: 'Email', target: 'Pricing', value: 180 },
  { source: 'Landing', target: 'Pricing', value: 430 },
  { source: 'Landing', target: 'Bounced', value: 350 },
  { source: 'Pricing', target: 'Trial', value: 380 },
  { source: 'Pricing', target: 'Bounced', value: 230 },
  { source: 'Trial', target: 'Paid', value: 210 },
  { source: 'Trial', target: 'Churned', value: 170 },
];

export default function SankeyDemo() {
  const scheme = useDemoScheme();
  return <SankeyChart height={360} colorScheme={scheme} series={[{ links, label: 'Visitors' }]} />;
}
