export type ScenarioKind = 'scatter' | 'line' | 'bar' | 'stream' | 'many';

export interface Scenario {
  id: string;
  kind: ScenarioKind;
  label: string;
  /** Number of data points (per chart). */
  n: number;
  /** Charts rendered at once (dashboard scenario). */
  charts?: number;
  /** Legacy runs at this size can freeze the tab for a long time. */
  heavy?: boolean;
}

export const SCENARIOS: Scenario[] = [
  { id: 'bar-12', kind: 'bar', label: 'Bars · 12 categories', n: 12 },
  { id: 'line-100', kind: 'line', label: 'Line · 100 points', n: 100 },
  { id: 'scatter-200', kind: 'scatter', label: 'Scatter · 200 points', n: 200 },
  {
    id: 'scatter-1k',
    kind: 'scatter',
    label: 'Scatter · 1,000 points',
    n: 1_000,
  },
  {
    id: 'scatter-10k',
    kind: 'scatter',
    label: 'Scatter · 10,000 points',
    n: 10_000,
  },
  {
    id: 'scatter-100k',
    kind: 'scatter',
    label: 'Scatter · 100,000 points',
    n: 100_000,
    heavy: true,
  },
  {
    id: 'scatter-1m',
    kind: 'scatter',
    label: 'Scatter · 1,000,000 points',
    n: 1_000_000,
    heavy: true,
  },
  { id: 'line-10k', kind: 'line', label: 'Line · 10,000 points', n: 10_000 },
  {
    id: 'line-100k',
    kind: 'line',
    label: 'Line · 100,000 points',
    n: 100_000,
    heavy: true,
  },
  {
    id: 'line-1m',
    kind: 'line',
    label: 'Line · 1,000,000 points',
    n: 1_000_000,
    heavy: true,
  },
  { id: 'bar-500', kind: 'bar', label: 'Bars · 500 categories', n: 500 },
  { id: 'bar-5k', kind: 'bar', label: 'Bars · 5,000 categories', n: 5_000 },
  {
    id: 'stream-2k',
    kind: 'stream',
    label: 'Live line · 2,000 points, 30 updates/s',
    n: 2_000,
  },
  {
    id: 'many-24',
    kind: 'many',
    label: 'Dashboard · 24 charts × 2,000 points',
    n: 2_000,
    charts: 24,
  },
  {
    id: 'many-100',
    kind: 'many',
    label: 'Dashboard · 100 charts × 500 points',
    n: 500,
    charts: 100,
  },
];

/** Deterministic pseudo-random generator so both libraries get identical data. */
export function rand(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Dataset {
  /** Row objects (the legacy library's input). */
  rows: Record<string, unknown>[];
  /** Typed columns (the D3 charts read these). */
  xs: Float64Array;
  ys: Float64Array;
  /** Plain arrays and interleaved positions (RSC-GL's inputs). */
  plainXs: number[];
  plainYs: number[];
  positions?: Float32Array;
  categories?: string[];
}

/**
 * Builds every library's input format up front, so no library's timed render
 * includes converting the data into the shape it expects.
 */
export function withInputs(kind: ScenarioKind, xs: Float64Array, ys: Float64Array, categories?: string[]): Dataset {
  const n = xs.length;
  const rows: Record<string, unknown>[] = new Array(n);
  for (let i = 0; i < n; i++) rows[i] = kind === 'bar' ? { category: categories![i], value: ys[i] } : { x: xs[i], y: ys[i] };
  let positions: Float32Array | undefined;
  if (kind === 'scatter') {
    positions = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      positions[i * 2] = xs[i];
      positions[i * 2 + 1] = ys[i];
    }
  }
  return {
    rows,
    xs,
    ys,
    plainXs: Array.from(xs),
    plainYs: Array.from(ys),
    positions,
    categories,
  };
}

/** Marker diameter in px, shared by all three libraries. */
export const markerSize = (n: number) => (n > 100_000 ? 2 : 5);
/** Line stroke width in px, shared by all three libraries. */
export const LINE_WIDTH = 2;
/** Gap between bars as a share of each category's slot, shared by all three libraries. */
export const BAR_GAP = 0.2;
/**
 * Value-axis tick count, shared by all three libraries: the legacy library's
 * own rule (one tick per 100 px of plot height, 2 to 10), which it does not
 * let callers change, so the other two are set to match it.
 */
export const valueTicks = (chartHeight: number) => Math.min(10, Math.max(2, Math.ceil((chartHeight - 40) / 100)));
/** Numeric x-axis tick count, shared by all three libraries (Vega's default). */
export const X_TICKS = 10;

export function makeData(s: Scenario, seed = 7): Dataset {
  const r = rand(seed);
  const n = s.n;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  if (s.kind === 'scatter') {
    for (let i = 0; i < n; i++) {
      const c = i % 3;
      const g = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
      const h = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
      xs[i] = [30, 60, 45][c] + g * 9;
      ys[i] = [40, 65, 25][c] + h * 8;
    }
  } else if (s.kind === 'bar') {
    for (let i = 0; i < n; i++) {
      xs[i] = i;
      ys[i] = Math.round(20 + 60 * r() + 15 * Math.sin(i / 40));
    }
  } else {
    let v = 50;
    for (let i = 0; i < n; i++) {
      v += (r() - 0.5) * 2 + Math.sin(i / 500) * 0.05;
      xs[i] = i;
      ys[i] = v;
    }
  }
  const categories = s.kind === 'bar' ? Array.from({ length: n }, (_, i) => `C${i + 1}`) : undefined;
  return withInputs(s.kind, xs, ys, categories);
}
