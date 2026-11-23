import {
  curveBasis,
  curveBumpX,
  curveBumpY,
  curveCardinal,
  curveCatmullRom,
  curveLinear,
  curveMonotoneX,
  curveMonotoneY,
  curveNatural,
  curveStep,
  curveStepAfter,
  curveStepBefore,
  line as d3line,
  type CurveFactory,
} from 'd3-shape';
import type { CurveType } from '../types';

const CURVES: Record<CurveType, CurveFactory> = {
  linear: curveLinear,
  monotoneX: curveMonotoneX,
  monotoneY: curveMonotoneY,
  natural: curveNatural,
  step: curveStep,
  stepBefore: curveStepBefore,
  stepAfter: curveStepAfter,
  catmullRom: curveCatmullRom,
  cardinal: curveCardinal,
  basis: curveBasis,
  bumpX: curveBumpX,
  bumpY: curveBumpY,
};

/** Accepts both our names and the alternative spellings used by other APIs. */
const ALIASES: Record<string, CurveType> = {
  monotone: 'monotoneX',
  'catmull-rom': 'catmullRom',
  'step-after': 'stepAfter',
  'step-before': 'stepBefore',
};

export function resolveCurve(name: string | undefined): CurveType {
  if (!name) return 'linear';
  return (ALIASES[name] ?? name) as CurveType;
}

export interface Sample {
  x: number;
  y: number;
  /** Source point index of the segment start. */
  src: number;
  /** Sample index within that segment (0 = the source point itself). */
  sub: number;
}

/**
 * Flattens a d3 curve into a polyline. Bezier segments are subdivided based
 * on their length so curves stay smooth at any zoom level.
 */
export function sampleCurve(points: ReadonlyArray<{ x: number; y: number }>, curveName: CurveType): Sample[] {
  if (curveName === 'linear' || points.length < 3) {
    return points.map((p, i) => ({ x: p.x, y: p.y, src: i, sub: 0 }));
  }
  const out: Sample[] = [];
  const xs = points.map((p) => p.x);
  let cx = 0;
  let cy = 0;
  // Map a position to the source segment by x (data is x-sorted for line charts).
  let segCursor = 0;
  const segmentOf = (x: number) => {
    while (segCursor < xs.length - 1 && x >= xs[segCursor + 1] - 1e-6) segCursor++;
    return segCursor;
  };
  const counters = new Map<number, number>();
  const push = (x: number, y: number) => {
    const src = segmentOf(x);
    const sub = counters.get(src) ?? 0;
    counters.set(src, sub + 1);
    out.push({ x, y, src, sub });
  };
  const ctx = {
    moveTo(x: number, y: number) {
      push(x, y);
      cx = x;
      cy = y;
    },
    lineTo(x: number, y: number) {
      push(x, y);
      cx = x;
      cy = y;
    },
    bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
      const len = Math.hypot(x1 - cx, y1 - cy) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x - x2, y - y2);
      const steps = Math.max(2, Math.min(32, Math.ceil(len / 6)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        const px = mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x;
        const py = mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y;
        push(px, py);
      }
      cx = x;
      cy = y;
    },
    quadraticCurveTo(x1: number, y1: number, x: number, y: number) {
      this.bezierCurveTo(cx + (2 / 3) * (x1 - cx), cy + (2 / 3) * (y1 - cy), x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y), x, y);
    },
    closePath() {},
    arc() {},
    arcTo() {},
    rect() {},
  };
  d3line<{ x: number; y: number }>()
    .x((d) => d.x)
    .y((d) => d.y)
    .curve(CURVES[curveName] ?? curveLinear)
    .context(ctx as unknown as CanvasRenderingContext2D)(points as { x: number; y: number }[]);
  return out;
}

/** Linear interpolation of y at x along an x-sorted polyline. */
export function yAt(samples: ReadonlyArray<{ x: number; y: number }>, x: number): number {
  if (samples.length === 0) return 0;
  if (x <= samples[0].x) return samples[0].y;
  const last = samples[samples.length - 1];
  if (x >= last.x) return last.y;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].x <= x) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  return b.x === a.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}
