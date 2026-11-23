import { useMemo, useState } from 'react';
import { LineChart, marqueePlugin, crosshairPlugin, zoomPlugin, type MarqueeSelection } from '@rsc-gl/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

const DAY = 864e5;
const start = Date.UTC(2025, 0, 1);

export default function ZoomMarqueeDemo() {
  const scheme = useDemoScheme();
  const [selection, setSelection] = useState<MarqueeSelection | null>(null);
  const { x, a, b } = useMemo(() => {
    const r = rng(4);
    let va = 100;
    let vb = 80;
    const x: number[] = [];
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < 730; i++) {
      va += (r() - 0.48) * 6;
      vb += (r() - 0.5) * 5;
      x.push(start + i * DAY);
      a.push(Math.round(va * 10) / 10);
      b.push(Math.round(vb * 10) / 10);
    }
    return { x, a, b };
  }, []);
  // Plugins are created once per chart.
  const plugins = useMemo(
    () => [
      zoomPlugin({
        slider: true,
        rangeButtons: [
          { label: '1M', span: 30 * DAY },
          { label: '3M', span: 91 * DAY },
          { label: '1Y', span: 365 * DAY },
          { label: 'All', span: null },
        ],
      }),
      marqueePlugin({ mode: 'x', modifier: 'shift', action: 'select', persist: false, onMarqueeEnd: setSelection }),
      crosshairPlugin(),
    ],
    [],
  );
  return (
    <div>
      <LineChart
        height={380}
        colorScheme={scheme}
        plugins={plugins}
        xAxis={[{ data: x, scaleType: 'time', zoom: true }]}
        series={[
          { data: a, label: 'Index A', curve: 'linear' },
          { data: b, label: 'Index B', curve: 'linear' },
        ]}
      />
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
        Scroll or pinch to zoom, drag to pan, use the range buttons or the slider, and Shift+drag to select a range.{' '}
        {selection
          ? `Selected ${new Date(Number(selection.x[0])).toLocaleDateString()} – ${new Date(Number(selection.x[1])).toLocaleDateString()}: ${selection.items.length} points.`
          : 'No selection.'}
      </div>
    </div>
  );
}
