import { useState } from 'react';
import { BarChart, ChartsSvgLayer, useDrawingArea, useYScale, type LegendSlotProps, type TooltipContext } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

/** Custom drawing with the chart's own scales: a target band. */
function TargetBand({ from, to, label }: { from: number; to: number; label: string }) {
  const y = useYScale();
  const area = useDrawingArea();
  if (!y) return null;
  const y0 = y.map(to);
  const y1 = y.map(from);
  return (
    <g>
      <rect x={area.left} width={area.width} y={y0} height={y1 - y0} fill="#2fa37a" opacity={0.12} />
      <line x1={area.left} x2={area.left + area.width} y1={y0} y2={y0} stroke="#2fa37a" strokeDasharray="4 3" />
      <text x={area.left + area.width - 6} y={y0 - 6} textAnchor="end" fontSize={12} fontWeight={600} fill="#2fa37a">
        {label}
      </text>
    </g>
  );
}

/** A legend slot: any React UI, wired to the chart's toggle / highlight. */
function PillLegend({ items, hidden, toggle, highlight }: LegendSlotProps) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', paddingTop: 8 }}>
      {items.map((it) => (
        <button
          key={it.id}
          className="btn"
          onClick={() => toggle(it.id)}
          onMouseEnter={() => highlight(it.id)}
          onMouseLeave={() => highlight(null)}
          style={{ opacity: hidden.includes(it.id) ? 0.45 : 1, borderColor: it.color, borderRadius: 999 }}
        >
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: it.color, marginRight: 6 }} />
          {it.label}
        </button>
      ))}
    </div>
  );
}

function CardTooltip({ context }: { context: TooltipContext }) {
  const it = context.items[0];
  if (!it) return null;
  return (
    <div style={{ padding: 4 }}>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{context.axisLabel}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: it.color }}>{it.formattedValue}</div>
      <div style={{ fontSize: 12 }}>{it.seriesLabel}</div>
    </div>
  );
}

function Spinner() {
  return <div style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--rgl-tooltip-bg)', border: '1px solid var(--rgl-tooltip-border)', fontSize: 13 }}>Fetching quarterly numbers…</div>;
}

export default function CompositionDemo() {
  const scheme = useDemoScheme();
  const [loading, setLoading] = useState(false);
  return (
    <div style={{ paddingBottom: 44 }}>
      <button className="btn" style={{ marginBottom: 8 }} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>
        Simulate loading
      </button>
      <BarChart
        height={300}
        colorScheme={scheme}
        loading={loading}
        xAxis={[{ data: quarters }]}
        series={[
          { label: 'North', data: [42, 51, 58, 64] },
          { label: 'South', data: [36, 44, 49, 61] },
        ]}
        slots={{ legend: PillLegend, tooltip: CardTooltip as never, loadingOverlay: Spinner }}
      >
        <ChartsSvgLayer>
          <TargetBand from={50} to={60} label="Target range" />
        </ChartsSvgLayer>
      </BarChart>
    </div>
  );
}
