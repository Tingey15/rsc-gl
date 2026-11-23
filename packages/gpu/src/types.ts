/**
 * Hardware abstraction layer (HAL) types.
 *
 * The model follows the WebGPU resource model (immutable pipelines, explicit
 * buffers and bindings, render passes). The WebGL2 backend emulates it.
 *
 * Every pipeline carries two hand-written shader sources, one GLSL ES 3.00
 * and one WGSL, that implement the same contract:
 *   - vertex attributes use the same `location` numbers in both languages
 *   - one uniform block (group 0 / binding 0) whose layout is described by a
 *     {@link UniformLayout} and packed identically for std140 and WGSL
 *   - textures use bindings 1..n (WGSL places the sampler right after each
 *     texture: texture at binding 2k+1, sampler at 2k+2)
 */

export type BackendType = 'webgpu' | 'webgl2';

export type VertexFormat =
  | 'float32'
  | 'float32x2'
  | 'float32x3'
  | 'float32x4'
  | 'unorm8x4'
  | 'uint32';

export type BufferUsage = 'vertex' | 'index' | 'uniform';

export interface BufferDescriptor {
  label?: string;
  usage: BufferUsage;
  /** Size in bytes. Ignored when `data` is provided (data length is used). */
  byteLength?: number;
  data?: ArrayBufferView;
}

export interface GpuBuffer {
  readonly id: number;
  readonly usage: BufferUsage;
  readonly byteLength: number;
  /** Write `data` at `byteOffset`. Grows (re-allocates) the buffer when needed. */
  write(data: ArrayBufferView, byteOffset?: number): void;
  destroy(): void;
}

export type TextureFormat = 'rgba8unorm' | 'r8unorm';

export interface TextureDescriptor {
  label?: string;
  width: number;
  height: number;
  format?: TextureFormat;
  /** Linear filtering (default) or nearest. */
  filter?: 'linear' | 'nearest';
  data?: Uint8Array | Uint8ClampedArray;
}

export interface GpuTexture {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  write(data: Uint8Array | Uint8ClampedArray, width?: number, height?: number): void;
  /** Upload directly from a canvas / image source (e.g. a glyph atlas canvas). */
  writeFromSource(source: TexImageSource, width: number, height: number): void;
  destroy(): void;
}

export interface VertexAttribute {
  name: string;
  location: number;
  format: VertexFormat;
  offset: number;
}

export interface VertexBufferLayout {
  /** Name used to bind a buffer to this slot at draw time. */
  name: string;
  stepMode: 'vertex' | 'instance';
  /** Byte stride between consecutive elements. */
  stride: number;
  attributes: VertexAttribute[];
}

export type UniformType = 'f32' | 'vec2' | 'vec4' | 'mat4';

export interface UniformField {
  name: string;
  type: UniformType;
}

export interface UniformLayout {
  fields: UniformField[];
}

export type BlendMode = 'alpha' | 'additive' | 'none';

export type Topology = 'triangle-list' | 'triangle-strip' | 'line-list' | 'point-list';

export interface ShaderSource {
  glsl: { vertex: string; fragment: string };
  wgsl: string;
  /** Entry points for WGSL (defaults: vs_main / fs_main). */
  vertexEntry?: string;
  fragmentEntry?: string;
}

export interface PipelineDescriptor {
  label?: string;
  shader: ShaderSource;
  buffers: VertexBufferLayout[];
  uniforms: UniformLayout;
  /** Texture slot names in binding order (GLSL sampler2D uniform names). */
  textures?: string[];
  topology?: Topology;
  blend?: BlendMode;
  /** Enable depth testing / writing (3D). */
  depth?: boolean;
  cullBackFaces?: boolean;
  /** Renders into a {@link GpuRenderTarget} (RGBA8, no MSAA) instead of a canvas surface. */
  offscreen?: boolean;
}

export interface GpuPipeline {
  readonly id: number;
  readonly descriptor: PipelineDescriptor;
  destroy(): void;
}

/** A CPU-side packed uniform block bound to a GPU uniform buffer. */
export interface GpuUniforms {
  readonly layout: UniformLayout;
  set(name: string, value: number | ArrayLike<number>): this;
  /** Pushes pending changes to the GPU buffer (done automatically on draw). */
  flush(): void;
  destroy(): void;
}

export interface DrawCall {
  pipeline: GpuPipeline;
  uniforms: GpuUniforms;
  vertexBuffers: Record<string, GpuBuffer>;
  /**
   * Byte offset per vertex buffer slot. Binding one buffer to several slots
   * at different offsets lets an instance read neighboring records (e.g.
   * line segments reading 4 consecutive points).
   */
  vertexBufferOffsets?: Record<string, number>;
  textures?: Record<string, GpuTexture>;
  indexBuffer?: GpuBuffer;
  /** Vertices per instance (or total vertices when not instanced). */
  vertexCount: number;
  instanceCount?: number;
  firstVertex?: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderPass {
  /** Viewport in physical (device) pixels, origin top-left. */
  setViewport(rect: Rect): void;
  /** Scissor in physical (device) pixels, origin top-left. `null` disables. */
  setScissor(rect: Rect | null): void;
  draw(call: DrawCall): void;
  end(): void;
}

export interface FrameOptions {
  /** Premultiplied RGBA, 0..1. Defaults to transparent. */
  clearColor?: [number, number, number, number];
}

/**
 * A presentation target (one per chart canvas). Multiple surfaces share a single
 * device, so the number of charts per page is not bounded by context limits.
 */
/** A presentable canvas: a DOM canvas or an `OffscreenCanvas` (workers). */
export type SurfaceCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface GpuSurface {
  readonly canvas: SurfaceCanvas;
  /** Physical pixel size. */
  readonly width: number;
  readonly height: number;
  resize(width: number, height: number): void;
  beginFrame(options?: FrameOptions): RenderPass;
  destroy(): void;
}

/** Offscreen color + depth target with pixel readback (GPU picking, exports). */
export interface GpuRenderTarget {
  readonly width: number;
  readonly height: number;
  resize(width: number, height: number): void;
  beginPass(options?: FrameOptions): RenderPass;
  /** Reads one RGBA8 pixel; origin top-left, physical pixels. */
  readPixel(x: number, y: number): Promise<Uint8Array>;
  destroy(): void;
}

export interface ComputeBuffer {
  /** Initial contents (storage buffers) or values (uniform buffers). */
  data?: ArrayBufferView;
  byteLength?: number;
  uniform?: boolean;
  /** Copy back to the CPU after the dispatch. */
  readback?: boolean;
}

export interface ComputeDescriptor {
  /** WGSL with buffers at @group(0) @binding(i) in the order given. */
  wgsl: string;
  entry?: string;
  buffers: ComputeBuffer[];
  workgroups: [number, number?, number?];
}

export interface DeviceLimits {
  maxTextureSize: number;
  maxInstances: number;
}

export interface GpuDevice {
  readonly type: BackendType;
  readonly limits: DeviceLimits;
  readonly lost: boolean;
  createBuffer(descriptor: BufferDescriptor): GpuBuffer;
  createTexture(descriptor: TextureDescriptor): GpuTexture;
  createPipeline(descriptor: PipelineDescriptor): GpuPipeline;
  createUniforms(layout: UniformLayout): GpuUniforms;
  createSurface(canvas: SurfaceCanvas): GpuSurface;
  createRenderTarget(width: number, height: number): GpuRenderTarget;
  /** General-purpose compute (WebGPU only). Resolves with the readback buffers in order. */
  compute?(descriptor: ComputeDescriptor): Promise<ArrayBuffer[]>;
  /** Registers a device-lost callback. Returns an unsubscribe function. */
  onLost(callback: (reason: string) => void): () => void;
  destroy(): void;
}

export interface DeviceOptions {
  /** Request high-performance adapter (discrete GPU) when available. */
  powerPreference?: 'low-power' | 'high-performance';
  /** Multi-sample anti-aliasing. Default true. */
  antialias?: boolean;
}

/**
 * A backend adapter. Backends are imported explicitly so applications only
 * bundle the backends they use.
 */
export interface GpuBackend {
  readonly type: BackendType;
  isSupported(): boolean;
  createDevice(options?: DeviceOptions): Promise<GpuDevice>;
}
