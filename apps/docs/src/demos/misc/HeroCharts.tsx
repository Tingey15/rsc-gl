import { useEffect, useState } from 'react';
import { BarChart, LineChart, PieChart } from '@rsc-gl/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function series(seed: number) {
  const r = rng(seed);
  return [0, 1, 2].map(() => labels.map(() => Math.round(10 + r() * 40)));
}

/** Landing page showcase: data changes every few seconds and everything morphs. */
export default function HeroCharts() {
  const scheme = useDemoScheme();
  const [seed, setSeed] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setSeed((s) => s + 1), 2600);
    return () => clearInterval(id);
  }, []);
  const s = series(seed);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
      <BarChart
        height={230}
        colorScheme={scheme}
        hideLegend
        borderRadius={5}
        animation={{ duration: 800, easing: 'cubicInOut', stagger: 0.25 }}
        xAxis={[{ data: labels }]}
        // A fixed value range keeps the scale steady, so only the bars move when the data changes.
        yAxis={[{ min: 0, max: 160, tickNumber: 4 }]}
        series={s.map((d, i) => ({ data: d, label: `S${i}`, stack: 'a' }))}
      />
      <PieChart
        height={230}
        colorScheme={scheme}
        hideLegend
        series={[{ data: s[0].slice(0, 5).map((v, i) => ({ id: i, value: v, label: labels[i] })), innerRadius: '58%', cornerRadius: 5, paddingAngle: 2 }]}
      />
      <div style={{ gridColumn: '1 / -1' }}>
        <LineChart
          height={160}
          colorScheme={scheme}
          hideLegend
          xAxis={[{ data: labels, scaleType: 'point' }]}
          yAxis={[{ min: 0, max: 50, tickNumber: 3 }]}
          series={s.map((d, i) => ({ data: d, curve: 'natural' as const, area: i === 0, gradient: i === 0, showMark: i === 0 }))}
        />
      </div>
    </div>
  );
}
