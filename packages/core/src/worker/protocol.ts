import type { ChartOptions } from '../types';

/** Messages from the page to a chart worker. */
export type ToWorker =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number; dpr: number; options: ChartOptions; prefer?: 'webgpu' | 'webgl2' }
  | { type: 'options'; options: ChartOptions; animate?: boolean }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'pointer'; x: number; y: number }
  | { type: 'leave' }
  | { type: 'append'; seriesIndex: number; values: unknown[]; maxPoints?: number }
  | { type: 'dispose' };

export interface WorkerTooltip {
  x: number;
  y: number;
  header?: string;
  label: string;
  value: string;
  color: string;
}

/** Messages from a chart worker to the page. */
export type FromWorker =
  | { type: 'ready'; backend: string }
  | { type: 'error'; message: string }
  | { type: 'tooltip'; tip: WorkerTooltip | null }
  | { type: 'frame'; fps: number; frameMs: number };

/** Drops functions (not transferable) and keeps typed arrays / dates as is. */
export function cloneable<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'function') return undefined;
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Date || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;
    if (seen.has(v)) return seen.get(v);
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      seen.set(v, out);
      for (const x of v) out.push(walk(x));
      return out;
    }
    const out: Record<string, unknown> = {};
    seen.set(v, out);
    for (const [k, x] of Object.entries(v)) {
      const w = walk(x);
      if (w !== undefined) out[k] = w;
    }
    return out;
  };
  return walk(value) as T;
}
