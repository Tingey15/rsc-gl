import { prepareGlsl } from '../shader-prelude';
import { UniformData } from '../uniforms';
import type {
  SurfaceCanvas,
  BufferDescriptor,
  DeviceOptions,
  DrawCall,
  FrameOptions,
  GpuBackend,
  GpuBuffer,
  GpuDevice,
  GpuPipeline,
  GpuRenderTarget,
  GpuSurface,
  GpuTexture,
  GpuUniforms,
  PipelineDescriptor,
  Rect,
  RenderPass,
  TextureDescriptor,
  UniformLayout,
  VertexFormat,
} from '../types';

let nextId = 1;

const FORMAT: Record<VertexFormat, { size: number; type: number; normalized: boolean; integer: boolean }> = {
  float32: { size: 1, type: 0x1406, normalized: false, integer: false },
  float32x2: { size: 2, type: 0x1406, normalized: false, integer: false },
  float32x3: { size: 3, type: 0x1406, normalized: false, integer: false },
  float32x4: { size: 4, type: 0x1406, normalized: false, integer: false },
  unorm8x4: { size: 4, type: 0x1401, normalized: true, integer: false },
  uint32: { size: 1, type: 0x1405, normalized: false, integer: true },
};

class GLBuffer implements GpuBuffer {
  readonly id = nextId++;
  /** Incremented whenever the underlying GL object changes (VAO cache key). */
  version = 0;
  handle: WebGLBuffer;
  byteLength: number;
  private readonly target: number;

  constructor(private readonly device: WebGL2Device, desc: BufferDescriptor) {
    const gl = device.gl;
    this.usage = desc.usage;
    this.target = desc.usage === 'index' ? gl.ELEMENT_ARRAY_BUFFER : desc.usage === 'uniform' ? gl.UNIFORM_BUFFER : gl.ARRAY_BUFFER;
    this.handle = gl.createBuffer()!;
    this.byteLength = Math.max(4, desc.data?.byteLength ?? desc.byteLength ?? 4);
    gl.bindBuffer(this.target, this.handle);
    if (desc.data) gl.bufferData(this.target, desc.data, gl.DYNAMIC_DRAW);
    else gl.bufferData(this.target, this.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(this.target, null);
  }

  readonly usage: BufferDescriptor['usage'];

  write(data: ArrayBufferView, byteOffset = 0): void {
    const gl = this.device.gl;
    const end = byteOffset + data.byteLength;
    if (end > this.byteLength) this.grow(Math.max(end, Math.ceil(this.byteLength * 1.5)), byteOffset > 0);
    // Index buffers must not be bound to ARRAY_BUFFER while a VAO is bound; unbind VAO first.
    gl.bindVertexArray(null);
    gl.bindBuffer(this.target, this.handle);
    gl.bufferSubData(this.target, byteOffset, data);
    gl.bindBuffer(this.target, null);
  }

  private grow(size: number, preserve: boolean): void {
    const gl = this.device.gl;
    gl.bindVertexArray(null);
    const next = gl.createBuffer()!;
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, next);
    gl.bufferData(gl.COPY_WRITE_BUFFER, size, gl.DYNAMIC_DRAW);
    if (preserve) {
      gl.bindBuffer(gl.COPY_READ_BUFFER, this.handle);
      gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, 0, 0, this.byteLength);
      gl.bindBuffer(gl.COPY_READ_BUFFER, null);
    }
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
    gl.deleteBuffer(this.handle);
    this.handle = next;
    this.byteLength = size;
    this.version++;
  }

  destroy(): void {
    this.device.gl.deleteBuffer(this.handle);
  }
}

class GLTexture implements GpuTexture {
  readonly id = nextId++;
  readonly handle: WebGLTexture;
  width: number;
  height: number;
  private readonly format: 'rgba8unorm' | 'r8unorm';

  constructor(private readonly device: WebGL2Device, desc: TextureDescriptor) {
    const gl = device.gl;
    this.width = desc.width;
    this.height = desc.height;
    this.format = desc.format ?? 'rgba8unorm';
    this.handle = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.handle);
    const filter = desc.filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.upload(desc.data ?? null, desc.width, desc.height);
  }

  private upload(data: Uint8Array | Uint8ClampedArray | null, width: number, height: number): void {
    const gl = this.device.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.handle);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const view = data ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
    if (this.format === 'r8unorm') gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, view);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, view);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  write(data: Uint8Array | Uint8ClampedArray, width = this.width, height = this.height): void {
    this.width = width;
    this.height = height;
    this.upload(data, width, height);
  }

  writeFromSource(source: TexImageSource, width: number, height: number): void {
    const gl = this.device.gl;
    this.width = width;
    this.height = height;
    gl.bindTexture(gl.TEXTURE_2D, this.handle);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  destroy(): void {
    this.device.gl.deleteTexture(this.handle);
  }
}

class GLUniforms implements GpuUniforms {
  readonly id = nextId++;
  private readonly cpu: UniformData;
  readonly buffer: GLBuffer;

  constructor(device: WebGL2Device, readonly layout: UniformLayout) {
    this.cpu = new UniformData(layout);
    this.buffer = new GLBuffer(device, { usage: 'uniform', byteLength: this.cpu.packed.byteLength });
  }

  set(name: string, value: number | ArrayLike<number>): this {
    this.cpu.set(name, value);
    return this;
  }

  flush(): void {
    if (!this.cpu.dirty) return;
    this.buffer.write(this.cpu.data);
    this.cpu.dirty = false;
  }

  destroy(): void {
    this.buffer.destroy();
  }
}

class GLPipeline implements GpuPipeline {
  readonly id = nextId++;
  readonly program: WebGLProgram;
  readonly textureLocations: (WebGLUniformLocation | null)[];
  readonly vaos = new Map<string, WebGLVertexArrayObject>();

  constructor(private readonly device: WebGL2Device, readonly descriptor: PipelineDescriptor) {
    const gl = device.gl;
    const vs = compile(gl, gl.VERTEX_SHADER, prepareGlsl(descriptor.shader.glsl.vertex, descriptor), descriptor.label);
    const fs = compile(gl, gl.FRAGMENT_SHADER, prepareGlsl(descriptor.shader.glsl.fragment, descriptor), descriptor.label);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`[gpu] link failed (${descriptor.label ?? 'pipeline'}): ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const blockIndex = gl.getUniformBlockIndex(program, 'Uniforms');
    if (blockIndex !== gl.INVALID_INDEX) gl.uniformBlockBinding(program, blockIndex, 0);
    this.textureLocations = (descriptor.textures ?? []).map((name) => gl.getUniformLocation(program, name));
    this.program = program;
  }

  destroy(): void {
    const gl = this.device.gl;
    for (const vao of this.vaos.values()) gl.deleteVertexArray(vao);
    this.vaos.clear();
    gl.deleteProgram(this.program);
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string, label?: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    const numbered = source
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(3)}: ${l}`)
      .join('\n');
    throw new Error(`[gpu] ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader compile failed (${label ?? ''}): ${log}\n${numbered}`);
  }
  return shader;
}

const TOPOLOGY = { 'triangle-list': 0x0004, 'triangle-strip': 0x0005, 'line-list': 0x0001, 'point-list': 0x0000 } as const;

/**
 * Surfaces share the device's single WebGL2 context. Each frame is rendered
 * into the bottom-left region of the shared drawing buffer and then copied to
 * the surface's own 2D canvas (GPU to GPU on accelerated canvases). This
 * avoids the per-page context limit when a dashboard contains many charts.
 */
class GLSurface implements GpuSurface {
  width = 1;
  height = 1;
  private readonly ctx2d: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor(private readonly device: WebGL2Device, readonly canvas: SurfaceCanvas) {
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('[gpu] could not acquire 2D context for surface');
    this.ctx2d = ctx;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    if (this.canvas.width !== this.width) this.canvas.width = this.width;
    if (this.canvas.height !== this.height) this.canvas.height = this.height;
  }

  beginFrame(options?: FrameOptions): RenderPass {
    const device = this.device;
    const gl = device.gl;
    device.ensureBackbuffer(this.width, this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, this.width, this.height);
    const c = options?.clearColor ?? [0, 0, 0, 0];
    gl.clearColor(c[0], c[1], c[2], c[3]);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    return new GLRenderPass(device, this, () => {
      gl.disable(gl.SCISSOR_TEST);
      const bb = device.canvas;
      this.ctx2d.clearRect(0, 0, this.width, this.height);
      this.ctx2d.drawImage(bb, 0, bb.height - this.height, this.width, this.height, 0, 0, this.width, this.height);
    });
  }

  destroy(): void {}
}

class GLRenderPass implements RenderPass {
  constructor(
    private readonly device: WebGL2Device,
    private readonly surface: { width: number; height: number },
    private readonly onEnd: () => void,
  ) {}

  setViewport(r: Rect): void {
    const gl = this.device.gl;
    gl.viewport(r.x, this.surface.height - (r.y + r.height), r.width, r.height);
  }

  setScissor(r: Rect | null): void {
    const gl = this.device.gl;
    const s = r ?? { x: 0, y: 0, width: this.surface.width, height: this.surface.height };
    gl.scissor(Math.max(0, s.x), Math.max(0, this.surface.height - (s.y + s.height)), Math.max(0, s.width), Math.max(0, s.height));
  }

  draw(call: DrawCall): void {
    this.device.draw(call);
  }

  end(): void {
    this.onEnd();
  }
}

class GLRenderTarget implements GpuRenderTarget {
  width = 1;
  height = 1;
  private fb: WebGLFramebuffer;
  private color: WebGLTexture;
  private depth: WebGLRenderbuffer;

  constructor(private readonly device: WebGL2Device, width: number, height: number) {
    const gl = device.gl;
    this.fb = gl.createFramebuffer()!;
    this.color = gl.createTexture()!;
    this.depth = gl.createRenderbuffer()!;
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    const gl = this.device.gl;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    gl.bindTexture(gl.TEXTURE_2D, this.color);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.color, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  beginPass(options?: FrameOptions): RenderPass {
    const gl = this.device.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, this.width, this.height);
    const c = options?.clearColor ?? [0, 0, 0, 0];
    gl.clearColor(c[0], c[1], c[2], c[3]);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    return new GLRenderPass(this.device, this, () => {
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    });
  }

  async readPixel(x: number, y: number): Promise<Uint8Array> {
    const gl = this.device.gl;
    const out = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.readPixels(Math.floor(x), this.height - 1 - Math.floor(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  destroy(): void {
    const gl = this.device.gl;
    gl.deleteFramebuffer(this.fb);
    gl.deleteTexture(this.color);
    gl.deleteRenderbuffer(this.depth);
  }
}

export class WebGL2Device implements GpuDevice {
  readonly type = 'webgl2' as const;
  readonly canvas: SurfaceCanvas;
  readonly gl: WebGL2RenderingContext;
  readonly limits;
  lost = false;
  private readonly lostCallbacks = new Set<(reason: string) => void>();

  constructor(options: DeviceOptions = {}) {
    // Workers have no DOM: fall back to an OffscreenCanvas for the shared context.
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
    this.canvas.width = 1;
    this.canvas.height = 1;
    const gl = (this.canvas as HTMLCanvasElement).getContext('webgl2', {
      antialias: options.antialias ?? true,
      alpha: true,
      premultipliedAlpha: true,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: options.powerPreference ?? 'high-performance',
    });
    if (!gl) throw new Error('[gpu] WebGL2 is not available');
    this.gl = gl;
    this.limits = { maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, maxInstances: 1 << 24 };
    (this.canvas as HTMLCanvasElement).addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      for (const cb of this.lostCallbacks) cb('webgl context lost');
    });
  }

  ensureBackbuffer(width: number, height: number): void {
    // Grow only (with headroom) so dashboards of different chart sizes do not thrash allocations.
    const max = this.limits.maxTextureSize;
    if (this.canvas.width < width) this.canvas.width = Math.min(max, Math.ceil(width * 1.25));
    if (this.canvas.height < height) this.canvas.height = Math.min(max, Math.ceil(height * 1.25));
  }

  createBuffer(desc: BufferDescriptor): GpuBuffer {
    return new GLBuffer(this, desc);
  }

  createTexture(desc: TextureDescriptor): GpuTexture {
    return new GLTexture(this, desc);
  }

  createPipeline(desc: PipelineDescriptor): GpuPipeline {
    return new GLPipeline(this, desc);
  }

  createUniforms(layout: UniformLayout): GpuUniforms {
    return new GLUniforms(this, layout);
  }

  createSurface(canvas: SurfaceCanvas): GpuSurface {
    return new GLSurface(this, canvas);
  }

  createRenderTarget(width: number, height: number): GpuRenderTarget {
    return new GLRenderTarget(this, width, height);
  }

  onLost(callback: (reason: string) => void): () => void {
    this.lostCallbacks.add(callback);
    return () => this.lostCallbacks.delete(callback);
  }

  draw(call: DrawCall): void {
    const gl = this.gl;
    const pipeline = call.pipeline as GLPipeline;
    const desc = pipeline.descriptor;
    gl.useProgram(pipeline.program);

    // Fixed function state.
    const blend = desc.blend ?? 'alpha';
    if (blend === 'none') gl.disable(gl.BLEND);
    else {
      gl.enable(gl.BLEND);
      if (blend === 'additive') gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    if (desc.depth) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
    } else {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
    }
    if (desc.cullBackFaces) gl.enable(gl.CULL_FACE);
    else gl.disable(gl.CULL_FACE);

    // Vertex array (cached per buffer combination).
    let key = '';
    for (const layout of desc.buffers) {
      const b = call.vertexBuffers[layout.name] as GLBuffer | undefined;
      if (!b) throw new Error(`[gpu] missing vertex buffer "${layout.name}" for ${desc.label ?? 'pipeline'}`);
      key += `${b.id}.${b.version}@${call.vertexBufferOffsets?.[layout.name] ?? 0}|`;
    }
    const ib = call.indexBuffer as GLBuffer | undefined;
    if (ib) key += `i${ib.id}.${ib.version}`;
    let vao = pipeline.vaos.get(key);
    if (!vao) {
      vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      for (const layout of desc.buffers) {
        const b = call.vertexBuffers[layout.name] as GLBuffer;
        const base = call.vertexBufferOffsets?.[layout.name] ?? 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, b.handle);
        for (const attr of layout.attributes) {
          const f = FORMAT[attr.format];
          gl.enableVertexAttribArray(attr.location);
          if (f.integer) gl.vertexAttribIPointer(attr.location, f.size, f.type, layout.stride, base + attr.offset);
          else gl.vertexAttribPointer(attr.location, f.size, f.type, f.normalized, layout.stride, base + attr.offset);
          gl.vertexAttribDivisor(attr.location, layout.stepMode === 'instance' ? 1 : 0);
        }
      }
      if (ib) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib.handle);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      // Bound per draw so stale combinations can be evicted cheaply.
      if (pipeline.vaos.size > 64) {
        for (const v of pipeline.vaos.values()) gl.deleteVertexArray(v);
        pipeline.vaos.clear();
      }
      pipeline.vaos.set(key, vao);
    }

    // Uniforms.
    const uniforms = call.uniforms as GLUniforms;
    uniforms.flush();
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, uniforms.buffer.handle);

    // Textures.
    const names = desc.textures ?? [];
    for (let i = 0; i < names.length; i++) {
      const tex = call.textures?.[names[i]] as GLTexture | undefined;
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex ? tex.handle : null);
      const loc = pipeline.textureLocations[i];
      if (loc) gl.uniform1i(loc, i);
    }

    gl.bindVertexArray(vao);
    const mode = TOPOLOGY[desc.topology ?? 'triangle-list'];
    const instances = call.instanceCount ?? 1;
    if (instances > 0 && call.vertexCount > 0) {
      if (ib) gl.drawElementsInstanced(mode, call.vertexCount, gl.UNSIGNED_INT, (call.firstVertex ?? 0) * 4, instances);
      else gl.drawArraysInstanced(mode, call.firstVertex ?? 0, call.vertexCount, instances);
    }
    gl.bindVertexArray(null);
  }

  destroy(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

export const webgl2Backend: GpuBackend = {
  type: 'webgl2',
  isSupported() {
    // Avoid creating a probe context: contexts are a scarce per-page resource.
    // Workers have no document but can use WebGL2 through OffscreenCanvas.
    return (typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined') && typeof WebGL2RenderingContext !== 'undefined';
  },
  async createDevice(options) {
    return new WebGL2Device(options);
  },
};
