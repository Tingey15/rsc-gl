import { BoxplotChart } from '@rsc-gl/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

const r = rng(5);
const gauss = () => (r() + r() + r() + r() - 2) * 1.2;
const groups = ['Control', 'Variant A', 'Variant B', 'Variant C'];
const data = groups.flatMap((g, gi) => Array.from({ length: 80 }, () => ({ group: g, latency: 120 + gi * 18 + gauss() * (20 + gi * 6) + (r() > 0.97 ? 90 : 0) })));

export default function BoxplotDemo() {
  const scheme = useDemoScheme();
  return <BoxplotChart height={320} colorScheme={scheme} yAxis={[{ label: 'Latency (ms)' }]} series={[{ data, dimension: 'group', metric: 'latency', label: 'Latency' }]} />;
}
