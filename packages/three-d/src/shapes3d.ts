import type { MarkItem } from '@rsc-gl/core';
import type { BoxAttrs } from './marks3d';
import type { MeshPart } from './mesh3d';
import { MeshBuilder, frustum } from './geometry3d';
import type { Vec3 } from './math';

export type BarShape = 'box' | 'cylinder' | 'cone' | 'pyramid';

/** Turns a box into a shaped mesh (cylinder, cone, pyramid). */
export function shapedBar(b: BoxAttrs, shape: BarShape): { positions: Float32Array; normals: Float32Array } {
  const m = new MeshBuilder();
  const r = Math.min(b.width, b.depth) / 2;
  const p0: Vec3 = [b.x, b.y0, b.z];
  const p1: Vec3 = [b.x, b.y0 + Math.max(1e-4, b.height), b.z];
  if (shape === 'cylinder') frustum(m, p0, p1, r, r, 24);
  else if (shape === 'cone') frustum(m, p0, p1, r, 0, 24);
  else frustum(m, p0, p1, r * Math.SQRT2, 0, 4, true, Math.PI / 4);
  return m.build();
}

export function boxesToMeshes(items: MarkItem<BoxAttrs>[], shape: BarShape): MeshPart[] {
  return items.map((it) => ({ key: it.key, seriesIndex: it.seriesIndex, dataIndex: it.dataIndex, ...shapedBar(it.value, shape), color: it.value.color, enter: 'floor' as const, delay: it.delay }));
}

/* ---------------------------------------------------------------- surface contours */

/** Marching-squares iso-lines over a height grid (world coordinates). */
export function contourSegments(xs: Float32Array, zs: Float32Array, heights: Float32Array, values: Float64Array, levels: number[], lift = 0.003, floor = false): number[] {
  const nx = xs.length;
  const nz = zs.length;
  const out: number[] = [];
  const lerpT = (a: number, b: number, lv: number) => (b === a ? 0.5 : (lv - a) / (b - a));
  for (const lv of levels)
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const k = j * nx + i;
        const corners = [k, k + 1, k + nx + 1, k + nx];
        const v = corners.map((c) => values[c]);
        const pts: Vec3[] = [];
        const edges: [number, number][] = [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
        ];
        for (const [a, b] of edges) {
          if (v[a] < lv === v[b] < lv) continue;
          const t = lerpT(v[a], v[b], lv);
          const ca = corners[a];
          const cb = corners[b];
          const pa: Vec3 = [xs[ca % nx], heights[ca], zs[Math.floor(ca / nx)]];
          const pb: Vec3 = [xs[cb % nx], heights[cb], zs[Math.floor(cb / nx)]];
          pts.push([pa[0] + (pb[0] - pa[0]) * t, floor ? 0.001 : pa[1] + (pb[1] - pa[1]) * t + lift, pa[2] + (pb[2] - pa[2]) * t]);
        }
        if (pts.length >= 2) out.push(...pts[0], ...pts[1]);
        if (pts.length === 4) out.push(...pts[2], ...pts[3]);
      }
  return out;
}
