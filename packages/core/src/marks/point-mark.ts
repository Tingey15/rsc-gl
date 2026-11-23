import type { GpuUniforms, PipelineDescriptor } from '@rsc-gl/gpu';
import { UNIFORMS_TOKEN } from '@rsc-gl/gpu';
import { COMMON_UNIFORMS, GLSL_LIB, WGSL_LIB } from './shader-lib';
import { paint, symbolPath } from '../svg/svg';
import { InstanceMark, QUAD_LAYOUT, lerpColor, lerpN, packColor, type AttributeSpec, type FrameState } from './instance-mark';

export const SYMBOL_SHAPES = ['circle', 'square', 'rounded-square', 'diamond', 'triangle-up', 'triangle-down', 'cross', 'triangle-right'] as const;
export type SymbolShape = (typeof SYMBOL_SHAPES)[number];
export const symbolShapeId = (s: SymbolShape | undefined): number => Math.max(0, SYMBOL_SHAPES.indexOf(s ?? 'circle'));

export interface PointAttrs {
  x: number;
  y: number;
  /** Diameter in CSS px. */
  size: number;
  color: [number, number, number, number];
  strokeColor: [number, number, number, number];
  shape: number;
}

// from(3) to(3) colorFrom colorTo stroke key(2) delay shape = 13
const STRIDE = 13;

const attributes: AttributeSpec<PointAttrs> = {
  floatsPerInstance: STRIDE,
  write(f, u, o, a, b, item, delay) {
    f[o] = a.x;
    f[o + 1] = a.y;
    f[o + 2] = a.size;
    f[o + 3] = b.x;
    f[o + 4] = b.y;
    f[o + 5] = b.size;
    u[o + 6] = packColor(a.color);
    u[o + 7] = packColor(b.color);
    u[o + 8] = packColor(b.strokeColor);
    f[o + 9] = item.seriesIndex;
    f[o + 10] = item.dataIndex;
    f[o + 11] = delay;
    f[o + 12] = b.shape;
  },
  lerp(a, b, t) {
    return { x: lerpN(a.x, b.x, t), y: lerpN(a.y, b.y, t), size: lerpN(a.size, b.size, t), color: lerpColor(a.color, b.color, t), strokeColor: b.strokeColor, shape: b.shape };
  },
  faded(v) {
    return { ...v, size: 0, color: [v.color[0], v.color[1], v.color[2], 0] };
  },
};

const GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
${GLSL_LIB}
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec3 a_from;
layout(location = 2) in vec3 a_to;
layout(location = 3) in vec4 a_colorFrom;
layout(location = 4) in vec4 a_colorTo;
layout(location = 5) in vec4 a_stroke;
layout(location = 6) in vec2 a_key;
layout(location = 7) in float a_delay;
layout(location = 8) in float a_shape;
out vec2 v_local;
out float v_radius;
out vec4 v_color;
out vec4 v_stroke;
flat out float v_shape;
void main() {
  float t = localT(a_delay);
  vec3 s = mix(a_from, a_to, t);
  vec4 c = mix(a_colorFrom, a_colorTo, t);
  float m = hlMatch(a_key);
  float radius = max(0.0, s.z * 0.5 + m * u.hover.x);
  float ext = radius + u.style.x + 1.5 / u.dpr;
  vec2 p = s.xy + (a_quad * 2.0 - 1.0) * ext;
  v_local = p - s.xy;
  v_radius = radius;
  float fade = fadeFor(a_key) * u.opacity;
  v_color = vec4(c.rgb, c.a * fade);
  v_stroke = vec4(a_stroke.rgb, a_stroke.a * fade);
  v_shape = a_shape;
  gl_Position = vec4(toClip(p), 0.0, 1.0);
}
`;

const GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec2 v_local;
in float v_radius;
in vec4 v_color;
in vec4 v_stroke;
flat in float v_shape;
out vec4 outColor;
float sdBox(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float sdTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float shapeSdf(vec2 p, float r, float shape) {
  if (shape < 0.5) return length(p) - r;
  if (shape < 1.5) return sdBox(p, vec2(r * 0.9));
  if (shape < 2.5) return sdBox(p, vec2(r * 0.9 - r * 0.3)) - r * 0.3;
  if (shape < 3.5) return (abs(p.x) + abs(p.y) - r) * 0.70710678;
  if (shape < 4.5) return sdTri(vec2(p.x, -p.y + r * 0.15), r * 1.05);
  if (shape < 5.5) return sdTri(vec2(p.x, p.y + r * 0.15), r * 1.05);
  if (shape < 6.5) return min(sdBox(p, vec2(r, r * 0.3)), sdBox(p, vec2(r * 0.3, r)));
  return sdTri(vec2(p.y, p.x + r * 0.15), r * 1.05);
}
void main() {
  float d = shapeSdf(v_local, v_radius, v_shape);
  float sw = u.style.x;
  float outer = clamp(0.5 - (d - sw * 0.5) * u.dpr, 0.0, 1.0);
  float inner = clamp(0.5 - (d + sw * 0.5) * u.dpr, 0.0, 1.0);
  vec4 fill = vec4(v_color.rgb * v_color.a, v_color.a) * inner;
  vec4 stroke = vec4(v_stroke.rgb * v_stroke.a, v_stroke.a) * (outer - inner);
  outColor = fill + stroke * (sw > 0.0 ? 1.0 : 0.0) + (sw > 0.0 ? vec4(0.0) : vec4(v_color.rgb * v_color.a, v_color.a) * (outer - inner));
  if (outColor.a <= 0.0) discard;
}
`;

const WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
${WGSL_LIB}
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) radius: f32,
  @location(2) color: vec4f,
  @location(3) stroke: vec4f,
  @location(4) @interpolate(flat) shape: f32,
};
@vertex
fn vs_main(
  @location(0) quad: vec2f,
  @location(1) pFrom: vec3f,
  @location(2) pTo: vec3f,
  @location(3) colorFrom: vec4f,
  @location(4) colorTo: vec4f,
  @location(5) strokeColor: vec4f,
  @location(6) key: vec2f,
  @location(7) delay: f32,
  @location(8) shape: f32,
) -> VsOut {
  var o: VsOut;
  let t = localT(delay);
  let s = mix(pFrom, pTo, t);
  let c = mix(colorFrom, colorTo, t);
  let m = hlMatch(key);
  let radius = max(0.0, s.z * 0.5 + m * u.hover.x);
  let ext = radius + u.style.x + 1.5 / u.dpr;
  let p = s.xy + (quad * 2.0 - 1.0) * ext;
  o.localPos = p - s.xy;
  o.radius = radius;
  let fade = fadeFor(key) * u.opacity;
  o.color = vec4f(c.rgb, c.a * fade);
  o.stroke = vec4f(strokeColor.rgb, strokeColor.a * fade);
  o.shape = shape;
  o.position = vec4f(toClip(p), 0.0, 1.0);
  return o;
}
fn sdBox(p: vec2f, b: vec2f) -> f32 { let q = abs(p) - b; return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0); }
fn sdTri(p0: vec2f, r: f32) -> f32 {
  let k = 1.7320508;
  var p = vec2f(abs(p0.x) - r, p0.y + r / k);
  if (p.x + k * p.y > 0.0) { p = vec2f(p.x - k * p.y, -k * p.x - p.y) / 2.0; }
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
fn shapeSdf(p: vec2f, r: f32, shape: f32) -> f32 {
  if (shape < 0.5) { return length(p) - r; }
  if (shape < 1.5) { return sdBox(p, vec2f(r * 0.9)); }
  if (shape < 2.5) { return sdBox(p, vec2f(r * 0.9 - r * 0.3)) - r * 0.3; }
  if (shape < 3.5) { return (abs(p.x) + abs(p.y) - r) * 0.70710678; }
  if (shape < 4.5) { return sdTri(vec2f(p.x, -p.y + r * 0.15), r * 1.05); }
  if (shape < 5.5) { return sdTri(vec2f(p.x, p.y + r * 0.15), r * 1.05); }
  if (shape < 6.5) { return min(sdBox(p, vec2f(r, r * 0.3)), sdBox(p, vec2f(r * 0.3, r))); }
  return sdTri(vec2f(p.y, p.x + r * 0.15), r * 1.05);
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  let d = shapeSdf(vin.localPos, vin.radius, vin.shape);
  let sw = u.style.x;
  let outer = clamp(0.5 - (d - sw * 0.5) * u.dpr, 0.0, 1.0);
  let inner = clamp(0.5 - (d + sw * 0.5) * u.dpr, 0.0, 1.0);
  let fill = vec4f(vin.color.rgb * vin.color.a, vin.color.a) * inner;
  let ring = outer - inner;
  var outColor: vec4f;
  if (sw > 0.0) {
    outColor = fill + vec4f(vin.stroke.rgb * vin.stroke.a, vin.stroke.a) * ring;
  } else {
    outColor = fill + vec4f(vin.color.rgb * vin.color.a, vin.color.a) * ring;
  }
  if (outColor.a <= 0.0) { discard; }
  return outColor;
}
`;

const LAYOUT = {
  fields: [
    ...COMMON_UNIFORMS,
    // x: stroke width px
    { name: 'style', type: 'vec4' as const },
    // x: hover grow px (radius)
    { name: 'hover', type: 'vec4' as const },
  ],
};

export class PointMark extends InstanceMark<PointAttrs> {
  protected attributes = attributes;
  strokeWidth = 0;
  hoverGrow = 2;

  protected pipelineDescriptor(): PipelineDescriptor {
    return {
      label: 'point-mark',
      shader: { glsl: { vertex: GLSL_VS, fragment: GLSL_FS }, wgsl: WGSL },
      uniforms: LAYOUT,
      topology: 'triangle-strip',
      buffers: [
        QUAD_LAYOUT,
        {
          name: 'instance',
          stepMode: 'instance',
          stride: STRIDE * 4,
          attributes: [
            { name: 'a_from', location: 1, format: 'float32x3', offset: 0 },
            { name: 'a_to', location: 2, format: 'float32x3', offset: 12 },
            { name: 'a_colorFrom', location: 3, format: 'unorm8x4', offset: 24 },
            { name: 'a_colorTo', location: 4, format: 'unorm8x4', offset: 28 },
            { name: 'a_stroke', location: 5, format: 'unorm8x4', offset: 32 },
            { name: 'a_key', location: 6, format: 'float32x2', offset: 36 },
            { name: 'a_delay', location: 7, format: 'float32', offset: 44 },
            { name: 'a_shape', location: 8, format: 'float32', offset: 48 },
          ],
        },
      ],
    };
  }

  protected setUniforms(u: GpuUniforms, _frame: FrameState): void {
    u.set('style', [this.strokeWidth, 0, 0, 0]);
    u.set('hover', [this.hoverGrow, 0, 0, 0]);
  }

  toSvg(now: number): string {
    return this.snapshot(now)
      .map(({ state: p }) => {
        if (p.size <= 0.01 || p.color[3] + p.strokeColor[3] <= 0.002) return '';
        const stroke = this.strokeWidth > 0 ? ` ${paint('stroke', p.strokeColor)} stroke-width="${this.strokeWidth}"` : '';
        return `<path d="${symbolPath(p.shape, p.x, p.y, p.size)}" ${paint('fill', p.color, this.opacity)}${stroke}/>`;
      })
      .join('');
  }
}

/** Writes one point instance directly (for {@link InstanceMark.updateDirect}). Colors are packed RGBA8. */
export function writePointInstance(
  f: Float32Array,
  u: Uint32Array,
  o: number,
  x: number,
  y: number,
  size: number,
  color: number,
  stroke: number,
  seriesIndex: number,
  dataIndex: number,
  shape: number,
  fromSize = size,
  delay = 0,
): void {
  f[o] = x;
  f[o + 1] = y;
  f[o + 2] = fromSize;
  f[o + 3] = x;
  f[o + 4] = y;
  f[o + 5] = size;
  u[o + 6] = color;
  u[o + 7] = color;
  u[o + 8] = stroke;
  f[o + 9] = seriesIndex;
  f[o + 10] = dataIndex;
  f[o + 11] = delay;
  f[o + 12] = shape;
}
