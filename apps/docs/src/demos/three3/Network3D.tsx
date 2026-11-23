import { useMemo } from 'react';
import { Network3DChart } from '@rsc-gl/3d/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

const teams = ['Platform', 'Mobile', 'Web', 'Data', 'Design'];

/** A service dependency graph: dense within teams, sparse across. */
export default function Network3D() {
  const scheme = useDemoScheme();
  const graph = useMemo(() => {
    const r = rng(9);
    const nodes = teams.flatMap((team, t) => Array.from({ length: 22 }, (_, i) => ({ id: `${team}-${i}`, label: `${team} service ${i + 1}`, group: team })).map((n) => ({ ...n, t })));
    const links: { source: string; target: string }[] = [];
    for (const a of nodes)
      for (const b of nodes) {
        if (a.id >= b.id) continue;
        const p = a.t === b.t ? 0.13 : 0.004;
        if (r() < p) links.push({ source: a.id, target: b.id });
      }
    return { nodes: nodes.map(({ t: _t, ...n }) => n), links };
  }, []);
  return <Network3DChart height={460} colorScheme={scheme} nodes={graph.nodes} links={graph.links} camera={{ elevation: 16, distance: 3.6, autoRotate: true, autoRotateSpeed: 6 }} />;
}
