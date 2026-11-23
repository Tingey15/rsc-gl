import { LineChart } from '@rsc-gl/react';
import { revenue } from '../data';
import { useDemoScheme } from '../util';

export default function BasicLines() {
  const scheme = useDemoScheme();
  return (
    <LineChart
      height={320}
      colorScheme={scheme}
      xAxis={[{ data: revenue.months, scaleType: 'point' }]}
      series={[
        { data: revenue.product, label: 'Product', showMark: true },
        { data: revenue.services, label: 'Services', showMark: true },
        { data: revenue.licensing, label: 'Licensing', showMark: true, lineType: 'dashed' },
      ]}
    />
  );
}
