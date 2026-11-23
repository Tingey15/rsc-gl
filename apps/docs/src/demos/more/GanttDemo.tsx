import { GanttChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const tasks = [
  { task: 'Research', start: '2026-01-05', end: '2026-01-23', label: 'Research', progress: 1, color: '#8a63d2' },
  { task: 'Design', start: '2026-01-19', end: '2026-02-13', label: 'Design', progress: 0.9, color: '#3b6fe0' },
  { task: 'GPU engine', start: '2026-02-02', end: '2026-03-20', label: 'GPU engine', progress: 0.6, color: '#22a884' },
  { task: 'React API', start: '2026-02-23', end: '2026-03-27', label: 'React API', progress: 0.4, color: '#e0663b' },
  { task: 'Docs', start: '2026-03-09', end: '2026-04-10', label: 'Docs', progress: 0.25, color: '#c2408f' },
  { task: 'Launch', start: '2026-04-06', end: '2026-04-17', label: 'Launch', progress: 0, color: '#d9a400' },
];

export default function GanttDemo() {
  const scheme = useDemoScheme();
  return (
    <GanttChart
      height={320}
      colorScheme={scheme}
      referenceLines={[{ x: Date.parse('2026-03-01'), label: 'Today', color: '#d9475b', lineType: 'dashed' }]}
      series={[{ data: tasks, dimension: 'task', start: 'start', end: 'end', colorField: 'color', progressField: 'progress' }]}
    />
  );
}
