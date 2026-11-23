import { useMemo, useState } from 'react';
import { RenderEngine, decimateInWorker, gpuMinMaxIndices, minmax } from '@rsc-gl/core';
import { LineChart } from '@rsc-gl/react';
import { useDemoScheme } from '../util';

const N = 4_000_000;
const BUCKETS = 800;

export default function DecimationDemo() {
  const scheme = useDemoScheme();
  const ys = useMemo(() => {
    const out = new Float32Array(N);
    let v = 0;
    for (let i = 0; i < N; i++) {
      // Random walk with a drift and rare spikes (which min-max must keep).
      const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      v += Math.sin(i / 9000) * 0.02 + noise * 0.3;
      out[i] = v + (i % 250000 === 0 ? 40 : 0);
    }
    return out;
  }, []);
  const [result, setResult] = useState<{ method: string; ms: number; points: number; idx: Uint32Array } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (method: 'cpu' | 'worker' | 'gpu') => {
    setBusy(true);
    const t0 = performance.now();
    let idx: Uint32Array;
    let label = method.toUpperCase();
    if (method === 'cpu') {
      const xs = new Float32Array(N).map((_, i) => i);
      idx = Uint32Array.from(minmax(xs, ys, BUCKETS));
    } else if (method === 'worker') {
      idx = await decimateInWorker(new Float32Array(N).map((_, i) => i), ys.slice(), 'minmax', BUCKETS);
    } else {
      // Reuse the page's shared GPU device (compute is available on WebGPU).
      const engine = RenderEngine.all().find((e) => e.backend === 'webgpu') ?? RenderEngine.all().find((e) => e.backend);
      const device = engine ? await engine.getDevice() : null;
      const r = await gpuMinMaxIndices(device, ys, BUCKETS);
      idx = r.indices;
      if (r.backend === 'cpu') label = 'GPU (unavailable on WebGL2 → CPU fallback)';
    }
    setResult({ method: label, ms: performance.now() - t0, points: idx.length, idx });
    setBusy(false);
  };

  const series = result ? Array.from(result.idx, (i) => ys[i]) : [];
  const xs = result ? Array.from(result.idx) : [];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" disabled={busy} onClick={() => run('cpu')}>
          CPU (main thread)
        </button>
        <button className="btn" disabled={busy} onClick={() => run('worker')}>
          Web Worker
        </button>
        <button className="btn" data-primary disabled={busy} onClick={() => run('gpu')}>
          WebGPU compute
        </button>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {result ? `${result.method}: ${N.toLocaleString()} → ${result.points.toLocaleString()} points in ${result.ms.toFixed(1)} ms` : `${N.toLocaleString()} samples, min-max into ${BUCKETS} buckets`}
        </span>
      </div>
      {result && <LineChart height={260} colorScheme={scheme} hideLegend skipAnimation xAxis={[{ data: xs, scaleType: 'linear', domainLimit: 'strict' }]} series={[{ data: series, curve: 'linear', sampling: 'none', lineWidth: 1 }]} />}
    </div>
  );
}
