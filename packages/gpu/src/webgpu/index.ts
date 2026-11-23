import { prepareWgsl } from '../shader-prelude';
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
  ComputeDescriptor,
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

const FORMAT: Record<VertexFormat, GPUVertexFormat> = {
  float32: 'float32',
  float32x2: 'float32x2',
  float32x3: 'float32x3',
  float32x4: 'float32x4',
  unorm8x4: 'unorm8x4',
  uint32: 'uint32',
};

const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

const align4 = (n: number) => Math.ceil(n / 4) * 4;

function usageFlags(usage: BufferDescriptor['usage']): number {
  const base = GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  if (usage === 'index') return base | GPUBufferUsage.INDEX;
  if (usage === 'uniform') return base | GPUBufferUsage.UNIFORM;
  return base | GPUBufferUsage.VERTEX;
}

/** writeBuffer requires 4-byte multiples; pad odd-sized views. */
function padded(data: ArrayBufferView): ArrayBufferView {
  if (data.byteLength % 4 === 0) return data;
  const out = new Uint8Array(align4(data.byteLength));
  out.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return out;
}

class WGBuffer implements GpuBuffer {
  readonly id = nextId++;
  version = 0;
  handle: GPUBuffer;
  byteLength: number;

  constructor(private readonly device: WebGPUDevice, readonly usage: BufferDescriptor['usage'], desc: BufferDescriptor) {
    this.byteLength = align4(Math.max(4, desc.data?.byteLength ?? desc.byteLength ?? 4));
    this.handle = device.gpu.createBuffer({ label: desc.label, size: this.byteLength, usage: usageFlags(usage) });
    if (desc.data) this.write(desc.data);
  }

  write(data: ArrayBufferView, byteOffset = 0): void {
    const view = padded(data);
    const end = byteOffset + view.byteLength;
    if (end > this.byteLength) this.grow(align4(Math.max(end, Math.ceil(this.byteLength * 1.5))), byteOffset > 0);
    this.device.gpu.queue.writeBuffer(this.handle, byteOffset, view.buffer, view.byteOffset, view.byteLength);
  }

  private grow(size: number, preserve: boolean): void {
    const gpu = this.device.gpu;
    const next = gpu.createBuffer({ size, usage: usageFlags(this.usage) });
    if (preserve) {
      const enc = gpu.createCommandEncoder();
      enc.copyBufferToBuffer(this.handle, 0, next, 0, this.byteLength);
      gpu.queue.submit([enc.finish()]);
    }
    this.handle.destroy();
    this.handle = next;
    this.byteLength = size;
    this.version++;
  }

  destroy(): void {
    this.handle.destroy();
  }
}

class WGTexture implements GpuTexture {
  readonly id = nextId++;
  version = 0;
  handle!: GPUTexture;
  view!: GPUTextureView;
  readonly sampler: GPUSampler;
  width: number;
  height: number;
  private readonly format: GPUTextureFormat;

  constructor(private readonly device: WebGPUDevice, desc: TextureDescriptor) {
    this.width = desc.width;
    this.height = desc.height;
    this.format = desc.format ?? 'rgba8unorm';
    const filter: GPUFilterMode = desc.filter === 'nearest' ? 'nearest' : 'linear';
    this.sampler = device.gpu.createSampler({ magFilter: filter, minFilter: filter, addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.allocate(desc.width, desc.height);
    if (desc.data) this.write(desc.data);
  }

  private allocate(width: number, height: number): void {
    this.handle?.destroy();
    this.handle = this.device.gpu.createTexture({
      size: [Math.max(1, width), Math.max(1, height)],
      format: this.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.view = this.handle.createView();
    this.width = width;
    this.height = height;
    this.version++;
  }

  write(data: Uint8Array | Uint8ClampedArray, width = this.width, height = this.height): void {
    if (width !== this.width || height !== this.height) this.allocate(width, height);
    const bpp = this.format === 'r8unorm' ? 1 : 4;
    this.device.gpu.queue.writeTexture({ texture: this.handle }, data as Uint8Array<ArrayBuffer>, { bytesPerRow: width * bpp, rowsPerImage: height }, [width, height]);
  }

  writeFromSource(source: TexImageSource, width: number, height: number): void {
    if (width !== this.width || height !== this.height) this.allocate(width, height);
    this.device.gpu.queue.copyExternalImageToTexture(
      { source: source as GPUCopyExternalImageSource },
      { texture: this.handle, premultipliedAlpha: true },
      [width, height],
    );
  }

  destroy(): void {
    this.handle.destroy();
  }
}

class WGUniforms implements GpuUniforms {
  readonly id = nextId++;
  private readonly cpu: UniformData;
  readonly buffer: WGBuffer;

  constructor(device: WebGPUDevice, readonly layout: UniformLayout) {
    this.cpu = new UniformData(layout);
    this.buffer = new WGBuffer(device, 'uniform', { usage: 'uniform', byteLength: this.cpu.packed.byteLength });
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

class WGPipeline implements GpuPipeline {
  readonly id = nextId++;
  readonly handle: GPURenderPipeline;
  readonly bindGroupLayout: GPUBindGroupLayout;
  readonly bindGroups = new Map<string, GPUBindGroup>();

  constructor(device: WebGPUDevice, readonly descriptor: PipelineDescriptor) {
    const gpu = device.gpu;
    const code = prepareWgsl(descriptor.shader.wgsl, descriptor);
    const module = gpu.createShaderModule({ label: descriptor.label, code });
    module.getCompilationInfo?.().then((info) => {
      for (const m of info.messages) {
        if (m.type === 'error') console.error(`[gpu] WGSL ${descriptor.label ?? ''}:${m.lineNum}:${m.linePos} ${m.message}`);
      }
    });
    const entries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ];
    (descriptor.textures ?? []).forEach((_, i) => {
      entries.push({ binding: 1 + i * 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } });
      entries.push({ binding: 2 + i * 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } });
    });
    this.bindGroupLayout = gpu.createBindGroupLayout({ entries });
    const blend = descriptor.blend ?? 'alpha';
    const blendState: GPUBlendState | undefined =
      blend === 'none'
        ? undefined
        : blend === 'additive'
          ? { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } }
          : {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            };
    const topology = descriptor.topology ?? 'triangle-list';
    gpu.pushErrorScope('validation');
    this.handle = gpu.createRenderPipeline({
      label: descriptor.label,
      layout: gpu.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: descriptor.shader.vertexEntry ?? 'vs_main',
        buffers: descriptor.buffers.map((b) => ({
          arrayStride: b.stride,
          stepMode: b.stepMode,
          attributes: b.attributes.map((a) => ({ shaderLocation: a.location, format: FORMAT[a.format], offset: a.offset })),
        })),
      },
      fragment: {
        module,
        entryPoint: descriptor.shader.fragmentEntry ?? 'fs_main',
        targets: [{ format: descriptor.offscreen ? 'rgba8unorm' : device.format, blend: blendState }],
      },
      primitive: { topology, cullMode: descriptor.cullBackFaces ? 'back' : 'none', frontFace: 'ccw' },
      depthStencil: {
        format: DEPTH_FORMAT,
        depthWriteEnabled: !!descriptor.depth,
        depthCompare: descriptor.depth ? 'less' : 'always',
      },
      multisample: { count: descriptor.offscreen ? 1 : device.sampleCount },
    });
    gpu.popErrorScope().then((err) => {
      if (err) console.error(`[gpu] pipeline "${descriptor.label ?? ''}" is invalid: ${err.message}`);
    });
  }

  destroy(): void {
    this.bindGroups.clear();
  }
}

class WGSurface implements GpuSurface {
  width = 1;
  height = 1;
  private readonly context: GPUCanvasContext;
  private msaa: GPUTexture | null = null;
  private depth: GPUTexture | null = null;

  constructor(private readonly device: WebGPUDevice, readonly canvas: SurfaceCanvas) {
    const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!ctx) throw new Error('[gpu] could not acquire WebGPU canvas context');
    this.context = ctx;
    ctx.configure({ device: device.gpu, format: device.format, alphaMode: 'premultiplied' });
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height && this.depth) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.msaa?.destroy();
    this.depth?.destroy();
    const gpu = this.device.gpu;
    const count = this.device.sampleCount;
    this.msaa = count > 1 ? gpu.createTexture({ size: [w, h], format: this.device.format, sampleCount: count, usage: GPUTextureUsage.RENDER_ATTACHMENT }) : null;
    this.depth = gpu.createTexture({ size: [w, h], format: DEPTH_FORMAT, sampleCount: count, usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }

  beginFrame(options?: FrameOptions): RenderPass {
    if (!this.depth) this.resize(this.width, this.height);
    const gpu = this.device.gpu;
    const encoder = gpu.createCommandEncoder();
    const target = this.context.getCurrentTexture().createView();
    const c = options?.clearColor ?? [0, 0, 0, 0];
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        this.msaa
          ? { view: this.msaa.createView(), resolveTarget: target, loadOp: 'clear', storeOp: 'discard', clearValue: { r: c[0], g: c[1], b: c[2], a: c[3] } }
          : { view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: c[0], g: c[1], b: c[2], a: c[3] } },
      ],
      depthStencilAttachment: { view: this.depth!.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    });
    return new WGRenderPass(this.device, this, encoder, pass);
  }

  destroy(): void {
    this.msaa?.destroy();
    this.depth?.destroy();
    this.context.unconfigure();
  }
}

class WGRenderPass implements RenderPass {
  constructor(
    private readonly device: WebGPUDevice,
    private readonly surface: { width: number; height: number },
    private readonly encoder: GPUCommandEncoder,
    private readonly pass: GPURenderPassEncoder,
  ) {}

  setViewport(r: Rect): void {
    this.pass.setViewport(r.x, r.y, Math.max(1, r.width), Math.max(1, r.height), 0, 1);
  }

  setScissor(r: Rect | null): void {
    const s = this.surface;
    if (!r) {
      this.pass.setScissorRect(0, 0, s.width, s.height);
      return;
    }
    const x = Math.max(0, Math.min(s.width, Math.floor(r.x)));
    const y = Math.max(0, Math.min(s.height, Math.floor(r.y)));
    const w = Math.max(0, Math.min(s.width - x, Math.ceil(r.width)));
    const h = Math.max(0, Math.min(s.height - y, Math.ceil(r.height)));
    this.pass.setScissorRect(x, y, w, h);
  }

  draw(call: DrawCall): void {
    const pipeline = call.pipeline as WGPipeline;
    const desc = pipeline.descriptor;
    const instances = call.instanceCount ?? 1;
    if (instances <= 0 || call.vertexCount <= 0) return;
    const uniforms = call.uniforms as WGUniforms;
    uniforms.flush();

    const textures = (desc.textures ?? []).map((name) => call.textures?.[name] as WGTexture | undefined);
    let key = `${uniforms.buffer.id}.${uniforms.buffer.version}`;
    for (const t of textures) key += `|${t ? `${t.id}.${t.version}` : 'x'}`;
    let group = pipeline.bindGroups.get(key);
    if (!group) {
      const fallback = this.device.fallbackTexture();
      const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: uniforms.buffer.handle } }];
      textures.forEach((t, i) => {
        const tex = t ?? fallback;
        entries.push({ binding: 1 + i * 2, resource: tex.view });
        entries.push({ binding: 2 + i * 2, resource: tex.sampler });
      });
      group = this.device.gpu.createBindGroup({ layout: pipeline.bindGroupLayout, entries });
      if (pipeline.bindGroups.size > 256) pipeline.bindGroups.clear();
      pipeline.bindGroups.set(key, group);
    }

    this.pass.setPipeline(pipeline.handle);
    this.pass.setBindGroup(0, group);
    desc.buffers.forEach((layout, slot) => {
      const b = call.vertexBuffers[layout.name] as WGBuffer | undefined;
      if (!b) throw new Error(`[gpu] missing vertex buffer "${layout.name}" for ${desc.label ?? 'pipeline'}`);
      this.pass.setVertexBuffer(slot, b.handle, call.vertexBufferOffsets?.[layout.name] ?? 0);
    });
    if (call.indexBuffer) {
      this.pass.setIndexBuffer((call.indexBuffer as WGBuffer).handle, 'uint32');
      this.pass.drawIndexed(call.vertexCount, instances, call.firstVertex ?? 0, 0, 0);
    } else {
      this.pass.draw(call.vertexCount, instances, call.firstVertex ?? 0, 0);
    }
  }

  end(): void {
    this.pass.end();
    this.device.gpu.queue.submit([this.encoder.finish()]);
  }
}

class WGRenderTarget implements GpuRenderTarget {
  width = 1;
  height = 1;
  private color: GPUTexture | null = null;
  private depth: GPUTexture | null = null;

  constructor(private readonly device: WebGPUDevice, width: number, height: number) {
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height && this.color) return;
    this.width = w;
    this.height = h;
    this.color?.destroy();
    this.depth?.destroy();
    const gpu = this.device.gpu;
    this.color = gpu.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    this.depth = gpu.createTexture({ size: [w, h], format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }

  beginPass(options?: FrameOptions): RenderPass {
    const gpu = this.device.gpu;
    const encoder = gpu.createCommandEncoder();
    const c = options?.clearColor ?? [0, 0, 0, 0];
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.color!.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: c[0], g: c[1], b: c[2], a: c[3] } }],
      depthStencilAttachment: { view: this.depth!.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    });
    return new WGRenderPass(this.device, this, encoder, pass);
  }

  async readPixel(x: number, y: number): Promise<Uint8Array> {
    const gpu = this.device.gpu;
    const buf = gpu.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = gpu.createCommandEncoder();
    enc.copyTextureToBuffer(
      { texture: this.color!, origin: [Math.min(this.width - 1, Math.max(0, Math.floor(x))), Math.min(this.height - 1, Math.max(0, Math.floor(y)))] },
      { buffer: buf, bytesPerRow: 256 },
      [1, 1],
    );
    gpu.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const out = new Uint8Array(buf.getMappedRange().slice(0, 4));
    buf.unmap();
    buf.destroy();
    return out;
  }

  destroy(): void {
    this.color?.destroy();
    this.depth?.destroy();
  }
}

export class WebGPUDevice implements GpuDevice {
  readonly type = 'webgpu' as const;
  readonly format: GPUTextureFormat;
  readonly sampleCount: number;
  readonly limits;
  lost = false;
  private readonly lostCallbacks = new Set<(reason: string) => void>();
  private fallback: WGTexture | null = null;

  constructor(readonly gpu: GPUDevice, options: DeviceOptions = {}) {
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.sampleCount = options.antialias === false ? 1 : 4;
    this.limits = { maxTextureSize: gpu.limits.maxTextureDimension2D, maxInstances: 1 << 24 };
    gpu.lost.then((info) => {
      this.lost = true;
      for (const cb of this.lostCallbacks) cb(info.message || info.reason || 'device lost');
    });
    gpu.addEventListener?.('uncapturederror', (e) => console.error('[gpu] WebGPU error:', (e as GPUUncapturedErrorEvent).error.message));
  }

  fallbackTexture(): WGTexture {
    if (!this.fallback) this.fallback = new WGTexture(this, { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    return this.fallback;
  }

  createBuffer(desc: BufferDescriptor): GpuBuffer {
    return new WGBuffer(this, desc.usage, desc);
  }

  createTexture(desc: TextureDescriptor): GpuTexture {
    return new WGTexture(this, desc);
  }

  createPipeline(desc: PipelineDescriptor): GpuPipeline {
    return new WGPipeline(this, desc);
  }

  createUniforms(layout: UniformLayout): GpuUniforms {
    return new WGUniforms(this, layout);
  }

  createSurface(canvas: SurfaceCanvas): GpuSurface {
    return new WGSurface(this, canvas);
  }

  createRenderTarget(width: number, height: number): GpuRenderTarget {
    return new WGRenderTarget(this, width, height);
  }

  /** General-purpose compute dispatch with optional readback. */
  async compute(desc: ComputeDescriptor): Promise<ArrayBuffer[]> {
    const gpu = this.gpu;
    const module = gpu.createShaderModule({ code: desc.wgsl });
    const pipeline = gpu.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: desc.entry ?? 'main' } });
    const buffers = desc.buffers.map((b) => {
      const size = Math.max(16, Math.ceil((b.data?.byteLength ?? b.byteLength ?? 16) / 4) * 4);
      const buf = gpu.createBuffer({ size, usage: (b.uniform ? GPUBufferUsage.UNIFORM : GPUBufferUsage.STORAGE) | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
      if (b.data) gpu.queue.writeBuffer(buf, 0, b.data.buffer, b.data.byteOffset, b.data.byteLength);
      return { buf, size, spec: b };
    });
    const group = gpu.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: buffers.map((b, i) => ({ binding: i, resource: { buffer: b.buf } })) });
    const enc = gpu.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(desc.workgroups[0], desc.workgroups[1] ?? 1, desc.workgroups[2] ?? 1);
    pass.end();
    const reads = buffers.filter((b) => b.spec.readback).map((b) => {
      const staging = gpu.createBuffer({ size: b.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      enc.copyBufferToBuffer(b.buf, 0, staging, 0, b.size);
      return staging;
    });
    gpu.queue.submit([enc.finish()]);
    const out: ArrayBuffer[] = [];
    for (const s of reads) {
      await s.mapAsync(GPUMapMode.READ);
      out.push(s.getMappedRange().slice(0));
      s.unmap();
      s.destroy();
    }
    for (const b of buffers) b.buf.destroy();
    return out;
  }

  onLost(callback: (reason: string) => void): () => void {
    this.lostCallbacks.add(callback);
    return () => this.lostCallbacks.delete(callback);
  }

  destroy(): void {
    this.gpu.destroy();
  }
}

export const webgpuBackend: GpuBackend = {
  type: 'webgpu',
  isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  },
  async createDevice(options) {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: options?.powerPreference ?? 'high-performance' });
    if (!adapter) throw new Error('[gpu] no WebGPU adapter available');
    const device = await adapter.requestDevice();
    return new WebGPUDevice(device, options);
  },
};
