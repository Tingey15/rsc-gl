import { useMemo } from 'react';
import { VectorField3DChart } from '@rsc-gl/3d/react';
import { useDemoScheme } from '../util';

/** A vortex rising around the vertical axis. */
export default function VectorField3D() {
  const scheme = useDemoScheme();
  const vectors = useMemo(() => {
    const out = [];
    for (let x = -3; x <= 3; x++)
      for (let y = 0; y <= 4; y++)
        for (let z = -3; z <= 3; z++) {
          const r = Math.hypot(x, z) + 0.5;
          // Fast near the core, slow at the rim.
          const s = 1.6 * Math.exp(-r / 2.2) + 0.15;
          out.push({ x, y, z, u: (-z / r) * s, v: 0.12 + 0.1 * y * s, w: (x / r) * s });
        }
    return out;
  }, []);
  return <VectorField3DChart height={440} colorScheme={scheme} vectors={vectors} sequentialScheme="turbo" camera={{ elevation: 30 }} />;
}
