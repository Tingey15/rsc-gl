import { useEffect, useRef, useState } from 'react';
import { LineChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const WINDOW = 600;

export default function Streaming() {
  const scheme = useDemoScheme();
  const t = useRef(0);
  const [data, setData] = useState(() => ({ x: [] as number[], a: [] as number[], b: [] as number[] }));
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setData((prev) => {
        const x = [...prev.x];
        const a = [...prev.a];
        const b = [...prev.b];
        for (let k = 0; k < 5; k++) {
          const i = t.current++;
          x.push(i);
          a.push(Math.sin(i / 25) * 40 + Math.sin(i / 7) * 8 + (Math.random() - 0.5) * 6 + 50);
          b.push(Math.cos(i / 40) * 30 + (Math.random() - 0.5) * 10 + 20);
        }
        const drop = Math.max(0, x.length - WINDOW);
        return { x: x.slice(drop), a: a.slice(drop), b: b.slice(drop) };
      });
    }, 50);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div>
      <button className="btn" data-primary={running} onClick={() => setRunning((r) => !r)} style={{ marginBottom: 10 }}>
        {running ? 'Pause' : 'Resume'} stream
      </button>
      <LineChart
        height={300}
        colorScheme={scheme}
        skipAnimation
        xAxis={[{ data: data.x, scaleType: 'linear', domainLimit: 'strict' }]}
        yAxis={[{ min: -20, max: 110 }]}
        series={[
          { data: data.a, label: 'Sensor A', curve: 'linear', area: true },
          { data: data.b, label: 'Sensor B', curve: 'linear' },
        ]}
      />
    </div>
  );
}
