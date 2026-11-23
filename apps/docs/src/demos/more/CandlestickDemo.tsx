import { CandlestickChart } from '@rsc-gl/react';
import { rng } from '../data';
import { useDemoScheme } from '../util';

const r = rng(9);
let price = 120;
const data = Array.from({ length: 40 }, (_, i) => {
  const open = price;
  const close = open + (r() - 0.48) * 8;
  const high = Math.max(open, close) + r() * 4;
  const low = Math.min(open, close) - r() * 4;
  price = close;
  return { date: `D${i + 1}`, open, high, low, close };
});

export default function CandlestickDemo() {
  const scheme = useDemoScheme();
  return (
    <CandlestickChart
      height={340}
      colorScheme={scheme}
      xAxis={[{ categoryGapRatio: 0.3 }]}
      yAxis={[{ label: 'Price ($)' }]}
      trendlines={[{ method: 'movingAverage-5', color: '#d9a400', lineType: 'solid', label: 'MA(5)' }]}
      series={[{ data, dimension: 'date', label: 'ACME' }]}
    />
  );
}
