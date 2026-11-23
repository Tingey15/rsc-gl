import { useMemo, useState } from 'react';
import { ScatterChart } from '@rsc-gl/react';
import { bigPositions } from '../data';
import { useDemoScheme } from '../util';

const SIZES = [100_000, 500_000, 1_000_000, 2_000_000];

export default function MillionPoints() {
  const scheme = useDemoScheme();
  const [count, setCount] = useState(1_000_000);
  const positions = useMemo(() => bigPositions(count), [count]);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {SIZES.map((n) => (
          <button key={n} className="btn" data-primary={n === count} onClick={() => setCount(n)}>
            {n.toLocaleString()} points
          </button>
        ))}
      </div>
      <ScatterChart
        height={420}
        colorScheme={scheme}
        hideLegend
        xAxis={[{ zoom: true }]}
        series={[{ positions, markerSize: 2, color: '#2fa3c7', opacity: Math.min(0.5, 25_000 / count) }]}
      />
    </div>
  );
}
