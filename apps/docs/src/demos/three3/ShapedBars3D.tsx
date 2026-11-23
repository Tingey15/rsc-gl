import { useState } from 'react';
import { Bar3DChart, StackedBar3DChart } from '@rsc-gl/3d/react';
import type { BarShape } from '@rsc-gl/3d';
import { useDemoScheme } from '../util';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const sites = ['Oslo', 'Lyon', 'Porto', 'Turin'];
const values = sites.map((_, z) => months.map((_, x) => Math.round(30 + 25 * Math.sin((x + z) / 1.7) + z * 8 + x * 3)));

export default function ShapedBars3D() {
  const scheme = useDemoScheme();
  const [shape, setShape] = useState<BarShape>('cylinder');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {(['box', 'cylinder', 'cone', 'pyramid'] as const).map((s) => (
          <button key={s} className="btn" data-primary={shape === s} onClick={() => setShape(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="row">
        <Bar3DChart height={380} colorScheme={scheme} x={months} z={sites} values={values} shape={shape} colorBy="value" sequentialScheme="viridis" yAxis={{ label: 'Visitors (k)' }} />
        <StackedBar3DChart
          height={380}
          colorScheme={scheme}
          x={months}
          z={sites.slice(0, 3)}
          shape={shape}
          yAxis={{ label: 'Energy (GWh)' }}
          stacks={[
            { label: 'Solar', color: '#f2b705', values: sites.slice(0, 3).map((_, z) => months.map((_, x) => 6 + x * 3 + z * 2)) },
            { label: 'Wind', color: '#3b9fd6', values: sites.slice(0, 3).map((_, z) => months.map((_, x) => 14 - x + z * 3)) },
            { label: 'Hydro', color: '#2fa37a', values: sites.slice(0, 3).map((_, z) => months.map((_, x) => 10 + ((x + z) % 3) * 2)) },
          ]}
        />
      </div>
    </div>
  );
}
