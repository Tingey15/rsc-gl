import type { TrendlineMethod } from '../types';

export interface XY {
  x: number;
  y: number;
}

/** Solves a small dense linear system (Gaussian elimination with partial pivoting). */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    const d = m[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / d;
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** Least-squares polynomial coefficients (lowest order first). */
export function polyfit(pts: XY[], degree: number): number[] {
  const n = degree + 1;
  const ata = Array.from({ length: n }, () => new Array(n).fill(0));
  const atb = new Array(n).fill(0);
  for (const { x, y } of pts) {
    const pow = [1];
    for (let k = 1; k < 2 * n; k++) pow.push(pow[k - 1] * x);
    for (let r = 0; r < n; r++) {
      atb[r] += pow[r] * y;
      for (let c = 0; c < n; c++) ata[r][c] += pow[r + c];
    }
  }
  return solve(ata, atb);
}

const polyEval = (c: number[], x: number) => c.reduceRight((acc, k) => acc * x + k, 0);

/**
 * Returns a function evaluating the trend at x, or a list of points for
 * moving averages. x values are normalized internally so large timestamps
 * stay numerically stable.
 */
export function trend(points: XY[], method: TrendlineMethod = 'linear', opts: { partialWindows?: boolean } = {}): { at?: (x: number) => number; points?: XY[] } {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  if (pts.length < 2) return { points: pts };
  const x0 = pts[0].x;
  const span = pts[pts.length - 1].x - x0 || 1;
  const nx = (x: number) => (x - x0) / span;
  const norm = pts.map((p) => ({ x: nx(p.x), y: p.y }));
  if (method === 'average') {
    const avg = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    return { at: () => avg };
  }
  if (method === 'median') {
    const ys = pts.map((p) => p.y).sort((a, b) => a - b);
    const mid = ys.length >> 1;
    const med = ys.length % 2 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2;
    return { at: () => med };
  }
  if (method.startsWith('movingAverage')) {
    const w = Math.max(2, Number(method.split('-')[1]) || 3);
    const out: XY[] = [];
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      sum += pts[i].y;
      if (i >= w) sum -= pts[i - w].y;
      if (i >= w - 1) out.push({ x: pts[i].x, y: sum / w });
      // Partial windows average the points seen so far.
      else if (opts.partialWindows) out.push({ x: pts[i].x, y: sum / (i + 1) });
    }
    return { points: out };
  }
  if (method === 'exponential') {
    const pos = norm.filter((p) => p.y > 0);
    const [a, b] = polyfit(pos.map((p) => ({ x: p.x, y: Math.log(p.y) })), 1);
    return { at: (x) => Math.exp(a + b * nx(x)) };
  }
  if (method === 'logarithmic') {
    // Shift so log(x) is defined at the first point.
    const [a, b] = polyfit(norm.map((p) => ({ x: Math.log(p.x + 1), y: p.y })), 1);
    return { at: (x) => a + b * Math.log(nx(x) + 1) };
  }
  if (method === 'power') {
    const pos = norm.filter((p) => p.y > 0);
    const [a, b] = polyfit(pos.map((p) => ({ x: Math.log(p.x + 1), y: Math.log(p.y) })), 1);
    return { at: (x) => Math.exp(a) * Math.pow(nx(x) + 1, b) };
  }
  const degree = method === 'quadratic' ? 2 : method.startsWith('polynomial') ? Math.max(1, Math.min(8, Number(method.split('-')[1]) || 2)) : 1;
  const c = polyfit(norm, degree);
  return { at: (x) => polyEval(c, nx(x)) };
}
