import { BarChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const languages = ['TypeScript', 'Python', 'Rust', 'Go', 'Kotlin', 'Swift'];

export default function HorizontalBars() {
  const scheme = useDemoScheme();
  return (
    <BarChart
      height={300}
      layout="horizontal"
      colorScheme={scheme}
      barLabel="value"
      yAxis={[{ data: languages }]}
      series={[{ data: [78, 66, 41, 37, 22, 18], label: 'Satisfaction %', color: '#22a884' }]}
      hideLegend
    />
  );
}
