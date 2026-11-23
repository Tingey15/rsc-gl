import { useState } from 'react';
import { FunnelChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const data = [
  { label: 'Visited', value: 12400 },
  { label: 'Signed up', value: 5200 },
  { label: 'Activated', value: 3100 },
  { label: 'Subscribed', value: 1240 },
  { label: 'Renewed', value: 860 },
];

export default function FunnelDemo() {
  const scheme = useDemoScheme();
  const [variant, setVariant] = useState<'funnel' | 'pyramid'>('funnel');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {(['funnel', 'pyramid'] as const).map((v) => (
          <button key={v} className="btn" data-primary={variant === v} onClick={() => setVariant(v)}>
            {v}
          </button>
        ))}
      </div>
      <FunnelChart height={320} colorScheme={scheme} series={[{ data, variant, sectionLabel: 'value' }]} />
    </div>
  );
}
