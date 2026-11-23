import { useMemo, useState } from 'react';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { MapChart } from '@rsc-gl/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

type Projection = 'equalEarth' | 'naturalEarth1' | 'mercator' | 'orthographic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const countries = feature(world as any, (world as any).objects.countries) as unknown as { type: 'FeatureCollection'; features: { id: string; properties: { name: string } }[] };

export default function MapDemo() {
  const scheme = useDemoScheme();
  const [projection, setProjection] = useState<Projection>('equalEarth');
  const [seed, setSeed] = useState(1);
  const [spin, setSpin] = useState(20);
  const regions = useMemo(() => {
    const r = rng(seed);
    return countries.features.map((f) => ({ id: String(f.id), name: f.properties.name, value: Math.round(r() * 100) }));
  }, [seed]);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['equalEarth', 'naturalEarth1', 'mercator', 'orthographic'] as const).map((p) => (
          <button key={p} className="btn" data-primary={projection === p} onClick={() => setProjection(p)}>
            {p}
          </button>
        ))}
        <button className="btn" onClick={() => setSeed((s) => s + 1)}>
          New data
        </button>
        {projection === 'orthographic' && (
          <label style={{ fontSize: 13 }}>
            rotate <input type="range" min={-180} max={180} value={spin} onChange={(e) => setSpin(Number(e.target.value))} />
          </label>
        )}
      </div>
      <MapChart
        height={420}
        colorScheme={scheme}
        series={[{ geoJson: countries, regions, projection, rotate: [spin, -15], colorScheme: 'viridis', label: 'Index' }]}
      />
    </div>
  );
}
