import { PieChart } from '@rsc-gl/react';
import { marketShare } from '../data';
import { useDemoScheme } from '../util';

export default function BasicPie() {
  const scheme = useDemoScheme();
  return <PieChart height={300} colorScheme={scheme} series={[{ data: marketShare, arcLabel: 'percent' }]} />;
}
