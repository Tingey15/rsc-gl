import { useMemo, useState } from 'react';
import { BarChart, ScatterChart } from '@rsc-gl/react';
import { clusters } from '../data';
import { useDemoScheme } from '../util';

const languages = ['Python', 'JavaScript', 'TypeScript', 'Java', 'C#', 'C++', 'Go', 'Rust', 'Kotlin', 'Swift', 'PHP', 'Ruby', 'Scala', 'Dart'];
const usage = [51, 62, 39, 30, 27, 23, 14, 13, 9, 5, 18, 6, 3, 6];

/** The mode follows the chart: rectangles for scatter, vertical ranges for horizontal bars. Override with `mode`. */
export default function MarqueeModesDemo() {
  const scheme = useDemoScheme();
  const [mode, setMode] = useState<'x' | 'y' | 'xy'>('xy');
  const pts = useMemo(() => clusters(1500, 4, 21), []);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {(['xy', 'x', 'y'] as const).map((m) => (
            <button key={m} className="btn" data-primary={mode === m} onClick={() => setMode(m)}>
              mode: {m}
            </button>
          ))}
        </div>
        <ScatterChart key={mode} height={320} colorScheme={scheme} hideLegend marquee={{ mode }} series={[{ data: pts, label: 'Points', markerSize: 4 }]} />
      </div>
      <BarChart
        height={380}
        colorScheme={scheme}
        hideLegend
        layout="horizontal"
        marquee
        yAxis={[{ data: languages }]}
        series={[{ data: usage, label: 'Usage (%)', color: '#a656d6' }]}
      />
    </div>
  );
}
