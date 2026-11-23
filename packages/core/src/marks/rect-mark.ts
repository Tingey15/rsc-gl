import type { GpuUniforms, PipelineDescriptor } from '@rsc-gl/gpu';
import { UNIFORMS_TOKEN } from '@rsc-gl/gpu';
import { COMMON_UNIFORMS, GLSL_LIB, WGSL_LIB } from './shader-lib';
import { paint, roundRectPath } from '../svg/svg';
import { InstanceMark, QUAD_LAYOUT, lerpColor, lerpN, packColor, type AttributeSpec, type FrameState } from './instance-mark';

/**
 * Rectangle with optional rounded corners. Used for bars, heatmap cells,
 * treemap tiles, bullet tracks, legend swatches drawn on the GPU, etc.
 */
export interface RectAttrs {
  x: number;
  y: number;
  width: number;
  height: number;
  color: [number, number, number, number];
  /** Corner radius in CSS px. */
  radius: number;
  /** Bitmask of rounded corners: 1 top-left, 2 top-right, 4 bottom-right, 8 bottom-left. */
  corners: number;
}

// Layout: from(4) to(4) colorFrom(1) colorTo(1) key(2) delay(1) radius(1) corners(1) = 15 floats
const STRIDE = 15;

const attributes: AttributeSpec<RectAttrs> = {
  floatsPerInstance: STRIDE,
  write(f, u, o, a, b, item, delay) {
    f[o] = a.x;
    f[o + 1] = a.y;
    f[o + 2] = a.width;
    f[o + 3] = a.height;
    f[o + 4] = b.x;
    f[o + 5] = b.y;
    f[o + 6] = b.width;
    f[o + 7] = b.height;
    u[o + 8] = packColor(a.color);
    u[o + 9] = packColor(b.color);
    f[o + 10] = item.seriesIndex;
    f[o + 11] = item.dataIndex;
    f[o + 12] = delay;
    f[o + 13] = b.radius;
    f[o + 14] = b.corners;
  },
  lerp(a, b, t) {
    return {
      x: lerpN(a.x, b.x, t),
      y: lerpN(a.y, b.y, t),
      width: lerpN(a.width, b.width, t),
      height: lerpN(a.height, b.height, t),
      color: lerpColor(a.color, b.color, t),
      radius: b.radius,
      corners: b.corners,
    };
  },
  faded(v) {
    return { ...v, color: [v.color[0], v.color[1], v.color[2], 0] };
  },
};

const GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
${GLSL_LIB}
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec4 a_from;
layout(location = 2) in vec4 a_to;
layout(location = 3) in vec4 a_colorFrom;
layout(location = 4) in vec4 a_colorTo;
layout(location = 5) in vec2 a_key;
layout(location = 6) in float a_delay;
layout(location = 7) in vec2 a_radius;
out vec2 v_local;
out vec2 v_half;
out vec4 v_color;
out vec4 v_radii;
void main() {
  float t = localT(a_delay);
  vec4 r = mix(a_from, a_to, t);
  vec4 c = mix(a_colorFrom, a_colorTo, t);
  vec2 pos = r.xy + min(r.zw, vec2(0.0));
  vec2 size = abs(r.zw);
  float m = hlMatch(a_key);
  // Hover lift: grow highlighted items slightly.
  size += m * u.hover.x * 2.0;
  pos -= m * u.hover.x;
  float pad = 1.5 / u.dpr + u.style.x;
  vec2 p = pos - pad + a_quad * (size + 2.0 * pad);
  v_local = p - (pos + size * 0.5);
  v_half = size * 0.5;
  v_color = vec4(c.rgb, c.a * fadeFor(a_key) * u.opacity);
  float rad = min(a_radius.x, min(v_half.x, v_half.y));
  float k = a_radius.y;
  v_radii = vec4(
    mod(k, 2.0) >= 1.0 ? rad : 0.0,
    mod(floor(k / 2.0), 2.0) >= 1.0 ? rad : 0.0,
    mod(floor(k / 4.0), 2.0) >= 1.0 ? rad : 0.0,
    mod(floor(k / 8.0), 2.0) >= 1.0 ? rad : 0.0);
  gl_Position = vec4(toClip(p), 0.0, 1.0);
}
`;

const GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec2 v_local;
in vec2 v_half;
in vec4 v_color;
in vec4 v_radii;
out vec4 outColor;
float sdRoundBox(vec2 p, vec2 b, vec4 r) {
  float rr = p.x > 0.0 ? (p.y > 0.0 ? r.z : r.y) : (p.y > 0.0 ? r.w : r.x);
  vec2 q = abs(p) - b + rr;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rr;
}
void main() {
  float d = sdRoundBox(v_local, v_half, v_radii);
  float total = clamp(0.5 - d * u.dpr, 0.0, 1.0);
  float inner = clamp(0.5 - (d + u.style.x) * u.dpr, 0.0, 1.0);
  vec4 fill = vec4(v_color.rgb * v_color.a, v_color.a) * inner;
  vec4 stroke = vec4(u.stroke.rgb * u.stroke.a, u.stroke.a) * (total - inner) * v_color.a;
  outColor = fill + stroke;
  if (outColor.a <= 0.0) discard;
}
`;

const WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
${WGSL_LIB}
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) halfSize: vec2f,
  @location(2) color: vec4f,
  @location(3) radii: vec4f,
};
@vertex
fn vs_main(
  @location(0) quad: vec2f,
  @location(1) rFrom: vec4f,
  @location(2) rTo: vec4f,
  @location(3) colorFrom: vec4f,
  @location(4) colorTo: vec4f,
  @location(5) key: vec2f,
  @location(6) delay: f32,
  @location(7) radius: vec2f,
) -> VsOut {
  var o: VsOut;
  let t = localT(delay);
  let r = mix(rFrom, rTo, t);
  let c = mix(colorFrom, colorTo, t);
  var pos = r.xy + min(r.zw, vec2f(0.0));
  var size = abs(r.zw);
  let m = hlMatch(key);
  size += m * u.hover.x * 2.0;
  pos -= vec2f(m * u.hover.x);
  let pad = 1.5 / u.dpr + u.style.x;
  let p = pos - vec2f(pad) + quad * (size + 2.0 * pad);
  o.localPos = p - (pos + size * 0.5);
  o.halfSize = size * 0.5;
  o.color = vec4f(c.rgb, c.a * fadeFor(key) * u.opacity);
  let rad = min(radius.x, min(o.halfSize.x, o.halfSize.y));
  let k = radius.y;
  o.radii = vec4f(
    select(0.0, rad, (k % 2.0) >= 1.0),
    select(0.0, rad, (floor(k / 2.0) % 2.0) >= 1.0),
    select(0.0, rad, (floor(k / 4.0) % 2.0) >= 1.0),
    select(0.0, rad, (floor(k / 8.0) % 2.0) >= 1.0));
  o.position = vec4f(toClip(p), 0.0, 1.0);
  return o;
}
fn sdRoundBox(p: vec2f, b: vec2f, r: vec4f) -> f32 {
  let rr = select(select(r.x, r.w, p.y > 0.0), select(r.y, r.z, p.y > 0.0), p.x > 0.0);
  let q = abs(p) - b + rr;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - rr;
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  let d = sdRoundBox(vin.localPos, vin.halfSize, vin.radii);
  let total = clamp(0.5 - d * u.dpr, 0.0, 1.0);
  let inner = clamp(0.5 - (d + u.style.x) * u.dpr, 0.0, 1.0);
  let fill = vec4f(vin.color.rgb * vin.color.a, vin.color.a) * inner;
  let stroke = vec4f(u.stroke.rgb * u.stroke.a, u.stroke.a) * (total - inner) * vin.color.a;
  let outColor = fill + stroke;
  if (outColor.a <= 0.0) { discard; }
  return outColor;
}
`;

const LAYOUT = {
  fields: [
    ...COMMON_UNIFORMS,
    { name: 'stroke', type: 'vec4' as const },
    // x: stroke width (px)
    { name: 'style', type: 'vec4' as const },
    // x: hover grow (px)
    { name: 'hover', type: 'vec4' as const },
  ],
};

export interface RectStyle {
  strokeColor: [number, number, number, number];
  strokeWidth: number;
  hoverGrow: number;
}

export class RectMark extends InstanceMark<RectAttrs> {
  protected attributes = attributes;
  style: RectStyle = { strokeColor: [0, 0, 0, 0], strokeWidth: 0, hoverGrow: 0 };

  protected pipelineDescriptor(): PipelineDescriptor {
    const s = STRIDE * 4;
    return {
      label: 'rect-mark',
      shader: { glsl: { vertex: GLSL_VS, fragment: GLSL_FS }, wgsl: WGSL },
      uniforms: LAYOUT,
      topology: 'triangle-strip',
      blend: 'alpha',
      buffers: [
        QUAD_LAYOUT,
        {
          name: 'instance',
          stepMode: 'instance',
          stride: s,
          attributes: [
            { name: 'a_from', location: 1, format: 'float32x4', offset: 0 },
            { name: 'a_to', location: 2, format: 'float32x4', offset: 16 },
            { name: 'a_colorFrom', location: 3, format: 'unorm8x4', offset: 32 },
            { name: 'a_colorTo', location: 4, format: 'unorm8x4', offset: 36 },
            { name: 'a_key', location: 5, format: 'float32x2', offset: 40 },
            { name: 'a_delay', location: 6, format: 'float32', offset: 48 },
            { name: 'a_radius', location: 7, format: 'float32x2', offset: 52 },
          ],
        },
      ],
    };
  }

  toSvg(now: number): string {
    const sw = this.style.strokeWidth;
    return this.snapshot(now)
      .map(({ state: r }) => {
        if (r.color[3] <= 0.002 || r.width === 0 || r.height === 0) return '';
        const x = Math.min(r.x, r.x + r.width);
        const y = Math.min(r.y, r.y + r.height);
        const w = Math.abs(r.width);
        const h = Math.abs(r.height);
        const rad = Math.min(r.radius, w / 2, h / 2);
        const k = r.corners;
        const radii: [number, number, number, number] = [k & 1 ? rad : 0, k & 2 ? rad : 0, k & 4 ? rad : 0, k & 8 ? rad : 0];
        const stroke = sw > 0 && this.style.strokeColor[3] > 0 ? ` ${paint('stroke', this.style.strokeColor)} stroke-width="${sw}"` : '';
        return `<path d="${roundRectPath(x, y, w, h, radii)}" ${paint('fill', r.color, this.opacity)}${stroke}/>`;
      })
      .join('');
  }

  protected setUniforms(u: GpuUniforms, _frame: FrameState): void {
    u.set('stroke', this.style.strokeColor);
    u.set('style', [this.style.strokeWidth, 0, 0, 0]);
    u.set('hover', [this.style.hoverGrow, 0, 0, 0]);
  }
}
