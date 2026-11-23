import { useMemo, useState } from 'react';
import { feature } from 'topojson-client';
import land from 'world-atlas/land-110m.json';
import { Globe3DChart } from '@rsc-gl/3d/react';
import { useDemoScheme } from '../util';

const cities = [
  { label: 'Tokyo', lat: 35.7, lon: 139.7, value: 37.4 },
  { label: 'Delhi', lat: 28.6, lon: 77.2, value: 31.0 },
  { label: 'Shanghai', lat: 31.2, lon: 121.5, value: 27.1 },
  { label: 'São Paulo', lat: -23.6, lon: -46.6, value: 22.0 },
  { label: 'Mexico City', lat: 19.4, lon: -99.1, value: 21.8 },
  { label: 'Cairo', lat: 30.0, lon: 31.2, value: 20.9 },
  { label: 'Mumbai', lat: 19.1, lon: 72.9, value: 20.4 },
  { label: 'Beijing', lat: 39.9, lon: 116.4, value: 20.4 },
  { label: 'New York', lat: 40.7, lon: -74.0, value: 18.8 },
  { label: 'Lagos', lat: 6.5, lon: 3.4, value: 14.4 },
  { label: 'London', lat: 51.5, lon: -0.1, value: 9.3 },
  { label: 'Paris', lat: 48.9, lon: 2.35, value: 11.0 },
  { label: 'Sydney', lat: -33.9, lon: 151.2, value: 5.4 },
  { label: 'Johannesburg', lat: -26.2, lon: 28.0, value: 6.0 },
  { label: 'Los Angeles', lat: 34.1, lon: -118.2, value: 12.5 },
  { label: 'Singapore', lat: 1.35, lon: 103.8, value: 5.9 },
  { label: 'Moscow', lat: 55.8, lon: 37.6, value: 12.6 },
  { label: 'Buenos Aires', lat: -34.6, lon: -58.4, value: 15.2 },
];
const routes: [string, string][] = [
  ['New York', 'London'],
  ['London', 'Singapore'],
  ['Singapore', 'Sydney'],
  ['Los Angeles', 'Tokyo'],
  ['Tokyo', 'Shanghai'],
  ['Paris', 'Cairo'],
  ['Cairo', 'Mumbai'],
  ['São Paulo', 'Lagos'],
  ['Lagos', 'London'],
  ['Mexico City', 'New York'],
  ['Moscow', 'Beijing'],
  ['Buenos Aires', 'Johannesburg'],
];

/** Largest metro areas (population, millions) and long-haul routes. */
export default function Globe3D() {
  const scheme = useDemoScheme();
  const [spikes, setSpikes] = useState(true);
  const outlines = useMemo(() => feature(land as never, (land as unknown as { objects: { land: never } }).objects.land) as unknown as { features: { geometry: never }[] }, []);
  const at = (n: string) => cities.find((c) => c.label === n)!;
  return (
    <div>
      <button className="btn" style={{ marginBottom: 10 }} onClick={() => setSpikes((s) => !s)}>
        {spikes ? 'Show dots' : 'Show spikes'}
      </button>
      <Globe3DChart
        height={460}
        colorScheme={scheme}
        outlines={outlines}
        spikes={spikes}
        points={cities.map((c) => ({ ...c, color: '#ff8a3d' }))}
        arcs={routes.map(([a, b]) => ({ from: [at(a).lat, at(a).lon], to: [at(b).lat, at(b).lon], color: '#5ab0ff' }))}
        valueFormatter={(v) => `${v.toFixed(1)} M`}
        camera={{ elevation: 18, distance: 3.3, autoRotate: true, autoRotateSpeed: 8 }}
      />
    </div>
  );
}
