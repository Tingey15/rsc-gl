import { ChartsContainer } from '@rsc-gl/react';
import { revenue } from '../data';
import { useDemoScheme } from '../util';

const share = revenue.product.map((p, i) => Math.round((p / (p + revenue.services[i])) * 100));

export default function ComboChart() {
  const scheme = useDemoScheme();
  return (
    <ChartsContainer
      height={340}
      colorScheme={scheme}
      xAxis={[{ data: revenue.months, scaleType: 'band' }]}
      yAxis={[
        { id: 'revenue', label: 'Revenue ($k)' },
        { id: 'pct', position: 'right', label: 'Product share %', min: 0, max: 100 },
      ]}
      series={[
        { type: 'bar', data: revenue.product, label: 'Product', stack: 'r', yAxisId: 'revenue' },
        { type: 'bar', data: revenue.services, label: 'Services', stack: 'r', yAxisId: 'revenue' },
        { type: 'line', data: share, label: 'Product share', yAxisId: 'pct', color: '#d9a400', showMark: true, curve: 'monotoneX' },
      ]}
    />
  );
}
