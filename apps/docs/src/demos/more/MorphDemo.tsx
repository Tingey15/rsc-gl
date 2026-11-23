import { useState } from 'react';
import { MorphChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const data = [
  { label: 'Search', value: 38 },
  { label: 'Social', value: 24 },
  { label: 'Direct', value: 18 },
  { label: 'Email', value: 12 },
  { label: 'Referral', value: 8 },
];
const MODES = ['bar', 'horizontalBar', 'pie', 'donut', 'radial'] as const;

export default function MorphDemo() {
  const scheme = useDemoScheme();
  const [mode, setMode] = useState<(typeof MODES)[number]>('bar');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {MODES.map((m) => (
          <button key={m} className="btn" data-primary={mode === m} onClick={() => setMode(m)}>
            {m}
          </button>
        ))}
      </div>
      <MorphChart height={340} colorScheme={scheme} animation={{ duration: 1100, easing: 'cubicInOut' }} series={[{ data, mode }]} />
    </div>
  );
}
