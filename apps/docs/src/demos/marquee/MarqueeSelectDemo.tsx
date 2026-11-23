import { useMemo, useState } from 'react';
import { ScatterChart, type MarqueeSelection } from '@rsc-gl/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

/** `action: 'select'` keeps the rectangle and reports the points inside it. Click empty space to clear. */
export default function MarqueeSelectDemo() {
  const scheme = useDemoScheme();
  const [selection, setSelection] = useState<MarqueeSelection | null>(null);
  const points = useMemo(() => {
    const r = rng(12);
    return Array.from({ length: 60 }, (_, i) => ({ id: i + 1, x: Math.round(r() * 100), y: Math.round(r() * 50) }));
  }, []);
  const picked = selection?.items.map((it) => points[it.dataIndex]) ?? [];
  return (
    <div>
      <ScatterChart
        height={320}
        colorScheme={scheme}
        hideLegend
        marquee={{ action: 'select', onMarqueeEnd: setSelection }}
        series={[{ data: points, label: 'Samples', markerSize: 8 }]}
      />
      <div style={{ marginTop: 10, fontSize: 13 }}>
        {picked.length ? (
          <>
            <b>{picked.length} points selected</b>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {picked.map((p) => (
                <span key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', fontVariantNumeric: 'tabular-nums' }}>
                  #{p.id} ({p.x}, {p.y})
                </span>
              ))}
            </div>
          </>
        ) : (
          <span style={{ color: 'var(--muted)' }}>No points selected. Drag on the chart to select data points.</span>
        )}
      </div>
    </div>
  );
}
