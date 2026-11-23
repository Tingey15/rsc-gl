import { useState } from 'react';
import { Bar3DChart } from '@rsc-gl/3d/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

const quarters = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
const regions = ['North', 'South', 'East', 'West', 'Central'];

function makeValues(seed: number) {
  const r = rng(seed);
  return regions.map((_, zi) => quarters.map((_, xi) => Math.round(20 + r() * 60 + xi * 6 + zi * 4)));
}

export default function Bars3D() {
  const scheme = useDemoScheme();
  const [seed, setSeed] = useState(1);
  const [colorBy, setColorBy] = useState<'z' | 'x' | 'value'>('z');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button className="btn" onClick={() => setSeed((s) => s + 1)}>
          Randomize data
        </button>
        {(['z', 'x', 'value'] as const).map((c) => (
          <button key={c} className="btn" data-primary={colorBy === c} onClick={() => setColorBy(c)}>
            colorBy: {c}
          </button>
        ))}
      </div>
      <Bar3DChart
        height={440}
        colorScheme={scheme}
        x={quarters}
        z={regions}
        values={makeValues(seed)}
        colorBy={colorBy}
        yAxis={{ label: 'Revenue ($k)' }}
        camera={{ azimuth: 38, elevation: 26 }}
      />
    </div>
  );
}
