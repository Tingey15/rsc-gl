import { SparkLineChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const kpis = [
  { label: 'Revenue', value: '$1.24M', data: [3, 4, 3.6, 5, 4.8, 6, 6.4, 7.1, 6.8, 8.2], color: '#22a884', bar: false },
  { label: 'Churn', value: '2.1%', data: [5, 4.6, 4.8, 4.1, 3.9, 3.2, 3, 2.6, 2.4, 2.1], color: '#d9475b', bar: false },
  { label: 'Orders', value: '18,402', data: [8, 12, 9, 14, 11, 16, 13, 18, 17, 21], color: '#3b6fe0', bar: true },
];

export default function Sparklines() {
  const scheme = useDemoScheme();
  return (
    <div className="row">
      {kpis.map((k) => (
        <div key={k.label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>{k.label}</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{k.value}</div>
          <SparkLineChart data={k.data} color={k.color} area={!k.bar} plotType={k.bar ? 'bar' : 'line'} height={48} showTooltip showHighlight colorScheme={scheme} />
        </div>
      ))}
    </div>
  );
}
