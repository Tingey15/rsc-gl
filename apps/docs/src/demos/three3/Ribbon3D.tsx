import { useState } from 'react';
import { Ribbon3DChart } from '@rsc-gl/3d/react';
import { useDemoScheme } from '../util';

const hours = Array.from({ length: 49 }, (_, i) => i / 2);
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const load = (d: number, h: number) => {
  const weekend = d >= 5;
  const peak = weekend ? 13 : 9;
  return 20 + 60 * Math.exp(-((h - peak) ** 2) / (weekend ? 18 : 6)) + 35 * Math.exp(-((h - 18) ** 2) / 5) * (weekend ? 0.4 : 1) + d * 2;
};

/** Hourly load per weekday as ribbons or as a ridgeline of walls. */
export default function Ribbon3D() {
  const scheme = useDemoScheme();
  const [style, setStyle] = useState<'ribbon' | 'wall'>('wall');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {(['wall', 'ribbon'] as const).map((s) => (
          <button key={s} className="btn" data-primary={style === s} onClick={() => setStyle(s)}>
            {s === 'wall' ? 'Ridgeline walls' : 'Ribbons'}
          </button>
        ))}
      </div>
      <Ribbon3DChart
        height={420}
        colorScheme={scheme}
        variant={style}
        x={hours}
        series={days.map((d, i) => ({ label: d, data: hours.map((h) => Math.round(load(i, h))) }))}
        xAxis={{ label: 'Hour', format: (v) => `${v}:00` }}
        yAxis={{ label: 'Load (MW)' }}
        camera={{ azimuth: 28, elevation: 24 }}
      />
    </div>
  );
}
