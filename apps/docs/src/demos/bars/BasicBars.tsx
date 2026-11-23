import { BarChart } from '@rsc-gl/react';
import { revenue } from '../data';
import { useDemoScheme } from '../util';

export default function BasicBars() {
  const scheme = useDemoScheme();
  return (
    <BarChart
      height={320}
      colorScheme={scheme}
      xAxis={[{ data: revenue.months }]}
      series={[
        { data: revenue.product, label: 'Product' },
        { data: revenue.services, label: 'Services' },
      ]}
    />
  );
}
