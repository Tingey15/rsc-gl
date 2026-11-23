import { RadialLineChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hours = Array.from({ length: 24 * 4 }, (_, i) => i / 4);

export default function RadialLineDemo() {
  const scheme = useDemoScheme();
  return (
    <div className="row">
      {/* Categorical angles: a closed loop per year. */}
      <RadialLineChart
        height={340}
        colorScheme={scheme}
        series={[
          { label: '2025', angles: months, data: months.map((_, i) => 12 + 10 * Math.sin(((i - 3) / 12) * Math.PI * 2)), curve: 'smooth', area: true, showMarks: true },
          { label: '2026', angles: months, data: months.map((_, i) => 14 + 11 * Math.sin(((i - 3.4) / 12) * Math.PI * 2)), curve: 'smooth', showMarks: true },
        ]}
      />
      {/* Continuous angles: traffic by hour of day, with an inner hole. */}
      <RadialLineChart
        height={340}
        colorScheme={scheme}
        hideLegend
        series={[
          {
            label: 'Requests / min',
            angles: hours,
            angleDomain: [0, 24],
            innerRadius: '22%',
            data: hours.map((h) => Math.round(400 + 900 * Math.exp(-((h - 14) ** 2) / 18) + 300 * Math.exp(-((h - 20) ** 2) / 4))),
            area: true,
            curve: 'smooth',
            color: '#2fa37a',
            angleFormatter: (v) => `${String(v).padStart(2, '0')}:00`,
          },
        ]}
      />
    </div>
  );
}
