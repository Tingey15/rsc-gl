import type { GpuBuffer, GpuDevice, GpuPipeline, GpuUniforms, RenderPass, UniformField } from '@rsc-gl/gpu';
import { UNIFORMS_TOKEN } from '@rsc-gl/gpu';
import { COMMON_UNIFORMS, EASING_ID, GLSL_LIB, WGSL_LIB, packColor, type TransitionOptions } from '@rsc-gl/core';
import type { Frame3D } from './marks3d';

const UNIFORMS: UniformField[] = [...COMMON_UNIFORMS, { name: 'viewProj', type: 'mat4' }, { name: 'light', type: 'vec4' }, { name: 'fadeColor', type: 'vec4' }];

/** One keyed piece of geometry (a pie slice, a cylinder, a country prism, ...). */
export interface MeshPart {
  key: string;
  seriesIndex: number;
  dataIndex: number;
  /** Non-indexed triangles: xyz per vertex. */
  positions: Float32Array;
  /** Per-vertex normals (same length as positions). */
  normals: Float32Array;
  color: [number, number, number, number];
  /** Optional per-vertex colors (packed RGBA8); overrides `color`. */
  vertexColors?: Uint32Array;
  /** How the part grows in: flattened onto its base, collapsed to its centroid, or from a point. */
  enter?: 'floor' | 'center' | { from: [number, number, number] };
  /** Stagger position 0..1. */
  delay?: number;
  /** Excluded from hover / picking (decoration). */
  inert?: boolean;
}

const STRIDE = 14; // fromPos3, toPos3, normal3, colorFrom, colorTo, key2, delay

const GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
${GLSL_LIB}
layout(location = 0) in vec3 a_from;
layout(location = 1) in vec3 a_to;
layout(location = 2) in vec3 a_normal;
layout(location = 3) in vec4 a_colorFrom;
layout(location = 4) in vec4 a_colorTo;
layout(location = 5) in vec2 a_key;
layout(location = 6) in float a_delay;
out vec3 v_normal;
out vec4 v_color;
flat out vec2 v_key;
void main() {
  float t = localT(a_delay);
  vec3 world = mix(a_from, a_to, t);
  vec4 c = mix(a_colorFrom, a_colorTo, t);
  float m = hlMatch(a_key);
  float fade = fadeFor(a_key);
  v_color = vec4(mix(u.fadeColor.rgb, c.rgb, fade) + m * 0.1, c.a);
  v_normal = a_normal;
  v_key = a_key;
  gl_Position = u.viewProj * vec4(world, 1.0);
}
`;

const GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec3 v_normal;
in vec4 v_color;
flat in vec2 v_key;
out vec4 outColor;
void main() {
  if (u.anim.w > 0.5) {
    if (v_key.x < 0.0) discard;
    float id = v_key.x * 65536.0 + v_key.y + 1.0;
    outColor = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0);
    return;
  }
  vec3 L = normalize(u.light.xyz);
  float diff = abs(dot(normalize(v_normal), L));
  vec3 col = v_color.rgb * (u.light.w + (1.0 - u.light.w) * diff);
  float a = v_color.a * u.opacity;
  outColor = vec4(col * a, a);
}
`;

const WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
${WGSL_LIB}
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) color: vec4f,
  @location(2) @interpolate(flat) key: vec2f,
};
@vertex
fn vs_main(
  @location(0) fromP: vec3f,
  @location(1) toP: vec3f,
  @location(2) normal: vec3f,
  @location(3) colorFrom: vec4f,
  @location(4) colorTo: vec4f,
  @location(5) key: vec2f,
  @location(6) delay: f32,
) -> VsOut {
  var o: VsOut;
  let t = localT(delay);
  let world = mix(fromP, toP, t);
  let c = mix(colorFrom, colorTo, t);
  let m = hlMatch(key);
  let fade = fadeFor(key);
  o.color = vec4f(mix(u.fadeColor.rgb, c.rgb, fade) + vec3f(m * 0.1), c.a);
  o.normal = normal;
  o.key = key;
  var p = u.viewProj * vec4f(world, 1.0);
  p.z = (p.z + p.w) * 0.5;
  o.position = p;
  return o;
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  if (u.anim.w > 0.5) {
    if (vin.key.x < 0.0) { discard; }
    let id = vin.key.x * 65536.0 + vin.key.y + 1.0;
    return vec4f((id % 256.0) / 255.0, (floor(id / 256.0) % 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0);
  }
  let L = normalize(u.light.xyz);
  let diff = abs(dot(normalize(vin.normal), L));
  let col = vin.color.rgb * (u.light.w + (1.0 - u.light.w) * diff);
  let a = vin.color.a * u.opacity;
  return vec4f(col * a, a);
}
`;

interface LivePart {
  part: MeshPart;
  from: Float32Array;
  fromColor: Uint32Array;
}

function centroid(p: Float32Array): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  const n = p.length / 3 || 1;
  for (let i = 0; i < p.length; i += 3) {
    x += p[i];
    y += p[i + 1];
    z += p[i + 2];
  }
  return [x / n, y / n, z / n];
}

/**
 * Lit triangle meshes in world space. Parts are keyed: when data changes,
 * parts with the same key and vertex count morph on the GPU; new parts grow
 * in (from the floor, their centroid or a point). Supports highlight / fade
 * and GPU picking like the other 3D marks.
 */
export class MeshMark3D {
  private pipeline: GpuPipeline | null = null;
  private pickPipeline: GpuPipeline | null = null;
  private uniforms: GpuUniforms | null = null;
  private pickUniforms: GpuUniforms | null = null;
  private vbo: GpuBuffer | null = null;
  private live: LivePart[] = [];
  private count = 0;
  private dirty = false;
  private start = 0;
  private transition: TransitionOptions = { duration: 0, easing: 'linear', stagger: 0 };
  opacity = 1;

  constructor(private device: GpuDevice) {}

  private progress(now: number): number {
    const d = this.transition.duration;
    return d <= 0 ? 1 : Math.min(1, Math.max(0, (now - this.start) / d));
  }

  isAnimating(now: number): boolean {
    return this.transition.duration > 0 && now - this.start < this.transition.duration;
  }

  /** Interpolated positions of a live part (CPU mirror of the shader, for retargeting). */
  private current(l: LivePart, now: number): Float32Array {
    const raw = this.progress(now);
    const span = Math.max(1 - this.transition.stagger, 1e-5);
    const lt = Math.min(1, Math.max(0, (raw - (l.part.delay ?? 0) * this.transition.stagger) / span));
    const e = ease(lt, EASING_ID[this.transition.easing]);
    const to = l.part.positions;
    if (e >= 1) return to;
    const out = new Float32Array(to.length);
    for (let i = 0; i < to.length; i++) out[i] = l.from[i] + (to[i] - l.from[i]) * e;
    return out;
  }

  update(parts: MeshPart[], transition: TransitionOptions, now: number): void {
    const prev = new Map(this.live.map((l) => [l.part.key, l]));
    const next: LivePart[] = [];
    for (const part of parts) {
      const old = prev.get(part.key);
      const colors = part.vertexColors ?? new Uint32Array(part.positions.length / 3).fill(packColor(part.color));
      let from: Float32Array;
      let fromColor: Uint32Array = colors;
      if (old && old.part.positions.length === part.positions.length) {
        from = this.current(old, now);
        fromColor = old.part.vertexColors ?? new Uint32Array(part.positions.length / 3).fill(packColor(old.part.color));
      } else if (transition.duration <= 0) {
        from = part.positions;
      } else {
        from = new Float32Array(part.positions);
        const mode = part.enter ?? 'floor';
        if (mode === 'floor') {
          // Flatten onto the part's own base so it grows upward from where it stands.
          let minY = Infinity;
          for (let i = 1; i < from.length; i += 3) minY = Math.min(minY, from[i]);
          for (let i = 1; i < from.length; i += 3) from[i] = minY;
        }
        else {
          const c = mode === 'center' ? centroid(part.positions) : mode.from;
          for (let i = 0; i < from.length; i += 3) {
            from[i] = c[0];
            from[i + 1] = c[1];
            from[i + 2] = c[2];
          }
        }
      }
      next.push({ part, from, fromColor });
    }
    this.live = next;
    this.transition = transition;
    this.start = now;
    this.dirty = true;
  }

  private upload(): void {
    let verts = 0;
    for (const l of this.live) verts += l.part.positions.length / 3;
    const data = new Float32Array(verts * STRIDE);
    const u32 = new Uint32Array(data.buffer);
    let o = 0;
    for (const l of this.live) {
      const p = l.part;
      const n = p.positions.length / 3;
      const toColors = p.vertexColors;
      const packed = packColor(p.color);
      for (let v = 0; v < n; v++, o += STRIDE) {
        data[o] = l.from[v * 3];
        data[o + 1] = l.from[v * 3 + 1];
        data[o + 2] = l.from[v * 3 + 2];
        data[o + 3] = p.positions[v * 3];
        data[o + 4] = p.positions[v * 3 + 1];
        data[o + 5] = p.positions[v * 3 + 2];
        data[o + 6] = p.normals[v * 3];
        data[o + 7] = p.normals[v * 3 + 1];
        data[o + 8] = p.normals[v * 3 + 2];
        u32[o + 9] = l.fromColor[v] ?? packed;
        u32[o + 10] = toColors ? toColors[v] : packed;
        data[o + 11] = p.inert ? -1 : p.seriesIndex;
        data[o + 12] = p.dataIndex;
        data[o + 13] = p.delay ?? 0;
      }
    }
    if (!this.vbo || this.vbo.byteLength < data.byteLength) {
      this.vbo?.destroy();
      this.vbo = this.device.createBuffer({ usage: 'vertex', byteLength: Math.max(1024, data.byteLength) });
    }
    this.vbo.write(data);
    this.count = verts;
    this.dirty = false;
  }

  private ensure(): void {
    if (this.pipeline) return;
    const desc = (offscreen: boolean) => ({
      label: offscreen ? 'mesh-3d-pick' : 'mesh-3d',
      shader: { glsl: { vertex: GLSL_VS, fragment: GLSL_FS }, wgsl: WGSL },
      uniforms: { fields: UNIFORMS },
      topology: 'triangle-list' as const,
      depth: true,
      blend: offscreen ? ('none' as const) : ('alpha' as const),
      offscreen,
      buffers: [
        {
          name: 'vertex',
          stepMode: 'vertex' as const,
          stride: STRIDE * 4,
          attributes: [
            { name: 'a_from', location: 0, format: 'float32x3' as const, offset: 0 },
            { name: 'a_to', location: 1, format: 'float32x3' as const, offset: 12 },
            { name: 'a_normal', location: 2, format: 'float32x3' as const, offset: 24 },
            { name: 'a_colorFrom', location: 3, format: 'unorm8x4' as const, offset: 36 },
            { name: 'a_colorTo', location: 4, format: 'unorm8x4' as const, offset: 40 },
            { name: 'a_key', location: 5, format: 'float32x2' as const, offset: 44 },
            { name: 'a_delay', location: 6, format: 'float32' as const, offset: 52 },
          ],
        },
      ],
    });
    this.pipeline = this.device.createPipeline(desc(false));
    this.uniforms = this.device.createUniforms(this.pipeline.descriptor.uniforms);
    this.pickPipeline = this.device.createPipeline(desc(true));
    this.pickUniforms = this.device.createUniforms(this.pickPipeline.descriptor.uniforms);
    this.dirty = true;
  }

  private setUniforms(u: GpuUniforms, frame: Frame3D, pick: boolean): void {
    u.set('hl', pick ? [-1, -1, 1, 0] : frame.highlight);
    u.set('anim', [this.progress(frame.now), EASING_ID[this.transition.easing], this.transition.stagger, pick ? 1 : 0]);
    u.set('resolution', [frame.width, frame.height]);
    u.set('dpr', frame.dpr);
    u.set('opacity', this.opacity);
    u.set('viewProj', frame.viewProj);
    u.set('light', frame.light);
    u.set('fadeColor', frame.fadeColor);
  }

  draw(pass: RenderPass, frame: Frame3D): void {
    if (!this.live.length) return;
    this.ensure();
    if (this.dirty) this.upload();
    if (!this.count) return;
    this.setUniforms(this.uniforms!, frame, false);
    pass.draw({ pipeline: this.pipeline!, uniforms: this.uniforms!, vertexBuffers: { vertex: this.vbo! }, vertexCount: this.count });
  }

  drawPick(pass: RenderPass, frame: Frame3D): void {
    if (!this.live.length) return;
    this.ensure();
    if (this.dirty) this.upload();
    if (!this.count) return;
    this.setUniforms(this.pickUniforms!, { ...frame, now: frame.now + 1e9 }, true);
    pass.draw({ pipeline: this.pickPipeline!, uniforms: this.pickUniforms!, vertexBuffers: { vertex: this.vbo! }, vertexCount: this.count });
  }

  setDevice(device: GpuDevice): void {
    this.destroy();
    this.device = device;
    this.dirty = true;
  }

  destroy(): void {
    this.pipeline?.destroy();
    this.pickPipeline?.destroy();
    this.uniforms?.destroy();
    this.pickUniforms?.destroy();
    this.vbo?.destroy();
    this.pipeline = null;
    this.pickPipeline = null;
    this.uniforms = null;
    this.pickUniforms = null;
    this.vbo = null;
  }
}

/** CPU mirror of the shader easing (ids from EASING_ID). */
function ease(t: number, kind: number): number {
  t = Math.min(1, Math.max(0, t));
  if (kind < 0.5) return t;
  if (kind < 1.5) return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  if (kind < 2.5) return 1 - Math.pow(1 - t, 3);
  if (kind < 3.5) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  if (kind < 4.5) return t <= 0 || t >= 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.0943951) + 1;
  return 1 - (1 - t) * (1 - t);
}
