import { useState } from 'react';
import { BarChart, PALETTES } from '@rsc-gl/react';
import { revenue } from '../data';
import { useDemoScheme } from '../util';

const NAMES = [...Object.keys(PALETTES), 'sequentialViridis6', 'divergingRedBlue6', 'custom tokens'];

export default function Palettes() {
  const scheme = useDemoScheme();
  const [name, setName] = useState('categorical16');
  const colors = name === 'custom tokens' ? ['indigo-900', 'magenta-800', 'orange-700', 'seafoam-800', 'gray-500', 'yellow-600'] : name;
  return (
    <div>
      <select className="btn" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 10 }}>
        {NAMES.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
      <BarChart
        height={300}
        colorScheme={scheme}
        colors={colors}
        xAxis={[{ data: revenue.months.slice(0, 6) }]}
        series={['A', 'B', 'C', 'D', 'E', 'F'].map((l, i) => ({ label: `Series ${l}`, data: revenue.product.slice(0, 6).map((v) => Math.round(v * (1 - i * 0.12))), stack: 's' }))}
      />
    </div>
  );
}
