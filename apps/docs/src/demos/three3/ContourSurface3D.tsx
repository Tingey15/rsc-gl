import { Surface3DChart } from '@rsc-gl/3d/react';
import { useDemoScheme } from '../util';

const xs = Array.from({ length: 61 }, (_, i) => -3 + i * 0.1);
const zs = xs;
const peaks = (x: number, z: number) => 3 * (1 - x) ** 2 * Math.exp(-(x ** 2) - (z + 1) ** 2) - 10 * (x / 5 - x ** 3 - z ** 5) * Math.exp(-(x ** 2) - z ** 2) - (1 / 3) * Math.exp(-((x + 1) ** 2) - z ** 2);

/** Iso-lines traced on the surface and projected onto the floor (marching squares). */
export default function ContourSurface3D() {
  const scheme = useDemoScheme();
  return <Surface3DChart height={460} colorScheme={scheme} xs={xs} zs={zs} values={peaks} contours={12} floorContours sequentialScheme="viridis" camera={{ elevation: 32 }} />;
}
