import { Axis, Bar, Chart, ChartTooltip, Legend } from '@rsc-gl/react';
import { browserData } from '../data';
import { useDemoScheme } from '../util';

export default function ComposableBars() {
  const scheme = useDemoScheme();
  return (
    <Chart data={browserData} height={360} colorScheme={scheme}>
      <Axis position="bottom" baseline title="Browser" />
      <Axis position="left" grid title="Downloads" numberFormat="shortNumber" />
      <Bar dimension="browser" metric="downloads" color="os" type="dodged">
        <ChartTooltip>
          {(d) => (
            <div>
              <b>{String(d.browser)}</b> on {String(d.os)}
              <div>{Number(d.downloads).toLocaleString()} downloads</div>
            </div>
          )}
        </ChartTooltip>
      </Bar>
      <Legend isToggleable highlight title="Platform" />
    </Chart>
  );
}
