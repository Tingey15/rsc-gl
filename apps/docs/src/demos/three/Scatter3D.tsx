import { useState } from 'react';
import { Scatter3DChart } from '@rsc-gl/3d/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

function cluster(seed: number, cx: number, cy: number, cz: number, n = 120) {
  const r = rng(seed);
  const g = () => (r() + r() + r() - 1.5) * 1.6;
  return Array.from({ length: n }, () => ({ x: cx + g(), y: cy + g(), z: cz + g(), size: 7 + r() * 7 }));
}

const series = [
  { label: 'Setosa', data: cluster(1, 2, 3, 2) },
  { label: 'Versicolor', data: cluster(2, 5, 5, 5) },
  { label: 'Virginica', data: cluster(3, 7, 2.5, 7.5) },
];

export default function Scatter3D() {
  const scheme = useDemoScheme();
  const [autoRotate, setAutoRotate] = useState(true);
  return (
    <div>
      <button className="btn" data-primary={autoRotate} onClick={() => setAutoRotate((a) => !a)} style={{ marginBottom: 10 }}>
        Auto-rotate {autoRotate ? 'on' : 'off'}
      </button>
      <Scatter3DChart
        height={440}
        colorScheme={scheme}
        series={series}
        xAxis={{ label: 'Sepal' }}
        yAxis={{ label: 'Petal' }}
        zAxis={{ label: 'Width' }}
        camera={{ autoRotate, autoRotateSpeed: 14 }}
      />
    </div>
  );
}
