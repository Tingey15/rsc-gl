import { useState } from 'react';
import { BarChart, type EasingName } from '@rsc-gl/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

const EASINGS: EasingName[] = ['cubicInOut', 'cubicOut', 'backOut', 'elasticOut', 'linear'];

function randomData(seed: number, n: number) {
  const r = rng(seed);
  return {
    labels: Array.from({ length: n }, (_, i) => `C${i + 1}`),
    a: Array.from({ length: n }, () => Math.round(10 + r() * 90)),
    b: Array.from({ length: n }, () => Math.round(10 + r() * 60)),
  };
}

export default function AnimatedUpdates() {
  const scheme = useDemoScheme();
  const [seed, setSeed] = useState(1);
  const [count, setCount] = useState(8);
  const [easing, setEasing] = useState<EasingName>('backOut');
  const [stagger, setStagger] = useState(0.4);
  const d = randomData(seed, count);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" data-primary onClick={() => setSeed((s) => s + 1)}>
          New data
        </button>
        <button className="btn" onClick={() => setCount((c) => Math.min(16, c + 2))}>
          Add categories
        </button>
        <button className="btn" onClick={() => setCount((c) => Math.max(2, c - 2))}>
          Remove categories
        </button>
        <select className="btn" value={easing} onChange={(e) => setEasing(e.target.value as EasingName)}>
          {EASINGS.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <label style={{ fontSize: 13 }}>
          stagger {stagger}
          <input type="range" min={0} max={0.9} step={0.1} value={stagger} onChange={(e) => setStagger(Number(e.target.value))} />
        </label>
      </div>
      <BarChart
        height={320}
        colorScheme={scheme}
        animation={{ duration: 900, easing, stagger }}
        xAxis={[{ data: d.labels }]}
        series={[
          { data: d.a, label: 'Alpha' },
          { data: d.b, label: 'Beta' },
        ]}
      />
    </div>
  );
}
