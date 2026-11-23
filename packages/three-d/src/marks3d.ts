import type { GpuBuffer, GpuDevice, GpuPipeline, GpuTexture, GpuUniforms, PipelineDescriptor, RenderPass, UniformField } from '@rsc-gl/gpu';
import { UNIFORMS_TOKEN } from '@rsc-gl/gpu';
import { COMMON_UNIFORMS, GLSL_LIB, InstanceMark, WGSL_LIB, packColor, type FrameState, type GlyphAtlas, type MarkItem } from '@rsc-gl/core';
import type { Mat4 } from './math';

/** Per-frame 3D state shared by every 3D mark. */
export interface Frame3D extends FrameState {
  viewProj: Mat4;
  /** Light direction (xyz) + ambient (w). */
  light: [number, number, number, number];
  /** Color faded items are mixed towards (the background). */
  fadeColor: [number, number, number, number];
}

const UNIFORMS_3D: UniformField[] = [
  ...COMMON_UNIFORMS,
  { name: 'viewProj', type: 'mat4' },
  { name: 'light', type: 'vec4' },
  { name: 'fadeColor', type: 'vec4' },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpC = (a: number[], b: number[], t: number): [number, number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];

/* ============================================================== boxes (Bar3D) */

export interface BoxAttrs {
  x: number;
  z: number;
  /** Base height. */
  y0: number;
  height: number;
  width: number;
  depth: number;
  color: [number, number, number, number];
}

const BOX_STRIDE = 17;

function cubeGeometry(): Float32Array {
  // Unit cube spanning x,z in [-0.5, 0.5], y in [0, 1]; position + normal per vertex.
  const faces: [number[], number[][]][] = [
    [[0, 0, 1], [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]]],
    [[0, 0, -1], [[0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]]],
    [[1, 0, 0], [[0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 0, 0.5], [0.5, 1, -0.5], [0.5, 1, 0.5]]],
    [[-1, 0, 0], [[-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 0, -0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]]],
    [[0, 1, 0], [[-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5]]],
    [[0, -1, 0], [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]]],
  ];
  const out: number[] = [];
  for (const [n, verts] of faces) for (const v of verts) out.push(v[0], v[1], v[2], n[0], n[1], n[2]);
  return new Float32Array(out);
}

const BOX_GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
${GLSL_LIB}
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec3 a_fromA;
layout(location = 3) in vec3 a_fromB;
layout(location = 4) in vec3 a_toA;
layout(location = 5) in vec3 a_toB;
layout(location = 6) in vec4 a_colorFrom;
layout(location = 7) in vec4 a_colorTo;
layout(location = 8) in vec2 a_key;
layout(location = 9) in float a_delay;
out vec3 v_normal;
out vec4 v_color;
out float v_top;
flat out vec2 v_key;
void main() {
  float t = localT(a_delay);
  vec3 A = mix(a_fromA, a_toA, t); // x, z, y0
  vec3 B = mix(a_fromB, a_toB, t); // height, width, depth
  vec4 c = mix(a_colorFrom, a_colorTo, t);
  float m = hlMatch(a_key);
  vec3 world = vec3(A.x + a_pos.x * B.y * (1.0 + m * 0.08), A.z + a_pos.y * B.x, A.y + a_pos.z * B.z * (1.0 + m * 0.08));
  float fade = fadeFor(a_key);
  v_color = vec4(mix(u.fadeColor.rgb, c.rgb, fade), c.a);
  v_color.rgb += m * 0.12;
  v_normal = a_normal;
  v_top = a_pos.y;
  v_key = a_key;
  gl_Position = u.viewProj * vec4(world, 1.0);
}
`;

const BOX_GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec3 v_normal;
in vec4 v_color;
in float v_top;
flat in vec2 v_key;
out vec4 outColor;
void main() {
  if (u.anim.w > 0.5) {
    float id = v_key.x * 65536.0 + v_key.y + 1.0;
    outColor = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0);
    return;
  }
  vec3 L = normalize(u.light.xyz);
  float diff = max(dot(normalize(v_normal), L), 0.0);
  float shade = u.light.w + (1.0 - u.light.w) * diff;
  vec3 col = v_color.rgb * shade * (0.88 + 0.12 * v_top);
  float a = v_color.a * u.opacity;
  outColor = vec4(col * a, a);
}
`;

const BOX_WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
${WGSL_LIB}
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) color: vec4f,
  @location(2) top: f32,
  @location(3) @interpolate(flat) key: vec2f,
};
@vertex
fn vs_main(
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) fromA: vec3f,
  @location(3) fromB: vec3f,
  @location(4) toA: vec3f,
  @location(5) toB: vec3f,
  @location(6) colorFrom: vec4f,
  @location(7) colorTo: vec4f,
  @location(8) key: vec2f,
  @location(9) delay: f32,
) -> VsOut {
  var o: VsOut;
  let t = localT(delay);
  let A = mix(fromA, toA, t);
  let B = mix(fromB, toB, t);
  let c = mix(colorFrom, colorTo, t);
  let m = hlMatch(key);
  let world = vec3f(A.x + pos.x * B.y * (1.0 + m * 0.08), A.z + pos.y * B.x, A.y + pos.z * B.z * (1.0 + m * 0.08));
  let fade = fadeFor(key);
  o.color = vec4f(mix(u.fadeColor.rgb, c.rgb, fade) + vec3f(m * 0.12), c.a);
  o.normal = normal;
  o.top = pos.y;
  o.key = key;
  var p = u.viewProj * vec4f(world, 1.0);
  p.z = (p.z + p.w) * 0.5;
  o.position = p;
  return o;
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  if (u.anim.w > 0.5) {
    let id = vin.key.x * 65536.0 + vin.key.y + 1.0;
    return vec4f((id % 256.0) / 255.0, (floor(id / 256.0) % 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0);
  }
  let L = normalize(u.light.xyz);
  let diff = max(dot(normalize(vin.normal), L), 0.0);
  let shade = u.light.w + (1.0 - u.light.w) * diff;
  let col = vin.color.rgb * shade * (0.88 + 0.12 * vin.top);
  let a = vin.color.a * u.opacity;
  return vec4f(col * a, a);
}
`;

export class BoxMark extends InstanceMark<BoxAttrs> {
  protected override vertexCount = 36;
  protected attributes = {
    floatsPerInstance: BOX_STRIDE,
    write(f: Float32Array, u: Uint32Array, o: number, a: BoxAttrs, b: BoxAttrs, item: MarkItem<BoxAttrs>, delay: number) {
      f[o] = a.x;
      f[o + 1] = a.z;
      f[o + 2] = a.y0;
      f[o + 3] = a.height;
      f[o + 4] = a.width;
      f[o + 5] = a.depth;
      f[o + 6] = b.x;
      f[o + 7] = b.z;
      f[o + 8] = b.y0;
      f[o + 9] = b.height;
      f[o + 10] = b.width;
      f[o + 11] = b.depth;
      u[o + 12] = packColor(a.color);
      u[o + 13] = packColor(b.color);
      f[o + 14] = item.seriesIndex;
      f[o + 15] = item.dataIndex;
      f[o + 16] = delay;
    },
    lerp: (a: BoxAttrs, b: BoxAttrs, t: number): BoxAttrs => ({
      x: lerp(a.x, b.x, t),
      z: lerp(a.z, b.z, t),
      y0: lerp(a.y0, b.y0, t),
      height: lerp(a.height, b.height, t),
      width: lerp(a.width, b.width, t),
      depth: lerp(a.depth, b.depth, t),
      color: lerpC(a.color, b.color, t),
    }),
    faded: (v: BoxAttrs): BoxAttrs => ({ ...v, height: 0 }),
  };
  frame3d: Frame3D | null = null;

  protected override geometry(): Float32Array {
    return cubeGeometry();
  }

  protected pipelineDescriptor(): PipelineDescriptor {
    return {
      label: 'box-3d',
      shader: { glsl: { vertex: BOX_GLSL_VS, fragment: BOX_GLSL_FS }, wgsl: BOX_WGSL },
      uniforms: { fields: UNIFORMS_3D },
      topology: 'triangle-list',
      depth: true,
      blend: 'alpha',
      buffers: [
        {
          name: 'quad',
          stepMode: 'vertex',
          stride: 24,
          attributes: [
            { name: 'a_pos', location: 0, format: 'float32x3', offset: 0 },
            { name: 'a_normal', location: 1, format: 'float32x3', offset: 12 },
          ],
        },
        {
          name: 'instance',
          stepMode: 'instance',
          stride: BOX_STRIDE * 4,
          attributes: [
            { name: 'a_fromA', location: 2, format: 'float32x3', offset: 0 },
            { name: 'a_fromB', location: 3, format: 'float32x3', offset: 12 },
            { name: 'a_toA', location: 4, format: 'float32x3', offset: 24 },
            { name: 'a_toB', location: 5, format: 'float32x3', offset: 36 },
            { name: 'a_colorFrom', location: 6, format: 'unorm8x4', offset: 48 },
            { name: 'a_colorTo', location: 7, format: 'unorm8x4', offset: 52 },
            { name: 'a_key', location: 8, format: 'float32x2', offset: 56 },
            { name: 'a_delay', location: 9, format: 'float32', offset: 64 },
          ],
        },
      ],
    };
  }

  protected setUniforms(u: GpuUniforms, frame: FrameState): void {
    const f = frame as Frame3D;
    u.set('viewProj', f.viewProj);
    u.set('light', f.light);
    u.set('fadeColor', f.fadeColor);
  }
}

/* ============================================================== sprites (Scatter3D) */

export interface SpriteAttrs {
  x: number;
  y: number;
  z: number;
  /** Diameter in CSS px. */
  size: number;
  color: [number, number, number, number];
}

const SPRITE_STRIDE = 13;

const SPRITE_GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
${GLSL_LIB}
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec4 a_from;
layout(location = 2) in vec4 a_to;
layout(location = 3) in vec4 a_colorFrom;
layout(location = 4) in vec4 a_colorTo;
layout(location = 5) in vec2 a_key;
layout(location = 6) in float a_delay;
out vec2 v_uv;
out vec4 v_color;
flat out vec2 v_key;
void main() {
  float t = localT(a_delay);
  vec4 s = mix(a_from, a_to, t);
  vec4 c = mix(a_colorFrom, a_colorTo, t);
  float m = hlMatch(a_key);
  vec4 clip = u.viewProj * vec4(s.xyz, 1.0);
  float size = s.w * (1.0 + m * 0.6);
  vec2 offset = (a_quad * 2.0 - 1.0) * size / u.resolution * clip.w;
  clip.xy += offset;
  v_uv = a_quad * 2.0 - 1.0;
  v_key = a_key;
  float fade = fadeFor(a_key);
  v_color = vec4(mix(u.fadeColor.rgb, c.rgb, fade), c.a);
  gl_Position = clip;
}
`;

const SPRITE_GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec2 v_uv;
in vec4 v_color;
flat in vec2 v_key;
out vec4 outColor;
void main() {
  float r2 = dot(v_uv, v_uv);
  if (r2 > 1.0) discard;
  if (u.anim.w > 0.5) {
    float id = v_key.x * 65536.0 + v_key.y + 1.0;
    outColor = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0);
    return;
  }
  vec3 n = vec3(v_uv.x, -v_uv.y, sqrt(1.0 - r2));
  vec3 L = normalize(vec3(-0.4, 0.6, 0.7));
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * 0.35;
  vec3 col = v_color.rgb * (u.light.w + (1.0 - u.light.w) * diff) + spec;
  float edge = clamp((1.0 - sqrt(r2)) * 8.0, 0.0, 1.0);
  float a = v_color.a * u.opacity * edge;
  outColor = vec4(col * a, a);
}
`;

const SPRITE_WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
${WGSL_LIB}
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) @interpolate(flat) key: vec2f,
};
@vertex
fn vs_main(
  @location(0) quad: vec2f,
  @location(1) sFrom: vec4f,
  @location(2) sTo: vec4f,
  @location(3) colorFrom: vec4f,
  @location(4) colorTo: vec4f,
  @location(5) key: vec2f,
  @location(6) delay: f32,
) -> VsOut {
  var o: VsOut;
  let t = localT(delay);
  let s = mix(sFrom, sTo, t);
  let c = mix(colorFrom, colorTo, t);
  let m = hlMatch(key);
  var clip = u.viewProj * vec4f(s.xyz, 1.0);
  let size = s.w * (1.0 + m * 0.6);
  let offset = (quad * 2.0 - 1.0) * size / u.resolution * clip.w;
  clip = vec4f(clip.xy + offset, clip.z, clip.w);
  clip.z = (clip.z + clip.w) * 0.5;
  o.uv = quad * 2.0 - 1.0;
  o.key = key;
  let fade = fadeFor(key);
  o.color = vec4f(mix(u.fadeColor.rgb, c.rgb, fade), c.a);
  o.position = clip;
  return o;
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  let r2 = dot(vin.uv, vin.uv);
  if (r2 > 1.0) { discard; }
  if (u.anim.w > 0.5) {
    let id = vin.key.x * 65536.0 + vin.key.y + 1.0;
    return vec4f((id % 256.0) / 255.0, (floor(id / 256.0) % 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0);
  }
  let n = vec3f(vin.uv.x, -vin.uv.y, sqrt(1.0 - r2));
  let L = normalize(vec3f(-0.4, 0.6, 0.7));
  let diff = max(dot(n, L), 0.0);
  let spec = pow(max(dot(reflect(-L, n), vec3f(0.0, 0.0, 1.0)), 0.0), 24.0) * 0.35;
  let col = vin.color.rgb * (u.light.w + (1.0 - u.light.w) * diff) + vec3f(spec);
  let edge = clamp((1.0 - sqrt(r2)) * 8.0, 0.0, 1.0);
  let a = vin.color.a * u.opacity * edge;
  return vec4f(col * a, a);
}
`;

export class SpriteMark extends InstanceMark<SpriteAttrs> {
  protected attributes = {
    floatsPerInstance: SPRITE_STRIDE,
    write(f: Float32Array, u: Uint32Array, o: number, a: SpriteAttrs, b: SpriteAttrs, item: MarkItem<SpriteAttrs>, delay: number) {
      f[o] = a.x;
      f[o + 1] = a.y;
      f[o + 2] = a.z;
      f[o + 3] = a.size;
      f[o + 4] = b.x;
      f[o + 5] = b.y;
      f[o + 6] = b.z;
      f[o + 7] = b.size;
      u[o + 8] = packColor(a.color);
      u[o + 9] = packColor(b.color);
      f[o + 10] = item.seriesIndex;
      f[o + 11] = item.dataIndex;
      f[o + 12] = delay;
    },
    lerp: (a: SpriteAttrs, b: SpriteAttrs, t: number): SpriteAttrs => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), size: lerp(a.size, b.size, t), color: lerpC(a.color, b.color, t) }),
    faded: (v: SpriteAttrs): SpriteAttrs => ({ ...v, size: 0 }),
  };

  protected pipelineDescriptor(): PipelineDescriptor {
    return {
      label: 'sprite-3d',
      shader: { glsl: { vertex: SPRITE_GLSL_VS, fragment: SPRITE_GLSL_FS }, wgsl: SPRITE_WGSL },
      uniforms: { fields: UNIFORMS_3D },
      topology: 'triangle-strip',
      depth: true,
      buffers: [
        { name: 'quad', stepMode: 'vertex', stride: 8, attributes: [{ name: 'a_quad', location: 0, format: 'float32x2', offset: 0 }] },
        {
          name: 'instance',
          stepMode: 'instance',
          stride: SPRITE_STRIDE * 4,
          attributes: [
            { name: 'a_from', location: 1, format: 'float32x4', offset: 0 },
            { name: 'a_to', location: 2, format: 'float32x4', offset: 16 },
            { name: 'a_colorFrom', location: 3, format: 'unorm8x4', offset: 32 },
            { name: 'a_colorTo', location: 4, format: 'unorm8x4', offset: 36 },
            { name: 'a_key', location: 5, format: 'float32x2', offset: 40 },
            { name: 'a_delay', location: 6, format: 'float32', offset: 48 },
          ],
        },
      ],
    };
  }

  protected setUniforms(u: GpuUniforms, frame: FrameState): void {
    const f = frame as Frame3D;
    u.set('viewProj', f.viewProj);
    u.set('light', f.light);
    u.set('fadeColor', f.fadeColor);
  }
}

/* ============================================================== surface mesh */

const SURFACE_GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
layout(location = 0) in vec4 a_pos;      // x, yTo, z, yFrom
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_colorFrom;
layout(location = 3) in vec4 a_colorTo;
out vec3 v_normal;
out vec4 v_color;
void main() {
  float t = u.anim.x;
  vec3 world = vec3(a_pos.x, mix(a_pos.w, a_pos.y, t), a_pos.z);
  v_normal = a_normal;
  v_color = mix(a_colorFrom, a_colorTo, t);
  gl_Position = u.viewProj * vec4(world, 1.0);
}
`;

const SURFACE_GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec3 v_normal;
in vec4 v_color;
out vec4 outColor;
void main() {
  vec3 n = normalize(v_normal);
  vec3 L = normalize(u.light.xyz);
  float diff = abs(dot(n, L));
  vec3 col = v_color.rgb * (u.light.w + (1.0 - u.light.w) * diff);
  float a = v_color.a * u.opacity;
  outColor = vec4(col * a, a);
}
`;

const SURFACE_WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) color: vec4f,
};
@vertex
fn vs_main(@location(0) pos: vec4f, @location(1) normal: vec3f, @location(2) colorFrom: vec4f, @location(3) colorTo: vec4f) -> VsOut {
  var o: VsOut;
  let t = u.anim.x;
  let world = vec3f(pos.x, mix(pos.w, pos.y, t), pos.z);
  o.normal = normal;
  o.color = mix(colorFrom, colorTo, t);
  var p = u.viewProj * vec4f(world, 1.0);
  p.z = (p.z + p.w) * 0.5;
  o.position = p;
  return o;
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  let n = normalize(vin.normal);
  let L = normalize(u.light.xyz);
  let diff = abs(dot(n, L));
  let col = vin.color.rgb * (u.light.w + (1.0 - u.light.w) * diff);
  let a = vin.color.a * u.opacity;
  return vec4f(col * a, a);
}
`;

/** Height-field mesh that morphs between datasets on the GPU. */
export class SurfaceMark {
  private pipeline: GpuPipeline | null = null;
  private uniforms: GpuUniforms | null = null;
  private vbo: GpuBuffer | null = null;
  private ibo: GpuBuffer | null = null;
  private indexCount = 0;
  private cpu: { heights: Float32Array; colors: Uint32Array; nx: number; nz: number; xs: Float32Array; zs: Float32Array } | null = null;
  private fromHeights: Float32Array | null = null;
  private fromColors: Uint32Array | null = null;
  private start = 0;
  private duration = 0;
  private dirty = false;
  opacity = 1;

  constructor(private device: GpuDevice) {}

  /** Current interpolated heights (for hit testing / interrupted transitions). */
  private currentHeights(now: number): Float32Array | null {
    if (!this.cpu) return null;
    const t = this.progress(now);
    if (!this.fromHeights || t >= 1) return this.cpu.heights;
    const out = new Float32Array(this.cpu.heights.length);
    for (let i = 0; i < out.length; i++) out[i] = this.fromHeights[i] + (this.cpu.heights[i] - this.fromHeights[i]) * t;
    return out;
  }

  progress(now: number): number {
    if (this.duration <= 0) return 1;
    const t = Math.min(1, Math.max(0, (now - this.start) / this.duration));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  isAnimating(now: number): boolean {
    return this.duration > 0 && now - this.start < this.duration;
  }

  /** `heights` is row-major [z][x] in world units; `colors` packed RGBA8 per vertex. */
  update(xs: Float32Array, zs: Float32Array, heights: Float32Array, colors: Uint32Array, duration: number, now: number, enterFromZero: boolean): void {
    const same = this.cpu && this.cpu.nx === xs.length && this.cpu.nz === zs.length;
    const cur = same ? this.currentHeights(now) : null;
    this.fromHeights = cur ? new Float32Array(cur) : enterFromZero ? new Float32Array(heights.length) : new Float32Array(heights);
    this.fromColors = same && this.cpu ? this.cpu.colors : colors;
    this.cpu = { heights, colors, nx: xs.length, nz: zs.length, xs, zs };
    this.start = now;
    this.duration = duration;
    this.dirty = true;
  }

  private upload(): void {
    const c = this.cpu!;
    const { nx, nz, xs, zs, heights } = c;
    const stride = 9;
    const data = new Float32Array(nx * nz * stride);
    const u32 = new Uint32Array(data.buffer);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const o = k * stride;
        const h = heights[k];
        // Central-difference normal.
        const hl = heights[j * nx + Math.max(0, i - 1)];
        const hr = heights[j * nx + Math.min(nx - 1, i + 1)];
        const hd = heights[Math.max(0, j - 1) * nx + i];
        const hu = heights[Math.min(nz - 1, j + 1) * nx + i];
        const dx = xs[Math.min(nx - 1, i + 1)] - xs[Math.max(0, i - 1)] || 1;
        const dz = zs[Math.min(nz - 1, j + 1)] - zs[Math.max(0, j - 1)] || 1;
        let nxv = -(hr - hl) / dx;
        let nyv = 1;
        let nzv = -(hu - hd) / dz;
        const len = Math.hypot(nxv, nyv, nzv) || 1;
        nxv /= len;
        nyv /= len;
        nzv /= len;
        data[o] = xs[i];
        data[o + 1] = h;
        data[o + 2] = zs[j];
        data[o + 3] = this.fromHeights![k];
        data[o + 4] = nxv;
        data[o + 5] = nyv;
        data[o + 6] = nzv;
        u32[o + 7] = this.fromColors![k] ?? c.colors[k];
        u32[o + 8] = c.colors[k];
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let p = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const cc = a + nx;
        const d = cc + 1;
        idx[p++] = a;
        idx[p++] = cc;
        idx[p++] = b;
        idx[p++] = b;
        idx[p++] = cc;
        idx[p++] = d;
      }
    }
    this.vbo!.write(data);
    this.ibo!.write(idx);
    this.indexCount = idx.length;
    this.dirty = false;
  }

  draw(pass: RenderPass, frame: Frame3D): void {
    if (!this.cpu || this.cpu.nx < 2 || this.cpu.nz < 2) return;
    if (!this.pipeline) {
      this.pipeline = this.device.createPipeline({
        label: 'surface-3d',
        shader: { glsl: { vertex: SURFACE_GLSL_VS, fragment: SURFACE_GLSL_FS }, wgsl: SURFACE_WGSL },
        uniforms: { fields: UNIFORMS_3D },
        topology: 'triangle-list',
        depth: true,
        buffers: [
          {
            name: 'vertex',
            stepMode: 'vertex',
            stride: 36,
            attributes: [
              { name: 'a_pos', location: 0, format: 'float32x4', offset: 0 },
              { name: 'a_normal', location: 1, format: 'float32x3', offset: 16 },
              { name: 'a_colorFrom', location: 2, format: 'unorm8x4', offset: 28 },
              { name: 'a_colorTo', location: 3, format: 'unorm8x4', offset: 32 },
            ],
          },
        ],
      });
      this.uniforms = this.device.createUniforms(this.pipeline.descriptor.uniforms);
      this.vbo = this.device.createBuffer({ usage: 'vertex', byteLength: 1024 });
      this.ibo = this.device.createBuffer({ usage: 'index', byteLength: 1024 });
      this.dirty = true;
    }
    if (this.dirty) this.upload();
    const u = this.uniforms!;
    u.set('hl', [-1, -1, 1, 0]);
    u.set('anim', [this.progress(frame.now), 0, 0, 0]);
    u.set('resolution', [frame.width, frame.height]);
    u.set('dpr', frame.dpr);
    u.set('opacity', this.opacity);
    u.set('viewProj', frame.viewProj);
    u.set('light', frame.light);
    u.set('fadeColor', frame.fadeColor);
    pass.draw({ pipeline: this.pipeline, uniforms: u, vertexBuffers: { vertex: this.vbo! }, indexBuffer: this.ibo!, vertexCount: this.indexCount });
  }

  /** Grid vertex positions at the current animation state (hit testing). */
  vertices(now: number): { xs: Float32Array; zs: Float32Array; heights: Float32Array; nx: number; nz: number } | null {
    const h = this.currentHeights(now);
    if (!this.cpu || !h) return null;
    return { xs: this.cpu.xs, zs: this.cpu.zs, heights: h, nx: this.cpu.nx, nz: this.cpu.nz };
  }

  setDevice(device: GpuDevice): void {
    this.destroy();
    this.device = device;
    this.dirty = true;
  }

  destroy(): void {
    this.pipeline?.destroy();
    this.uniforms?.destroy();
    this.vbo?.destroy();
    this.ibo?.destroy();
    this.pipeline = null;
    this.uniforms = null;
    this.vbo = null;
    this.ibo = null;
  }
}

/* ============================================================== lines (axes, grid, wireframe) */

const LINES_GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec4 a_color;
out vec4 v_color;
void main() {
  v_color = a_color;
  gl_Position = u.viewProj * vec4(a_pos, 1.0);
}
`;

const LINES_GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec4 v_color;
out vec4 outColor;
void main() {
  float a = v_color.a * u.opacity;
  outColor = vec4(v_color.rgb * a, a);
}
`;

const LINES_WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
struct VsOut { @builtin(position) position: vec4f, @location(0) color: vec4f };
@vertex
fn vs_main(@location(0) pos: vec3f, @location(1) color: vec4f) -> VsOut {
  var o: VsOut;
  o.color = color;
  var p = u.viewProj * vec4f(pos, 1.0);
  p.z = (p.z + p.w) * 0.5;
  o.position = p;
  return o;
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  let a = vin.color.a * u.opacity;
  return vec4f(vin.color.rgb * a, a);
}
`;

/** 1px GPU line segments in world space (axes, grid walls, wireframes). */
export class Lines3D {
  private pipeline: GpuPipeline | null = null;
  private uniforms: GpuUniforms | null = null;
  private vbo: GpuBuffer | null = null;
  private count = 0;
  private data = new Float32Array(0);
  private dirty = false;
  opacity = 1;

  constructor(private device: GpuDevice) {}

  /** segments: [x0,y0,z0,x1,y1,z1,...]; colors: packed RGBA8 per segment. */
  set(segments: number[], colors: number[]): void {
    const n = segments.length / 6;
    const out = new Float32Array(n * 2 * 4);
    const u32 = new Uint32Array(out.buffer);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 4;
        out[o] = segments[i * 6 + k * 3];
        out[o + 1] = segments[i * 6 + k * 3 + 1];
        out[o + 2] = segments[i * 6 + k * 3 + 2];
        u32[o + 3] = colors[i];
      }
    }
    this.data = out;
    this.count = n * 2;
    this.dirty = true;
  }

  draw(pass: RenderPass, frame: Frame3D): void {
    if (this.count === 0) return;
    if (!this.pipeline) {
      this.pipeline = this.device.createPipeline({
        label: 'lines-3d',
        shader: { glsl: { vertex: LINES_GLSL_VS, fragment: LINES_GLSL_FS }, wgsl: LINES_WGSL },
        uniforms: { fields: UNIFORMS_3D },
        topology: 'line-list',
        depth: true,
        buffers: [
          {
            name: 'vertex',
            stepMode: 'vertex',
            stride: 16,
            attributes: [
              { name: 'a_pos', location: 0, format: 'float32x3', offset: 0 },
              { name: 'a_color', location: 1, format: 'unorm8x4', offset: 12 },
            ],
          },
        ],
      });
      this.uniforms = this.device.createUniforms(this.pipeline.descriptor.uniforms);
      this.vbo = this.device.createBuffer({ usage: 'vertex', byteLength: 1024 });
      this.dirty = true;
    }
    if (this.dirty) {
      this.vbo!.write(this.data);
      this.dirty = false;
    }
    const u = this.uniforms!;
    u.set('hl', [-1, -1, 1, 0]);
    u.set('anim', [1, 0, 0, 0]);
    u.set('resolution', [frame.width, frame.height]);
    u.set('dpr', frame.dpr);
    u.set('opacity', this.opacity);
    u.set('viewProj', frame.viewProj);
    u.set('light', frame.light);
    u.set('fadeColor', frame.fadeColor);
    pass.draw({ pipeline: this.pipeline, uniforms: u, vertexBuffers: { vertex: this.vbo! }, vertexCount: this.count });
  }

  setDevice(device: GpuDevice): void {
    this.destroy();
    this.device = device;
    this.dirty = true;
  }

  destroy(): void {
    this.pipeline?.destroy();
    this.uniforms?.destroy();
    this.vbo?.destroy();
    this.pipeline = null;
    this.uniforms = null;
    this.vbo = null;
  }
}

/* ============================================================== SDF text (labels) */

const TEXT_UNIFORMS: UniformField[] = [
  { name: 'viewProj', type: 'mat4' },
  { name: 'resolution', type: 'vec2' },
  { name: 'atlasSize', type: 'vec2' },
  { name: 'color', type: 'vec4' },
];

const TEXT_GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec3 a_anchor;
layout(location = 2) in vec4 a_rect;   // x, y, w, h in px relative to the anchor
layout(location = 3) in vec4 a_uv;     // atlas rect in px
out vec2 v_uv;
void main() {
  vec4 clip = u.viewProj * vec4(a_anchor, 1.0);
  vec2 px = a_rect.xy + a_quad * a_rect.zw;
  clip.xy += vec2(px.x, -px.y) * 2.0 / u.resolution * clip.w;
  // Pull labels slightly towards the camera so they win depth ties with grid lines.
  clip.z -= 0.002 * clip.w;
  v_uv = (a_uv.xy + a_quad * a_uv.zw) / u.atlasSize;
  gl_Position = clip;
}
`;

const TEXT_GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
uniform sampler2D u_atlas;
in vec2 v_uv;
out vec4 outColor;
void main() {
  float d = texture(u_atlas, v_uv).r;
  float w = max(fwidth(d) * 0.75, 0.02);
  float a = smoothstep(0.75 - w, 0.75 + w, d) * u.color.a;
  if (a < 0.02) discard;
  outColor = vec4(u.color.rgb * a, a);
}
`;

const TEXT_WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
@group(0) @binding(1) var atlasTex: texture_2d<f32>;
@group(0) @binding(2) var atlasSamp: sampler;
struct VsOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex
fn vs_main(@location(0) quad: vec2f, @location(1) anchor: vec3f, @location(2) rect: vec4f, @location(3) uvRect: vec4f) -> VsOut {
  var o: VsOut;
  var clip = u.viewProj * vec4f(anchor, 1.0);
  let px = rect.xy + quad * rect.zw;
  clip = vec4f(clip.xy + vec2f(px.x, -px.y) * 2.0 / u.resolution * clip.w, clip.z - 0.002 * clip.w, clip.w);
  clip.z = (clip.z + clip.w) * 0.5;
  o.uv = (uvRect.xy + quad * uvRect.zw) / u.atlasSize;
  o.position = clip;
  return o;
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  let d = textureSample(atlasTex, atlasSamp, vin.uv).r;
  let w = max(fwidth(d) * 0.75, 0.02);
  let a = smoothstep(0.75 - w, 0.75 + w, d) * u.color.a;
  if (a < 0.02) { discard; }
  return vec4f(u.color.rgb * a, a);
}
`;

export interface Label3D {
  text: string;
  pos: [number, number, number];
  size?: number;
  align?: 'left' | 'center' | 'right';
  /** Pixel offset applied after projection. */
  dx?: number;
  dy?: number;
}

/** Depth-tested, camera-facing SDF text for 3D axes and annotations. */
export class TextMark3D {
  private pipeline: GpuPipeline | null = null;
  private uniforms: GpuUniforms | null = null;
  private quad: GpuBuffer | null = null;
  private instances: GpuBuffer | null = null;
  private texture: GpuTexture | null = null;
  private textureVersion = -1;
  private count = 0;
  private data = new Float32Array(0);
  private dirty = false;
  color: [number, number, number, number] = [0.4, 0.4, 0.45, 1];

  constructor(private device: GpuDevice, private readonly atlas: GlyphAtlas) {}

  set(labels: Label3D[]): void {
    const rows: number[] = [];
    for (const l of labels) {
      const size = l.size ?? 11;
      for (const q of this.atlas.layout(l.text, size, l.align ?? 'center')) {
        rows.push(l.pos[0], l.pos[1], l.pos[2], q.x + (l.dx ?? 0), q.y + (l.dy ?? 0), q.w, q.h, q.glyph.x, q.glyph.y, q.glyph.w, q.glyph.h);
      }
    }
    this.data = new Float32Array(rows);
    this.count = rows.length / 11;
    this.dirty = true;
  }

  draw(pass: RenderPass, frame: Frame3D): void {
    if (!this.count) return;
    if (!this.pipeline) {
      this.pipeline = this.device.createPipeline({
        label: 'text-3d',
        shader: { glsl: { vertex: TEXT_GLSL_VS, fragment: TEXT_GLSL_FS }, wgsl: TEXT_WGSL },
        uniforms: { fields: TEXT_UNIFORMS },
        textures: ['u_atlas'],
        topology: 'triangle-strip',
        depth: true,
        buffers: [
          { name: 'quad', stepMode: 'vertex', stride: 8, attributes: [{ name: 'a_quad', location: 0, format: 'float32x2', offset: 0 }] },
          {
            name: 'instance',
            stepMode: 'instance',
            stride: 44,
            attributes: [
              { name: 'a_anchor', location: 1, format: 'float32x3', offset: 0 },
              { name: 'a_rect', location: 2, format: 'float32x4', offset: 12 },
              { name: 'a_uv', location: 3, format: 'float32x4', offset: 28 },
            ],
          },
        ],
      });
      this.uniforms = this.device.createUniforms(this.pipeline.descriptor.uniforms);
      this.quad = this.device.createBuffer({ usage: 'vertex', data: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]) });
      this.instances = this.device.createBuffer({ usage: 'vertex', byteLength: 1024 });
      this.dirty = true;
    }
    if (this.textureVersion !== this.atlas.version || !this.texture) {
      this.texture?.destroy();
      this.texture = this.device.createTexture({ width: this.atlas.width, height: this.atlas.height, format: 'r8unorm', data: this.atlas.data });
      this.textureVersion = this.atlas.version;
    }
    if (this.dirty) {
      this.instances!.write(this.data);
      this.dirty = false;
    }
    const u = this.uniforms!;
    u.set('viewProj', frame.viewProj);
    u.set('resolution', [frame.width, frame.height]);
    u.set('atlasSize', [this.atlas.width, this.atlas.height]);
    u.set('color', this.color);
    pass.draw({ pipeline: this.pipeline, uniforms: u, vertexBuffers: { quad: this.quad!, instance: this.instances! }, textures: { u_atlas: this.texture }, vertexCount: 4, instanceCount: this.count });
  }

  setDevice(device: GpuDevice): void {
    this.destroy();
    this.device = device;
    this.textureVersion = -1;
    this.dirty = true;
  }

  destroy(): void {
    this.pipeline?.destroy();
    this.uniforms?.destroy();
    this.quad?.destroy();
    this.instances?.destroy();
    this.texture?.destroy();
    this.pipeline = null;
    this.uniforms = null;
    this.quad = null;
    this.instances = null;
    this.texture = null;
  }
}
