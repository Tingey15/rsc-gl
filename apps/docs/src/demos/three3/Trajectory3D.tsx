import { useMemo } from 'react';
import { Trajectory3DChart } from '@rsc-gl/3d/react';
import { useDemoScheme } from '../util';

/** Two Lorenz attractor runs from nearly identical starting points. */
export default function Trajectory3D() {
  const scheme = useDemoScheme();
  const series = useMemo(() => {
    const run = (x0: number) => {
      let x = x0;
      let y = 1;
      let z = 1.05;
      const pts = [];
      const dt = 0.006;
      for (let i = 0; i < 4000; i++) {
        const dx = 10 * (y - x);
        const dy = x * (28 - z) - y;
        const dz = x * y - (8 / 3) * z;
        x += dx * dt;
        y += dy * dt;
        z += dz * dt;
        if (i % 2 === 0) pts.push({ x, y: z, z: y });
      }
      return pts;
    };
    return [
      { label: 'Run A', color: '#4f6bed', points: run(0.1) },
      { label: 'Run B', color: '#e06d3c', points: run(0.1001) },
    ];
  }, []);
  return <Trajectory3DChart height={460} colorScheme={scheme} series={series} tubeRadius={0.006} camera={{ elevation: 18, autoRotate: true, autoRotateSpeed: 6 }} />;
}
