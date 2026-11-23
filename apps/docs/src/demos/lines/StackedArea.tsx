import { AreaChart } from '@rsc-gl/react';
import { revenue } from '../data';
import { useDemoScheme } from '../util';

export default function StackedArea() {
  const scheme = useDemoScheme();
  return (
    <AreaChart
      height={320}
      colorScheme={scheme}
      xAxis={[{ data: revenue.months, scaleType: 'point' }]}
      series={[
        { data: revenue.licensing, label: 'Licensing', stack: 'total' },
        { data: revenue.services, label: 'Services', stack: 'total' },
        { data: revenue.product, label: 'Product', stack: 'total' },
      ]}
    />
  );
}
