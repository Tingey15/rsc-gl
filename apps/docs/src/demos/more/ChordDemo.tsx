import { ChordChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const names = ['Europe', 'Americas', 'Asia', 'Africa', 'Oceania'];
const matrix = [
  [0, 52, 31, 12, 6],
  [44, 0, 38, 7, 9],
  [29, 41, 0, 10, 14],
  [15, 6, 8, 0, 2],
  [5, 8, 16, 2, 0],
];

export default function ChordDemo() {
  const scheme = useDemoScheme();
  return <ChordChart height={400} colorScheme={scheme} series={[{ matrix, names, label: 'Trade flows' }]} />;
}
