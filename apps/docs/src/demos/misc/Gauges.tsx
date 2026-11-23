import { Gauge } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

export default function Gauges() {
  const scheme = useDemoScheme();
  return (
    <div className="row">
      <Gauge value={72} text={({ value }) => `${value}%`} colorScheme={scheme} height={180} />
      <Gauge value={38} startAngle={0} endAngle={360} innerRadius="80%" color="#e0663b" colorScheme={scheme} height={180} />
      <Gauge
        value={0.86}
        valueMax={1}
        startAngle={-90}
        endAngle={90}
        cornerRadius={12}
        color="#22a884"
        text={({ value }) => `${Math.round((value ?? 0) * 100)} NPS`}
        colorScheme={scheme}
        height={180}
      />
    </div>
  );
}
