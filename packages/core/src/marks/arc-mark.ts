import type { GpuUniforms, PipelineDescriptor } from '@rsc-gl/gpu';
import { UNIFORMS_TOKEN } from '@rsc-gl/gpu';
import { COMMON_UNIFORMS, GLSL_LIB, WGSL_LIB } from './shader-lib';
import { arcPath, paint } from '../svg/svg';
import { InstanceMark, QUAD_LAYOUT, lerpColor, lerpN, packColor, type AttributeSpec, type FrameState } from './instance-mark';

/**
 * Annular sector (pie / donut / gauge / radial bar). Angles are in radians,
 * 0 at 12 o'clock, increasing clockwise.
 */
export interface ArcAttrs {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  color: [number, number, number, number];
}

// from(6) to(6) colorFrom colorTo key(2) delay = 17
const STRIDE = 17;

const attributes: AttributeSpec<ArcAttrs> = {
  floatsPerInstance: STRIDE,
  write(f, u, o, a, b, item, delay) {
    f[o] = a.cx;
    f[o + 1] = a.cy;
    f[o + 2] = a.innerRadius;
    f[o + 3] = a.outerRadius;
    f[o + 4] = a.startAngle;
    f[o + 5] = a.endAngle;
    f[o + 6] = b.cx;
    f[o + 7] = b.cy;
    f[o + 8] = b.innerRadius;
    f[o + 9] = b.outerRadius;
    f[o + 10] = b.startAngle;
    f[o + 11] = b.endAngle;
    u[o + 12] = packColor(a.color);
    u[o + 13] = packColor(b.color);
    f[o + 14] = item.seriesIndex;
    f[o + 15] = item.dataIndex;
    f[o + 16] = delay;
  },
  lerp(a, b, t) {
    return {
      cx: lerpN(a.cx, b.cx, t),
      cy: lerpN(a.cy, b.cy, t),
      innerRadius: lerpN(a.innerRadius, b.innerRadius, t),
      outerRadius: lerpN(a.outerRadius, b.outerRadius, t),
      startAngle: lerpN(a.startAngle, b.startAngle, t),
      endAngle: lerpN(a.endAngle, b.endAngle, t),
      color: lerpColor(a.color, b.color, t),
    };
  },
  faded(v) {
    const mid = (v.startAngle + v.endAngle) / 2;
    return { ...v, startAngle: mid, endAngle: mid, color: [v.color[0], v.color[1], v.color[2], 0] };
  },
};

const GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
${GLSL_LIB}
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec3 a_fromA;
layout(location = 2) in vec3 a_fromB;
layout(location = 3) in vec3 a_toA;
layout(location = 4) in vec3 a_toB;
layout(location = 5) in vec4 a_colorFrom;
layout(location = 6) in vec4 a_colorTo;
layout(location = 7) in vec2 a_key;
layout(location = 8) in float a_delay;
out vec2 v_local;
out vec4 v_arc;
out vec4 v_color;
void main() {
  float t = localT(a_delay);
  vec3 A = mix(a_fromA, a_toA, t); // cx, cy, inner
  vec3 B = mix(a_fromB, a_toB, t); // outer, start, end
  vec4 c = mix(a_colorFrom, a_colorTo, t);
  float m = hlMatch(a_key);
  float outer = B.x + m * u.hover.x;
  float ext = outer + 2.0 / u.dpr;
  vec2 p = A.xy + (a_quad * 2.0 - 1.0) * ext;
  v_local = p - A.xy;
  v_arc = vec4(A.z, outer, B.y, B.z);
  v_color = vec4(c.rgb, c.a * fadeFor(a_key) * u.opacity);
  gl_Position = vec4(toClip(p), 0.0, 1.0);
}
`;

const GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec2 v_local;
in vec4 v_arc;
in vec4 v_color;
out vec4 outColor;
const float PI = 3.14159265;
void main() {
  float inner = v_arc.x;
  float outer = v_arc.y;
  float halfA = (v_arc.w - v_arc.z) * 0.5;
  if (halfA <= 0.0) discard;
  float midA = (v_arc.z + v_arc.w) * 0.5;
  float r = length(v_local);
  float a = atan(v_local.x, -v_local.y);
  float da = a - midA;
  da = da - 2.0 * PI * floor((da + PI) / (2.0 * PI));
  float dRad = max(r - outer, inner - r);
  float dAng = halfA >= PI - 0.0001 ? -1e5 : r * sin(clamp(abs(da) - halfA, -PI * 0.5, PI * 0.5)) + u.style.x * 0.5;
  float cr = min(u.style.y, (outer - inner) * 0.5);
  vec2 q = vec2(dRad, dAng) + cr;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - cr;
  float cov = clamp(0.5 - d * u.dpr, 0.0, 1.0);
  outColor = vec4(v_color.rgb * v_color.a, v_color.a) * cov;
  if (outColor.a <= 0.0) discard;
}
`;

const WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
${WGSL_LIB}
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) arc: vec4f,
  @location(2) color: vec4f,
};
@vertex
fn vs_main(
  @location(0) quad: vec2f,
  @location(1) fromA: vec3f,
  @location(2) fromB: vec3f,
  @location(3) toA: vec3f,
  @location(4) toB: vec3f,
  @location(5) colorFrom: vec4f,
  @location(6) colorTo: vec4f,
  @location(7) key: vec2f,
  @location(8) delay: f32,
) -> VsOut {
  var o: VsOut;
  let t = localT(delay);
  let A = mix(fromA, toA, t);
  let B = mix(fromB, toB, t);
  let c = mix(colorFrom, colorTo, t);
  let m = hlMatch(key);
  let outer = B.x + m * u.hover.x;
  let ext = outer + 2.0 / u.dpr;
  let p = A.xy + (quad * 2.0 - 1.0) * ext;
  o.localPos = p - A.xy;
  o.arc = vec4f(A.z, outer, B.y, B.z);
  o.color = vec4f(c.rgb, c.a * fadeFor(key) * u.opacity);
  o.position = vec4f(toClip(p), 0.0, 1.0);
  return o;
}
const PI: f32 = 3.14159265;
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  let inner = vin.arc.x;
  let outer = vin.arc.y;
  let halfA = (vin.arc.w - vin.arc.z) * 0.5;
  if (halfA <= 0.0) { discard; }
  let midA = (vin.arc.z + vin.arc.w) * 0.5;
  let r = length(vin.localPos);
  let a = atan2(vin.localPos.x, -vin.localPos.y);
  var da = a - midA;
  da = da - 2.0 * PI * floor((da + PI) / (2.0 * PI));
  let dRad = max(r - outer, inner - r);
  let dAng = select(r * sin(clamp(abs(da) - halfA, -PI * 0.5, PI * 0.5)) + u.style.x * 0.5, -1e5, halfA >= PI - 0.0001);
  let cr = min(u.style.y, (outer - inner) * 0.5);
  let q = vec2f(dRad, dAng) + cr;
  let d = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - cr;
  let cov = clamp(0.5 - d * u.dpr, 0.0, 1.0);
  let outColor = vec4f(vin.color.rgb * vin.color.a, vin.color.a) * cov;
  if (outColor.a <= 0.0) { discard; }
  return outColor;
}
`;

const LAYOUT = {
  fields: [
    ...COMMON_UNIFORMS,
    // x: pad (px), y: corner radius (px)
    { name: 'style', type: 'vec4' as const },
    // x: hover grow (px)
    { name: 'hover', type: 'vec4' as const },
  ],
};

export class ArcMark extends InstanceMark<ArcAttrs> {
  protected attributes = attributes;
  padding = 1;
  cornerRadius = 0;
  hoverGrow = 6;

  protected pipelineDescriptor(): PipelineDescriptor {
    return {
      label: 'arc-mark',
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
            { name: 'a_fromA', location: 1, format: 'float32x3', offset: 0 },
            { name: 'a_fromB', location: 2, format: 'float32x3', offset: 12 },
            { name: 'a_toA', location: 3, format: 'float32x3', offset: 24 },
            { name: 'a_toB', location: 4, format: 'float32x3', offset: 36 },
            { name: 'a_colorFrom', location: 5, format: 'unorm8x4', offset: 48 },
            { name: 'a_colorTo', location: 6, format: 'unorm8x4', offset: 52 },
            { name: 'a_key', location: 7, format: 'float32x2', offset: 56 },
            { name: 'a_delay', location: 8, format: 'float32', offset: 64 },
          ],
        },
      ],
    };
  }

  toSvg(now: number): string {
    return this.snapshot(now)
      .map(({ state: a }) => (a.color[3] <= 0.002 ? '' : `<path d="${arcPath(a.cx, a.cy, a.innerRadius, a.outerRadius, a.startAngle, a.endAngle, this.padding)}" ${paint('fill', a.color, this.opacity)} fill-rule="evenodd"/>`))
      .join('');
  }

  protected setUniforms(u: GpuUniforms, _frame: FrameState): void {
    u.set('style', [this.padding, this.cornerRadius, 0, 0]);
    u.set('hover', [this.hoverGrow, 0, 0, 0]);
  }
}
