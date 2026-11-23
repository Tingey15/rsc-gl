import { useEffect, useMemo, useState } from 'react';
import { LineChart, WorkerChart, type ChartOptions } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const signal = (t: number) => Math.sin(t / 18) * 40 + Math.sin(t / 5.3) * 12 + 60 + ((t * 7919) % 13) - 6;

/** The same live signal rendered on the main thread and inside a Web Worker. */
export default function WorkerDemo() {
  const scheme = useDemoScheme();
  const [data, setData] = useState<number[]>([]);
  const [stats, setStats] = useState<{ fps: number; frameMs: number } | null>(null);
  const [backend, setBackend] = useState('');
  const [blocked, setBlocked] = useState(false);

  // Main-thread chart: data arrives through React state.
  useEffect(() => {
    let t = 0;
    const id = setInterval(() => {
      setData((d) => {
        const next = [...d];
        for (let i = 0; i < 4; i++, t++) next.push(signal(t));
        return next.slice(-400);
      });
    }, 40);
    return () => clearInterval(id);
  }, []);

  const block = () => {
    setBlocked(true);
    // Let the button repaint, then hog the main thread for 3 seconds.
    setTimeout(() => {
      const end = performance.now() + 3000;
      while (performance.now() < end) {
        /* busy */
      }
      setBlocked(false);
    }, 50);
  };

  const workerOptions = useMemo<ChartOptions>(
    () => ({
      title: 'Rendered in a Web Worker',
      colorScheme: scheme,
      legend: false,
      animation: false,
      xAxis: [{ scaleType: 'linear', tickNumber: 4 }],
      yAxis: [{ min: 0, max: 130 }],
      series: [{ type: 'line', data: [], color: '#2fa37a', curve: 'linear', lineWidth: 2 } as never],
    }),
    [scheme],
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="btn" data-primary disabled={blocked} onClick={block}>
          {blocked ? 'Main thread blocked…' : 'Block the main thread for 3 s'}
        </button>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          Worker: {backend || 'starting'} {stats ? `· ${stats.fps} fps · ${stats.frameMs.toFixed(2)} ms/frame` : ''}
        </span>
      </div>
      <div className="row">
        <LineChart
          title="Rendered on the main thread"
          height={260}
          colorScheme={scheme}
          hideLegend
          skipAnimation
          xAxis={[{ scaleType: 'linear', data: data.map((_, i) => i), tickNumber: 4 }]}
          yAxis={[{ min: 0, max: 130 }]}
          series={[{ data, color: '#4f6bed', curve: 'linear', lineWidth: 2, sampling: 'none' }]}
        />
        <WorkerChart height={260} options={workerOptions} worker={() => new Worker(new URL('./chart.worker.ts', import.meta.url), { type: 'module' })} onReady={setBackend} onFrameStats={setStats} />
      </div>
    </div>
  );
}
