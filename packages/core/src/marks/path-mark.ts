import type { GpuBuffer, GpuDevice, GpuPipeline, GpuUniforms, PipelineDescriptor, RenderPass } from '@rsc-gl/gpu';
import { UNIFORMS_TOKEN } from '@rsc-gl/gpu';
import { EASING_ID, ease, type TransitionOptions } from '../animation/easing';
import type { FrameState } from './instance-mark';
import { nextId, num, paint, polyline } from '../svg/svg';

/** A vertex of a path-like mark (line / area). */
export interface PathPoint {
  key: string;
  x: number;
  y: number;
  /** Baseline for areas (ignored by lines). */
  y0?: number;
  /** false creates a gap. */
  defined?: boolean;
  /** Use the alternate dash pattern from this point to the next (e.g. forecast segments). */
  alternate?: boolean;
}

interface Pos {
  x: number;
  y: number;
  y0: number;
}

/**
 * Keyed point-sequence transitions shared by lines and areas. New points
 * appear on the previous path (interpolated by x) so inserting data morphs
 * the shape instead of popping.
 */
class PathState {
  points: PathPoint[] = [];
  from: Pos[] = [];
  start = 0;
  transition: TransitionOptions = { duration: 0, easing: 'linear', stagger: 0 };

  progress(now: number): number {
    const d = this.transition.duration;
    if (d <= 0) return 1;
    return ease(Math.min(1, Math.max(0, (now - this.start) / d)), EASING_ID[this.transition.easing]);
  }

  rawProgress(now: number): number {
    const d = this.transition.duration;
    return d <= 0 ? 1 : Math.min(1, Math.max(0, (now - this.start) / d));
  }

  current(now: number): Pos[] {
    const t = this.progress(now);
    return this.points.map((p, i) => {
      const f = this.from[i];
      const y0 = p.y0 ?? 0;
      return { x: f.x + (p.x - f.x) * t, y: f.y + (p.y - f.y) * t, y0: f.y0 + (y0 - f.y0) * t };
    });
  }

  update(points: PathPoint[], transition: TransitionOptions, now: number, enter?: (p: PathPoint) => Pos): void {
    const prevPoints = this.points;
    const prev = this.current(now);
    const byKey = new Map<string, Pos>();
    prevPoints.forEach((p, i) => byKey.set(p.key, prev[i]));
    const sorted = prev.map((p, i) => ({ ...p, ok: prevPoints[i].defined !== false })).filter((p) => p.ok).sort((a, b) => a.x - b.x);
    const along = (x: number): Pos | null => {
      if (sorted.length === 0) return null;
      if (x <= sorted[0].x) return { ...sorted[0], x };
      if (x >= sorted[sorted.length - 1].x) return { ...sorted[sorted.length - 1], x };
      let lo = 0;
      let hi = sorted.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid].x <= x) lo = mid;
        else hi = mid;
      }
      const a = sorted[lo];
      const b = sorted[hi];
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return { x, y: a.y + (b.y - a.y) * t, y0: a.y0 + (b.y0 - a.y0) * t };
    };
    this.from = points.map((p) => byKey.get(p.key) ?? along(p.x) ?? enter?.(p) ?? { x: p.x, y: p.y, y0: p.y0 ?? 0 });
    this.points = points;
    this.transition = transition;
    this.start = now;
  }

  isAnimating(now: number): boolean {
    return this.transition.duration > 0 && now - this.start < this.transition.duration;
  }
}

export interface LineStyle {
  color: [number, number, number, number];
  width: number;
  /** Dash pattern [dash, gap, dash, gap] in px. Empty / zeros = solid. */
  dash: number[];
  /** Pattern used for points flagged `alternate`. */
  alternateDash: number[];
  opacity: number;
}

/** Horizontal reveal (draw-in) + clip rectangle in CSS px. */
export interface PathClip {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const POINT_FLOATS = 6; // x y fx fy dist flags

const LINE_GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec4 a_p0;
layout(location = 2) in vec2 a_m0;
layout(location = 3) in vec4 a_p1;
layout(location = 4) in vec2 a_m1;
layout(location = 5) in vec4 a_p2;
layout(location = 6) in vec2 a_m2;
layout(location = 7) in vec4 a_p3;
layout(location = 8) in vec2 a_m3;
out vec2 v_local;
out float v_len;
out float v_dist;
out vec4 v_clipA;
out vec4 v_clipB;
out vec2 v_px;
flat out float v_alt;
vec2 toClip(vec2 px) { return vec2(px.x / u.resolution.x * 2.0 - 1.0, 1.0 - px.y / u.resolution.y * 2.0); }
float flagBit(float f, float b) { return mod(floor(f / b), 2.0); }
void main() {
  float t = u.anim.x;
  vec2 P0 = mix(a_p0.zw, a_p0.xy, t);
  vec2 A = mix(a_p1.zw, a_p1.xy, t);
  vec2 B = mix(a_p2.zw, a_p2.xy, t);
  vec2 P3 = mix(a_p3.zw, a_p3.xy, t);
  float valid = flagBit(a_m1.y, 1.0) * flagBit(a_m2.y, 1.0);
  vec2 d = B - A;
  float len = length(d);
  vec2 dir = len > 0.0001 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw = u.line.x * 0.5 + 1.0 / u.dpr;
  float along = mix(-hw, len + hw, a_quad.x);
  float across = mix(-hw, hw, a_quad.y);
  vec2 p = A + dir * along + nrm * across;
  v_local = vec2(along, across);
  v_len = len;
  v_dist = a_m1.x;
  v_px = p;
  v_alt = flagBit(a_m1.y, 2.0);
  // Join split planes: (point, normal); w = 1 when active.
  vec2 dPrev = A - P0;
  vec2 dNext = P3 - B;
  bool hasPrev = flagBit(a_m0.y, 1.0) > 0.5 && length(dPrev) > 0.0001;
  bool hasNext = flagBit(a_m3.y, 1.0) > 0.5 && length(dNext) > 0.0001;
  vec2 tA = hasPrev ? normalize(dPrev) + dir : vec2(0.0);
  vec2 tB = hasNext ? dir + normalize(dNext) : vec2(0.0);
  v_clipA = vec4(A, length(tA) > 0.001 ? normalize(tA) : vec2(0.0));
  v_clipB = vec4(B, length(tB) > 0.001 ? normalize(tB) : vec2(0.0));
  gl_Position = valid > 0.5 ? vec4(toClip(p), 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const LINE_GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec2 v_local;
in float v_len;
in float v_dist;
in vec4 v_clipA;
in vec4 v_clipB;
in vec2 v_px;
flat in float v_alt;
out vec4 outColor;
float dashCoverage(float s, vec4 pat) {
  float total = pat.x + pat.y + pat.z + pat.w;
  if (total <= 0.0) return 1.0;
  float m = mod(s, total);
  float aa = 0.5 / u.dpr;
  float c1 = clamp(min(m, pat.x - m) / aa + 0.5, 0.0, 1.0);
  float m2 = m - pat.x - pat.y;
  float c2 = pat.z > 0.0 ? clamp(min(m2, pat.z - m2) / aa + 0.5, 0.0, 1.0) : 0.0;
  return max(c1, c2);
}
void main() {
  if (v_px.x < u.clip.x || v_px.x > u.clip.y || v_px.y < u.clip.z || v_px.y > u.clip.w) discard;
  if (dot(v_clipA.zw, v_clipA.zw) > 0.0 && dot(v_px - v_clipA.xy, v_clipA.zw) < 0.0) discard;
  if (dot(v_clipB.zw, v_clipB.zw) > 0.0 && dot(v_px - v_clipB.xy, v_clipB.zw) >= 0.0) discard;
  float ax = max(max(-v_local.x, v_local.x - v_len), 0.0);
  float d = length(vec2(ax, v_local.y)) - u.line.x * 0.5;
  float cov = clamp(0.5 - d * u.dpr, 0.0, 1.0);
  float s = v_dist + clamp(v_local.x, 0.0, v_len);
  cov *= dashCoverage(s, v_alt > 0.5 ? u.altDash : u.dash);
  float a = u.color.a * u.opacity * cov;
  outColor = vec4(u.color.rgb * a, a);
  if (outColor.a <= 0.0) discard;
}
`;

const LINE_WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) segLen: f32,
  @location(2) dist: f32,
  @location(3) clipA: vec4f,
  @location(4) clipB: vec4f,
  @location(5) px: vec2f,
  @location(6) @interpolate(flat) alt: f32,
};
fn toClip(px: vec2f) -> vec2f { return vec2f(px.x / u.resolution.x * 2.0 - 1.0, 1.0 - px.y / u.resolution.y * 2.0); }
fn flagBit(f: f32, b: f32) -> f32 { return floor(f / b) % 2.0; }
@vertex
fn vs_main(
  @location(0) quad: vec2f,
  @location(1) p0: vec4f, @location(2) m0: vec2f,
  @location(3) p1: vec4f, @location(4) m1: vec2f,
  @location(5) p2: vec4f, @location(6) m2: vec2f,
  @location(7) p3: vec4f, @location(8) m3: vec2f,
) -> VsOut {
  var o: VsOut;
  let t = u.anim.x;
  let P0 = mix(p0.zw, p0.xy, t);
  let A = mix(p1.zw, p1.xy, t);
  let B = mix(p2.zw, p2.xy, t);
  let P3 = mix(p3.zw, p3.xy, t);
  let valid = flagBit(m1.y, 1.0) * flagBit(m2.y, 1.0);
  let d = B - A;
  let len = length(d);
  let dir = select(vec2f(1.0, 0.0), d / max(len, 0.0001), len > 0.0001);
  let nrm = vec2f(-dir.y, dir.x);
  let hw = u.line.x * 0.5 + 1.0 / u.dpr;
  let along = mix(-hw, len + hw, quad.x);
  let across = mix(-hw, hw, quad.y);
  let p = A + dir * along + nrm * across;
  o.localPos = vec2f(along, across);
  o.segLen = len;
  o.dist = m1.x;
  o.px = p;
  o.alt = flagBit(m1.y, 2.0);
  let dPrev = A - P0;
  let dNext = P3 - B;
  let hasPrev = flagBit(m0.y, 1.0) > 0.5 && length(dPrev) > 0.0001;
  let hasNext = flagBit(m3.y, 1.0) > 0.5 && length(dNext) > 0.0001;
  let tA = select(vec2f(0.0), normalize(dPrev + vec2f(1e-9)) + dir, hasPrev);
  let tB = select(vec2f(0.0), dir + normalize(dNext + vec2f(1e-9)), hasNext);
  o.clipA = vec4f(A, select(vec2f(0.0), tA / max(length(tA), 1e-6), length(tA) > 0.001));
  o.clipB = vec4f(B, select(vec2f(0.0), tB / max(length(tB), 1e-6), length(tB) > 0.001));
  o.position = select(vec4f(2.0, 2.0, 2.0, 1.0), vec4f(toClip(p), 0.0, 1.0), valid > 0.5);
  return o;
}
fn dashCoverage(s: f32, pat: vec4f) -> f32 {
  let total = pat.x + pat.y + pat.z + pat.w;
  if (total <= 0.0) { return 1.0; }
  let m = s - total * floor(s / total);
  let aa = 0.5 / u.dpr;
  let c1 = clamp(min(m, pat.x - m) / aa + 0.5, 0.0, 1.0);
  let m2 = m - pat.x - pat.y;
  let c2 = select(0.0, clamp(min(m2, pat.z - m2) / aa + 0.5, 0.0, 1.0), pat.z > 0.0);
  return max(c1, c2);
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  if (vin.px.x < u.clip.x || vin.px.x > u.clip.y || vin.px.y < u.clip.z || vin.px.y > u.clip.w) { discard; }
  if (dot(vin.clipA.zw, vin.clipA.zw) > 0.0 && dot(vin.px - vin.clipA.xy, vin.clipA.zw) < 0.0) { discard; }
  if (dot(vin.clipB.zw, vin.clipB.zw) > 0.0 && dot(vin.px - vin.clipB.xy, vin.clipB.zw) >= 0.0) { discard; }
  let ax = max(max(-vin.localPos.x, vin.localPos.x - vin.segLen), 0.0);
  let d = length(vec2f(ax, vin.localPos.y)) - u.line.x * 0.5;
  var cov = clamp(0.5 - d * u.dpr, 0.0, 1.0);
  let s = vin.dist + clamp(vin.localPos.x, 0.0, vin.segLen);
  cov *= dashCoverage(s, select(u.dash, u.altDash, vin.alt > 0.5));
  let a = u.color.a * u.opacity * cov;
  if (a <= 0.0) { discard; }
  return vec4f(u.color.rgb * a, a);
}
`;

const LINE_LAYOUT = {
  fields: [
    { name: 'anim', type: 'vec4' as const },
    { name: 'resolution', type: 'vec2' as const },
    { name: 'dpr', type: 'f32' as const },
    { name: 'opacity', type: 'f32' as const },
    { name: 'color', type: 'vec4' as const },
    // x: width
    { name: 'line', type: 'vec4' as const },
    { name: 'dash', type: 'vec4' as const },
    { name: 'altDash', type: 'vec4' as const },
    // x0, x1, y0, y1
    { name: 'clip', type: 'vec4' as const },
  ],
};

const toVec4 = (d: number[]): [number, number, number, number] => {
  if (!d || d.length === 0) return [0, 0, 0, 0];
  const v = d.length % 2 === 1 ? [...d, ...d] : d;
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0];
};

/** Shared plumbing for path marks. */
abstract class PathMarkBase {
  protected state = new PathState();
  protected pipeline: GpuPipeline | null = null;
  protected uniforms: GpuUniforms | null = null;
  protected buffer: GpuBuffer | null = null;
  protected dirty = true;
  protected cpu = new Float32Array(0);
  clip: PathClip = { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 };

  constructor(protected device: GpuDevice) {}

  update(points: PathPoint[], transition: TransitionOptions, now: number, enter?: (p: PathPoint) => { x: number; y: number; y0: number }): void {
    this.state.update(points, transition, now, enter);
    this.dirty = true;
  }

  get points(): PathPoint[] {
    return this.state.points;
  }

  /** On-screen positions (accounts for running transitions). */
  current(now: number) {
    return this.state.current(now);
  }

  isAnimating(now: number): boolean {
    return this.state.isAnimating(now);
  }

  /** Eased transition progress, 0..1 (1 when idle). */
  progress(now: number): number {
    return this.state.progress(now);
  }

  protected abstract descriptor(): PipelineDescriptor;

  protected ensure(): void {
    if (this.pipeline) return;
    this.pipeline = this.device.createPipeline(this.descriptor());
    this.uniforms = this.device.createUniforms(this.pipeline.descriptor.uniforms);
    this.buffer = this.device.createBuffer({ usage: 'vertex', byteLength: 1024 });
    this.onCreate();
  }

  protected onCreate(): void {}

  releaseGpu(): void {
    this.pipeline?.destroy();
    this.uniforms?.destroy();
    this.buffer?.destroy();
    this.pipeline = null;
    this.uniforms = null;
    this.buffer = null;
    this.dirty = true;
  }

  setDevice(device: GpuDevice): void {
    this.releaseGpu();
    this.device = device;
  }

  destroy(): void {
    this.releaseGpu();
  }
}

export class LineMark extends PathMarkBase {
  style: LineStyle = { color: [0, 0, 0, 1], width: 2, dash: [], alternateDash: [2, 3], opacity: 1 };

  /** Vector export: one path per run of defined points (split where the dash style changes). */
  toSvg(now: number, fade = 1): string {
    const pts = this.state.points;
    if (pts.length < 2) return '';
    const cur = this.state.current(now);
    const out: string[] = [];
    let run: { x: number; y: number }[] = [];
    let alt = false;
    const flush = () => {
      if (run.length > 1) {
        const dash = alt ? this.style.alternateDash : this.style.dash;
        out.push(
          `<path d="${polyline(run)}" fill="none" ${paint('stroke', this.style.color, this.style.opacity * fade)} stroke-width="${num(this.style.width)}" stroke-linecap="round" stroke-linejoin="round"${dash.length ? ` stroke-dasharray="${dash.join(' ')}"` : ''}/>`,
        );
      }
      run = [];
    };
    pts.forEach((p, i) => {
      if (p.defined === false) return flush();
      if (run.length && !!p.alternate !== alt) {
        run.push({ x: cur[i].x, y: cur[i].y });
        flush();
      }
      alt = !!p.alternate;
      run.push({ x: cur[i].x, y: cur[i].y });
    });
    flush();
    return out.join('');
  }
  private quad: GpuBuffer | null = null;
  private segmentCount = 0;

  protected descriptor(): PipelineDescriptor {
    const stride = POINT_FLOATS * 4;
    // Four bindings of the same buffer, offset by one record each: instance i
    // reads (prev, A, B, next) = rows i..i+3. Attribute offsets stay within
    // the stride, as WebGPU requires.
    const slots = [0, 1, 2, 3].map((k) => ({
      name: `seg${k}`,
      stepMode: 'instance' as const,
      stride,
      attributes: [
        { name: `a_p${k}`, location: 1 + k * 2, format: 'float32x4' as const, offset: 0 },
        { name: `a_m${k}`, location: 2 + k * 2, format: 'float32x2' as const, offset: 16 },
      ],
    }));
    return {
      label: 'line-mark',
      shader: { glsl: { vertex: LINE_GLSL_VS, fragment: LINE_GLSL_FS }, wgsl: LINE_WGSL },
      uniforms: LINE_LAYOUT,
      topology: 'triangle-strip',
      buffers: [
        { name: 'quad', stepMode: 'vertex', stride: 8, attributes: [{ name: 'a_quad', location: 0, format: 'float32x2', offset: 0 }] },
        ...slots,
      ],
    };
  }

  protected override onCreate(): void {
    this.quad = this.device.createBuffer({ usage: 'vertex', data: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]) });
  }

  override releaseGpu(): void {
    this.quad?.destroy();
    this.quad = null;
    super.releaseGpu();
  }

  private upload(): void {
    const pts = this.state.points;
    const from = this.state.from;
    // [pad, p0..pn-1, pad, pad]: instance i reads (prev, A, B, next) = rows i..i+3.
    const rows = pts.length + 3;
    if (this.cpu.length < rows * POINT_FLOATS) this.cpu = new Float32Array(Math.ceil(rows * 1.25) * POINT_FLOATS);
    const f = this.cpu;
    f.fill(0, 0, rows * POINT_FLOATS);
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const o = (i + 1) * POINT_FLOATS;
      const defined = p.defined !== false && Number.isFinite(p.x) && Number.isFinite(p.y);
      if (i > 0 && defined && pts[i - 1].defined !== false) dist += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      f[o] = p.x;
      f[o + 1] = p.y;
      f[o + 2] = from[i].x;
      f[o + 3] = from[i].y;
      f[o + 4] = dist;
      f[o + 5] = (defined ? 1 : 0) + (p.alternate ? 2 : 0);
    }
    this.segmentCount = Math.max(0, pts.length - 1);
    this.buffer!.write(f.subarray(0, rows * POINT_FLOATS));
    this.dirty = false;
  }

  draw(pass: RenderPass, frame: FrameState, fade = 1): void {
    if (this.state.points.length < 2) return;
    this.ensure();
    if (this.dirty) this.upload();
    const u = this.uniforms!;
    u.set('anim', [this.state.progress(frame.now), 0, 0, 0]);
    u.set('resolution', [frame.width, frame.height]);
    u.set('dpr', frame.dpr);
    u.set('opacity', this.style.opacity * fade);
    u.set('color', this.style.color);
    u.set('line', [this.style.width, 0, 0, 0]);
    u.set('dash', toVec4(this.style.dash));
    u.set('altDash', toVec4(this.style.alternateDash));
    u.set('clip', [this.clip.x0, this.clip.x1, this.clip.y0, this.clip.y1]);
    pass.draw({
      pipeline: this.pipeline!,
      uniforms: u,
      vertexBuffers: { quad: this.quad!, seg0: this.buffer!, seg1: this.buffer!, seg2: this.buffer!, seg3: this.buffer! },
      vertexBufferOffsets: { seg1: POINT_FLOATS * 4, seg2: POINT_FLOATS * 8, seg3: POINT_FLOATS * 12 },
      vertexCount: 4,
      instanceCount: this.segmentCount,
    });
  }
}

const AREA_GLSL_VS = /* glsl */ `
${UNIFORMS_TOKEN}
layout(location = 0) in vec4 a_pos;
out vec2 v_px;
void main() {
  vec2 p = mix(a_pos.zw, a_pos.xy, u.anim.x);
  v_px = p;
  gl_Position = vec4(p.x / u.resolution.x * 2.0 - 1.0, 1.0 - p.y / u.resolution.y * 2.0, 0.0, 1.0);
}
`;

const AREA_GLSL_FS = /* glsl */ `
${UNIFORMS_TOKEN}
in vec2 v_px;
out vec4 outColor;
void main() {
  if (v_px.x < u.clip.x || v_px.x > u.clip.y || v_px.y < u.clip.z || v_px.y > u.clip.w) discard;
  float g = clamp((v_px.y - u.gradient.x) / max(u.gradient.y - u.gradient.x, 1.0), 0.0, 1.0);
  vec4 c = mix(u.color, u.color2, g);
  float a = c.a * u.opacity;
  outColor = vec4(c.rgb * a, a);
}
`;

const AREA_WGSL = /* wgsl */ `
${UNIFORMS_TOKEN}
struct VsOut { @builtin(position) position: vec4f, @location(0) px: vec2f };
@vertex
fn vs_main(@location(0) pos: vec4f) -> VsOut {
  var o: VsOut;
  let p = mix(pos.zw, pos.xy, u.anim.x);
  o.px = p;
  o.position = vec4f(p.x / u.resolution.x * 2.0 - 1.0, 1.0 - p.y / u.resolution.y * 2.0, 0.0, 1.0);
  return o;
}
@fragment
fn fs_main(vin: VsOut) -> @location(0) vec4f {
  if (vin.px.x < u.clip.x || vin.px.x > u.clip.y || vin.px.y < u.clip.z || vin.px.y > u.clip.w) { discard; }
  let g = clamp((vin.px.y - u.gradient.x) / max(u.gradient.y - u.gradient.x, 1.0), 0.0, 1.0);
  let c = mix(u.color, u.color2, g);
  let a = c.a * u.opacity;
  return vec4f(c.rgb * a, a);
}
`;

const AREA_LAYOUT = {
  fields: [
    { name: 'anim', type: 'vec4' as const },
    { name: 'resolution', type: 'vec2' as const },
    { name: 'dpr', type: 'f32' as const },
    { name: 'opacity', type: 'f32' as const },
    { name: 'color', type: 'vec4' as const },
    { name: 'color2', type: 'vec4' as const },
    // x: gradient start y (px), y: gradient end y (px)
    { name: 'gradient', type: 'vec4' as const },
    { name: 'clip', type: 'vec4' as const },
  ],
};

export interface AreaStyle {
  color: [number, number, number, number];
  /** Bottom color for a vertical gradient. Defaults to `color`. */
  color2?: [number, number, number, number];
  gradientY?: [number, number];
  opacity: number;
}

export class AreaMark extends PathMarkBase {
  style: AreaStyle = { color: [0, 0, 0, 0.5], opacity: 1 };

  toSvg(now: number, fade = 1): string {
    const pts = this.state.points;
    if (pts.length < 2) return '';
    const cur = this.state.current(now);
    let fill = paint('fill', this.style.color, this.style.opacity * fade);
    let defs = '';
    if (this.style.color2) {
      const id = nextId('rgl-g');
      const [y0, y1] = this.style.gradientY ?? [0, 1];
      const stop = (c: readonly number[], off: number) =>
        `<stop offset="${off}" stop-color="rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})" stop-opacity="${num((c[3] ?? 1) * this.style.opacity * fade)}"/>`;
      defs = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${num(y0)}" x2="0" y2="${num(y1)}">${stop(this.style.color, 0)}${stop(this.style.color2, 1)}</linearGradient></defs>`;
      fill = `fill="url(#${id})"`;
    }
    const out: string[] = [];
    let run: number[] = [];
    const flush = () => {
      if (run.length > 1) {
        const top = run.map((i) => ({ x: cur[i].x, y: cur[i].y }));
        const bottom = run.map((i) => ({ x: cur[i].x, y: cur[i].y0 })).reverse();
        out.push(`<path d="${polyline([...top, ...bottom])}Z" ${fill}/>`);
      }
      run = [];
    };
    pts.forEach((p, i) => (p.defined === false ? flush() : run.push(i)));
    flush();
    return defs + out.join('');
  }
  private runs: Array<[number, number]> = [];

  protected descriptor(): PipelineDescriptor {
    return {
      label: 'area-mark',
      shader: { glsl: { vertex: AREA_GLSL_VS, fragment: AREA_GLSL_FS }, wgsl: AREA_WGSL },
      uniforms: AREA_LAYOUT,
      topology: 'triangle-strip',
      buffers: [{ name: 'vertex', stepMode: 'vertex', stride: 16, attributes: [{ name: 'a_pos', location: 0, format: 'float32x4', offset: 0 }] }],
    };
  }

  private upload(): void {
    const pts = this.state.points;
    const from = this.state.from;
    const n = pts.length * 2;
    if (this.cpu.length < n * 4) this.cpu = new Float32Array(Math.ceil(n * 1.25) * 4);
    const f = this.cpu;
    this.runs = [];
    let runStart = -1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const ok = p.defined !== false && Number.isFinite(p.y) && Number.isFinite(p.y0 ?? 0);
      const o = i * 8;
      f[o] = p.x;
      f[o + 1] = p.y;
      f[o + 2] = from[i].x;
      f[o + 3] = from[i].y;
      f[o + 4] = p.x;
      f[o + 5] = p.y0 ?? 0;
      f[o + 6] = from[i].x;
      f[o + 7] = from[i].y0;
      if (ok && runStart < 0) runStart = i;
      if ((!ok || i === pts.length - 1) && runStart >= 0) {
        const end = ok ? i : i - 1;
        if (end > runStart) this.runs.push([runStart * 2, (end - runStart + 1) * 2]);
        runStart = -1;
      }
    }
    if (n > 0) this.buffer!.write(f.subarray(0, n * 4));
    this.dirty = false;
  }

  draw(pass: RenderPass, frame: FrameState, fade = 1): void {
    if (this.state.points.length < 2) return;
    this.ensure();
    if (this.dirty) this.upload();
    const u = this.uniforms!;
    u.set('anim', [this.state.progress(frame.now), 0, 0, 0]);
    u.set('resolution', [frame.width, frame.height]);
    u.set('dpr', frame.dpr);
    u.set('opacity', this.style.opacity * fade);
    u.set('color', this.style.color);
    u.set('color2', this.style.color2 ?? this.style.color);
    u.set('gradient', [this.style.gradientY?.[0] ?? 0, this.style.gradientY?.[1] ?? 1, 0, 0]);
    u.set('clip', [this.clip.x0, this.clip.x1, this.clip.y0, this.clip.y1]);
    for (const [first, count] of this.runs) {
      pass.draw({ pipeline: this.pipeline!, uniforms: u, vertexBuffers: { vertex: this.buffer! }, vertexCount: count, firstVertex: first });
    }
  }
}
