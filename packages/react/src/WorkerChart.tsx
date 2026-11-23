import { useEffect, useRef, type CSSProperties } from 'react';
import { WorkerChart as EngineWorkerChart, type ChartOptions } from '@rsc-gl/core';
import type { ChartSize } from './GLChart';

export interface WorkerChartProps {
  /** Creates the worker (called once per mount), e.g. `() => new Worker(new URL('./chart.worker.ts', import.meta.url), { type: 'module' })`. */
  worker: () => Worker;
  /** Structured-cloneable options (functions are dropped). */
  options: ChartOptions;
  width?: ChartSize;
  height?: ChartSize;
  prefer?: 'webgpu' | 'webgl2';
  className?: string;
  style?: CSSProperties;
  onReady?: (backend: string) => void;
  onFrameStats?: (stats: { fps: number; frameMs: number }) => void;
  /** Receives the host to stream data (`appendData`) from the page. */
  onChart?: (chart: EngineWorkerChart) => void;
}

const toCss = (v: ChartSize | undefined, fallback: string) => (v === undefined || v === 'auto' ? fallback : typeof v === 'number' ? `${v}px` : v);

/** A chart rendered entirely inside a Web Worker (OffscreenCanvas + GPU). */
export function WorkerChart(props: WorkerChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<EngineWorkerChart | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (!host.current) return;
    const worker = latest.current.worker();
    const c = new EngineWorkerChart(host.current, worker, latest.current.options, {
      prefer: latest.current.prefer,
      onReady: (b) => latest.current.onReady?.(b),
      onFrameStats: (s) => latest.current.onFrameStats?.(s),
    });
    chart.current = c;
    latest.current.onChart?.(c);
    return () => {
      c.destroy();
      worker.terminate();
      chart.current = null;
    };
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    chart.current?.setOptions(props.options);
  }, [props.options]);

  return <div ref={host} className={props.className} style={{ position: 'relative', width: toCss(props.width, '100%'), height: toCss(props.height, '300px'), ...props.style }} />;
}
