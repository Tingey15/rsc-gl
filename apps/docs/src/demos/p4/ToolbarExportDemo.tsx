import { useRef, useState } from 'react';
import { LineChart, type ChartHandle } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const days = Array.from({ length: 120 }, (_, i) => new Date(2026, 0, 1 + i));
const visits = days.map((_, i) => Math.round(1200 + 300 * Math.sin(i / 9) + i * 6 + ((i * 37) % 90)));
const signups = visits.map((v, i) => Math.round(v * (0.08 + 0.02 * Math.sin(i / 14))));

/** `toolbar` adds zoom, PNG / SVG / CSV downloads, print and full screen. */
export default function ToolbarExportDemo() {
  const scheme = useDemoScheme();
  const ref = useRef<ChartHandle>(null);
  const [preview, setPreview] = useState('');
  return (
    <div>
      <LineChart
        ref={ref}
        title="Traffic"
        height={300}
        colorScheme={scheme}
        toolbar={{ visibility: 'always', items: ['zoomIn', 'zoomOut', 'resetZoom', 'downloadPng', 'downloadSvg', 'downloadCsv', 'downloadXlsx', 'print', 'fullscreen'] }}
        xAxis={[{ data: days, scaleType: 'time', zoom: true }]}
        series={[
          { label: 'Visits', data: visits, curve: 'monotoneX' },
          { label: 'Sign-ups', data: signups, curve: 'monotoneX' },
        ]}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {(['csv', 'tsv', 'json'] as const).map((f) => (
          <button key={f} className="btn" onClick={() => setPreview(ref.current?.chart?.exportData(f).split('\n').slice(0, 8).join('\n') ?? '')}>
            Preview {f.toUpperCase()}
          </button>
        ))}
      </div>
      {preview && <pre style={{ marginTop: 10, maxHeight: 180, overflow: 'auto', fontSize: 12 }}>{preview}</pre>}
    </div>
  );
}
