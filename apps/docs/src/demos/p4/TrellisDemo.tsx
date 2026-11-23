import { Axis, Bar, Chart, ChartTooltip, Legend } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const regions = ['North', 'South', 'East', 'West'];
const products = ['Laptops', 'Phones', 'Tablets'];
const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
const rows = regions.flatMap((region, r) =>
  quarters.flatMap((quarter, q) =>
    products.map((product, p) => ({ region, quarter, product, sales: Math.round(20 + ((r * 7 + q * 5 + p * 11) % 23) + q * 4 + (region === 'East' ? 12 : 0)) })),
  ),
);

/** One `trellis` prop turns a chart into small multiples that share the value scale. */
export default function TrellisDemo() {
  const scheme = useDemoScheme();
  return (
    <Chart data={rows} height={260} colorScheme={scheme} title="Sales by quarter, per region">
      <Axis position="bottom" />
      <Axis position="left" grid numberFormat="shortNumber" />
      <Bar dimension="quarter" metric="sales" color="product" trellis="region" trellisOrientation="horizontal">
        <ChartTooltip>{(d) => <span>{String(d.product)}: {String(d.sales)}</span>}</ChartTooltip>
      </Bar>
      <Legend position="bottom" />
    </Chart>
  );
}
