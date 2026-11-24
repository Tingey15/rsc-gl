import { lazy, memo, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BarChart, LineChart, ScatterChart, type ChartHandle } from '@rsc-gl/react';
import { Callout, H2, Page } from '../components/docs';
import { useSite } from '../components/docs';
import { BAR_GAP, LINE_WIDTH, SCENARIOS, X_TICKS, makeData, markerSize, valueTicks, type Dataset, type Scenario } from '../demos/bench/scenarios';

// The comparison libraries load only on this page.
const LegacyChart = lazy(() => import('../demos/bench/LegacyCharts'));
const D3Chart = lazy(() => import('../demos/bench/D3Charts'));
const LEGACY = 'Legacy library';
const D3 = 'D3';
const OURS = 'RSC-GL';
type Lib = typeof OURS | typeof D3 | typeof LEGACY;
const LIBS: Lib[] = [OURS, D3, LEGACY];
const STORAGE_KEY = 'rsc-gl-bench-results-v2';
/** Bumped whenever the harness changes what or how it measures; stored results from older versions are dropped. */
const HARNESS_VERSION = 4;
/** Rounds per library: multiples of 6 cycle through every ordering of three libraries equally often. */
const ROUND_OPTIONS = [1, 6, 12, 18, 24];

/* ------------------------------------------------------------------ metrics */

type MetricKey = 'firstPaint' | 'blocked' | 'tbt' | 'update' | 'resize' | 'fps' | 'p95Frame' | 'worstFrame' | 'dropped' | 'heap' | 'unmount' | 'domNodes';

interface MetricDef {
  key: MetricKey;
  label: string;
  unit: 'ms' | 'fps' | '%' | 'MB' | '';
  better: 'lower' | 'higher';
  help: string;
}

const METRICS: MetricDef[] = [
  {
    key: 'firstPaint',
    label: 'First paint',
    unit: 'ms',
    better: 'lower',
    help: 'Mount to the second frame after the chart reports its first render.',
  },
  {
    key: 'blocked',
    label: 'Blocked',
    unit: 'ms',
    better: 'lower',
    help: 'Total length of long animation frames (over 50 ms, including style, layout and rendering work) during mount. Browsers without the Long Animation Frames API fall back to long tasks, which miss rendering work.',
  },
  {
    key: 'tbt',
    label: 'Blocking time',
    unit: 'ms',
    better: 'lower',
    help: 'Total blocking time: the part of each long frame beyond 50 ms during which input could not be handled (the standard total-blocking-time measure).',
  },
  {
    key: 'update',
    label: 'Data update',
    unit: 'ms',
    better: 'lower',
    help: 'Swap in a new dataset of the same size until frames are smooth again.',
  },
  {
    key: 'resize',
    label: 'Resize',
    unit: 'ms',
    better: 'lower',
    help: 'Shrink the container to 70% width until frames are smooth again. D3 baseline is not responsive (n/a).',
  },
  {
    key: 'fps',
    label: 'Hover / live fps',
    unit: 'fps',
    better: 'higher',
    help: 'Frame rate during a pointer sweep (tooltips, hit testing) or 30 updates/s in the live scenario. Capped by the display.',
  },
  {
    key: 'p95Frame',
    label: 'p95 frame',
    unit: 'ms',
    better: 'lower',
    help: '95th percentile frame time during the sweep.',
  },
  {
    key: 'worstFrame',
    label: 'Worst frame',
    unit: 'ms',
    better: 'lower',
    help: 'Longest single frame during the sweep.',
  },
  {
    key: 'dropped',
    label: 'Dropped frames',
    unit: '%',
    better: 'lower',
    help: 'Frames that took over 1.5× the display interval.',
  },
  {
    key: 'heap',
    label: 'JS heap growth',
    unit: 'MB',
    better: 'lower',
    help: 'JS heap retained after mount (garbage collected before both readings when possible). Chromium only, with precise memory info enabled. Typed-array and GPU memory are not included, so it is shown for information and not scored.',
  },
  {
    key: 'unmount',
    label: 'Unmount',
    unit: 'ms',
    better: 'lower',
    help: 'Remove the chart until frames are smooth again.',
  },
  {
    key: 'domNodes',
    label: 'DOM nodes',
    unit: '',
    better: 'lower',
    help: 'Elements inside the chart container after mount.',
  },
];
const metricDef = (k: MetricKey) => METRICS.find((m) => m.key === k)!;
const TABLE_METRICS: MetricKey[] = ['firstPaint', 'blocked', 'update', 'resize', 'fps', 'p95Frame', 'worstFrame', 'dropped', 'heap', 'unmount', 'domNodes'];

interface Stats {
  n: number;
  median: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  p95: number;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function stats(values: number[] | undefined): Stats | null {
  const s = (values ?? []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  let sum = 0;
  for (const v of s) sum += v;
  const mean = sum / s.length;
  let sq = 0;
  for (const v of s) sq += (v - mean) ** 2;
  return {
    n: s.length,
    median: quantile(s, 0.5),
    mean,
    sd: Math.sqrt(sq / Math.max(1, s.length - 1)),
    min: s[0],
    max: s[s.length - 1],
    p95: quantile(s, 0.95),
  };
}

interface LibResult {
  scenarioId: string;
  scenario: string;
  points: number;
  charts: number;
  lib: Lib;
  renderer: string;
  backend: string;
  sampling: boolean;
  rounds: number;
  samples: Partial<Record<MetricKey, number[]>>;
  at: string;
  /** Display frame interval during the run (timings are frame-quantized). */
  refreshMs?: number;
  /** Size of one chart in CSS px. */
  chartSize?: string;
  /** The tab was hidden at some point (browsers throttle frames in background tabs). */
  interrupted?: boolean;
  /** Results from one press of a run button share an id; verdicts never mix runs. */
  runId?: string;
  /** Harness version that produced this result. */
  harness?: number;
  /** React StrictMode was active (development double-mounting). */
  strictMode?: boolean;
  /** Rounds where the chart never reported ready within the time limit. */
  timeouts?: number;
}

interface Verdict {
  metric: MetricKey;
  best: Lib;
  runnerUp: Lib;
  /** Ratio of medians (NaN when one is 0 or negative). */
  factor: number;
  /** Absolute difference of medians. */
  diff: number;
  /** Two-sided Mann-Whitney U p-value (NaN with fewer than 2 rounds each). */
  p: number;
  /** 95% bootstrap confidence interval of the ratio of medians (NaN when no ratio). */
  ci: [number, number];
  /** 'clear': significant (p < 0.05) and above the timing resolution; 'noise': not significant; 'tie': within resolution. */
  kind: 'clear' | 'noise' | 'tie';
}

/**
 * One measurement per family counts towards the scoreboard, so correlated
 * numbers from the same test (e.g. fps, p95 and worst frame from one sweep)
 * cannot multiply a single win. DOM nodes are structural, not performance.
 */
const SCORED: MetricKey[] = ['firstPaint', 'tbt', 'update', 'resize', 'p95Frame', 'unmount'];

/** Measurements whose end is detected on a frame boundary: differences under one frame are not real. */
const FRAME_QUANTIZED = new Set<MetricKey>(['firstPaint', 'update', 'resize', 'unmount', 'p95Frame', 'worstFrame']);

function normalCdf(z: number): number {
  // Abramowitz-Stegun 7.1.26 approximation of erf.
  const x = z / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + Math.sign(x) * y);
}

const pCache = new Map<string, number>();

/**
 * Two-sided Mann-Whitney U test p-value. Exact up to 60 rounds in total: the
 * permutation distribution of the rank sum is counted directly (ties get
 * mid-ranks, so tied frame-quantized timings are handled exactly). Larger
 * samples use the tie-corrected normal approximation. Makes no assumption
 * that timings are normally distributed.
 */
function mannWhitney(a: number[], b: number[]): number {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return Number.NaN;
  const key = `${a.join(',')}|${b.join(',')}`;
  const hit = pCache.get(key);
  if (hit !== undefined) return hit;
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  const N = all.length;
  const ranks = new Array<number>(N);
  let ties = 0;
  for (let i = 0; i < N;) {
    let j = i;
    while (j + 1 < N && all[j + 1].v === all[i].v) j++;
    const t = j - i + 1;
    if (t > 1) ties += t * t * t - t;
    for (let k = i; k <= j; k++) ranks[k] = (i + j) / 2 + 1;
    i = j + 1;
  }
  let r1 = 0;
  all.forEach((x, i) => {
    if (x.g === 0) r1 += ranks[i];
  });
  let p: number;
  if (N <= 60) {
    // Doubled mid-ranks are integers. f[k][s] = ways to pick k of the values with doubled sum s.
    const vals = ranks.map((x) => Math.round(x * 2));
    const maxSum = vals.reduce((acc, v) => acc + v, 0);
    const f = Array.from({ length: n1 + 1 }, () => new Float64Array(maxSum + 1));
    f[0][0] = 1;
    let seen = 0;
    for (const v of vals) {
      seen++;
      for (let k = Math.min(n1, seen); k >= 1; k--) {
        const fk = f[k];
        const fp = f[k - 1];
        for (let sum = maxSum; sum >= v; sum--) fk[sum] += fp[sum - v];
      }
    }
    const mean = n1 * (N + 1); // doubled expected rank sum
    const dev = Math.abs(Math.round(r1 * 2) - mean);
    let total = 0;
    let tail = 0;
    const dist = f[n1];
    for (let sum = 0; sum <= maxSum; sum++) {
      if (!dist[sum]) continue;
      total += dist[sum];
      if (Math.abs(sum - mean) >= dev - 1e-9) tail += dist[sum];
    }
    p = Math.min(1, tail / total);
  } else {
    const u1 = r1 - (n1 * (n1 + 1)) / 2;
    const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - ties / (N * (N - 1))));
    p = sigma === 0 ? 1 : Math.min(1, 2 * (1 - normalCdf(Math.max(0, (Math.abs(u1 - (n1 * n2) / 2) - 0.5) / sigma))));
  }
  pCache.set(key, p);
  return p;
}

/** Deterministic pseudo-random numbers, so a result's confidence interval is the same every time it is shown. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ciCache = new Map<string, [number, number]>();

/** 95% percentile-bootstrap interval for (runner-up median / best median), or the inverse when higher is better. */
function bootstrapRatio(best: number[], other: number[], higherBetter: boolean): [number, number] {
  const key = `${best.join(',')}|${other.join(',')}|${higherBetter}`;
  const hit = ciCache.get(key);
  if (hit) return hit;
  const rnd = seeded(best.length * 7919 + other.length);
  const med = (src: number[]) => {
    const pick = Array.from({ length: src.length }, () => src[Math.floor(rnd() * src.length)]).sort((x, y) => x - y);
    return quantile(pick, 0.5);
  };
  const ratios: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const mb = med(best);
    const mo = med(other);
    if (mb > 0 && mo > 0) ratios.push(higherBetter ? mb / mo : mo / mb);
  }
  ratios.sort((x, y) => x - y);
  const ci: [number, number] = ratios.length ? [quantile(ratios, 0.025), quantile(ratios, 0.975)] : [Number.NaN, Number.NaN];
  ciCache.set(key, ci);
  return ci;
}

/** Per metric: the best median, how far ahead it is, and whether the difference is statistically real. */
function verdicts(rows: LibResult[]): Verdict[] {
  const out: Verdict[] = [];
  const frame = Math.max(0, ...rows.map((r) => r.refreshMs ?? 0));
  for (const m of METRICS) {
    const cands = rows
      .map((r) => ({
        lib: r.lib,
        s: stats(r.samples[m.key]),
        v: (r.samples[m.key] ?? []).filter(Number.isFinite),
      }))
      .filter((c): c is { lib: Lib; s: Stats; v: number[] } => !!c.s);
    if (cands.length < 2) continue;
    const dir = m.better === 'lower' ? 1 : -1;
    cands.sort((a, b) => dir * (a.s.median - b.s.median));
    const [a, b] = cands;
    if (a.s.median === b.s.median) {
      out.push({
        metric: m.key,
        best: a.lib,
        runnerUp: b.lib,
        factor: 1,
        diff: 0,
        p: Number.NaN,
        ci: [1, 1],
        kind: 'tie',
      });
      continue;
    }
    // A ratio is meaningless when either median is 0 or negative (e.g. no blocking at all): report the difference instead.
    const ratioOk = a.s.median > 0 && b.s.median > 0;
    const factor = !ratioOk ? Number.NaN : m.better === 'lower' ? b.s.median / a.s.median : a.s.median / b.s.median;
    const p = mannWhitney(a.v, b.v);
    const diff = Math.abs(a.s.median - b.s.median);
    const minDiff = m.unit === 'ms' ? (FRAME_QUANTIZED.has(m.key) ? frame : 1) : m.unit === 'fps' ? 2 : m.unit === '%' ? 1 : m.unit === 'MB' ? 0.5 : 0;
    const tie = diff < minDiff || (ratioOk && factor < 1.03);
    // DOM node counts are deterministic, so any difference is real.
    const significant = m.key === 'domNodes' || (Number.isFinite(p) && p < 0.05);
    const ci: [number, number] = ratioOk ? bootstrapRatio(a.v, b.v, m.better === 'higher') : [Number.NaN, Number.NaN];
    out.push({
      metric: m.key,
      best: a.lib,
      runnerUp: b.lib,
      factor,
      diff,
      p,
      ci,
      kind: tie ? 'tie' : significant ? 'clear' : 'noise',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ timing helpers */

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

/** A chart that has not drawn after this long is treated as failed (heavy legacy runs can take tens of seconds). */
const READY_TIMEOUT = 180_000;

/** Resolves true when `p` settles in time, false on timeout. */
function withTimeout(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(false), ms);
    void p.then(() => {
      clearTimeout(id);
      resolve(true);
    });
  });
}
const frames = async (n: number) => {
  let t = 0;
  for (let i = 0; i < n; i++) t = await nextFrame();
  return t;
};

/** Whether the browser reports long animation frames (which include rendering work that long tasks miss). */
const LOAF = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('long-animation-frame');

/**
 * Main-thread blocking while a measurement runs: total duration and total
 * blocking time. Uses long animation frames where available, so work done in
 * animation-frame callbacks and rendering (where GPU libraries do theirs)
 * counts the same as work in ordinary tasks.
 */
function trackLongTasks() {
  let total = 0;
  let tbt = 0;
  let po: PerformanceObserver | null = null;
  const add = (list: PerformanceEntryList) =>
    list.forEach((e) => {
      total += e.duration;
      const blocking = (e as PerformanceEntry & { blockingDuration?: number }).blockingDuration;
      tbt += blocking ?? Math.max(0, e.duration - 50);
    });
  try {
    po = new PerformanceObserver((l) => add(l.getEntries()));
    po.observe({
      type: LOAF ? 'long-animation-frame' : 'longtask',
      buffered: false,
    });
  } catch {
    /* not supported */
  }
  return () => {
    // Entries not yet delivered to the callback would otherwise be lost.
    if (po) add(po.takeRecords());
    po?.disconnect();
    return { total, tbt };
  };
}

const heapMB = (): number => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? m.usedJSHeapSize / 1048576 : Number.NaN;
};

/**
 * Chromium reports a coarse, rarely updated heap size unless started with
 * --enable-precise-memory-info, which makes per-chart growth meaningless.
 * Allocate a known amount and see whether the reported size moves.
 */
function heapIsPrecise(): boolean {
  const before = heapMB();
  if (!Number.isFinite(before)) return false;
  const probe = new Array<number>(1_000_000).fill(1.5); // about 8 MB of heap
  const grew = heapMB() - before;
  return probe[1] === 1.5 && grew > 2;
}

/** Garbage-collects before a round when the browser exposes it (Chromium with --js-flags=--expose-gc). */
const collectGarbage = () => (globalThis as { gc?: () => void }).gc?.();

/** Median idle frame interval (the display refresh). */
async function measureRefresh(): Promise<number> {
  const d: number[] = [];
  let last = await nextFrame();
  for (let i = 0; i < 30; i++) {
    const t = await nextFrame();
    d.push(t - last);
    last = t;
  }
  return quantile(
    d.sort((a, b) => a - b),
    0.5,
  );
}

/**
 * Waits until the page renders smoothly again (two frames in a row within
 * 1.6× the display interval) and returns the time the work finished.
 */
async function settle(interval: number, maxMs = 15_000): Promise<number> {
  const limit = interval * 1.6;
  const start = performance.now();
  let prev = await nextFrame();
  let calm = 0;
  let doneAt = prev;
  for (;;) {
    const t = await nextFrame();
    if (t - prev < limit) {
      if (calm === 0) doneAt = prev;
      calm++;
    } else calm = 0;
    prev = t;
    if (calm >= 2) return doneAt;
    // Never settled: report the whole wait rather than an early frame.
    if (t - start > maxMs) return t;
  }
}

/**
 * Sends the events a real mouse produces at (x, y): pointer/mouse over and out
 * when the element under the pointer changes, then pointermove and mousemove,
 * all on the element actually under the pointer (so SVG marks get their own
 * events, as with real input).
 */
function moveTo(x: number, y: number, scope: Element, prev: Element | null): Element | null {
  const hit = document.elementFromPoint(x, y);
  const el = hit && scope.contains(hit) ? hit : scope;
  const init = {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
  };
  const p = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  if (el !== prev) {
    if (prev) {
      prev.dispatchEvent(new PointerEvent('pointerout', { ...p, relatedTarget: el }));
      prev.dispatchEvent(new MouseEvent('mouseout', { ...init, relatedTarget: el }));
    }
    el.dispatchEvent(new PointerEvent('pointerover', { ...p, relatedTarget: prev }));
    el.dispatchEvent(new MouseEvent('mouseover', { ...init, relatedTarget: prev }));
  }
  el.dispatchEvent(new PointerEvent('pointermove', p));
  el.dispatchEvent(new MouseEvent('mousemove', init));
  return el;
}

/** Frame times while a synthetic pointer sweeps the plot (or while live data streams in). */
async function sampleFrames(target: Element | null, ms: number, yBand: [number, number] = [0.5, 0.3]): Promise<number[]> {
  const deltas: number[] = [];
  if (target) {
    // Hit testing (elementFromPoint) only sees the visible viewport, and real users hover visible charts.
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    await frames(3);
  }
  const r = target?.getBoundingClientRect();
  const t0 = await nextFrame();
  let last = t0;
  let under: Element | null = null;
  for (;;) {
    const t = await nextFrame();
    deltas.push(t - last);
    last = t;
    if (target && r) {
      const k = ((t - t0) / ms) % 1;
      under = moveTo(r.left + r.width * (0.05 + 0.9 * k), r.top + r.height * (yBand[0] + yBand[1] * Math.sin(k * 12)), target, under);
    }
    if (t - t0 >= ms) break;
  }
  if (target) {
    const init = {
      bubbles: true,
      pointerType: 'mouse',
      relatedTarget: document.body,
    };
    under?.dispatchEvent(new PointerEvent('pointerout', init));
    under?.dispatchEvent(
      new MouseEvent('mouseout', {
        bubbles: true,
        relatedTarget: document.body,
      }),
    );
    target.dispatchEvent(new PointerEvent('pointerleave', { ...init, bubbles: false }));
    target.dispatchEvent(
      new MouseEvent('mouseleave', {
        bubbles: false,
        relatedTarget: document.body,
      }),
    );
  }
  return deltas;
}

/** Every ordering of the libraries, so each one follows each other one equally often. */
function orderings(libs: Lib[]): Lib[][] {
  if (libs.length <= 1) return [libs];
  return libs.flatMap((l, i) => orderings([...libs.slice(0, i), ...libs.slice(i + 1)]).map((rest) => [l, ...rest]));
}

/** Fresh arrays and row objects for a round, so no library reuses caches keyed on the previous round's arrays. Made outside the timed region. */
function freshCopy(d: Dataset): Dataset {
  return {
    rows: d.rows.map((row) => ({ ...row })),
    xs: d.xs.slice(),
    ys: d.ys.slice(),
    plainXs: d.plainXs.slice(),
    plainYs: d.plainYs.slice(),
    positions: d.positions?.slice(),
    categories: d.categories?.slice(),
  };
}

/* ------------------------------------------------------------------ environment */

interface Environment {
  userAgent: string;
  platform: string;
  cores: number | null;
  deviceMemoryGB: number | null;
  devicePixelRatio: number;
  viewport: string;
  refreshMs: number | null;
  webgpu: boolean;
  gpuAdapter: string | null;
  webglRenderer: string | null;
  rscGlBackend: string | null;
  d3Version: string | null;
  vegaVersion: string | null;
  buildMode: string;
  preciseHeap: boolean;
  exposedGc: boolean;
  /** React StrictMode was active (development double-mounting distorts timings). */
  strictMode: boolean;
  /** Which browser API the blocking measurements use. */
  blockingSource: string;
}

async function collectEnvironment(): Promise<Environment> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: {
      requestAdapter(): Promise<{ info?: Record<string, string> } | null>;
    };
  };
  let gpuAdapter: string | null = null;
  try {
    const a = await nav.gpu?.requestAdapter();
    const i = a?.info;
    if (i) gpuAdapter = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' · ') || null;
  } catch {
    /* unavailable */
  }
  let webglRenderer: string | null = null;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    webglRenderer = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* unavailable */
  }
  const [d3m, lm] = await Promise.all([import('../demos/bench/D3Charts').catch(() => null), import('../demos/bench/LegacyCharts').catch(() => null)]);
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    cores: navigator.hardwareConcurrency ?? null,
    deviceMemoryGB: nav.deviceMemory ?? null,
    devicePixelRatio: window.devicePixelRatio,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    refreshMs: null,
    webgpu: !!nav.gpu,
    gpuAdapter,
    webglRenderer,
    rscGlBackend: null,
    d3Version: d3m?.d3Version ?? null,
    vegaVersion: lm?.vegaVersion ?? null,
    buildMode: import.meta.env.DEV ? 'development' : 'production',
    preciseHeap: heapIsPrecise(),
    exposedGc: typeof (globalThis as { gc?: unknown }).gc === 'function',
    strictMode: false,
    blockingSource: LOAF ? 'long-animation-frame' : 'longtask (misses rendering work)',
  };
}

/* ------------------------------------------------------------------ charts */

/** Our chart, reporting its first painted frame and the GPU backend it got. */
const OurChart = memo(function OurChart({
  scenario,
  data,
  onReady,
  sampling,
  height,
}: {
  scenario: Scenario;
  data: Dataset;
  onReady: (backend?: string, inFrame?: boolean) => void;
  sampling: boolean;
  height: number;
}) {
  const ref = useRef<ChartHandle>(null);
  const scheme = useSite().scheme;
  useLayoutEffect(() => {
    let done = false;
    const tryAttach = () => {
      const c = ref.current?.chart;
      if (!c) return requestAnimationFrame(tryAttach);
      const off = c.on('render', () => {
        if (done) return;
        done = true;
        off();
        // Reported from inside the animation frame that draws it (the others report before their frame).
        onReady(c.backend ?? undefined, true);
      });
    };
    tryAttach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const n = data.xs.length;
  if (scenario.kind === 'scatter')
    return (
      <ScatterChart
        ref={ref}
        height={height}
        colorScheme={scheme}
        hideLegend
        skipAnimation
        xAxis={[{ tickNumber: X_TICKS }]}
        yAxis={[{ tickNumber: valueTicks(height) }]}
        series={[
          {
            positions: data.positions!,
            markerSize: markerSize(n),
            opacity: 1,
            label: 'Points',
          } as never,
        ]}
      />
    );
  if (scenario.kind === 'bar')
    return (
      <BarChart
        ref={ref}
        height={height}
        colorScheme={scheme}
        hideLegend
        skipAnimation
        xAxis={[{ data: data.categories!, categoryGapRatio: BAR_GAP }]}
        yAxis={[{ tickNumber: valueTicks(height) }]}
        series={[{ data: data.plainYs, label: 'Value' }]}
      />
    );
  return (
    <LineChart
      ref={ref}
      height={height}
      colorScheme={scheme}
      hideLegend
      skipAnimation
      xAxis={[{ data: data.plainXs, scaleType: 'linear', tickNumber: X_TICKS }]}
      yAxis={[{ tickNumber: valueTicks(height) }]}
      series={[
        {
          data: data.plainYs,
          curve: 'linear',
          lineWidth: LINE_WIDTH,
          label: 'Value',
          sampling: sampling ? undefined : 'none',
        } as never,
      ]}
    />
  );
});

/** Live-update scenario: the measured library gets 30 updates per second. */
function useStream(base: Dataset | null, active: boolean): Dataset | null {
  const [d, setD] = useState(base);
  useEffect(() => setD(base), [base]);
  useEffect(() => {
    if (!active || !base) return;
    let t = base.xs.length;
    let v = base.ys[base.ys.length - 1];
    const id = setInterval(() => {
      setD((cur) => {
        if (!cur) return cur;
        const n = cur.xs.length;
        const xs = new Float64Array(n);
        const ys = new Float64Array(n);
        xs.set(cur.xs.subarray(1));
        ys.set(cur.ys.subarray(1));
        v += Math.random() - 0.5;
        xs[n - 1] = t++;
        ys[n - 1] = v;
        // Every library's input is rebuilt on every tick, so each pays the same.
        const rows = new Array(n);
        for (let i = 0; i < n; i++) rows[i] = { x: xs[i], y: ys[i] };
        return {
          xs,
          ys,
          rows,
          plainXs: Array.from(xs),
          plainYs: Array.from(ys),
        };
      });
    }, 33);
    return () => clearInterval(id);
  }, [active, base]);
  return d;
}

/* ------------------------------------------------------------------ page */

interface Settings {
  runs: number;
  warmup: boolean;
  runD3: boolean;
  runLegacy: boolean;
  d3Renderer: 'svg' | 'canvas';
  legacyRenderer: 'svg' | 'canvas';
  sampling: boolean;
  allowHeavy: boolean;
}

/** Libraries that run for a scenario: heavy SVG / legacy runs need the confirmation box. */
function libsFor(sc: Scenario, s: Settings): Lib[] {
  return LIBS.filter((lib) => {
    if (lib === D3) return s.runD3 && (!sc.heavy || s.d3Renderer === 'canvas' || s.allowHeavy);
    if (lib === LEGACY) return s.runLegacy && (!sc.heavy || s.allowHeavy);
    return true;
  });
}

const rendererLabel = (lib: Lib, s: Settings, backend: string) => (lib === OURS ? backend || 'webgpu / webgl2' : lib === D3 ? s.d3Renderer : s.legacyRenderer);

function loadStored(): LibResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LibResult[]).filter((x) => x.harness === HARNESS_VERSION) : [];
  } catch {
    return [];
  }
}

export function BenchmarkPage() {
  const scheme = useSite().scheme;
  const [scenarioId, setScenarioId] = useState('scatter-10k');
  const selected = SCENARIOS.find((s) => s.id === scenarioId)!;
  const [active, setActive] = useState<Scenario>(selected);
  const [settings, setSettings] = useState<Settings>({
    runs: 6,
    warmup: true,
    runD3: true,
    runLegacy: true,
    d3Renderer: 'svg',
    legacyRenderer: 'canvas',
    sampling: false,
    allowHeavy: false,
  });
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Dataset | null>(null);
  const [override, setOverride] = useState<{
    lib: Lib;
    data: Dataset[];
  } | null>(null);
  /** One fresh copy of the data per chart (dashboards), so no chart shares arrays with another. */
  const [copies, setCopies] = useState<Dataset[] | null>(null);
  const [results, setResults] = useState<LibResult[]>(loadStored);
  const [status, setStatus] = useState('');
  const [mounted, setMounted] = useState<Record<Lib, boolean>>({
    [OURS]: false,
    [D3]: false,
    [LEGACY]: false,
  });
  const [streaming, setStreaming] = useState(false);
  const [streamTarget, setStreamTarget] = useState<Lib>(OURS);
  const [env, setEnv] = useState<Environment | null>(null);
  const [copied, setCopied] = useState(false);
  const boxes = {
    [OURS]: useRef<HTMLDivElement>(null),
    [D3]: useRef<HTMLDivElement>(null),
    [LEGACY]: useRef<HTMLDivElement>(null),
  };
  const ready = useRef<(() => void) | null>(null);
  const readyCount = useRef(0);
  const chartsRef = useRef(1);
  const backendRef = useRef('');
  const stopRef = useRef(false);
  const preciseHeap = useRef(false);
  const hiddenRef = useRef(false);
  const readyInFrame = useRef(false);
  const timeouts = useRef(0);
  const strictCount = useRef(0);
  const streamData = useStream(active.kind === 'stream' ? data : null, streaming);
  const charts = active.charts ?? 1;

  // Warm the comparison bundles so their download is not counted as render time.
  useEffect(() => {
    void import('../demos/bench/LegacyCharts');
    void import('../demos/bench/D3Charts');
    // StrictMode runs mount effects twice in development.
    strictCount.current++;
    void collectEnvironment().then((e) => {
      preciseHeap.current = e.preciseHeap;
      setEnv({ ...e, strictMode: strictCount.current > 1 });
    });
    // Background tabs throttle animation frames, which would corrupt every timing.
    const onVis = () => {
      if (document.hidden) hiddenRef.current = true;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
    } catch {
      /* storage full or blocked: results stay in memory */
    }
  }, [results]);

  const onChartReady = useCallback((backend?: string, inFrame?: boolean) => {
    if (backend) backendRef.current = backend;
    readyInFrame.current = !!inFrame;
    readyCount.current++;
    if (readyCount.current >= chartsRef.current) {
      const r = ready.current;
      ready.current = null;
      r?.();
    }
  }, []);
  const onPlainReady = useCallback(() => onChartReady(), [onChartReady]);
  const setMount = (lib: Lib, on: boolean) => setMounted((m) => ({ ...m, [lib]: on }));
  const none = { [OURS]: false, [D3]: false, [LEGACY]: false } as Record<Lib, boolean>;

  /** One isolated round for one library: mount, interact, update, resize, unmount. */
  const round = async (sc: Scenario, lib: Lib, base: Dataset, alt: Dataset | null, out: Partial<Record<MetricKey, number[]>>, interval: number) => {
    const push = (k: MetricKey, v: number) => (out[k] ??= []).push(v);
    setMounted(none);
    setOverride(null);
    const count = sc.charts ?? 1;
    setCopies(Array.from({ length: count }, () => freshCopy(base)));
    collectGarbage();
    await settle(interval);
    const heap0 = heapMB();
    readyCount.current = 0;
    const stopLong = trackLongTasks();
    const isReady = new Promise<void>((r) => (ready.current = r));
    const t0 = performance.now();
    setMount(lib, true);
    if (!(await withTimeout(isReady, READY_TIMEOUT))) {
      // A chart that never reports ready: record the round as missing instead of hanging the run.
      stopLong();
      ready.current = null;
      timeouts.current++;
      setMount(lib, false);
      await settle(interval);
      return;
    }
    // End on the same frame for everyone: the frame after the one that draws the chart.
    await frames(readyInFrame.current ? 1 : 2);
    push('firstPaint', performance.now() - t0);
    const lt = stopLong();
    push('blocked', lt.total);
    push('tbt', lt.tbt);
    // Retained heap: collect garbage before reading, as before the baseline (only when the browser allows it).
    collectGarbage();
    push('heap', preciseHeap.current ? heapMB() - heap0 : Number.NaN);
    const box = boxes[lib].current;
    push('domNodes', box?.querySelectorAll('*').length ?? 0);
    await settle(interval);

    // Interaction: pointer sweep, or 30 updates/s for the live scenario.
    let deltas: number[];
    if (sc.kind === 'stream') {
      setStreamTarget(lib);
      setStreaming(true);
      deltas = await sampleFrames(null, 3000);
      setStreaming(false);
    } else {
      const plot =
        lib === OURS ? box?.querySelector('.rgl-plot') : lib === D3 ? box?.querySelector('svg.d3-plot') : box?.querySelector('canvas.marks, svg.marks');
      // Bars: sweep low in the plot, where every bar is under the pointer (the legacy library highlights only when the pointer is on a bar).
      deltas = await sampleFrames(plot ?? null, 1200, sc.kind === 'bar' ? [0.8, 0.03] : [0.5, 0.3]);
    }
    const sorted = [...deltas].sort((a, b) => a - b);
    const span = deltas.reduce((a, b) => a + b, 0);
    push('fps', (deltas.length * 1000) / Math.max(1, span));
    push('p95Frame', quantile(sorted, 0.95));
    push('worstFrame', sorted[sorted.length - 1]);
    push('dropped', (100 * deltas.filter((d) => d > interval * 1.5).length) / Math.max(1, deltas.length));
    await settle(interval);

    // Data update: same size, different values.
    if (alt) {
      const next = Array.from({ length: count }, () => freshCopy(alt));
      const t = performance.now();
      setOverride({ lib, data: next });
      push('update', (await settle(interval)) - t);
      setOverride(null);
      await settle(interval);
    }

    // Resize (the D3 baseline has no responsive layout).
    if (lib !== D3 && box) {
      const t = performance.now();
      box.style.width = '70%';
      push('resize', (await settle(interval)) - t);
      box.style.width = '';
      await settle(interval);
    }

    const t = performance.now();
    setMount(lib, false);
    push('unmount', (await settle(interval)) - t);
  };

  /** Runs every selected library on one scenario: warm-up, then interleaved rounds in rotating order. */
  const runScenario = async (sc: Scenario, s: Settings, runId: string): Promise<LibResult[]> => {
    setActive(sc);
    setMounted(none);
    setOverride(null);
    setStatus(`${sc.label}: generating data…`);
    await frames(2);
    const d = makeData(sc);
    const alt = sc.kind === 'stream' ? null : makeData(sc, 8);
    setData(d);
    chartsRef.current = sc.charts ?? 1;
    await frames(2);
    hiddenRef.current = document.hidden;
    const interval = await measureRefresh();
    setEnv((e) => (e ? { ...e, refreshMs: interval } : e));
    const libs = libsFor(sc, s);
    // Every library gets the same number of rounds; heavy scenarios are capped at 6 (one full set of orderings) because the slow libraries take seconds per round.
    const rounds = sc.heavy ? Math.min(6, s.runs) : s.runs;
    timeouts.current = 0;
    const samples = new Map<Lib, Partial<Record<MetricKey, number[]>>>(libs.map((l) => [l, {}]));
    const backends = new Map<Lib, string>();

    if (s.warmup) {
      // Every library warms up (heavy scenarios with a small dataset, so the warm-up itself stays quick).
      const warm = sc.heavy ? makeData({ ...sc, n: 2000 }) : d;
      for (const lib of libs) {
        if (stopRef.current) break;
        setStatus(`${sc.label}: warming up ${lib}…`);
        setCopies(Array.from({ length: sc.charts ?? 1 }, () => freshCopy(warm)));
        readyCount.current = 0;
        const isReady = new Promise<void>((r) => (ready.current = r));
        setMount(lib, true);
        await withTimeout(isReady, READY_TIMEOUT);
        ready.current = null;
        await settle(interval);
        setMount(lib, false);
        await settle(interval);
      }
    }
    // Counterbalanced: cycle through every ordering so each library precedes and follows each other one equally often.
    const orders = orderings(libs);
    for (let k = 0; k < rounds && !stopRef.current; k++) {
      for (const lib of orders[k % orders.length]) {
        if (stopRef.current) continue;
        setStatus(`${sc.label}: ${lib} round ${k + 1} of ${rounds}…`);
        backendRef.current = '';
        await round(sc, lib, d, alt, samples.get(lib)!, interval);
        if (backendRef.current) backends.set(lib, backendRef.current);
      }
    }
    if (backends.get(OURS)) setEnv((e) => (e ? { ...e, rscGlBackend: backends.get(OURS)! } : e));

    // Leave every chart on screen for a visual comparison (not timed; the heaviest stay off).
    const show = { ...none };
    for (const lib of libs) show[lib] = !(sc.heavy && lib !== OURS && (lib === LEGACY || s.d3Renderer === 'svg'));
    setMounted(show);

    const at = new Date().toISOString();
    const plotBox = boxes[OURS].current?.getBoundingClientRect();
    const chartSize = plotBox ? `${Math.round(plotBox.width / ((sc.charts ?? 1) > 1 ? 4 : 1))}x${sc.kind === 'many' ? 110 : 320}` : undefined;
    const interrupted = hiddenRef.current;
    return libs
      .filter((lib) => Object.keys(samples.get(lib)!).length > 0)
      .map((lib) => ({
        scenarioId: sc.id,
        scenario: sc.label,
        points: sc.n,
        charts: sc.charts ?? 1,
        lib,
        renderer: rendererLabel(lib, s, backends.get(lib) ?? ''),
        backend: lib === OURS ? (backends.get(lib) ?? '') : lib === D3 ? `d3 ${s.d3Renderer}` : `vega ${s.legacyRenderer}`,
        sampling: lib === OURS && (sc.kind === 'line' || sc.kind === 'many' || sc.kind === 'stream') ? s.sampling : false,
        rounds: samples.get(lib)!.firstPaint?.length ?? 0,
        samples: samples.get(lib)!,
        at,
        refreshMs: interval,
        chartSize,
        interrupted,
        runId,
        harness: HARNESS_VERSION,
        strictMode: strictCount.current > 1,
        timeouts: timeouts.current,
      }));
  };

  const start = async (list: Scenario[]) => {
    stopRef.current = false;
    setBusy(true);
    const s = settings;
    const runId = `${Date.now().toString(36)}`;
    for (const sc of list) {
      if (stopRef.current) break;
      const out = await runScenario(sc, s, runId);
      // Newest first; a rerun replaces the earlier result for the same scenario, library and renderer.
      setResults((prev) => [...out, ...prev]);
    }
    setBusy(false);
    setStatus(stopRef.current ? 'Stopped.' : '');
  };

  const shownFor = (lib: Lib, i: number): Dataset | null =>
    active.kind === 'stream' && lib === streamTarget && streaming
      ? streamData
      : override?.lib === lib
        ? (override.data[i] ?? override.data[0])
        : (copies?.[i] ?? copies?.[0] ?? data);
  const height = active.kind === 'many' ? 110 : 320;

  const panels = (lib: Lib): ReactNode => {
    if (!shownFor(lib, 0) || !mounted[lib]) return null;
    const list = Array.from({ length: charts }, (_, i) => i);
    return (
      <Suspense fallback={<div style={{ height }}>Loading…</div>}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: charts > 1 ? 'repeat(4, minmax(0, 1fr))' : 'minmax(0, 1fr)',
            gap: 6,
          }}
        >
          {list.map((i) => {
            const shown = shownFor(lib, i)!;
            return lib === OURS ? (
              <OurChart key={`${active.id}-${i}`} scenario={active} data={shown} onReady={onChartReady} sampling={settings.sampling} height={height} />
            ) : lib === D3 ? (
              <D3Chart
                key={`${active.id}-${i}`}
                scenario={active}
                data={shown}
                renderer={settings.d3Renderer}
                height={height}
                colorScheme={scheme}
                onReady={onPlainReady}
              />
            ) : (
              <LegacyChart
                key={`${active.id}-${i}`}
                scenario={active}
                data={shown.rows}
                renderer={settings.legacyRenderer}
                height={height}
                colorScheme={scheme}
                onReady={onPlainReady}
              />
            );
          })}
        </div>
      </Suspense>
    );
  };

  const newestRun = results.find((r) => r.scenarioId === selected.id)?.runId;
  const selectedRows = results.filter((r) => r.scenarioId === selected.id && r.runId === newestRun);
  const latest = (lib: Lib) => selectedRows.find((r) => r.lib === lib);
  const selectedVerdicts = verdicts(LIBS.map(latest).filter((r): r is LibResult => !!r));
  const heavyNote = selected.heavy && !settings.allowHeavy && (settings.runLegacy || (settings.runD3 && settings.d3Renderer === 'svg'));

  const exportPayload = () => ({
    generatedAt: new Date().toISOString(),
    environment: env,
    settings,
    metrics: METRICS,
    results: results.map((r) => ({
      ...r,
      summary: Object.fromEntries(METRICS.map((m) => [m.key, stats(r.samples[m.key])])),
    })),
    verdicts: scenarioGroups(results).map(([id, rows]) => ({
      scenarioId: id,
      scenario: rows[0].scenario,
      verdicts: verdicts(rows),
    })),
  });

  return (
    <Page
      title="Benchmark: GPU vs SVG / Canvas"
      lede="The same data and the same chart, rendered live in your browser by RSC-GL (WebGPU / WebGL2), hand-written D3 (SVG or Canvas 2D) and the legacy Vega-based library (SVG or Canvas 2D). Each library is measured alone, several times, taking turns in every possible order."
    >
      <Callout kind="warning">
        Large legacy and D3 SVG runs (100,000+ points) can freeze this tab for a long time or run out of memory: each mark becomes a scene-graph object (and,
        with SVG, a DOM node). They are skipped unless you tick the confirmation box, and are capped at 6 rounds when they do. All libraries run unminified
        development builds here; production builds are faster for all of them.
      </Callout>

      <div style={{ display: 'grid', gap: 10, margin: '14px 0' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SCENARIOS.map((s) => (
            <button key={s.id} className="btn" data-primary={s.id === scenarioId} disabled={busy} onClick={() => setScenarioId(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: 13,
          }}
        >
          <label>
            <input type="checkbox" checked={settings.runD3} disabled={busy} onChange={(e) => set('runD3', e.target.checked)} /> D3{' '}
            <select value={settings.d3Renderer} disabled={busy} onChange={(e) => set('d3Renderer', e.target.value as 'canvas' | 'svg')}>
              <option value="svg">SVG</option>
              <option value="canvas">Canvas 2D</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={settings.runLegacy} disabled={busy} onChange={(e) => set('runLegacy', e.target.checked)} /> {LEGACY}{' '}
            <select value={settings.legacyRenderer} disabled={busy} onChange={(e) => set('legacyRenderer', e.target.value as 'canvas' | 'svg')}>
              <option value="canvas">Canvas 2D</option>
              <option value="svg">SVG</option>
            </select>
          </label>
          <label title="Rounds per library. Multiples of 6 let three libraries take turns in every possible order equally often; results show the median and the spread.">
            Rounds{' '}
            <select value={settings.runs} disabled={busy} onChange={(e) => set('runs', Number(e.target.value))}>
              {ROUND_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="option-with-tip">
            <label>
              <input type="checkbox" checked={settings.warmup} disabled={busy} onChange={(e) => set('warmup', e.target.checked)} /> Warm-up mount
            </label>
            <InfoTip label="Warm-up mount">
              Before timing anything, each library draws the chart once and removes it, untimed. The first chart on a page pays one-time costs that later charts
              don&apos;t: the browser compiling the library&apos;s code, RSC-GL creating its GPU device and shaders, the legacy library setting up its Vega
              parser. Warming up keeps those out of the results, so you compare everyday rendering speed. Turn it off to include first-load costs.
            </InfoTip>
          </span>
          <span className="option-with-tip">
            <label>
              <input type="checkbox" checked={settings.sampling} disabled={busy} onChange={(e) => set('sampling', e.target.checked)} /> RSC-GL line sampling
            </label>
            <InfoTip label="RSC-GL line sampling">
              RSC-GL&apos;s default for long lines. A chart can only show so much detail across its width, so RSC-GL keeps the highest and lowest point in each
              pixel column (min-max) and skips the rest. The line looks the same and no peaks are lost, but far fewer points are drawn. It is off here by
              default so all three libraries draw every point; turn it on to see RSC-GL&apos;s normal behaviour. Affects the line, live and dashboard scenarios.
            </InfoTip>
          </span>
          <label style={{ color: '#d9475b', fontWeight: 600 }}>
            <input type="checkbox" checked={settings.allowHeavy} disabled={busy} onChange={(e) => set('allowHeavy', e.target.checked)} /> Include heavy SVG /
            legacy runs (may freeze this tab)
          </label>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: 13,
          }}
        >
          <button className="btn" data-primary disabled={busy} onClick={() => void start([selected])}>
            {busy ? 'Running…' : 'Run scenario'}
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void start(SCENARIOS)}
            title="Every scenario in turn. Heavy SVG / legacy runs follow the checkbox above."
          >
            Run full suite
          </button>
          {busy && (
            <button className="btn" onClick={() => (stopRef.current = true)}>
              Stop
            </button>
          )}
          <span style={{ color: 'var(--muted)' }}>
            {status || (heavyNote ? 'Heavy scenario: the slow SVG / legacy runs are skipped unless you include them.' : '')}
          </span>
        </div>
      </div>

      {env?.strictMode && (
        <Callout kind="warning">
          React StrictMode is active (you navigated here from another page in a development build), which mounts every chart twice and distorts timings. Reload
          this page to benchmark without it.
        </Callout>
      )}
      {selectedVerdicts.length > 0 && <VerdictList rows={selectedRows} list={selectedVerdicts} />}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 14,
        }}
      >
        <BenchPanel title={OURS} subtitle={env?.rscGlBackend ?? 'WebGPU / WebGL2'} r={latest(OURS)} accent>
          <div ref={boxes[OURS]}>{panels(OURS)}</div>
        </BenchPanel>
        {settings.runD3 && (
          <BenchPanel title={D3} subtitle={settings.d3Renderer === 'svg' ? 'SVG' : 'Canvas 2D'} r={latest(D3)}>
            <div ref={boxes[D3]}>{panels(D3)}</div>
          </BenchPanel>
        )}
        {settings.runLegacy && (
          <BenchPanel title={LEGACY} subtitle={`Vega · ${settings.legacyRenderer === 'svg' ? 'SVG' : 'Canvas 2D'}`} r={latest(LEGACY)}>
            <div ref={boxes[LEGACY]}>{panels(LEGACY)}</div>
          </BenchPanel>
        )}
      </div>

      {busy && results.length > 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Results are hidden while the benchmark runs, so they add no work to the measurements.</p>
      )}
      {results.length > 0 && !busy && (
        <>
          <H2>Results</H2>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              margin: '0 0 12px',
            }}
          >
            <button className="btn" onClick={() => download(`rsc-gl-benchmark-${stamp()}.csv`, toCsv(results, env), 'text/csv')}>
              Export CSV
            </button>
            <button className="btn" onClick={() => download(`rsc-gl-benchmark-${stamp()}.json`, JSON.stringify(exportPayload(), null, 2), 'application/json')}>
              Export JSON
            </button>
            <button
              className="btn"
              onClick={() => {
                void navigator.clipboard?.writeText(toMarkdown(results, env)).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  },
                  () => undefined,
                );
              }}
            >
              {copied ? 'Copied' : 'Copy as Markdown'}
            </button>
            <button className="btn" disabled={busy} onClick={() => setResults([])}>
              Clear results
            </button>
          </div>
          <MemoScoreboard results={results} />
          <MemoResultsChart results={results} />
          <MemoResultsTable results={results} />
        </>
      )}

      <H2>Same chart in all three</H2>
      <ul>
        <li>Identical data from a seeded generator; each library receives it in its usual input format, prepared before timing starts.</li>
        <li>
          Same size, marks and styling: {markerSize(1)} px points (2 px above 100,000), {LINE_WIDTH} px lines, {BAR_GAP * 100}% bar gaps, horizontal gridlines,
          no legend, no animation.
        </li>
        <li>
          Same hover behaviour: a tooltip, and for scatter and bars every other mark dims (D3 sets each mark&apos;s opacity, the legacy library re-encodes them,
          RSC-GL fades them on the GPU). Synthetic input sends the events a real mouse does (over / out / move, pointer and mouse) to the element under the
          pointer.
        </li>
        <li>
          Same axes: every bar category gets a tick, with labels thinned to fit; value axes ask every library for the same tick count (the legacy library&apos;s
          own rule, about 3 at full size and 2 on the dashboard; 10 on numeric x axes); horizontal gridlines.
        </li>
        <li>
          Counterbalanced and isolated: every round and every dashboard chart gets its own fresh copy of the data (so nothing reuses a cache), libraries take
          turns in every possible order (use a multiple of 6 rounds), and each one is measured with the other libraries and the results section removed from the
          page. All libraries warm up and get the same number of rounds.
        </li>
        <li>
          Remaining differences: RSC-GL reads scatter points from a typed array (its documented fast path for large data). Its line sampling is off by default
          here so every library draws every vertex; turn it on to see the default behaviour. The D3 baseline has no accessibility layer and no responsive
          resizing, and reads its width immediately instead of waiting for a resize observer (about one frame of head start), so it does less work than the
          other two. On line hover RSC-GL also draws a crosshair and the legacy library a rule; RSC-GL fades marks over 180 ms and stops highlighting beyond 30
          px from a point. Timings end when the main thread presents a frame; GPU and rasterization work finishing later is not captured. The page runs as a
          development build; production builds are faster for all three.
        </li>
      </ul>

      <H2>What is measured</H2>
      <ul>
        {METRICS.map((m) => (
          <li key={m.key}>
            <b>{m.label}:</b> {m.help}
          </li>
        ))}
        <li>
          <b>Verdicts:</b> the best median per measurement against the runner-up, with a 95% bootstrap confidence interval for the ratio. A win is
          <i> clear</i> when an exact Mann-Whitney U test on the rounds gives p &lt; 0.05 (it does not assume timings are normally distributed); differences
          under one display frame or 3% are ties. The scoreboard additionally corrects for testing many measurements at once (Holm). Use 6+ rounds: with 3 or
          fewer, no difference can reach significance.
        </li>
        <li>
          <b>Timing resolution:</b> update, resize and unmount times end at the first frame after the page is smooth again, so they are rounded to whole frames
          (about {env?.refreshMs ? `${env.refreshMs.toFixed(1)} ms` : 'one display refresh'} here).
        </li>
      </ul>
      <ul>
        <li>
          <b>For the most reliable numbers:</b> keep this tab visible and in front, close other heavy tabs, plug in laptops, and use 10+ rounds. Starting
          Chromium with <code>--enable-precise-memory-info --js-flags=--expose-gc</code> turns on heap measurement and a garbage collection before every round.
          A production build removes development-mode overhead from all three libraries.
        </li>
      </ul>
      {env && (
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          Machine: {env.cores ?? '?'} cores
          {env.deviceMemoryGB ? `, ${env.deviceMemoryGB}+ GB` : ''}, DPR {env.devicePixelRatio}, GPU {env.gpuAdapter ?? env.webglRenderer ?? 'unknown'}
          {env.refreshMs ? `, ${Math.round(1000 / env.refreshMs)} Hz display` : ''}, {env.buildMode} build, heap measurement{' '}
          {env.preciseHeap ? 'on' : 'off (needs --enable-precise-memory-info)'}, forced GC {env.exposedGc ? 'on' : 'off'}, blocking measured with{' '}
          {env.blockingSource}. Exports include these details.
        </p>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ presentation */

const td = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap' as const,
};

/** A "?" button that explains an option on hover or keyboard focus. */
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="info-tip">
      <button type="button" className="info-tip-btn" aria-label={`About ${label}`} aria-describedby={id}>
        ?
      </button>
      <span role="tooltip" id={id} className="info-tip-pop">
        {children}
      </span>
    </span>
  );
}

function fmtValue(v: number, unit: MetricDef['unit']): string {
  if (!Number.isFinite(v)) return '—';
  if (unit === 'ms') return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v < 10 ? v.toFixed(1) : v.toFixed(0)} ms`;
  if (unit === 'fps') return v.toFixed(0);
  if (unit === '%') return `${v.toFixed(1)}%`;
  if (unit === 'MB') return `${v.toFixed(1)} MB`;
  return Math.round(v).toLocaleString();
}

function cell(r: LibResult, k: MetricKey): ReactNode {
  const s = stats(r.samples[k]);
  if (!s) return '—';
  const u = metricDef(k).unit;
  return (
    <>
      {fmtValue(s.median, u)}
      {s.n > 1 && s.min !== s.max && (
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
          {' '}
          ({fmtValue(s.min, u)}–{fmtValue(s.max, u)})
        </span>
      )}
    </>
  );
}

/** For each scenario, the rows of its newest run only (verdicts never mix runs, settings or sessions). */
function scenarioGroups(results: LibResult[]): [string, LibResult[]][] {
  const map = new Map<string, LibResult[]>();
  const runOf = new Map<string, string | undefined>();
  for (const r of results) {
    if (!runOf.has(r.scenarioId)) runOf.set(r.scenarioId, r.runId);
    if (runOf.get(r.scenarioId) !== r.runId) continue;
    const list = map.get(r.scenarioId) ?? [];
    if (!list.some((x) => x.lib === r.lib)) list.push(r);
    map.set(r.scenarioId, list);
  }
  return [...map.entries()];
}

function verdictText(v: Verdict): string {
  if (v.kind === 'tie') return '(tie: under one frame or 3%)';
  const p = Number.isFinite(v.p) ? `, p = ${v.p < 0.001 ? '<0.001' : v.p.toFixed(3)}` : '';
  return v.kind === 'clear' ? `(clear${p})` : `(within noise${p})`;
}

function VerdictList({ rows, list }: { rows: LibResult[]; list: Verdict[] }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '10px 14px',
        margin: '6px 0 14px',
        fontSize: 14,
      }}
    >
      <b>Verdict · {rows[0].scenario}</b>
      {rows.some((r) => r.interrupted) && (
        <div style={{ color: '#d9475b', fontSize: 13 }}>
          The tab was hidden during this run, so frame timings are unreliable. Run it again with the tab visible.
        </div>
      )}
      {rows.some((r) => r.rounds < 4) && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          3 or fewer rounds for some libraries: no difference can be statistically clear. Use 6 or more.
        </div>
      )}
      {rows.some((r) => r.strictMode) && (
        <div style={{ color: '#d9475b', fontSize: 13 }}>Measured with React StrictMode on: excluded from the scoreboard. Reload this page and run again.</div>
      )}
      {rows.some((r) => (r.timeouts ?? 0) > 0) && (
        <div style={{ color: '#d9475b', fontSize: 13 }}>Some rounds timed out (a chart never finished drawing) and are missing.</div>
      )}
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {list.map((v) => (
          <li key={v.metric}>
            <b>{metricDef(v.metric).label}:</b>{' '}
            {v.kind === 'tie' ? (
              <span style={{ color: 'var(--muted)' }}>
                tie between {v.best} and {v.runnerUp} (difference below one display frame or 3%)
              </span>
            ) : (
              <>
                {v.best} wins,{' '}
                {Number.isFinite(v.factor)
                  ? `${v.factor >= 10 ? v.factor.toFixed(0) : v.factor.toFixed(1)}× better than`
                  : `${fmtValue(v.diff, metricDef(v.metric).unit)} better than`}{' '}
                {v.runnerUp}
                {Number.isFinite(v.ci[0]) && (
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {' '}
                    (95% CI {v.ci[0].toFixed(2)}–{v.ci[1].toFixed(2)}×)
                  </span>
                )}{' '}
                <span
                  style={{
                    color: v.kind === 'clear' ? '#22a884' : 'var(--muted)',
                    fontWeight: 600,
                  }}
                >
                  {verdictText(v)}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Holm-Bonferroni adjusted p-values (same order as the input): controls false wins when many measurements are tested together. */
function holm(ps: number[]): number[] {
  const order = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const out = new Array<number>(ps.length);
  let running = 0;
  order.forEach(({ p, i }, k) => {
    running = Math.max(running, Math.min(1, (ps.length - k) * p));
    out[i] = running;
  });
  return out;
}

function Scoreboard({ results }: { results: LibResult[] }) {
  const all = scenarioGroups(results);
  // Runs that cannot be trusted never count: tab hidden, StrictMode double-mounting, or rounds that timed out.
  const groups = all.filter(([, rows]) => !rows.some((x) => x.interrupted || x.strictMode || (x.timeouts ?? 0) > 0));
  const excluded = all.length - groups.length;
  const scored = groups.flatMap(([, rows]) => verdicts(rows).filter((v) => SCORED.includes(v.metric)));
  const testable = scored.filter((v) => v.kind !== 'tie' && Number.isFinite(v.p));
  const adjusted = holm(testable.map((v) => v.p));
  const confirmed = new Set(testable.filter((_, i) => adjusted[i] < 0.05));
  const score = new Map<Lib, { wins: number; clear: number }>(LIBS.map((l) => [l, { wins: 0, clear: 0 }]));
  const total = scored.length;
  for (const v of scored) {
    if (v.kind === 'tie') continue;
    const sc = score.get(v.best)!;
    sc.wins++;
    if (confirmed.has(v)) sc.clear++;
  }
  const d3Renderers = new Set(groups.flatMap(([, rows]) => rows.filter((x) => x.lib === D3).map((x) => x.renderer)));
  const legacyRenderers = new Set(groups.flatMap(([, rows]) => rows.filter((x) => x.lib === LEGACY).map((x) => x.renderer)));
  const mixed = d3Renderers.size > 1 || legacyRenderers.size > 1;
  if (!total) return null;
  // With 3 or fewer rounds per library the test can never reach p < 0.05, so no win can be confirmed.
  const minRounds = Math.min(...groups.flatMap(([, rows]) => rows.map((r) => r.rounds)));
  return (
    <div style={{ margin: '0 0 14px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        {LIBS.map((lib) => {
          const s = score.get(lib)!;
          return (
            <div
              key={lib}
              style={{
                border: `1px solid ${lib === OURS ? '#22a884' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '8px 12px',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{lib}</div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: s.clear ? '#22a884' : undefined,
                }}
              >
                {s.clear} / {total}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                statistically clear wins across {groups.length} scenario
                {groups.length === 1 ? '' : 's'}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                + {s.wins - s.clear} more within noise (not counted)
                <InfoTip label="statistically clear">
                  A win is statistically clear when the gap is too big and too consistent to be luck: comparing every round of the winner with every round of
                  the runner-up (a Mann-Whitney U test), there is less than a 5% chance the difference came from normal run-to-run variation (p &lt; 0.05),
                  after correcting for testing many measurements at once (Holm). Wins &ldquo;within noise&rdquo; had the better middle result, but the rounds
                  overlap too much to be sure, so they are not counted.
                </InfoTip>
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--muted)',
          marginTop: 10,
          lineHeight: 1.55,
        }}
      >
        <p style={{ margin: '0 0 6px' }}>
          <b>How to read this.</b> The big number counts <b>statistically clear wins</b>: the library had the best median (middle) result, and the win is real
          rather than luck. A Mann-Whitney U test on the rounds gives less than a 5% chance that the gap is just normal run-to-run variation (p &lt; 0.05),
          after a Holm correction for testing many measurements at once (otherwise some &ldquo;wins&rdquo; would appear by chance alone). Wins{' '}
          <i>within noise</i> are listed but not counted: treat the libraries as equal there. Differences smaller than one display frame or 3% are <i>ties</i>{' '}
          and count for nobody.
        </p>
        <p style={{ margin: '0 0 6px' }}>
          <b>Why it can say 0.</b> The test needs enough rounds: with 3 rounds per library even a clean sweep gives p = 0.10, so nothing can be clear. With 5
          rounds a clean sweep gives p = 0.008; use 10+ for firm conclusions. Small charts (around 1,000 marks or fewer) often finish within the same frame in
          every library, so they mostly produce ties.
        </p>
        <p style={{ margin: 0 }}>
          One measurement per family is scored (first paint, blocking time, data update, resize, p95 frame, unmount), so several numbers from the same test
          can&apos;t multiply a single win. Heap and DOM nodes are shown but not scored. Only each scenario&apos;s newest run counts, and runs with the tab
          hidden, React StrictMode on or timed-out rounds are left out.
        </p>
        {excluded > 0 && (
          <p style={{ margin: '6px 0 0', color: '#d9475b', fontWeight: 600 }}>
            {excluded} scenario{excluded === 1 ? '' : 's'} left out of the scoreboard (tab hidden, StrictMode or timeouts). Run {excluded === 1 ? 'it' : 'them'}{' '}
            again.
          </p>
        )}
        {mixed && (
          <p style={{ margin: '6px 0 0', color: '#d9475b', fontWeight: 600 }}>
            These results mix renderers (
            {[...d3Renderers]
              .map((x) => `D3 ${x}`)
              .concat([...legacyRenderers].map((x) => `legacy ${x}`))
              .join(', ')}
            ) across scenarios. For a single comparison, run every scenario with the same settings (Run full suite).
          </p>
        )}
        {minRounds < 4 && (
          <p style={{ margin: '6px 0 0', color: '#d9475b', fontWeight: 600 }}>
            Some of these results have {minRounds} round
            {minRounds === 1 ? '' : 's'} per library, too few for any win to be statistically clear. Run them again with 5 or more rounds.
          </p>
        )}
      </div>
    </div>
  );
}

function ResultsTable({ results }: { results: LibResult[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Scenario', 'Library', 'Renderer', 'Rounds', ...TABLE_METRICS.map((k) => metricDef(k).label)].map((h) => (
              <th
                key={h}
                style={{
                  ...td,
                  textAlign: 'left',
                  fontSize: 11,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i}>
              <td style={td}>{r.scenario}</td>
              <td
                style={{
                  ...td,
                  fontWeight: 700,
                  color: r.lib === OURS ? '#22a884' : undefined,
                }}
              >
                {r.lib}
              </td>
              <td style={td}>
                {r.renderer}
                {r.lib === OURS && !r.sampling && /Line|Dashboard/.test(r.scenario) ? ' · no sampling' : ''}
              </td>
              <td style={td}>{r.rounds}</td>
              {TABLE_METRICS.map((k) => (
                <td key={k} style={td}>
                  {cell(r, k)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>Median of all rounds, with the fastest and slowest round in brackets.</p>
    </div>
  );
}

function BenchPanel({ title, subtitle, r, children, accent }: { title: string; subtitle: string; r?: LibResult; children: ReactNode; accent?: boolean }) {
  const stat = (k: MetricKey) => {
    const s = r && stats(r.samples[k]);
    return (
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 8px',
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{metricDef(k).label}</div>
        <div style={{ fontWeight: 800 }}>{s ? fmtValue(s.median, metricDef(k).unit) : '—'}</div>
      </div>
    );
  };
  return (
    <div
      style={{
        border: `1px solid ${accent ? '#22a884' : 'var(--border)'}`,
        borderRadius: 12,
        padding: 12,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <b style={{ fontSize: 15 }}>{title}</b>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{subtitle}</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 6,
          marginBottom: 10,
        }}
      >
        {stat('firstPaint')}
        {stat('update')}
        {stat('fps')}
        {stat('domNodes')}
      </div>
      <div style={{ minHeight: 120 }}>{children}</div>
    </div>
  );
}

function ResultsChart({ results }: { results: LibResult[] }) {
  const scheme = useSite().scheme;
  const groups = scenarioGroups(results);
  const scenarios = groups.map(([, rows]) => rows[0].scenario);
  const get = (lib: Lib) => groups.map(([, rows]) => stats(rows.find((r) => r.lib === lib)?.samples.firstPaint)?.median ?? null);
  return (
    <BarChart
      height={Math.max(160, 60 + scenarios.length * 46)}
      colorScheme={scheme}
      layout="horizontal"
      barLabel={(item) => (item.value === null ? '' : item.value >= 1000 ? `${(item.value / 1000).toFixed(2)} s` : `${Math.round(item.value)} ms`)}
      yAxis={[{ data: scenarios }]}
      xAxis={[
        {
          scaleType: 'log',
          label: 'First paint, median (ms, log scale)',
          min: 1,
        },
      ]}
      series={[
        { label: OURS, data: get(OURS), color: '#22a884' },
        { label: D3, data: get(D3), color: '#e0a03c' },
        { label: LEGACY, data: get(LEGACY), color: '#8a8f98' },
      ]}
    />
  );
}

const MemoScoreboard = memo(Scoreboard);
const MemoResultsChart = memo(ResultsChart);
const MemoResultsTable = memo(ResultsTable);

/* ------------------------------------------------------------------ export */

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 'best (clear)' / 'best (noise)' for the winning library, 'tie' for all, empty otherwise. */
const verdictLabel = (v: Verdict | undefined, lib: Lib) => (!v ? '' : v.kind === 'tie' ? 'tie' : v.best === lib ? `best (${v.kind})` : '');

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Long format: one row per scenario, library and measurement, with summary statistics and the raw samples. */
function toCsv(results: LibResult[], env: Environment | null): string {
  const head = [
    'scenario_id',
    'scenario',
    'points',
    'charts',
    'chart_size',
    'library',
    'renderer',
    'backend',
    'line_sampling',
    'rounds',
    'metric',
    'unit',
    'better',
    'n',
    'median',
    'mean',
    'sd',
    'min',
    'max',
    'p95',
    'samples',
    'verdict',
    'p_value',
    'ratio_ci_low',
    'ratio_ci_high',
    'refresh_ms',
    'tab_hidden',
    'strict_mode',
    'timeouts',
    'harness',
    'measured_at',
    'gpu',
    'user_agent',
    'build',
  ];
  const verdictOf = new Map<string, Verdict>();
  for (const [id, rows] of scenarioGroups(results)) for (const v of verdicts(rows)) verdictOf.set(`${id}|${v.metric}`, v);
  const lines = [head.join(',')];
  for (const r of results)
    for (const m of METRICS) {
      const s = stats(r.samples[m.key]);
      if (!s) continue;
      lines.push(
        [
          r.scenarioId,
          r.scenario,
          r.points,
          r.charts,
          r.chartSize ?? '',
          r.lib,
          r.renderer,
          r.backend,
          r.sampling,
          r.rounds,
          m.key,
          m.unit,
          m.better,
          s.n,
          s.median,
          s.mean,
          s.sd,
          s.min,
          s.max,
          s.p95,
          (r.samples[m.key] ?? []).map((v) => Math.round(v * 1000) / 1000).join(' '),
          verdictLabel(verdictOf.get(`${r.scenarioId}|${m.key}`), r.lib),
          verdictOf.get(`${r.scenarioId}|${m.key}`)?.p ?? '',
          verdictOf.get(`${r.scenarioId}|${m.key}`)?.ci[0] ?? '',
          verdictOf.get(`${r.scenarioId}|${m.key}`)?.ci[1] ?? '',
          r.refreshMs ?? '',
          !!r.interrupted,
          !!r.strictMode,
          r.timeouts ?? 0,
          r.harness ?? '',
          r.at,
          env?.gpuAdapter ?? env?.webglRenderer ?? '',
          env?.userAgent ?? '',
          env?.buildMode ?? '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
  return lines.join('\n');
}

function toMarkdown(results: LibResult[], env: Environment | null): string {
  const out: string[] = ['## RSC-GL benchmark', ''];
  if (env)
    out.push(
      `${env.cores ?? '?'} cores · GPU ${env.gpuAdapter ?? env.webglRenderer ?? 'unknown'} · ${env.refreshMs ? `${Math.round(1000 / env.refreshMs)} Hz` : ''} · ${env.buildMode} build`,
      '',
    );
  const cols: MetricKey[] = ['firstPaint', 'blocked', 'update', 'resize', 'fps', 'p95Frame', 'dropped', 'domNodes'];
  out.push(`| Scenario | Library | Renderer | Rounds | ${cols.map((k) => metricDef(k).label).join(' | ')} |`);
  out.push(`|${' --- |'.repeat(4 + cols.length)}`);
  for (const [, rows] of scenarioGroups(results))
    for (const r of rows)
      out.push(
        `| ${r.scenario} | ${r.lib} | ${r.renderer} | ${r.rounds} | ${cols
          .map((k) => {
            const s = stats(r.samples[k]);
            return s ? fmtValue(s.median, metricDef(k).unit) : '—';
          })
          .join(' | ')} |`,
      );
  out.push('', 'Medians of all rounds. Verdicts:', '');
  for (const [, rows] of scenarioGroups(results)) {
    const v = verdicts(rows);
    if (!v.length) continue;
    const wins = v.filter((x) => x.kind !== 'tie');
    out.push(
      `**${rows[0].scenario}:** ${wins.map((x) => `${metricDef(x.metric).label} → ${x.best} ${x.factor.toFixed(1)}× ${verdictText(x)}`).join('; ') || 'all ties'}`,
    );
  }
  return out.join('\n');
}
