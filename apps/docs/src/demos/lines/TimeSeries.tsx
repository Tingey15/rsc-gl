import { Axis, Chart, Legend, Line } from '@rsc-gl/react';
import { timeSeries } from '../data';
import { useDemoScheme } from '../util';

const data = timeSeries();

export default function TimeSeries() {
  const scheme = useDemoScheme();
  return (
    <Chart data={data} height={340} colorScheme={scheme}>
      <Axis position="bottom" baseline ticks labelFormat="time" granularity="day" />
      <Axis position="left" grid numberFormat="shortNumber" title="Events" />
      <Line dimension="datetime" metric="value" color="series" interpolate="monotone" />
      <Legend highlight isToggleable />
    </Chart>
  );
}
