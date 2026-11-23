import { useState } from 'react';
import { Surface3DChart } from '@rsc-gl/3d/react';
import { useDemoScheme } from '../util';

const xs = Array.from({ length: 64 }, (_, i) => -3 + (i / 63) * 6);
const zs = Array.from({ length: 64 }, (_, i) => -3 + (i / 63) * 6);

const FUNCTIONS: Record<string, (x: number, z: number) => number> = {
  ripple: (x, z) => {
    const r = Math.hypot(x, z) * 2.2;
    return r === 0 ? 1 : Math.sin(r) / r;
  },
  peaks: (x, z) =>
    3 * (1 - x) ** 2 * Math.exp(-(x ** 2) - (z + 1) ** 2) - 10 * (x / 5 - x ** 3 - z ** 5) * Math.exp(-(x ** 2) - z ** 2) - (1 / 3) * Math.exp(-((x + 1) ** 2) - z ** 2),
  saddle: (x, z) => (x * x - z * z) / 9,
  waves: (x, z) => Math.sin(x * 1.6) * Math.cos(z * 1.6),
};

export default function Surface3D() {
  const scheme = useDemoScheme();
  const [fn, setFn] = useState('peaks');
  const [wireframe, setWireframe] = useState(true);
  const [palette, setPalette] = useState('viridis');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {Object.keys(FUNCTIONS).map((k) => (
          <button key={k} className="btn" data-primary={fn === k} onClick={() => setFn(k)}>
            {k}
          </button>
        ))}
        <button className="btn" data-primary={wireframe} onClick={() => setWireframe((w) => !w)}>
          wireframe
        </button>
        <select className="btn" value={palette} onChange={(e) => setPalette(e.target.value)}>
          {['viridis', 'magma', 'inferno', 'cividis', 'redBlue'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <Surface3DChart
        height={460}
        colorScheme={scheme}
        xs={xs}
        zs={zs}
        values={FUNCTIONS[fn]}
        wireframe={wireframe}
        sequentialScheme={palette}
        animation={{ duration: 1100 }}
      />
    </div>
  );
}
