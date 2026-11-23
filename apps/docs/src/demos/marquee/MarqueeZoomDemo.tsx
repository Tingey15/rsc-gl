import { useMemo } from 'react';
import { BarChart, LineChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `marquee` on its own zooms: drag across the plot, then double-click, press Esc or use "Reset zoom". */
export default function MarqueeZoomDemo() {
  const scheme = useDemoScheme();
  const days = useMemo(() => {
    const start = Date.UTC(2025, 0, 1);
    let v = 100;
    return Array.from({ length: 365 }, (_, i) => {
      v += Math.sin(i / 11) * 1.2 + Math.cos(i / 4.3) * 0.8 + (i % 17 === 0 ? 4 : 0) - 0.15;
      return { t: start + i * 864e5, v: Math.round(v * 10) / 10 };
    });
  }, []);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <BarChart
        height={280}
        colorScheme={scheme}
        marquee
        xAxis={[{ data: months }]}
        series={[{ data: [4, 8, 6, 12, 9, 15, 11, 14, 13, 18, 16, 20], label: 'Sales' }]}
      />
      <LineChart
        height={280}
        colorScheme={scheme}
        hideLegend
        marquee
        xAxis={[{ data: days.map((d) => d.t), scaleType: 'time' }]}
        series={[{ data: days.map((d) => d.v), label: 'Index', area: true, gradient: true, curve: 'monotoneX' }]}
      />
    </div>
  );
}
