import type { GpuBuffer, GpuDevice, GpuPipeline, GpuUniforms, PipelineDescriptor, RenderPass } from '@rsc-gl/gpu';
import { UNIFORMS_TOKEN } from '@rsc-gl/gpu';
import { EASING_ID, ease, localProgress, type TransitionOptions } from '../animation/easing';
import { COMMON_UNIFORMS, GLSL_LIB, WGSL_LIB } from './shader-lib';
import { packColor, type FrameState } from './instance-mark';
import { paint, trianglesPath } from '../svg/svg';

/**
 * A keyed triangle mesh (funnels, ribbons, radar fills, map regions…).
 * `triangles` holds xy pairs, three vertices per triangle. Items with the
 * same key and vertex count morph between states on the GPU; others grow
 * from (or shrink to) their centroid.
 */
export interface MeshItem {
  key: string;
  seriesIndex: number;
  dataIndex: number;
  triangles: Float32Array;
  color: [number, number, number, number];
  /** Optional explicit enter state (same vertex count). */
  enter?: Float32Array;
}

interface Live {
  item: MeshItem;
  from: Float32Array;
  to: Float32Array;
  colorFrom: [number, number, number, number];
  delay: number;
  exiting: boolean;
}

const STRIDE = 9; // to(2) from(2) colorTo colorFrom key(2) delay

const GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
${GLSL_LIB}
layout(location = 0) in vec4 a_pos;
layout(location = 1) in vec4 a_colorTo;
layout(location = 2) in vec4 a_colorFrom;
layout(location = 3) in vec2 a_key;
layout(location = 4) in float a_delay;
out vec4 v_color;
void main() {
  float t = localT(a_delay);
  vec2 p = mix(a_pos.zw, a_pos.xy, t);
  vec4 c = mix(a_colorFrom, a_colorTo, t);
  float m = hlMatch(a_key);
  v_color = vec4(c.rgb + m * 0.06, c.a * fadeFor(a_key) * u.opacity);
  gl_Position = vec4(toClip(p), 0.0, 1.0);
}
`;

const GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = vec4(v_color.rgb * v_color.a, v_color.a);
}
`;

const WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
${WGSL_LIB}
struct VsOut { @builtin(position) position: vec4f, @location(0) color: vec4f };
@vertex
fn vs_main(@location(0) pos: vec4f, @location(1) colorTo: vec4f, @location(2) colorFrom: vec4f, @location(3) key: vec2f, @location(4) delay: f32) -> VsOut {
  var o: VsOut;
  let t = localT(delay);
  let p = mix(pos.zw, pos.xy, t);
  let c = mix(colorFrom, colorTo, t);
  let m = hlMatch(key);
  o.color = vec4f(c.rgb + vec3f(m * 0.06), c.a * fadeFor(key) * u.opacity);
  o.position = vec4f(toClip(p), 0.0, 1.0);
  return o;
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  return vec4f(vin.color.rgb * vin.color.a, vin.color.a);
}
`;

function centroidCollapse(tri: Float32Array): Float32Array {
  let cx = 0;
  let cy = 0;
  const n = tri.length / 2;
  for (let i = 0; i < tri.length; i += 2) {
    cx += tri[i];
    cy += tri[i + 1];
  }
  cx /= n || 1;
  cy /= n || 1;
  const out = new Float32Array(tri.length);
  for (let i = 0; i < tri.length; i += 2) {
    out[i] = cx;
    out[i + 1] = cy;
  }
  return out;
}

function lerpArr(a: Float32Array, b: Float32Array, t: number): Float32Array {
  const out = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

export class MeshMark {
  private pipeline: GpuPipeline | null = null;
  private uniforms: GpuUniforms | null = null;
  private buffer: GpuBuffer | null = null;
  private live: Live[] = [];
  private byKey = new Map<string, Live>();
  private start = 0;
  private transition: TransitionOptions = { duration: 0, easing: 'linear', stagger: 0 };
  private dirty = true;
  private vertexCount = 0;
  opacity = 1;

  constructor(private device: GpuDevice) {}

  private progress(now: number, delay: number): number {
    const d = this.transition.duration;
    if (d <= 0) return 1;
    const t = Math.min(1, Math.max(0, (now - this.start) / d));
    return ease(localProgress(t, delay, this.transition.stagger), EASING_ID[this.transition.easing]);
  }

  /** Current on-screen triangles of an item (hit testing). */
  current(key: string, now: number): Float32Array | undefined {
    const l = this.byKey.get(key);
    return l ? lerpArr(l.from, l.to, this.progress(now, l.delay)) : undefined;
  }

  get items(): MeshItem[] {
    return this.live.filter((l) => !l.exiting).map((l) => l.item);
  }

  update(items: MeshItem[], transition: TransitionOptions, now: number): void {
    const next: Live[] = [];
    const nextByKey = new Map<string, Live>();
    items.forEach((item, i) => {
      const prev = this.byKey.get(item.key);
      let from: Float32Array;
      let colorFrom = item.color;
      if (prev && prev.to.length === item.triangles.length) {
        const t = this.progress(now, prev.delay);
        from = lerpArr(prev.from, prev.to, t);
        const c0 = prev.colorFrom;
        const c1 = prev.item.color;
        colorFrom = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t, c0[3] + (c1[3] - c0[3]) * t];
      } else {
        from = item.enter ?? (transition.duration > 0 ? centroidCollapse(item.triangles) : item.triangles);
      }
      const l: Live = { item, from, to: item.triangles, colorFrom, delay: items.length > 1 ? i / (items.length - 1) : 0, exiting: false };
      next.push(l);
      nextByKey.set(item.key, l);
    });
    if (transition.duration > 0) {
      for (const prev of this.live) {
        if (nextByKey.has(prev.item.key) || prev.exiting) continue;
        const cur = lerpArr(prev.from, prev.to, this.progress(now, prev.delay));
        const l: Live = { item: prev.item, from: cur, to: centroidCollapse(cur), colorFrom: prev.item.color, delay: 0, exiting: true };
        next.push(l);
        nextByKey.set(prev.item.key, l);
      }
    }
    this.live = next;
    this.byKey = nextByKey;
    this.transition = transition;
    this.start = now;
    this.dirty = true;
  }

  isAnimating(now: number): boolean {
    return this.transition.duration > 0 && now - this.start < this.transition.duration;
  }

  toSvg(now: number): string {
    return this.live
      .filter((l) => !l.exiting && l.item.color[3] > 0.002)
      .map((l) => `<path d="${trianglesPath(lerpArr(l.from, l.to, this.progress(now, l.delay)))}" ${paint('fill', l.item.color, this.opacity)}/>`)
      .join('');
  }

  private ensure(): void {
    if (this.pipeline) return;
    const desc: PipelineDescriptor = {
      label: 'mesh-mark',
      shader: { glsl: { vertex: GLSL_VS, fragment: GLSL_FS }, wgsl: WGSL },
      uniforms: { fields: COMMON_UNIFORMS },
      topology: 'triangle-list',
      buffers: [
        {
          name: 'vertex',
          stepMode: 'vertex',
          stride: STRIDE * 4,
          attributes: [
            { name: 'a_pos', location: 0, format: 'float32x4', offset: 0 },
            { name: 'a_colorTo', location: 1, format: 'unorm8x4', offset: 16 },
            { name: 'a_colorFrom', location: 2, format: 'unorm8x4', offset: 20 },
            { name: 'a_key', location: 3, format: 'float32x2', offset: 24 },
            { name: 'a_delay', location: 4, format: 'float32', offset: 32 },
          ],
        },
      ],
    };
    this.pipeline = this.device.createPipeline(desc);
    this.uniforms = this.device.createUniforms(desc.uniforms);
    this.buffer = this.device.createBuffer({ usage: 'vertex', byteLength: 1024 });
  }

  private upload(): void {
    let verts = 0;
    for (const l of this.live) verts += l.to.length / 2;
    const f = new Float32Array(Math.max(1, verts) * STRIDE);
    const u = new Uint32Array(f.buffer);
    let o = 0;
    for (const l of this.live) {
      const cTo = packColor(l.exiting ? [l.item.color[0], l.item.color[1], l.item.color[2], 0] : l.item.color);
      const cFrom = packColor(l.colorFrom);
      for (let i = 0; i < l.to.length; i += 2) {
        f[o] = l.to[i];
        f[o + 1] = l.to[i + 1];
        f[o + 2] = l.from[i];
        f[o + 3] = l.from[i + 1];
        u[o + 4] = cTo;
        u[o + 5] = cFrom;
        f[o + 6] = l.item.seriesIndex;
        f[o + 7] = l.item.dataIndex;
        f[o + 8] = l.delay;
        o += STRIDE;
      }
    }
    this.vertexCount = verts;
    this.buffer!.write(f);
    this.dirty = false;
  }

  draw(pass: RenderPass, frame: FrameState): void {
    if (!this.isAnimating(frame.now) && this.live.some((l) => l.exiting)) {
      this.live = this.live.filter((l) => !l.exiting);
      this.byKey = new Map(this.live.map((l) => [l.item.key, l]));
      this.dirty = true;
    }
    if (this.live.length === 0) return;
    this.ensure();
    if (this.dirty) this.upload();
    const u = this.uniforms!;
    const t = this.transition.duration > 0 ? Math.min(1, Math.max(0, (frame.now - this.start) / this.transition.duration)) : 1;
    u.set('hl', frame.highlight);
    u.set('anim', [t, EASING_ID[this.transition.easing], this.transition.stagger, 0]);
    u.set('resolution', [frame.width, frame.height]);
    u.set('dpr', frame.dpr);
    u.set('opacity', this.opacity);
    pass.draw({ pipeline: this.pipeline!, uniforms: u, vertexBuffers: { vertex: this.buffer! }, vertexCount: this.vertexCount });
  }

  setDevice(device: GpuDevice): void {
    this.destroy();
    this.device = device;
    this.dirty = true;
  }

  destroy(): void {
    this.pipeline?.destroy();
    this.uniforms?.destroy();
    this.buffer?.destroy();
    this.pipeline = null;
    this.uniforms = null;
    this.buffer = null;
  }
}

/* ------------------------------------------------------------------ tessellation helpers */

/** Fan triangulation of a star-shaped ring (around its centroid). */
export function fan(ring: ArrayLike<number>): Float32Array {
  const n = ring.length / 2;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i += 2) {
    cx += ring[i];
    cy += ring[i + 1];
  }
  cx /= n;
  cy /= n;
  const out = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.set([cx, cy, ring[i * 2], ring[i * 2 + 1], ring[j * 2], ring[j * 2 + 1]], i * 6);
  }
  return out;
}

/** Triangulates the band between two polylines of equal length. */
export function strip(top: ArrayLike<number>, bottom: ArrayLike<number>): Float32Array {
  const n = top.length / 2;
  const out = new Float32Array((n - 1) * 12);
  for (let i = 0; i < n - 1; i++) {
    const t0 = [top[i * 2], top[i * 2 + 1]];
    const t1 = [top[i * 2 + 2], top[i * 2 + 3]];
    const b0 = [bottom[i * 2], bottom[i * 2 + 1]];
    const b1 = [bottom[i * 2 + 2], bottom[i * 2 + 3]];
    out.set([...t0, ...b0, ...t1, ...t1, ...b0, ...b1], i * 12);
  }
  return out;
}

/** Point-in-triangle-list test. */
export function hitTriangles(tri: Float32Array, x: number, y: number): boolean {
  for (let i = 0; i < tri.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = [tri[i], tri[i + 1], tri[i + 2], tri[i + 3], tri[i + 4], tri[i + 5]];
    const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
    const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}
