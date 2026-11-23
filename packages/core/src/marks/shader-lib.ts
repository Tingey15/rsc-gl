import type { UniformField } from '@rsc-gl/gpu';

/**
 * Uniform fields shared by every 2D mark. They must come first in each mark's
 * layout so the shared snippets below can reference them.
 *
 * hl         (series, index, fadeAlpha, active)   highlight / fade state
 * anim       (t, easingId, stagger, unused)        transition progress
 * resolution (cssWidth, cssHeight)
 * dpr        device pixel ratio
 * opacity    global mark opacity
 */
export const COMMON_UNIFORMS: UniformField[] = [
  { name: 'hl', type: 'vec4' },
  { name: 'anim', type: 'vec4' },
  { name: 'resolution', type: 'vec2' },
  { name: 'dpr', type: 'f32' },
  { name: 'opacity', type: 'f32' },
];

export const GLSL_LIB = /* glsl */ `
float easeFn(float t, float kind) {
  t = clamp(t, 0.0, 1.0);
  if (kind < 0.5) return t;
  if (kind < 1.5) return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  if (kind < 2.5) return 1.0 - pow(1.0 - t, 3.0);
  if (kind < 3.5) { float c1 = 1.70158; float c3 = c1 + 1.0; return 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0); }
  if (kind < 4.5) { if (t <= 0.0 || t >= 1.0) return t; return pow(2.0, -10.0 * t) * sin((t * 10.0 - 0.75) * 2.0943951) + 1.0; }
  return 1.0 - (1.0 - t) * (1.0 - t);
}
float localT(float delay) {
  float span = max(1.0 - u.anim.z, 0.00001);
  return easeFn(clamp((u.anim.x - delay * u.anim.z) / span, 0.0, 1.0), u.anim.y);
}
float hlMatch(vec2 key) {
  if (u.hl.w < 0.5) return 0.0;
  bool s = abs(key.x - u.hl.x) < 0.5;
  bool i = u.hl.y < 0.0 || abs(key.y - u.hl.y) < 0.5;
  return (s && i) ? 1.0 : 0.0;
}
float fadeFor(vec2 key) {
  if (u.hl.w < 0.5) return 1.0;
  return hlMatch(key) > 0.5 ? 1.0 : u.hl.z;
}
vec2 toClip(vec2 px) {
  return vec2(px.x / u.resolution.x * 2.0 - 1.0, 1.0 - px.y / u.resolution.y * 2.0);
}
`;

export const WGSL_LIB = /* wgsl */ `
fn easeFn(t0: f32, kind: f32) -> f32 {
  let t = clamp(t0, 0.0, 1.0);
  if (kind < 0.5) { return t; }
  if (kind < 1.5) { return select(1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0, 4.0 * t * t * t, t < 0.5); }
  if (kind < 2.5) { return 1.0 - pow(1.0 - t, 3.0); }
  if (kind < 3.5) { let c1 = 1.70158; let c3 = c1 + 1.0; return 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0); }
  if (kind < 4.5) { if (t <= 0.0 || t >= 1.0) { return t; } return pow(2.0, -10.0 * t) * sin((t * 10.0 - 0.75) * 2.0943951) + 1.0; }
  return 1.0 - (1.0 - t) * (1.0 - t);
}
fn localT(delay: f32) -> f32 {
  let span = max(1.0 - u.anim.z, 0.00001);
  return easeFn(clamp((u.anim.x - delay * u.anim.z) / span, 0.0, 1.0), u.anim.y);
}
fn hlMatch(key: vec2f) -> f32 {
  if (u.hl.w < 0.5) { return 0.0; }
  let s = abs(key.x - u.hl.x) < 0.5;
  let i = u.hl.y < 0.0 || abs(key.y - u.hl.y) < 0.5;
  return select(0.0, 1.0, s && i);
}
fn fadeFor(key: vec2f) -> f32 {
  if (u.hl.w < 0.5) { return 1.0; }
  return select(u.hl.z, 1.0, hlMatch(key) > 0.5);
}
fn toClip(px: vec2f) -> vec2f {
  return vec2f(px.x / u.resolution.x * 2.0 - 1.0, 1.0 - px.y / u.resolution.y * 2.0);
}
`;
