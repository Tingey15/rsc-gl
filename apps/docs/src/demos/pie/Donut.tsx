import { PieChart } from '@rsc-gl/react';
import { marketShare } from '../data';
import { useDemoScheme } from '../util';

const total = marketShare.reduce((a, d) => a + d.value, 0);

export default function Donut() {
  const scheme = useDemoScheme();
  return (
    <PieChart
      height={300}
      colorScheme={scheme}
      series={[
        {
          data: marketShare,
          innerRadius: '62%',
          paddingAngle: 1.5,
          cornerRadius: 6,
          centerLabel: `${total}k`,
          centerSubLabel: 'Sessions',
        },
      ]}
    />
  );
}
