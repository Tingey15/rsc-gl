/**
 * Downsampling for x-sorted series. All functions return the indices of the
 * points to keep (always including the first and last point), so callers can
 * keep their original records and keys.
 */
export type SamplingMethod = 'none' | 'auto' | 'lttb' | 'minmax' | 'm4';

/** Largest-Triangle-Three-Buckets: preserves visual shape with `threshold` points. */
export function lttb(xs: ArrayLike<number>, ys: ArrayLike<number>, threshold: number): number[] {
  const n = xs.length;
  if (threshold >= n || threshold < 3) return Array.from({ length: n }, (_, i) => i);
  const out = [0];
  const every = (n - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    const avgStart = Math.floor((i + 1) * every) + 1;
    const avgEnd = Math.min(n, Math.floor((i + 2) * every) + 1);
    let ax = 0;
    let ay = 0;
    for (let j = avgStart; j < avgEnd; j++) {
      ax += xs[j];
      ay += ys[j];
    }
    const len = Math.max(1, avgEnd - avgStart);
    ax /= len;
    ay /= len;
    const rs = Math.floor(i * every) + 1;
    const re = Math.floor((i + 1) * every) + 1;
    let best = -1;
    let next = rs;
    for (let j = rs; j < re; j++) {
      const area = Math.abs((xs[a] - ax) * (ys[j] - ys[a]) - (xs[a] - xs[j]) * (ay - ys[a]));
      if (area > best) {
        best = area;
        next = j;
      }
    }
    out.push(next);
    a = next;
  }
  out.push(n - 1);
  return out;
}

/** Keeps the min and max of each pixel bucket: exact peaks, at most 2 points per bucket. */
export function minmax(xs: ArrayLike<number>, ys: ArrayLike<number>, buckets: number): number[] {
  return bucketed(xs, ys, buckets, false);
}

/** M4: first, min, max and last of each bucket (pixel-exact line rendering). */
export function m4(xs: ArrayLike<number>, ys: ArrayLike<number>, buckets: number): number[] {
  return bucketed(xs, ys, buckets, true);
}

function bucketed(xs: ArrayLike<number>, ys: ArrayLike<number>, buckets: number, withEnds: boolean): number[] {
  const n = xs.length;
  if (n <= buckets * (withEnds ? 4 : 2)) return Array.from({ length: n }, (_, i) => i);
  const x0 = xs[0];
  const span = xs[n - 1] - x0 || 1;
  const out: number[] = [];
  let b = -1;
  let first = 0;
  let last = 0;
  let mn = 0;
  let mx = 0;
  const flush = () => {
    if (b < 0) return;
    const set = withEnds ? [first, mn, mx, last] : [mn, mx];
    for (const i of [...new Set(set)].sort((p, q) => p - q)) out.push(i);
  };
  for (let i = 0; i < n; i++) {
    const bi = Math.min(buckets - 1, Math.floor(((xs[i] - x0) / span) * buckets));
    if (bi !== b) {
      flush();
      b = bi;
      first = last = mn = mx = i;
      continue;
    }
    last = i;
    if (ys[i] < ys[mn]) mn = i;
    if (ys[i] > ys[mx]) mx = i;
  }
  flush();
  if (out[0] !== 0) out.unshift(0);
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

/** Applies a method; 'auto' picks min-max once there are more points than 2 per pixel. */
export function sampleIndices(xs: ArrayLike<number>, ys: ArrayLike<number>, method: SamplingMethod, pixels: number): number[] | null {
  const n = xs.length;
  const m = method === 'auto' ? (n > pixels * 2 ? 'minmax' : 'none') : method;
  if (m === 'none' || n < 4) return null;
  const buckets = Math.max(2, Math.round(pixels));
  if (m === 'lttb') return lttb(xs, ys, buckets * 2);
  if (m === 'm4') return m4(xs, ys, buckets);
  return minmax(xs, ys, buckets);
}
