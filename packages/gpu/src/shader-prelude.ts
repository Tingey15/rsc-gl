import { glslBlock, wgslStruct } from './uniforms';
import type { PipelineDescriptor } from './types';

/**
 * Shader sources use a `/*UNIFORMS*\/` placeholder so the uniform declarations
 * are generated from the pipeline's {@link UniformLayout} and can never drift
 * between the two languages. GLSL sources also get the version / precision
 * header prepended.
 */
export const UNIFORMS_TOKEN = '/*UNIFORMS*/';

export function prepareGlsl(source: string, desc: PipelineDescriptor): string {
  const block = glslBlock('Uniforms', 'u', desc.uniforms);
  const body = source.includes(UNIFORMS_TOKEN) ? source.replace(UNIFORMS_TOKEN, block) : source;
  if (body.trimStart().startsWith('#version')) return body;
  return `#version 300 es\nprecision highp float;\nprecision highp int;\n${body}`;
}

export function prepareWgsl(source: string, desc: PipelineDescriptor): string {
  const decl = `${wgslStruct('Uniforms', desc.uniforms)}\n@group(0) @binding(0) var<uniform> u: Uniforms;`;
  return source.includes(UNIFORMS_TOKEN) ? source.replace(UNIFORMS_TOKEN, decl) : source;
}
