import { useState } from 'react';
import { Treemap3DChart } from '@rsc-gl/3d/react';
import { useDemoScheme } from '../util';

const root = {
  name: 'Cloud spend',
  children: [
    { name: 'Compute', children: [{ name: 'VMs', value: 420 }, { name: 'Containers', value: 260 }, { name: 'Functions', value: 90 }, { name: 'GPUs', value: 310 }] },
    { name: 'Storage', children: [{ name: 'Object', value: 210 }, { name: 'Block', value: 130 }, { name: 'Archive', value: 40 }] },
    { name: 'Network', children: [{ name: 'Egress', value: 180 }, { name: 'CDN', value: 95 }, { name: 'Load balancers', value: 55 }] },
    { name: 'Data', children: [{ name: 'Warehouse', value: 240 }, { name: 'Streaming', value: 120 }, { name: 'Databases', value: 200 }] },
    { name: 'Other', children: [{ name: 'Monitoring', value: 60 }, { name: 'Support', value: 80 }] },
  ],
};

export default function Treemap3D() {
  const scheme = useDemoScheme();
  const [by, setBy] = useState<'value' | 'depth'>('value');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {(['value', 'depth'] as const).map((b) => (
          <button key={b} className="btn" data-primary={by === b} onClick={() => setBy(b)}>
            Height by {b}
          </button>
        ))}
      </div>
      <Treemap3DChart height={440} colorScheme={scheme} root={root} heightBy={by} valueFormatter={(v) => `$${v}k`} camera={{ elevation: 42, distance: 3.6 }} />
    </div>
  );
}
