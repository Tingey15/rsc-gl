import { useMemo, useState } from 'react';
import { Histogram3DChart } from '@rsc-gl/3d/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

/** 20,000 samples from two correlated clusters, binned into 3D columns. */
export default function Histogram3D() {
  const scheme = useDemoScheme();
  const [bins, setBins] = useState(18);
  const points = useMemo(() => {
    const r = rng(4);
    const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
    return Array.from({ length: 20000 }, (_, i) => {
      const a = gauss();
      const b = gauss();
      return i % 3 ? { x: 40 + a * 9, z: 60 + (a * 0.6 + b * 0.8) * 8 } : { x: 70 + a * 6, z: 30 + b * 6 };
    });
  }, []);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {[10, 18, 28].map((b) => (
          <button key={b} className="btn" data-primary={bins === b} onClick={() => setBins(b)}>
            {b} × {b} bins
          </button>
        ))}
      </div>
      <Histogram3DChart height={440} colorScheme={scheme} points={points} bins={bins} xAxis={{ label: 'Age' }} zAxis={{ label: 'Income (k)' }} yAxis={{ label: 'Count' }} />
    </div>
  );
}
