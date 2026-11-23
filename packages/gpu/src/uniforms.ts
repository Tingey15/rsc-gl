import type { UniformLayout, UniformType } from './types';

/**
 * Computes byte offsets for a uniform block. Restricting the field types to
 * f32 / vec2 / vec4 / mat4 means std140 (GLSL) and WGSL uniform address space
 * rules produce the exact same layout, so a single packer serves both backends.
 */
const SIZE: Record<UniformType, number> = { f32: 4, vec2: 8, vec4: 16, mat4: 64 };
const ALIGN: Record<UniformType, number> = { f32: 4, vec2: 8, vec4: 16, mat4: 16 };

export interface PackedLayout {
  /** Float offset (bytes / 4) of each field. */
  offsets: Map<string, { offset: number; size: number }>;
  byteLength: number;
}

const cache = new WeakMap<UniformLayout, PackedLayout>();

export function packLayout(layout: UniformLayout): PackedLayout {
  const cached = cache.get(layout);
  if (cached) return cached;
  const offsets = new Map<string, { offset: number; size: number }>();
  let cursor = 0;
  for (const field of layout.fields) {
    const align = ALIGN[field.type];
    cursor = Math.ceil(cursor / align) * align;
    offsets.set(field.name, { offset: cursor / 4, size: SIZE[field.type] / 4 });
    cursor += SIZE[field.type];
  }
  const byteLength = Math.max(16, Math.ceil(cursor / 16) * 16);
  const packed = { offsets, byteLength };
  cache.set(layout, packed);
  return packed;
}

/** Shared CPU-side implementation of uniform writes. */
export class UniformData {
  readonly data: Float32Array;
  readonly packed: PackedLayout;
  dirty = true;

  constructor(readonly layout: UniformLayout) {
    this.packed = packLayout(layout);
    this.data = new Float32Array(this.packed.byteLength / 4);
  }

  set(name: string, value: number | ArrayLike<number>): void {
    const slot = this.packed.offsets.get(name);
    if (!slot) {
      throw new Error(`Unknown uniform "${name}"`);
    }
    if (typeof value === 'number') {
      if (this.data[slot.offset] !== value) {
        this.data[slot.offset] = value;
        this.dirty = true;
      }
      return;
    }
    const n = Math.min(slot.size, value.length);
    for (let i = 0; i < n; i++) {
      if (this.data[slot.offset + i] !== value[i]) {
        this.data[slot.offset + i] = value[i];
        this.dirty = true;
      }
    }
  }
}

/** Generates the WGSL struct declaration for a layout (handy for shader authors / tests). */
export function wgslStruct(name: string, layout: UniformLayout): string {
  const map: Record<UniformType, string> = { f32: 'f32', vec2: 'vec2f', vec4: 'vec4f', mat4: 'mat4x4f' };
  return `struct ${name} {\n${layout.fields.map((f) => `  ${f.name}: ${map[f.type]},`).join('\n')}\n};`;
}

/** Generates the GLSL std140 block declaration for a layout. */
export function glslBlock(name: string, instance: string, layout: UniformLayout): string {
  const map: Record<UniformType, string> = { f32: 'float', vec2: 'vec2', vec4: 'vec4', mat4: 'mat4' };
  return `layout(std140) uniform ${name} {\n${layout.fields.map((f) => `  ${map[f.type]} ${f.name};`).join('\n')}\n} ${instance};`;
}
