import { describe, expect, it } from 'vitest';
import { glslBlock, packLayout, UniformData, wgslStruct } from '../uniforms';
import { prepareGlsl, prepareWgsl } from '../shader-prelude';

describe('uniform packing', () => {
  it('matches std140 / WGSL alignment rules', () => {
    const layout = {
      fields: [
        { name: 'a', type: 'f32' as const },
        { name: 'b', type: 'vec2' as const },
        { name: 'c', type: 'vec4' as const },
        { name: 'd', type: 'f32' as const },
        { name: 'm', type: 'mat4' as const },
      ],
    };
    const p = packLayout(layout);
    expect(p.offsets.get('a')!.offset).toBe(0);
    expect(p.offsets.get('b')!.offset).toBe(2); // vec2 aligned to 8 bytes
    expect(p.offsets.get('c')!.offset).toBe(4); // vec4 aligned to 16 bytes
    expect(p.offsets.get('d')!.offset).toBe(8);
    expect(p.offsets.get('m')!.offset).toBe(12); // mat4 aligned to 16 bytes
    expect(p.byteLength % 16).toBe(0);
    expect(p.byteLength).toBe(112);
  });

  it('tracks dirty state and rejects unknown names', () => {
    const u = new UniformData({ fields: [{ name: 'x', type: 'vec4' }] });
    u.dirty = false;
    u.set('x', [1, 2, 3, 4]);
    expect(u.dirty).toBe(true);
    expect([...u.data]).toEqual([1, 2, 3, 4]);
    u.dirty = false;
    u.set('x', [1, 2, 3, 4]);
    expect(u.dirty).toBe(false);
    expect(() => u.set('y', 1)).toThrow();
  });

  it('generates matching declarations for both languages', () => {
    const layout = { fields: [{ name: 'res', type: 'vec2' as const }, { name: 'vp', type: 'mat4' as const }] };
    expect(wgslStruct('U', layout)).toContain('res: vec2f');
    expect(wgslStruct('U', layout)).toContain('vp: mat4x4f');
    expect(glslBlock('U', 'u', layout)).toContain('layout(std140) uniform U');
    const desc = { shader: { glsl: { vertex: '', fragment: '' }, wgsl: '' }, buffers: [], uniforms: layout };
    expect(prepareGlsl('/*UNIFORMS*/\nvoid main(){}', desc)).toMatch(/^#version 300 es/);
    expect(prepareWgsl('/*UNIFORMS*/', desc)).toContain('@group(0) @binding(0) var<uniform> u: Uniforms;');
  });
});
