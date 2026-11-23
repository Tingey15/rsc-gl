import { WaterfallChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const data = [
  { step: 'Revenue', value: 420 },
  { step: 'COGS', value: -160 },
  { step: 'Gross profit', total: true },
  { step: 'R&D', value: -70 },
  { step: 'Marketing', value: -55 },
  { step: 'Other income', value: 18 },
  { step: 'Net income', total: true },
];

export default function WaterfallDemo() {
  const scheme = useDemoScheme();
  return <WaterfallChart height={320} colorScheme={scheme} series={[{ data, dimension: 'step', metric: 'value', totalField: 'total', showValues: true }]} />;
}
