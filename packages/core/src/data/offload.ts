import type { GpuDevice } from '@rsc-gl/gpu';
import { minmax } from './sampling';

const MINMAX_WGSL = /* wgsl */ `
struct Params { count: u32, buckets: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<storage, read> ys: array<f32>;
@group(0) @binding(1) var<storage, read_write> outIdx: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let b = id.x;
  if (b >= params.buckets) { return; }
  let per = f32(params.count) / f32(params.buckets);
  let start = u32(f32(b) * per);
  let end = min(params.count, u32(f32(b + 1u) * per));
  var mn = start;
  var mx = start;
  for (var i = start; i < end; i = i + 1u) {
    let v = ys[i];
    if (v < ys[mn]) { mn = i; }
    if (v > ys[mx]) { mx = i; }
  }
  outIdx[b * 2u] = min(mn, mx);
  outIdx[b * 2u + 1u] = max(mn, mx);
}
`;

/**
 * Min-max decimation on the GPU (WebGPU compute shader): one invocation per
 * pixel bucket. Falls back to the CPU on devices without compute (WebGL2).
 * `ys` must be sorted by an evenly spaced x (time series, sample streams).
 */
export async function gpuMinMaxIndices(device: GpuDevice | null, ys: Float32Array, buckets: number): Promise<{ indices: Uint32Array; backend: 'gpu' | 'cpu' }> {
  const count = ys.length;
  if (count <= buckets * 2 || !device?.compute) {
    const xs = new Float32Array(count).map((_, i) => i);
    return { indices: Uint32Array.from(minmax(xs, ys, buckets)), backend: 'cpu' };
  }
  const params = new Uint32Array([count, buckets, 0, 0]);
  const [out] = await device.compute({
    wgsl: MINMAX_WGSL,
    buffers: [{ data: ys }, { byteLength: buckets * 8, readback: true }, { data: params, uniform: true }],
    workgroups: [Math.ceil(buckets / 64)],
  });
  const pairs = new Uint32Array(out, 0, buckets * 2);
  // Deduplicate (min and max may coincide) while keeping order.
  const res: number[] = [];
  for (let i = 0; i < pairs.length; i++) if (res[res.length - 1] !== pairs[i]) res.push(pairs[i]);
  return { indices: Uint32Array.from(res), backend: 'gpu' };
}

/* ---------------------------------------------------------------- worker */

const WORKER_SRC = `
function minmax(ys, buckets) {
  const n = ys.length, out = [];
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor((b * n) / buckets), e = Math.min(n, Math.floor(((b + 1) * n) / buckets));
    if (s >= e) continue;
    let mn = s, mx = s;
    for (let i = s; i < e; i++) { if (ys[i] < ys[mn]) mn = i; if (ys[i] > ys[mx]) mx = i; }
    out.push(Math.min(mn, mx)); if (mx !== mn) out.push(Math.max(mn, mx));
  }
  return out;
}
function lttb(xs, ys, threshold) {
  const n = xs.length;
  if (threshold >= n || threshold < 3) return Array.from({ length: n }, (_, i) => i);
  const out = [0]; const every = (n - 2) / (threshold - 2); let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    const as = Math.floor((i + 1) * every) + 1, ae = Math.min(n, Math.floor((i + 2) * every) + 1);
    let ax = 0, ay = 0; for (let j = as; j < ae; j++) { ax += xs[j]; ay += ys[j]; }
    const len = Math.max(1, ae - as); ax /= len; ay /= len;
    const rs = Math.floor(i * every) + 1, re = Math.floor((i + 1) * every) + 1;
    let best = -1, next = rs;
    for (let j = rs; j < re; j++) { const area = Math.abs((xs[a] - ax) * (ys[j] - ys[a]) - (xs[a] - xs[j]) * (ay - ys[a])); if (area > best) { best = area; next = j; } }
    out.push(next); a = next;
  }
  out.push(n - 1); return out;
}
self.onmessage = (e) => {
  const { id, xs, ys, method, buckets } = e.data;
  const idx = method === 'lttb' ? lttb(xs, ys, buckets * 2) : minmax(ys, buckets);
  const out = Uint32Array.from(idx);
  self.postMessage({ id, out }, [out.buffer]);
};
`;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (v: Uint32Array) => void>();

/**
 * Decimates in a Web Worker so huge datasets never block the main thread.
 * The input arrays are copied (pass copies you don't need, or slices).
 */
export function decimateInWorker(xs: Float32Array | Float64Array, ys: Float32Array | Float64Array, method: 'minmax' | 'lttb', buckets: number): Promise<Uint32Array> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(Uint32Array.from(minmax(xs, ys, buckets)));
  }
  if (!worker) {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = (e: MessageEvent<{ id: number; out: Uint32Array }>) => {
      pending.get(e.data.id)?.(e.data.out);
      pending.delete(e.data.id);
    };
  }
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ id, xs, ys, method, buckets });
  });
}
