import { useMemo, useState } from 'react';
import { BarChart, renderToSVGString } from '@rsc-gl/react';
import { barSeries } from '@rsc-gl/core';
import { useDemoScheme } from '../util';

const quarters = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
const north = [42, 51, 58, 64, 61, 72];
const south = [36, 44, 49, 61, 66, 70];

/**
 * Server rendering + hydration. On a server you would call renderToSVGString
 * and send the SVG in the HTML; here we generate it in the browser to show
 * the handoff. The GPU chart mounts behind the SVG and replaces it without
 * re-running the entrance animation.
 */
export default function HydrationDemo() {
  const scheme = useDemoScheme();
  const [mounted, setMounted] = useState(false);
  const [timing, setTiming] = useState('');
  const svg = useMemo(
    () =>
      renderToSVGString(
        { colorScheme: scheme, legend: true, xAxis: [{ data: quarters }], series: [{ type: 'bar', data: north, label: 'North' }, { type: 'bar', data: south, label: 'South' }] },
        { series: [barSeries], width: 640, height: 300 },
      ),
    [scheme],
  );
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn"
          data-primary
          onClick={() => {
            const t0 = performance.now();
            setMounted(false);
            setTiming('');
            requestAnimationFrame(() => {
              setMounted(true);
              (window as unknown as { __hydrateT0: number }).__hydrateT0 = t0;
            });
          }}
        >
          {mounted ? 'Hydrate again' : 'Hydrate'}
        </button>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{mounted ? timing || 'GPU chart taking over…' : 'Showing server SVG (static, no JavaScript chart yet).'}</span>
      </div>
      <div style={{ width: 640, maxWidth: '100%', height: 300, position: 'relative' }}>
        {mounted ? (
          <BarChart
            width={640}
            height={300}
            colorScheme={scheme}
            serverSvg={svg}
            xAxis={[{ data: quarters }]}
            series={[{ data: north, label: 'North' }, { data: south, label: 'South' }]}
            onBackend={() => {
              const t0 = (window as unknown as { __hydrateT0: number }).__hydrateT0;
              requestAnimationFrame(() => setTiming(`Interactive GPU chart ready in ${(performance.now() - t0).toFixed(0)} ms — hover the bars.`));
            }}
          />
        ) : (
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        )}
      </div>
    </div>
  );
}
