import type { RGBA } from '../theme/colors';

/** Escapes text for XML. */
export const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

const n = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

/** fill="rgb(..)" fill-opacity=".." for an RGBA color (straight alpha). */
export function paint(attr: 'fill' | 'stroke', c: readonly number[], alpha = 1): string {
  const a = (c[3] ?? 1) * alpha;
  return `${attr}="rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})"${a < 1 ? ` ${attr}-opacity="${n(a)}"` : ''}`;
}

/** Rectangle path with per-corner radii [tl, tr, br, bl]. */
export function roundRectPath(x: number, y: number, w: number, h: number, r: [number, number, number, number]): string {
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, w / 2, h / 2)));
  return `M${n(x + tl)},${n(y)}H${n(x + w - tr)}${tr ? `A${n(tr)},${n(tr)} 0 0 1 ${n(x + w)},${n(y + tr)}` : ''}V${n(y + h - br)}${br ? `A${n(br)},${n(br)} 0 0 1 ${n(x + w - br)},${n(y + h)}` : ''}H${n(x + bl)}${bl ? `A${n(bl)},${n(bl)} 0 0 1 ${n(x)},${n(y + h - bl)}` : ''}V${n(y + tl)}${tl ? `A${n(tl)},${n(tl)} 0 0 1 ${n(x + tl)},${n(y)}` : ''}Z`;
}

const pt = (cx: number, cy: number, r: number, a: number) => `${n(cx + Math.sin(a) * r)},${n(cy - Math.cos(a) * r)}`;

/** Annular sector (angles: 0 at 12 o'clock, clockwise). */
export function arcPath(cx: number, cy: number, inner: number, outer: number, a0: number, a1: number, padPx = 0): string {
  const sweep = a1 - a0;
  if (sweep <= 0 || outer <= 0) return '';
  if (sweep >= Math.PI * 2 - 1e-6) {
    const ring = (r: number) => `M${pt(cx, cy, r, 0)}A${n(r)},${n(r)} 0 1 1 ${pt(cx, cy, r, Math.PI)}A${n(r)},${n(r)} 0 1 1 ${pt(cx, cy, r, 0)}Z`;
    return ring(outer) + (inner > 0 ? ring(inner) : '');
  }
  const po = padPx / 2 / outer;
  const pi = inner > 0 ? padPx / 2 / inner : 0;
  const o0 = a0 + Math.min(po, sweep / 2);
  const o1 = a1 - Math.min(po, sweep / 2);
  const large = o1 - o0 > Math.PI ? 1 : 0;
  let d = `M${pt(cx, cy, outer, o0)}A${n(outer)},${n(outer)} 0 ${large} 1 ${pt(cx, cy, outer, o1)}`;
  if (inner > 0) {
    const i0 = a0 + Math.min(pi, sweep / 2);
    const i1 = a1 - Math.min(pi, sweep / 2);
    d += `L${pt(cx, cy, inner, i1)}A${n(inner)},${n(inner)} 0 ${i1 - i0 > Math.PI ? 1 : 0} 0 ${pt(cx, cy, inner, i0)}`;
  } else d += `L${n(cx)},${n(cy)}`;
  return `${d}Z`;
}

/** SVG path for a symbol of diameter `size` centered at (x, y). Shape ids match the GPU shader. */
export function symbolPath(shape: number, x: number, y: number, size: number): string {
  const r = size / 2;
  switch (shape) {
    case 1:
      return `M${n(x - r * 0.9)},${n(y - r * 0.9)}h${n(r * 1.8)}v${n(r * 1.8)}h${n(-r * 1.8)}Z`;
    case 2:
      return roundRectPath(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8, [r * 0.3, r * 0.3, r * 0.3, r * 0.3]);
    case 3:
      return `M${n(x)},${n(y - r)}L${n(x + r)},${n(y)}L${n(x)},${n(y + r)}L${n(x - r)},${n(y)}Z`;
    case 4:
      return `M${n(x)},${n(y - r)}L${n(x + r)},${n(y + r * 0.8)}L${n(x - r)},${n(y + r * 0.8)}Z`;
    case 5:
      return `M${n(x)},${n(y + r)}L${n(x + r)},${n(y - r * 0.8)}L${n(x - r)},${n(y - r * 0.8)}Z`;
    case 6: {
      const t = r * 0.3;
      return `M${n(x - t)},${n(y - r)}h${n(2 * t)}v${n(r - t)}h${n(r - t)}v${n(2 * t)}h${n(-(r - t))}v${n(r - t)}h${n(-2 * t)}v${n(-(r - t))}h${n(-(r - t))}v${n(-2 * t)}h${n(r - t)}Z`;
    }
    case 7:
      return `M${n(x + r)},${n(y)}L${n(x - r * 0.8)},${n(y - r)}L${n(x - r * 0.8)},${n(y + r)}Z`;
    default:
      return `M${n(x - r)},${n(y)}a${n(r)},${n(r)} 0 1 0 ${n(2 * r)},0a${n(r)},${n(r)} 0 1 0 ${n(-2 * r)},0Z`;
  }
}

/** Path made of triangles (xy pairs, 3 vertices each). */
export function trianglesPath(tri: ArrayLike<number>): string {
  let d = '';
  for (let i = 0; i < tri.length; i += 6) d += `M${n(tri[i])},${n(tri[i + 1])}L${n(tri[i + 2])},${n(tri[i + 3])}L${n(tri[i + 4])},${n(tri[i + 5])}Z`;
  return d;
}

export function polyline(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)},${n(p.y)}`).join('');
}

let gradientCounter = 0;
export const nextId = (prefix: string) => `${prefix}${++gradientCounter}`;

export type Color = RGBA;
export { n as num };
