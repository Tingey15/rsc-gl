import { useMemo } from 'react';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { Map3DChart } from '@rsc-gl/3d/react';
import { useDemoScheme } from '../util';

// Sample metric (not real data): derived from each country's name so the demo is deterministic.
const sample = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return 10 + (h % 90);
};

export default function Map3D() {
  const scheme = useDemoScheme();
  const { features, values } = useMemo(() => {
    const fc = feature(world as never, (world as unknown as { objects: { countries: never } }).objects.countries) as unknown as { features: { properties: { name: string }; geometry: never }[] };
    // Antarctica dominates an equal-area map; leave it out.
    const kept = { type: 'FeatureCollection', features: fc.features.filter((f) => f.properties.name !== 'Antarctica') };
    return { features: kept, values: Object.fromEntries(kept.features.map((f) => [f.properties.name, sample(f.properties.name)])) };
  }, []);
  return <Map3DChart height={460} colorScheme={scheme} features={features as never} values={values} sequentialScheme="magma" valueFormatter={(v) => `${v} (sample)`} camera={{ azimuth: 0, elevation: 60, distance: 2.9 }} />;
}
