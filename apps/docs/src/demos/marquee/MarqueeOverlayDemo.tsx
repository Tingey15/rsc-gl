import { useMemo } from 'react';
import { ChartsSvgLayer, LineChart, useMarquee, useDrawingArea } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

interface Point {
  t: number;
  v: number;
}

/** Custom overlay: values at both ends of the selection, the difference and the % change. */
function ChangeOverlay({ data }: { data: Point[] }) {
  const marquee = useMarquee();
  const area = useDrawingArea();
  const range = marquee?.selection?.x;
  if (!marquee || !range) return null;
  const nearest = (t: number) => data.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), data[0]);
  const a = nearest(Number(range[0]));
  const b = nearest(Number(range[1]));
  const diff = b.v - a.v;
  const pct = (diff / a.v) * 100;
  const up = diff >= 0;
  const x = Math.min(marquee.start.x, marquee.current.x);
  const w = Math.abs(marquee.current.x - marquee.start.x);
  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const color = up ? '#22a884' : '#d9475b';
  const boxW = 212;
  const left = Math.min(Math.max(area.left, x + w / 2 - boxW / 2), area.left + area.width - boxW);
  return (
    <g>
      <rect x={left} y={area.top + 6} width={boxW} height={58} rx={8} fill="var(--rgl-tooltip-bg)" stroke={color} />
      <text x={left + 10} y={area.top + 24} fontSize={12} fill="var(--rgl-text)">
        {fmt(a.t)}: {a.v.toFixed(1)} → {fmt(b.t)}: {b.v.toFixed(1)}
      </text>
      <text x={left + 10} y={area.top + 46} fontSize={16} fontWeight={800} fill={color}>
        {up ? '▲' : '▼'} {Math.abs(diff).toFixed(1)} ({up ? '+' : '−'}
        {Math.abs(pct).toFixed(2)}%)
      </text>
    </g>
  );
}

export default function MarqueeOverlayDemo() {
  const scheme = useDemoScheme();
  const data = useMemo<Point[]>(() => {
    const start = Date.UTC(2025, 0, 1);
    let v = 112;
    return Array.from({ length: 50 }, (_, i) => {
      v += Math.sin(i / 3) * 2.4 + (i > 25 ? 0.6 : -0.3);
      return { t: start + i * 864e5, v: Math.round(v * 10) / 10 };
    });
  }, []);
  return (
    <LineChart
      height={320}
      colorScheme={scheme}
      hideLegend
      marquee={{ action: 'select', labels: false }}
      xAxis={[{ data: data.map((d) => d.t), scaleType: 'time' }]}
      series={[{ data: data.map((d) => d.v), label: 'Market value', showMark: true, curve: 'monotoneX' }]}
    >
      <ChartsSvgLayer>
        <ChangeOverlay data={data} />
      </ChartsSvgLayer>
    </LineChart>
  );
}
