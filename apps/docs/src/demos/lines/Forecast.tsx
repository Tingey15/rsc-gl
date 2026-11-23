import { LineChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const actual = [12, 18, 15, 22, 26, 24, 31, 35, null, null, null, null];
const forecast = [null, null, null, null, null, null, null, 35, 38, 42, 44, 49];
const weeks = Array.from({ length: 12 }, (_, i) => `W${i + 1}`);

export default function Forecast() {
  const scheme = useDemoScheme();
  return (
    <LineChart
      height={300}
      colorScheme={scheme}
      xAxis={[{ data: weeks, scaleType: 'point' }]}
      referenceLines={[{ x: 'W8', label: 'Today', lineType: 'dashed', color: 'gray-500' }]}
      series={[
        { data: actual, label: 'Actual', color: '#3b6fe0', area: true, gradient: true, curve: 'monotoneX' },
        { data: forecast, label: 'Forecast', color: '#8a63d2', lineType: 'dotted', curve: 'monotoneX' },
      ]}
    />
  );
}
