import { BarChart } from '@rsc-gl/react';
import { revenue } from '../data';
import { useDemoScheme } from '../util';

export default function StackedBars() {
  const scheme = useDemoScheme();
  return (
    <BarChart
      height={320}
      colorScheme={scheme}
      borderRadius={6}
      xAxis={[{ data: revenue.months }]}
      yAxis={[{ label: 'Revenue ($k)' }]}
      series={[
        { data: revenue.product, label: 'Product', stack: 'total' },
        { data: revenue.services, label: 'Services', stack: 'total' },
        { data: revenue.licensing, label: 'Licensing', stack: 'total' },
      ]}
    />
  );
}
