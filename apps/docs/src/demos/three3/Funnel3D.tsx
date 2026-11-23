import { useState } from 'react';
import { Funnel3DChart } from '@rsc-gl/3d/react';
import { useDemoScheme } from '../util';

const stages = [
  { label: 'Visits', value: 12800 },
  { label: 'Sign-ups', value: 5400 },
  { label: 'Activated', value: 3100 },
  { label: 'Trial', value: 1700 },
  { label: 'Paid', value: 820 },
];

export default function Funnel3D() {
  const scheme = useDemoScheme();
  const [shape, setShape] = useState<'cone' | 'pyramid'>('cone');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {(['cone', 'pyramid'] as const).map((s) => (
          <button key={s} className="btn" data-primary={shape === s} onClick={() => setShape(s)}>
            {s}
          </button>
        ))}
      </div>
      <Funnel3DChart height={440} colorScheme={scheme} data={stages} shape={shape} camera={{ elevation: 14, distance: 3.5 }} />
    </div>
  );
}
