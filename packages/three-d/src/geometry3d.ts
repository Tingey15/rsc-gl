import earcut from 'earcut';
import type { Vec3 } from './math';

/** Growable triangle soup with flat or smooth normals. */
export class MeshBuilder {
  private p: number[] = [];
  private n: number[] = [];

  tri(a: Vec3, b: Vec3, c: Vec3, normal?: Vec3): this {
    const nn = normal ?? faceNormal(a, b, c);
    this.p.push(...a, ...b, ...c);
    this.n.push(...nn, ...nn, ...nn);
    return this;
  }

  /** Triangle with per-vertex normals (smooth shading). */
  triN(a: Vec3, b: Vec3, c: Vec3, na: Vec3, nb: Vec3, nc: Vec3): this {
    this.p.push(...a, ...b, ...c);
    this.n.push(...na, ...nb, ...nc);
    return this;
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal?: Vec3): this {
    const nn = normal ?? faceNormal(a, b, c);
    return this.tri(a, b, c, nn).tri(a, c, d, nn);
  }

  get vertexCount(): number {
    return this.p.length / 3;
  }

  build(): { positions: Float32Array; normals: Float32Array } {
    return { positions: new Float32Array(this.p), normals: new Float32Array(this.n) };
  }
}

export function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  return normalize([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Two unit vectors perpendicular to `axis`. */
function basis(axis: Vec3): [Vec3, Vec3] {
  const a = normalize(axis);
  const ref: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(a, ref));
  const v = cross(a, u);
  return [u, v];
}

/**
 * A frustum from p0 (radius r0) to p1 (radius r1) with `segments` sides:
 * cylinders, cones (r1 = 0), pyramids (segments = 4), arrow shafts and tubes.
 */
export function frustum(m: MeshBuilder, p0: Vec3, p1: Vec3, r0: number, r1: number, segments = 24, caps = true, rotation = 0): void {
  const axis: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const len = Math.hypot(...axis) || 1e-6;
  const [u, v] = basis(axis);
  const dir = scale(axis, 1 / len);
  const smooth = segments > 6;
  const ring = (c: Vec3, r: number) =>
    Array.from({ length: segments + 1 }, (_, i) => {
      const a = rotation + (i / segments) * Math.PI * 2;
      return add(c, add(scale(u, Math.cos(a) * r), scale(v, Math.sin(a) * r)));
    });
  const A = ring(p0, r0);
  const B = ring(p1, r1);
  // Slope of the side so normals tilt correctly on cones.
  const slope = (r0 - r1) / len;
  for (let i = 0; i < segments; i++) {
    const a0 = rotation + (i / segments) * Math.PI * 2;
    const a1 = rotation + ((i + 1) / segments) * Math.PI * 2;
    const nAt = (a: number) => normalize(add(add(scale(u, Math.cos(a)), scale(v, Math.sin(a))), scale(dir, slope)));
    if (smooth) {
      const n0 = nAt(a0);
      const n1 = nAt(a1);
      m.triN(A[i], A[i + 1], B[i + 1], n0, n1, n1).triN(A[i], B[i + 1], B[i], n0, n1, n0);
    } else {
      const nm = nAt((a0 + a1) / 2);
      m.quad(A[i], A[i + 1], B[i + 1], B[i], nm);
    }
  }
  if (caps) {
    const nd = scale(dir, -1);
    for (let i = 0; i < segments; i++) {
      if (r0 > 0) m.tri(p0, A[i + 1], A[i], nd);
      if (r1 > 0) m.tri(p1, B[i], B[i + 1], dir);
    }
  }
}

/** Annular sector prism (pie / donut slices) in the xz plane, from y0 up by h. */
export function sectorPrism(m: MeshBuilder, cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, y0: number, h: number, steps = 0): void {
  const n = steps || Math.max(2, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 72));
  const pt = (r: number, a: number, y: number): Vec3 => [cx + Math.sin(a) * r, y, cz - Math.cos(a) * r];
  const y1 = y0 + h;
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    // Top and bottom.
    m.quad(pt(r0, t0, y1), pt(r1, t0, y1), pt(r1, t1, y1), pt(r0, t1, y1), [0, 1, 0]);
    m.quad(pt(r0, t1, y0), pt(r1, t1, y0), pt(r1, t0, y0), pt(r0, t0, y0), [0, -1, 0]);
    // Outer wall (smooth).
    const no0: Vec3 = [Math.sin(t0), 0, -Math.cos(t0)];
    const no1: Vec3 = [Math.sin(t1), 0, -Math.cos(t1)];
    m.triN(pt(r1, t0, y0), pt(r1, t1, y0), pt(r1, t1, y1), no0, no1, no1).triN(pt(r1, t0, y0), pt(r1, t1, y1), pt(r1, t0, y1), no0, no1, no0);
    if (r0 > 0) {
      const ni0 = scale(no0, -1);
      const ni1 = scale(no1, -1);
      m.triN(pt(r0, t1, y0), pt(r0, t0, y0), pt(r0, t0, y1), ni1, ni0, ni0).triN(pt(r0, t1, y0), pt(r0, t0, y1), pt(r0, t1, y1), ni1, ni0, ni1);
    }
  }
  // Radial end walls.
  m.quad(pt(r0, a0, y0), pt(r1, a0, y0), pt(r1, a0, y1), pt(r0, a0, y1));
  m.quad(pt(r1, a1, y0), pt(r0, a1, y0), pt(r0, a1, y1), pt(r1, a1, y1));
}

/** A horizontal band following a polyline at depth z (3D line / ribbon charts). */
export function ribbon(m: MeshBuilder, pts: Vec3[], width: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    m.quad([a[0], a[1], a[2] - width / 2], [b[0], b[1], b[2] - width / 2], [b[0], b[1], b[2] + width / 2], [a[0], a[1], a[2] + width / 2]);
  }
}

/** A vertical wall from the floor up to a polyline (3D area / ridgeline charts). */
export function wall(m: MeshBuilder, pts: Vec3[], floor = 0): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    m.quad([a[0], floor, a[2]], [b[0], floor, b[2]], b, a, [0, 0, 1]);
  }
}

/** UV sphere (smooth). */
export function sphere(m: MeshBuilder, c: Vec3, r: number, lat = 24, lon = 48): void {
  const at = (i: number, j: number): [Vec3, Vec3] => {
    const th = (i / lat) * Math.PI;
    const ph = (j / lon) * Math.PI * 2;
    const n: Vec3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    return [add(c, scale(n, r)), n];
  };
  for (let i = 0; i < lat; i++)
    for (let j = 0; j < lon; j++) {
      const [a, na] = at(i, j);
      const [b, nb] = at(i + 1, j);
      const [cc, nc] = at(i + 1, j + 1);
      const [d, nd] = at(i, j + 1);
      m.triN(a, b, cc, na, nb, nc).triN(a, cc, d, na, nc, nd);
    }
}

/** Extrudes polygons (rings in xz, first ring outer, others holes) from y0 to y1. */
export function prism(m: MeshBuilder, rings: [number, number][][], y0: number, y1: number): void {
  const flat: number[] = [];
  const holes: number[] = [];
  for (const [ri, ring] of rings.entries()) {
    if (ri > 0) holes.push(flat.length / 2);
    for (const p of ring) flat.push(p[0], p[1]);
  }
  const idx = earcut(flat, holes, 2);
  const v = (k: number, y: number): Vec3 => [flat[k * 2], y, flat[k * 2 + 1]];
  for (let i = 0; i < idx.length; i += 3) {
    m.tri(v(idx[i], y1), v(idx[i + 2], y1), v(idx[i + 1], y1), [0, 1, 0]);
    if (y0 !== y1) m.tri(v(idx[i], y0), v(idx[i + 1], y0), v(idx[i + 2], y0), [0, -1, 0]);
  }
  if (y1 - y0 > 1e-6)
    for (const ring of rings)
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        m.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]);
      }
}

/** Point on a unit sphere for latitude / longitude (degrees). */
export function latLon(lat: number, lon: number, r = 1): Vec3 {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)];
}

/** Great-circle arc between two lat/lon points, lifted above the surface in the middle. */
export function greatArc(a: [number, number], b: [number, number], r: number, lift: number, steps = 48): Vec3[] {
  const p = normalize(latLon(a[0], a[1]));
  const q = normalize(latLon(b[0], b[1]));
  const dot = Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
  const om = Math.acos(dot);
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = Math.sin(om) || 1e-6;
    const k0 = om < 1e-4 ? 1 - t : Math.sin((1 - t) * om) / s;
    const k1 = om < 1e-4 ? t : Math.sin(t * om) / s;
    const d = normalize([p[0] * k0 + q[0] * k1, p[1] * k0 + q[1] * k1, p[2] * k0 + q[2] * k1]);
    const h = r * (1 + lift * Math.sin(Math.PI * t) * (om / Math.PI + 0.25));
    out.push(scale(d, h));
  }
  return out;
}
