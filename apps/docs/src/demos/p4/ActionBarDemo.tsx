import { useState } from 'react';
import { Axis, Bar, Chart, ChartActionBar, ChartToolbar } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const rows = [
  { team: 'Design', open: 14 },
  { team: 'Platform', open: 31 },
  { team: 'Mobile', open: 22 },
  { team: 'Web', open: 27 },
  { team: 'Data', open: 9 },
  { team: 'Support', open: 18 },
];

/** Click a bar: the action bar opens next to it and the bar stays selected. */
export default function ActionBarDemo() {
  const scheme = useDemoScheme();
  const [log, setLog] = useState<string[]>([]);
  const add = (t: string) => setLog((l) => [t, ...l].slice(0, 4));
  return (
    <div>
      <Chart data={rows} height={300} colorScheme={scheme}>
        <Axis position="bottom" />
        <Axis position="left" grid />
        <Bar dimension="team" metric="open" color={{ value: '#4f6bed' }}>
          <ChartActionBar
            actions={[
              { label: 'Open issues', onAction: (d) => add(`Opened issues for ${d.team}`) },
              { label: 'Assign', onAction: (d) => add(`Assigned ${d.team}`) },
              { label: 'Export', onAction: (d) => add(`Exported ${d.team} (${d.open})`) },
            ]}
          />
        </Bar>
        <ChartToolbar items={['downloadPng', 'downloadCsv', 'print']} />
      </Chart>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, minHeight: 20 }}>{log.length ? log.join(' · ') : 'Click a bar to open its actions.'}</div>
    </div>
  );
}
